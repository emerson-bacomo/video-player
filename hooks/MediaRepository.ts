import { DEFAULT_SORT_SCOPE, DEFAULT_SORT_TYPE } from "@/constants/defaults";
import { AlbumData, ScreenshotData, VideoData } from "@/types/useMedia";
import * as SQLite from "expo-sqlite";

const db = SQLite.openDatabaseSync("player.db");

export interface VpcExport {
    id: number;
    timestamp: number;
    filepath: string;
    filename: string;
    config_json: string;
}

/**
 * Pure data-access layer. All methods wrap the underlying SQLite calls.
 * No business logic — callers interpret the returned data.
 */
export class MediaRepository {
    // ── Initialization ────────────────────────────────────────────────────

    async init(): Promise<void> {
        db.execSync(`
            CREATE TABLE IF NOT EXISTS albums (
                id TEXT PRIMARY KEY,
                title TEXT,
                lastModified INTEGER,
                thumbnail TEXT,
                videoSortSettingScope TEXT DEFAULT 'global',
                videoSortType TEXT,
                prefixOptions TEXT,
                selectedPrefixOptions TEXT,
                albumName TEXT,
                uri TEXT
            );
            CREATE TABLE IF NOT EXISTS videos (
                id TEXT PRIMARY KEY,
                albumId TEXT,
                filename TEXT,
                title TEXT,
                uri TEXT,
                duration REAL,
                width INTEGER NOT NULL DEFAULT 0,
                height INTEGER NOT NULL DEFAULT 0,
                modificationTime INTEGER,
                thumbnail TEXT,
                lastPlayedSec REAL DEFAULT -1,
                size INTEGER,
                markers TEXT,
                clipSourceUri TEXT
            );
            CREATE TABLE IF NOT EXISTS sync_metadata (
                key TEXT PRIMARY KEY,
                value TEXT
            );
            CREATE TABLE IF NOT EXISTS theme_presets (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT,
                config TEXT,
                is_active INTEGER DEFAULT 0,
                is_system INTEGER DEFAULT 0
            );
            CREATE TABLE IF NOT EXISTS logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp INTEGER,
                level TEXT,
                action TEXT,
                message TEXT,
                details TEXT
            );
            CREATE TABLE IF NOT EXISTS pending_media_data (
                uri TEXT PRIMARY KEY,
                type TEXT,
                data TEXT
            );
            CREATE TABLE IF NOT EXISTS vpc_exports (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp INTEGER,
                filepath TEXT UNIQUE,
                filename TEXT,
                config_json TEXT
            );
            CREATE TABLE IF NOT EXISTS pending_clip_assignments (
                outputUri TEXT PRIMARY KEY,
                sourceUri TEXT,
                timestamp INTEGER
            );
            CREATE TABLE IF NOT EXISTS screenshots (
                id TEXT PRIMARY KEY,
                uri TEXT NOT NULL,
                filename TEXT NOT NULL,
                videoTitle TEXT,
                videoId TEXT,
                albumId TEXT,
                captureTimestamp INTEGER,
                createdAt INTEGER NOT NULL,
                width INTEGER,
                height INTEGER,
                fileSize INTEGER,
                thumbnail TEXT
            );
        `);

        // Column migrations (safe for fresh & existing installs)
        for (const { table, column, type, def } of this.migrationColumns()) {
            try {
                db.execSync(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}${def ? ` DEFAULT ${def}` : ""}`);
            } catch {}
        }

        // Sec-units migration
        const secMigrated = await this.getSetting("db_v2_sec_units");
        if (!secMigrated) {
            try {
                db.execSync("ALTER TABLE playback_data ADD COLUMN last_played_sec REAL DEFAULT -1");
            } catch {}
            try {
                db.execSync(
                    "UPDATE playback_data SET last_played_sec = CASE WHEN last_played_ms > 0 THEN last_played_ms / 1000.0 ELSE -1 END WHERE last_played_ms IS NOT NULL",
                );
            } catch {}
            try {
                db.execSync("ALTER TABLE videos ADD COLUMN lastPlayedSec REAL DEFAULT -1");
            } catch {}
            try {
                db.execSync(
                    "UPDATE videos SET lastPlayedSec = CASE WHEN lastPlayedMs > 0 THEN lastPlayedMs / 1000.0 ELSE -1 END WHERE lastPlayedMs IS NOT NULL",
                );
            } catch {}
            await this.saveSetting("db_v2_sec_units", "1");
        }

        // Playback data migration
        const playbackMigrated = await this.getSetting("db_v3_playback_migrated");
        if (!playbackMigrated) {
            try {
                db.execSync(`
                    UPDATE videos SET lastPlayedSec = (
                        SELECT last_played_sec FROM playback_data WHERE playback_data.video_id = videos.id
                    ) WHERE EXISTS (
                        SELECT 1 FROM playback_data WHERE playback_data.video_id = videos.id AND playback_data.last_played_sec > videos.lastPlayedSec
                    )
                `);
                db.execSync("DROP TABLE IF EXISTS playback_data");
            } catch {}
            await this.saveSetting("db_v3_playback_migrated", "1");
        }
    }

    private migrationColumns(): { table: string; column: string; type: string; def?: string }[] {
        return [
            { table: "albums", column: "path", type: "TEXT" },
            { table: "pending_media_data", column: "path", type: "TEXT" },
            { table: "videos", column: "path", type: "TEXT" },
            { table: "albums", column: "title", type: "TEXT" },
            { table: "videos", column: "title", type: "TEXT" },
            { table: "videos", column: "size", type: "INTEGER" },
            { table: "albums", column: "isHidden", type: "INTEGER", def: "0" },
            { table: "videos", column: "isHidden", type: "INTEGER", def: "0" },
            { table: "videos", column: "markers", type: "TEXT" },
            { table: "albums", column: "videoSortSettingScope", type: "TEXT", def: "'global'" },
            { table: "albums", column: "videoSortType", type: "TEXT" },
            { table: "albums", column: "prefixOptions", type: "TEXT" },
            { table: "albums", column: "selectedPrefixOptions", type: "TEXT" },
            { table: "albums", column: "albumName", type: "TEXT" },
            { table: "albums", column: "uri", type: "TEXT" },
            { table: "videos", column: "lastOpenedTime", type: "INTEGER", def: "0" },
            { table: "logs", column: "action", type: "TEXT" },
            { table: "videos", column: "clipSourceUri", type: "TEXT" },
            { table: "videos", column: "isNewOverride", type: "INTEGER", def: "0" },
        ];
    }

    // ── Album CRUD ────────────────────────────────────────────────────────

    async getAlbums(includeHidden: boolean = false): Promise<AlbumData[]> {
        const hiddenClause = includeHidden ? "" : "WHERE isHidden = 0";
        const results = db.getAllSync<AlbumData>(`
            SELECT *, (SELECT COUNT(*) FROM videos WHERE albumId = albums.id AND isHidden = 0) as assetCount
            FROM albums ${hiddenClause}
        `);
        return results.map((a) => this.migrateAlbum(a));
    }

    async getHiddenAlbums(): Promise<AlbumData[]> {
        const results = db.getAllSync<AlbumData>(`
            SELECT *, (SELECT COUNT(*) FROM videos WHERE albumId = albums.id AND isHidden = 1) as assetCount
            FROM albums WHERE isHidden = 1
        `);
        return results.map((a) => this.migrateAlbum(a));
    }

    async getAlbumById(id: string): Promise<AlbumData | undefined> {
        const result = db.getFirstSync<AlbumData>("SELECT * FROM albums WHERE id = ?", [id]);
        return result ? this.migrateAlbum(result) : undefined;
    }

    async saveAlbums(albums: AlbumData[]): Promise<void> {
        db.execSync("DELETE FROM albums");
        const stmt = db.prepareSync(
            "INSERT INTO albums (id, title, lastModified, thumbnail, videoSortSettingScope, videoSortType, albumName, uri, isHidden, prefixOptions, selectedPrefixOptions) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        );
        for (const a of albums) {
            stmt.executeSync([
                a.id,
                a.title,
                a.lastModified || 0,
                a.thumbnail || "",
                a.videoSortSettingScope || DEFAULT_SORT_SCOPE,
                a.videoSortType || DEFAULT_SORT_TYPE,
                a.albumName,
                a.uri,
                a.isHidden || 0,
                a.prefixOptions || null,
                a.selectedPrefixOptions || null,
            ]);
        }
    }

    async upsertAlbum(album: AlbumData): Promise<void> {
        const insertStmt = db.prepareSync(
            "INSERT OR IGNORE INTO albums (id, title, lastModified, thumbnail, videoSortSettingScope, videoSortType, albumName, uri, isHidden, prefixOptions, selectedPrefixOptions) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        );
        insertStmt.executeSync([
            album.id,
            album.title,
            album.lastModified || 0,
            album.thumbnail || "",
            album.videoSortSettingScope || DEFAULT_SORT_SCOPE,
            album.videoSortType || DEFAULT_SORT_TYPE,
            album.albumName,
            album.uri,
            album.isHidden || 0,
            album.prefixOptions || null,
            album.selectedPrefixOptions || null,
        ]);

        const updateStmt = db.prepareSync(
            "UPDATE albums SET title = ?, lastModified = ?, thumbnail = ?, videoSortSettingScope = ?, videoSortType = ?, albumName = ?, uri = ?, isHidden = ?, prefixOptions = ?, selectedPrefixOptions = ? WHERE id = ?",
        );
        updateStmt.executeSync([
            album.title,
            album.lastModified || 0,
            album.thumbnail || "",
            album.videoSortSettingScope || DEFAULT_SORT_SCOPE,
            album.videoSortType || DEFAULT_SORT_TYPE,
            album.albumName,
            album.uri,
            album.isHidden || 0,
            album.prefixOptions || null,
            album.selectedPrefixOptions || null,
            album.id,
        ]);
    }

    async setAlbumHidden(albumId: string, isHidden: boolean): Promise<void> {
        const stmt = db.prepareSync("UPDATE albums SET isHidden = ? WHERE id = ?");
        stmt.executeSync([isHidden ? 1 : 0, albumId]);
    }

    async renameAlbum(albumId: string, title: string): Promise<void> {
        const stmt = db.prepareSync("UPDATE albums SET title = ? WHERE id = ?");
        stmt.executeSync([title, albumId]);
    }

    async updateAlbumThumbnail(albumId: string, thumbUri: string): Promise<void> {
        const stmt = db.prepareSync("UPDATE albums SET thumbnail = ? WHERE id = ?");
        stmt.executeSync([thumbUri, albumId]);
    }

    async updateAlbumVideoSortType(albumId: string, sortType: string | null): Promise<void> {
        const stmt = db.prepareSync("UPDATE albums SET videoSortType = ? WHERE id = ?");
        stmt.executeSync([sortType, albumId]);
    }

    async updateAlbumVideoSortScope(albumId: string, scope: string): Promise<void> {
        const stmt = db.prepareSync("UPDATE albums SET videoSortSettingScope = ? WHERE id = ?");
        stmt.executeSync([scope, albumId]);
    }

    async getAlbumPrefixOptions(albumId: string): Promise<string | null> {
        const result = db.getFirstSync<{ prefixOptions: string | null }>(
            "SELECT prefixOptions FROM albums WHERE id = ?",
            [albumId],
        );
        return result ? result.prefixOptions : null;
    }

    async updateAlbumPrefixOptions(id: string, options: string): Promise<void> {
        const stmt = db.prepareSync("UPDATE albums SET prefixOptions = ? WHERE id = ?");
        stmt.executeSync([options, id]);
    }

    async getAlbumSelectedPrefixOptions(albumId: string): Promise<string | null> {
        const result = db.getFirstSync<{ selectedPrefixOptions: string | null }>(
            "SELECT selectedPrefixOptions FROM albums WHERE id = ?",
            [albumId],
        );
        return result ? result.selectedPrefixOptions : null;
    }

    async updateAlbumSelectedPrefixOptions(id: string, selected: string | null): Promise<void> {
        const stmt = db.prepareSync("UPDATE albums SET selectedPrefixOptions = ? WHERE id = ?");
        stmt.executeSync([selected, id]);
    }

    async deleteAlbums(albumIds: string[]): Promise<void> {
        if (albumIds.length === 0) return;
        const placeholders = albumIds.map(() => "?").join(",");
        const albumDeleteStmt = db.prepareSync(`DELETE FROM albums WHERE id IN (${placeholders})`);
        albumDeleteStmt.executeSync(albumIds);
        const videoDeleteStmt = db.prepareSync(`DELETE FROM videos WHERE albumId IN (${placeholders})`);
        videoDeleteStmt.executeSync(albumIds);
    }

    // ── Video CRUD ────────────────────────────────────────────────────────

    async getVideos(albumId?: string, includeHidden: boolean = false): Promise<VideoData[]> {
        const hiddenClause = includeHidden ? "" : "AND isHidden = 0";
        if (albumId) {
            return db.getAllSync<VideoData>(
                `SELECT * FROM videos WHERE albumId = ? ${hiddenClause}`,
                [albumId],
            );
        }
        return db.getAllSync<VideoData>(`SELECT * FROM videos WHERE 1=1 ${hiddenClause}`);
    }

    async getVideoById(id: string): Promise<VideoData | undefined> {
        const result = db.getFirstSync<VideoData>("SELECT * FROM videos WHERE id = ? AND isHidden = 0", [id]);
        return result || undefined;
    }

    async getRecentlyPlayedVideos(limit: number = 200): Promise<VideoData[]> {
        return db.getAllSync<VideoData>(
            "SELECT * FROM videos WHERE lastOpenedTime > 0 AND isHidden = 0 ORDER BY lastOpenedTime DESC LIMIT ?",
            [limit],
        );
    }

    async searchVideos(query: string): Promise<VideoData[]> {
        return db.getAllSync<VideoData>(
            "SELECT * FROM videos WHERE title LIKE ? OR filename LIKE ?",
            [`%${query}%`, `%${query}%`],
        );
    }

    async addVideos(videos: VideoData[]): Promise<void> {
        if (!videos || videos.length === 0) return;
        const stmt = db.prepareSync(`
            INSERT INTO videos (id, albumId, filename, title, uri, duration, width, height, modificationTime, thumbnail, lastPlayedSec, size, markers, clipSourceUri, isNewOverride)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                albumId=excluded.albumId,
                filename=excluded.filename,
                title=excluded.title,
                uri=excluded.uri,
                duration=excluded.duration,
                width=excluded.width,
                height=excluded.height,
                modificationTime=excluded.modificationTime,
                thumbnail=excluded.thumbnail,
                lastPlayedSec=excluded.lastPlayedSec,
                size=excluded.size,
                markers=excluded.markers,
                clipSourceUri=excluded.clipSourceUri,
                isNewOverride=excluded.isNewOverride
        `);
        for (const v of videos) {
            stmt.executeSync([
                v.id,
                v.albumId || "",
                v.filename,
                v.title,
                v.uri,
                v.duration,
                v.width,
                v.height,
                v.modificationTime,
                v.thumbnail || "",
                v.lastPlayedSec ?? -1,
                v.size || 0,
                v.markers ? JSON.stringify(v.markers) : null,
                v.clipSourceUri || null,
                v.isNewOverride ? 1 : 0,
            ]);
        }
    }

    async replaceAlbumVideos(albumId: string, videos: VideoData[]): Promise<void> {
        db.execSync(`DELETE FROM videos WHERE albumId = '${albumId}'`);
        const stmt = db.prepareSync(`
            INSERT INTO videos (id, albumId, filename, title, uri, duration, width, height, modificationTime, thumbnail, lastPlayedSec, size, markers, clipSourceUri, isNewOverride)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        for (const v of videos) {
            stmt.executeSync([
                v.id,
                v.albumId || albumId || "",
                v.filename,
                v.title,
                v.uri,
                v.duration,
                v.width,
                v.height,
                v.modificationTime,
                v.thumbnail || "",
                v.lastPlayedSec ?? -1,
                v.size || 0,
                v.markers ? JSON.stringify(v.markers) : null,
                v.clipSourceUri || null,
                v.isNewOverride ? 1 : 0,
            ]);
        }
    }

    async deleteVideos(videoIds: string[]): Promise<void> {
        if (videoIds.length === 0) return;
        const placeholders = videoIds.map(() => "?").join(",");
        const stmt = db.prepareSync(`DELETE FROM videos WHERE id IN (${placeholders})`);
        stmt.executeSync(videoIds);
    }

    async setVideoHidden(videoId: string, isHidden: boolean): Promise<void> {
        const stmt = db.prepareSync("UPDATE videos SET isHidden = ? WHERE id = ?");
        stmt.executeSync([isHidden ? 1 : 0, videoId]);
    }

    async renameVideo(videoId: string, title: string): Promise<void> {
        const stmt = db.prepareSync("UPDATE videos SET title = ? WHERE id = ?");
        stmt.executeSync([title, videoId]);
    }

    async updateVideoThumbnail(videoId: string, thumbUri: string): Promise<void> {
        const stmt = db.prepareSync("UPDATE videos SET thumbnail = ? WHERE id = ?");
        stmt.executeSync([thumbUri, videoId]);
    }

    async updateVideoMarkers(videoId: string, markers: { time: number; markerId: string }[] | null): Promise<void> {
        const stmt = db.prepareSync("UPDATE videos SET markers = ? WHERE id = ?");
        stmt.executeSync([markers ? JSON.stringify(markers) : null, videoId]);
    }

    async clearVideoClipSourceUri(videoId: string): Promise<void> {
        const stmt = db.prepareSync("UPDATE videos SET clipSourceUri = NULL WHERE id = ?");
        stmt.executeSync([videoId]);
    }

    async clearVideoNewOverride(videoId: string): Promise<void> {
        const stmt = db.prepareSync("UPDATE videos SET isNewOverride = 0 WHERE id = ?");
        stmt.executeSync([videoId]);
    }

    // ── Playback Data ─────────────────────────────────────────────────────

    async savePlaybackData(videoId: string, lastPlayedSec: number): Promise<void> {
        const stmt = db.prepareSync("UPDATE videos SET lastPlayedSec = ? WHERE id = ?");
        stmt.executeSync([lastPlayedSec, videoId]);
    }

    async getPlaybackData(videoId: string): Promise<number> {
        const result = db.getFirstSync<{ lastPlayedSec: number }>(
            "SELECT lastPlayedSec FROM videos WHERE id = ?",
            [videoId],
        );
        return result ? result.lastPlayedSec : -1;
    }

    async getAllPlaybackData(): Promise<{ videoId: string; lastPlayedSec: number }[]> {
        return db.getAllSync<{ video_id: string; last_played_sec: number }>(
            "SELECT id as video_id, lastPlayedSec as last_played_sec FROM videos WHERE lastPlayedSec >= 0",
        ).map((r) => ({ videoId: r.video_id, lastPlayedSec: r.last_played_sec }));
    }

    async updateVideoLastOpenedTime(videoId: string, time: number = Date.now()): Promise<void> {
        const stmt = db.prepareSync("UPDATE videos SET lastOpenedTime = ? WHERE id = ?");
        stmt.executeSync([time, videoId]);
    }

    // ── Sync Metadata / Settings ──────────────────────────────────────────

    async setLastSyncTimestamp(timestamp: number): Promise<void> {
        const stmt = db.prepareSync("INSERT OR REPLACE INTO sync_metadata (key, value) VALUES (?, ?)");
        stmt.executeSync(["lastFullScanTimestamp", timestamp.toString()]);
    }

    async getLastSyncTimestamp(): Promise<number> {
        const result = db.getFirstSync<{ value: string }>(
            "SELECT value FROM sync_metadata WHERE key = ?",
            ["lastFullScanTimestamp"],
        );
        return result ? parseInt(result.value) : 0;
    }

    async saveSetting(key: string, value: string): Promise<void> {
        const stmt = db.prepareSync("INSERT OR REPLACE INTO sync_metadata (key, value) VALUES (?, ?)");
        stmt.executeSync([key, value]);
    }

    async getSetting(key: string): Promise<string | null> {
        const result = db.getFirstSync<{ value: string }>("SELECT value FROM sync_metadata WHERE key = ?", [key]);
        return result ? result.value : null;
    }

    // ── Theme Presets ─────────────────────────────────────────────────────

    async getThemePresets(): Promise<any[]> {
        return db.getAllSync<any>("SELECT * FROM theme_presets ORDER BY is_system DESC, id ASC");
    }

    async getActiveThemePreset(): Promise<any> {
        return db.getFirstSync<any>("SELECT * FROM theme_presets WHERE is_active = 1");
    }

    async saveThemePreset(name: string, config: string, isActive: number = 0, isSystem: number = 0): Promise<number> {
        if (isActive === 1) {
            db.execSync("UPDATE theme_presets SET is_active = 0");
        }
        const stmt = db.prepareSync("INSERT INTO theme_presets (name, config, is_active, is_system) VALUES (?, ?, ?, ?)");
        const result = stmt.executeSync([name, config, isActive, isSystem]);
        return result.lastInsertRowId;
    }

    async updateThemePreset(id: number, config: string, name?: string): Promise<void> {
        if (name) {
            const stmt = db.prepareSync("UPDATE theme_presets SET name = ?, config = ? WHERE id = ?");
            stmt.executeSync([name, config, id]);
        } else {
            const stmt = db.prepareSync("UPDATE theme_presets SET config = ? WHERE id = ?");
            stmt.executeSync([config, id]);
        }
    }

    async deleteThemePreset(id: number): Promise<void> {
        const stmt = db.prepareSync("DELETE FROM theme_presets WHERE id = ? AND is_system = 0");
        stmt.executeSync([id]);
    }

    async setActiveThemePreset(id: number): Promise<void> {
        db.execSync("UPDATE theme_presets SET is_active = 0");
        const stmt = db.prepareSync("UPDATE theme_presets SET is_active = 1 WHERE id = ?");
        stmt.executeSync([id]);
    }

    // ── Logs ──────────────────────────────────────────────────────────────

    async addLog(level: "INFO" | "ERROR" | "WARNING", action: string, message: string, details?: any): Promise<void> {
        const stmt = db.prepareSync("INSERT INTO logs (timestamp, level, action, message, details) VALUES (?, ?, ?, ?, ?)");
        stmt.executeSync([Date.now(), level, action, message, details ? JSON.stringify(details) : null]);
    }

    async getLogs(limit: number = 200): Promise<any[]> {
        return db.getAllSync<any>("SELECT * FROM logs ORDER BY timestamp DESC LIMIT ?", [limit]);
    }

    async clearLogs(): Promise<void> {
        db.execSync("DELETE FROM logs");
    }

    // ── Pending Media Data ────────────────────────────────────────────────

    async savePendingMediaData(uri: string, type: "video" | "album", data: any): Promise<void> {
        const stmt = db.prepareSync("INSERT OR REPLACE INTO pending_media_data (uri, type, data) VALUES (?, ?, ?)");
        stmt.executeSync([uri, type, JSON.stringify(data)]);
    }

    async getPendingMediaData(uri: string): Promise<{ type: string; data: any } | null> {
        const result = db.getFirstSync<{ type: string; data: string }>(
            "SELECT type, data FROM pending_media_data WHERE uri = ?",
            [uri],
        );
        if (result) {
            return { type: result.type, data: JSON.parse(result.data) };
        }
        return null;
    }

    async deletePendingMediaData(uri: string): Promise<void> {
        const stmt = db.prepareSync("DELETE FROM pending_media_data WHERE uri = ?");
        stmt.executeSync([uri]);
    }

    // ── VPC Exports ───────────────────────────────────────────────────────

    async addVpcExport(filepath: string, filename: string, configJson: string): Promise<void> {
        const stmt = db.prepareSync(
            "INSERT OR REPLACE INTO vpc_exports (timestamp, filepath, filename, config_json) VALUES (?, ?, ?, ?)",
        );
        stmt.executeSync([Date.now(), filepath, filename, configJson]);
    }

    async getVpcExports(): Promise<VpcExport[]> {
        return db.getAllSync<VpcExport>("SELECT * FROM vpc_exports ORDER BY timestamp DESC");
    }

    async deleteVpcExport(id: number): Promise<void> {
        const stmt = db.prepareSync("DELETE FROM vpc_exports WHERE id = ?");
        stmt.executeSync([id]);
    }

    async deleteVpcExportByPath(filepath: string): Promise<void> {
        const stmt = db.prepareSync("DELETE FROM vpc_exports WHERE filepath = ?");
        stmt.executeSync([filepath]);
    }

    // ── Pending Clip Assignments ──────────────────────────────────────────

    async addPendingClipAssignment(outputUri: string, sourceUri: string): Promise<void> {
        const stmt = db.prepareSync(
            "INSERT OR REPLACE INTO pending_clip_assignments (outputUri, sourceUri, timestamp) VALUES (?, ?, ?)",
        );
        stmt.executeSync([outputUri, sourceUri, Date.now()]);
    }

    async getAllPendingClipAssignments(): Promise<{ outputUri: string; sourceUri: string }[]> {
        return db.getAllSync<{ outputUri: string; sourceUri: string }>("SELECT * FROM pending_clip_assignments");
    }

    async deletePendingClipAssignment(outputUri: string): Promise<void> {
        const stmt = db.prepareSync("DELETE FROM pending_clip_assignments WHERE outputUri = ?");
        stmt.executeSync([outputUri]);
    }

    async clearOldPendingClipAssignments(maxAgeMs: number = 1000 * 60 * 60 * 24): Promise<void> {
        const stmt = db.prepareSync("DELETE FROM pending_clip_assignments WHERE timestamp < ?");
        stmt.executeSync([Date.now() - maxAgeMs]);
    }

    // ── Screenshots ───────────────────────────────────────────────────────

    async getScreenshots(): Promise<ScreenshotData[]> {
        return db.getAllSync<ScreenshotData>("SELECT * FROM screenshots ORDER BY createdAt DESC");
    }

    async addScreenshots(dataList: ScreenshotData[]): Promise<void> {
        const stmt = db.prepareSync(
            "INSERT OR REPLACE INTO screenshots (id, uri, filename, videoTitle, videoId, albumId, captureTimestamp, createdAt, width, height, fileSize, thumbnail) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        );
        for (const s of dataList) {
            stmt.executeSync([
                s.id,
                s.uri,
                s.filename,
                s.videoTitle || null,
                s.videoId || null,
                s.albumId || null,
                s.captureTimestamp || null,
                s.createdAt,
                s.width || null,
                s.height || null,
                s.fileSize || null,
                s.thumbnail || null,
            ]);
        }
    }

    async deleteScreenshots(ids: string[]): Promise<void> {
        if (ids.length === 0) return;
        const placeholders = ids.map(() => "?").join(",");
        const stmt = db.prepareSync(`DELETE FROM screenshots WHERE id IN (${placeholders})`);
        stmt.executeSync(ids);
    }

    async renameScreenshot(id: string, filename: string, uri: string): Promise<void> {
        const stmt = db.prepareSync("UPDATE screenshots SET filename = ?, uri = ? WHERE id = ?");
        stmt.executeSync([filename, uri, id]);
    }

    async clearAllScreenshots(): Promise<void> {
        db.execSync("DELETE FROM screenshots");
    }

    // ── Thumbnails ────────────────────────────────────────────────────────

    async clearAllThumbnails(): Promise<void> {
        db.execSync('UPDATE albums SET thumbnail = ""');
        db.execSync('UPDATE videos SET thumbnail = ""');
    }

    // ── Reset ─────────────────────────────────────────────────────────────

    async reset(): Promise<void> {
        try { db.execSync("DELETE FROM playback_data"); } catch {}
        db.execSync("DELETE FROM albums");
        db.execSync("DELETE FROM videos");
        db.execSync("DELETE FROM sync_metadata");
        db.execSync("DELETE FROM theme_presets");
        db.execSync("DELETE FROM logs");
        db.execSync("DELETE FROM pending_media_data");
        db.execSync("DELETE FROM screenshots");
    }

    // ── Helpers ───────────────────────────────────────────────────────────

    private migrateAlbum(a: AlbumData): AlbumData {
        let albumName = a.albumName;
        let uri = a.uri;
        if (!albumName || !uri) {
            const firstVideo = db.getFirstSync<{ uri: string }>("SELECT uri FROM videos WHERE albumId = ? LIMIT 1", [a.id]);
            if (firstVideo && firstVideo.uri) {
                if (!uri) uri = firstVideo.uri.substring(0, firstVideo.uri.lastIndexOf("/"));
                if (!albumName) albumName = uri.split("/").pop() ?? a.title;
            }
            if (!albumName) albumName = a.title || "Unknown";
            if (!uri) uri = "";
            try {
                const stmt = db.prepareSync("UPDATE albums SET albumName = ?, uri = ? WHERE id = ?");
                stmt.executeSync([albumName, uri, a.id]);
            } catch (e) {
                console.warn("[MediaRepository] Failed to save migration data for album", a.id, e);
            }
        }
        return { ...a, albumName, uri };
    }
}
