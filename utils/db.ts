import { DEFAULT_SORT_SCOPE, DEFAULT_SORT_TYPE } from "@/constants/defaults";
import { Album, VideoMedia } from "@/types/useMedia";
import * as SQLite from "expo-sqlite";

export const db = SQLite.openDatabaseSync("player.db");

export const initDB = () => {
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
      markers TEXT
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
  `);
    // Column migrations (safe for fresh & existing installs)
    try {
        db.execSync("ALTER TABLE albums RENAME COLUMN path TO uri");
    } catch {}
    try {
        db.execSync("ALTER TABLE pending_media_data RENAME COLUMN path TO uri");
    } catch {}
    try {
        db.execSync("ALTER TABLE videos DROP COLUMN path");
    } catch {}
    try {
        db.execSync("ALTER TABLE albums ADD COLUMN title TEXT");
    } catch {}
    try {
        db.execSync("ALTER TABLE videos ADD COLUMN title TEXT");
    } catch {}
    try {
        db.execSync("ALTER TABLE videos ADD COLUMN size INTEGER");
    } catch {}
    try {
        db.execSync("ALTER TABLE albums ADD COLUMN isHidden INTEGER DEFAULT 0");
    } catch {}
    try {
        db.execSync("ALTER TABLE videos ADD COLUMN isHidden INTEGER DEFAULT 0");
    } catch {}
    try {
        db.execSync("ALTER TABLE videos ADD COLUMN markers TEXT");
    } catch {}
    try {
        db.execSync("ALTER TABLE albums ADD COLUMN videoSortSettingScope TEXT DEFAULT 'global'");
    } catch {}
    try {
        db.execSync("ALTER TABLE albums ADD COLUMN videoSortType TEXT");
    } catch {}
    try {
        db.execSync("ALTER TABLE albums ADD COLUMN prefixOptions TEXT");
    } catch {}
    try {
        db.execSync("ALTER TABLE albums ADD COLUMN selectedPrefixOptions TEXT");
    } catch {}
    try {
        db.execSync("ALTER TABLE albums ADD COLUMN albumName TEXT");
    } catch {}
    try {
        db.execSync("ALTER TABLE albums ADD COLUMN uri TEXT");
    } catch {}
    try {
        db.execSync("ALTER TABLE videos ADD COLUMN lastOpenedTime INTEGER DEFAULT 0");
    } catch {}
    try {
        db.execSync("ALTER TABLE logs ADD COLUMN action TEXT");
    } catch {}

    const secMigrated = getSettingDb("db_v2_sec_units");
    if (!secMigrated) {
        // playback_data: add sec column, populate from ms column
        try {
            db.execSync("ALTER TABLE playback_data ADD COLUMN last_played_sec REAL DEFAULT -1");
        } catch {}
        try {
            db.execSync(`
                UPDATE playback_data
                SET last_played_sec = CASE WHEN last_played_ms > 0 THEN last_played_ms / 1000.0 ELSE -1 END
                WHERE last_played_ms IS NOT NULL
            `);
        } catch {}
        // videos table: add sec column, populate from ms column
        try {
            db.execSync("ALTER TABLE videos ADD COLUMN lastPlayedSec REAL DEFAULT -1");
        } catch {}
        try {
            db.execSync(`
                UPDATE videos
                SET lastPlayedSec = CASE WHEN lastPlayedMs > 0 THEN lastPlayedMs / 1000.0 ELSE -1 END
                WHERE lastPlayedMs IS NOT NULL
            `);
        } catch {}
        saveSettingDb("db_v2_sec_units", "1");
    }

    const playbackDataMigrated = getSettingDb("db_v3_playback_migrated");
    if (!playbackDataMigrated) {
        try {
            // Check if playback_data exists before attempting migration
            db.execSync(`
                UPDATE videos 
                SET lastPlayedSec = (SELECT last_played_sec FROM playback_data WHERE playback_data.video_id = videos.id) 
                WHERE EXISTS (SELECT 1 FROM playback_data WHERE playback_data.video_id = videos.id AND playback_data.last_played_sec > videos.lastPlayedSec)
            `);
            db.execSync("DROP TABLE IF EXISTS playback_data");
        } catch {}
        saveSettingDb("db_v3_playback_migrated", "1");
    }
};

export const savePlaybackDataDb = (videoId: string, lastPlayedSec: number) => {
    const stmt = db.prepareSync("UPDATE videos SET lastPlayedSec = ? WHERE id = ?");
    stmt.executeSync([lastPlayedSec, videoId]);
};

export const getPlaybackDataDb = (videoId: string): number => {
    const result = db.getFirstSync<{ lastPlayedSec: number }>("SELECT lastPlayedSec FROM videos WHERE id = ?", [videoId]);
    return result ? result.lastPlayedSec : -1;
};

export const updateVideoLastOpenedTimeDb = (videoId: string, time: number = Date.now()) => {
    const stmt = db.prepareSync("UPDATE videos SET lastOpenedTime = ? WHERE id = ?");
    stmt.executeSync([time, videoId]);
};


export const getAllPlaybackDataDb = () => {
    return db.getAllSync<{ video_id: string; last_played_sec: number }>(
        "SELECT id as video_id, lastPlayedSec as last_played_sec FROM videos WHERE lastPlayedSec >= 0",
    );
};

// --- Album Functions ---
export const getHiddenAlbumsDb = (): Album[] => {
    const results = db.getAllSync<Album>(`
        SELECT *, (SELECT COUNT(*) FROM videos WHERE albumId = albums.id AND isHidden = 1) as assetCount 
        FROM albums 
        WHERE isHidden = 1
    `);
    return results.map((a) => {
        let albumName = a.albumName;
        let uri = a.uri;
        if (!albumName || !uri) {
            const firstVideo = db.getFirstSync<{ uri: string }>("SELECT uri FROM videos WHERE albumId = ? LIMIT 1", [a.id]);
            if (firstVideo && firstVideo.uri) {
                if (!uri) uri = firstVideo.uri.substring(0, firstVideo.uri.lastIndexOf("/"));
                if (!albumName) albumName = uri.split("/").pop() ?? a.title;
            }
            if (!albumName) albumName = a.title || "Unknown";
            if (!uri) uri = ""; // Fallback
            // Save migrated data right away
            try {
                const stmt = db.prepareSync("UPDATE albums SET albumName = ?, uri = ? WHERE id = ?");
                stmt.executeSync([albumName, uri, a.id]);
            } catch (e) {
                console.warn("[DB] Failed to save migration data for hidden album", a.id, e);
            }
        }
        return { ...a, albumName, uri };
    });
};

export const saveAlbumsDb = (albums: Album[]) => {
    db.execSync("DELETE FROM albums");
    const stmt = db.prepareSync(
        "INSERT INTO albums (id, title, lastModified, thumbnail, videoSortSettingScope, videoSortType, albumName, uri) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    );
    albums.forEach((a) => {
        stmt.executeSync([
            a.id,
            a.title,
            a.lastModified || 0,
            a.thumbnail || "",
            a.videoSortSettingScope || DEFAULT_SORT_SCOPE,
            a.videoSortType || DEFAULT_SORT_TYPE,
            a.albumName,
            a.uri,
        ]);
    });
};

// Incremental, non-destructive album persistence for long-running syncs.
// This avoids losing scanned progress when the app is terminated before final bulk save.
export const upsertAlbumDb = (album: Album) => {
    const insertStmt = db.prepareSync(
        "INSERT OR IGNORE INTO albums (id, title, lastModified, thumbnail, videoSortSettingScope, videoSortType, albumName, uri) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
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
    ]);

    const updateStmt = db.prepareSync(
        "UPDATE albums SET title = ?, lastModified = ?, thumbnail = ?, videoSortSettingScope = ?, videoSortType = ?, albumName = ?, uri = ? WHERE id = ?",
    );
    updateStmt.executeSync([
        album.title,
        album.lastModified || 0,
        album.thumbnail || "",
        album.videoSortSettingScope || DEFAULT_SORT_SCOPE,
        album.videoSortType || DEFAULT_SORT_TYPE,
        album.albumName,
        album.uri,
        album.id,
    ]);
};

export const getAlbumsDb = (): Album[] => {
    const results = db.getAllSync<Album>(`
        SELECT *, (SELECT COUNT(*) FROM videos WHERE albumId = albums.id AND isHidden = 0) as assetCount 
        FROM albums 
        WHERE isHidden = 0
    `);
    return results.map((a) => {
        let albumName = a.albumName;
        let uri = a.uri;
        if (!albumName || !uri) {
            const firstVideo = db.getFirstSync<{ uri: string }>("SELECT uri FROM videos WHERE albumId = ? LIMIT 1", [a.id]);
            if (firstVideo && firstVideo.uri) {
                if (!uri) uri = firstVideo.uri.substring(0, firstVideo.uri.lastIndexOf("/"));
                if (!albumName) albumName = uri.split("/").pop() ?? a.title;
            }
            if (!albumName) albumName = a.title || "Unknown";
            if (!uri) uri = ""; // Fallback
            // Save migrated data right away
            console.log("[DB] Migrating album", a.id, albumName, uri);
            try {
                const stmt = db.prepareSync("UPDATE albums SET albumName = ?, uri = ? WHERE id = ?");
                stmt.executeSync([albumName, uri, a.id]);
            } catch (e) {
                console.warn("[DB] Failed to save migration data for album", a.id, e);
            }
        }
        return { ...a, albumName, uri };
    });
};

export const setAlbumHiddenDb = (albumId: string, isHidden: boolean) => {
    const stmt = db.prepareSync("UPDATE albums SET isHidden = ? WHERE id = ?");
    stmt.executeSync([isHidden ? 1 : 0, albumId]);
};

export const updateAlbumThumbnailDb = (albumId: string, thumbUri: string) => {
    const stmt = db.prepareSync("UPDATE albums SET thumbnail = ? WHERE id = ?");
    stmt.executeSync([thumbUri, albumId]);
};

export const updateAlbumPrefixOptionsDb = (id: string, options: string) => {
    const stmt = db.prepareSync("UPDATE albums SET prefixOptions = ? WHERE id = ?");
    stmt.executeSync([options, id]);
};

export const getAlbumSelectedPrefixOptionsDb = (albumId: string): string | null => {
    const result = db.getFirstSync<{ selectedPrefixOptions: string | null }>(
        "SELECT selectedPrefixOptions FROM albums WHERE id = ?",
        [albumId],
    );
    return result ? result.selectedPrefixOptions : null;
};

export const updateAlbumSelectedPrefixOptionsDb = (id: string, selected: string | null) => {
    const stmt = db.prepareSync("UPDATE albums SET selectedPrefixOptions = ? WHERE id = ?");
    stmt.executeSync([selected, id]);
};

export const updateAlbumVideoSortTypeDb = (albumId: string, sortType: string | null) => {
    console.log(`[DB] Updating album ${albumId} videoSortType:`, sortType);
    const stmt = db.prepareSync("UPDATE albums SET videoSortType = ? WHERE id = ?");
    stmt.executeSync([sortType, albumId]);
};

export const updateAlbumVideoSortScopeDb = (albumId: string, scope: string) => {
    console.log(`[DB] Updating album ${albumId} videoSortSettingScope:`, scope);
    const stmt = db.prepareSync("UPDATE albums SET videoSortSettingScope = ? WHERE id = ?");
    stmt.executeSync([scope, albumId]);
};

export const getAlbumPrefixOptionsDb = (albumId: string): string | null => {
    const result = db.getFirstSync<{ prefixOptions: string | null }>("SELECT prefixOptions FROM albums WHERE id = ?", [albumId]);
    return result ? result.prefixOptions : null;
};

export const renameAlbumDb = (albumId: string, title: string) => {
    const stmt = db.prepareSync("UPDATE albums SET title = ? WHERE id = ?");
    stmt.executeSync([title, albumId]);
};

// --- Video Functions ---
export const addVideosDb = (videos: VideoMedia[]) => {
    if (!videos || videos.length === 0) return;

    const stmt = db.prepareSync(`
        INSERT INTO videos (id, albumId, filename, title, uri, duration, width, height, modificationTime, thumbnail, lastPlayedSec, size, markers)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
            markers=excluded.markers
    `);

    videos.forEach((v) => {
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
        ]);
    });
};

export const saveVideosDb = (albumId: string | null, videos: VideoMedia[]) => {
    if (albumId) {
        db.execSync(`DELETE FROM videos WHERE albumId = '${albumId}'`);
    } else {
        db.execSync("DELETE FROM videos");
    }
    const stmt = db.prepareSync(`
    INSERT INTO videos (id, albumId, filename, title, uri, duration, width, height, modificationTime, thumbnail, lastPlayedSec, size, markers)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
    videos.forEach((v) => {
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
            v.lastPlayedSec ?? -1, // fallback covers old field name
            v.size || 0,
            v.markers ? JSON.stringify(v.markers) : null,
        ]);
    });
};

export const getAllVideosDb = () => {
    return db.getAllSync<any>("SELECT * FROM videos WHERE isHidden = 0");
};

export const getVideoByIdDb = (id: string) => {
    return db.getFirstSync<any>("SELECT * FROM videos WHERE id = ? AND isHidden = 0", [id]);
};

export const getVideosForAlbumDb = (albumId: string) => {
    return db.getAllSync<any>("SELECT * FROM videos WHERE albumId = ? AND isHidden = 0", [albumId]);
};

export const getRecentlyPlayedVideosDb = (limit: number = 200) => {
    return db.getAllSync<VideoMedia>(
        "SELECT * FROM videos WHERE lastOpenedTime > 0 AND isHidden = 0 ORDER BY lastOpenedTime DESC LIMIT ?",
        [limit],
    );
};

export const deleteMultipleVideosDb = (videoIds: string[]) => {
    if (!videoIds || videoIds.length === 0) return;
    const placeholders = videoIds.map(() => "?").join(",");
    const stmt = db.prepareSync(`DELETE FROM videos WHERE id IN (${placeholders})`);
    stmt.executeSync(videoIds);
};

export const deleteMultipleAlbumsDb = (albumIds: string[]) => {
    if (!albumIds || albumIds.length === 0) return;
    const placeholders = albumIds.map(() => "?").join(",");
    const albumDeleteStmt = db.prepareSync(`DELETE FROM albums WHERE id IN (${placeholders})`);
    albumDeleteStmt.executeSync(albumIds);
    const videoDeleteStmt = db.prepareSync(`DELETE FROM videos WHERE albumId IN (${placeholders})`);
    videoDeleteStmt.executeSync(albumIds);
};

export const setVideoHiddenDb = (videoId: string, isHidden: boolean) => {
    const stmt = db.prepareSync("UPDATE videos SET isHidden = ? WHERE id = ?");
    stmt.executeSync([isHidden ? 1 : 0, videoId]);
};

export const searchVideosByNameDb = (query: string) => {
    return db.getAllSync<any>("SELECT * FROM videos WHERE title LIKE ? OR filename LIKE ?", [`%${query}%`, `%${query}%`]);
};

export const updateVideoThumbnailDb = (videoId: string, thumbUri: string) => {
    const stmt = db.prepareSync("UPDATE videos SET thumbnail = ? WHERE id = ?");
    stmt.executeSync([thumbUri, videoId]);
};

export const renameVideoDb = (videoId: string, title: string) => {
    const stmt = db.prepareSync("UPDATE videos SET title = ? WHERE id = ?");
    stmt.executeSync([title, videoId]);
};

export const updateVideoMarkersDb = (videoId: string, markers: any[] | null) => {
    const stmt = db.prepareSync("UPDATE videos SET markers = ? WHERE id = ?");
    stmt.executeSync([markers ? JSON.stringify(markers) : null, videoId]);
};

export const getHiddenVideosDb = () => {
    return db.getAllSync<any>("SELECT * FROM videos WHERE isHidden = 1");
};

// --- Sync Metadata ---
export const setLastSyncTimestampDb = (timestamp: number) => {
    const stmt = db.prepareSync("INSERT OR REPLACE INTO sync_metadata (key, value) VALUES (?, ?)");
    stmt.executeSync(["lastFullScanTimestamp", timestamp.toString()]);
};

export const getLastSyncTimestampDb = (): number => {
    const result = db.getFirstSync<{ value: string }>("SELECT value FROM sync_metadata WHERE key = ?", ["lastFullScanTimestamp"]);
    return result ? parseInt(result.value) : 0;
};

export const saveSettingDb = (key: string, value: string) => {
    const stmt = db.prepareSync("INSERT OR REPLACE INTO sync_metadata (key, value) VALUES (?, ?)");
    stmt.executeSync([key, value]);
};

export const getSettingDb = (key: string): string | null => {
    const result = db.getFirstSync<{ value: string }>("SELECT value FROM sync_metadata WHERE key = ?", [key]);
    return result ? result.value : null;
};

export const clearAllThumbnailsDb = () => {
    db.execSync('UPDATE albums SET thumbnail = ""');
    db.execSync('UPDATE videos SET thumbnail = ""');
};

// --- Theme Functions ---
export const getThemePresetsDb = () => {
    return db.getAllSync<any>("SELECT * FROM theme_presets ORDER BY is_system DESC, id ASC");
};

export const getActiveThemePresetDb = () => {
    return db.getFirstSync<any>("SELECT * FROM theme_presets WHERE is_active = 1");
};

export const saveThemePresetDb = (name: string, config: string, is_active: number = 0, is_system: number = 0) => {
    if (is_active === 1) {
        db.execSync("UPDATE theme_presets SET is_active = 0");
    }
    const stmt = db.prepareSync("INSERT INTO theme_presets (name, config, is_active, is_system) VALUES (?, ?, ?, ?)");
    const result = stmt.executeSync([name, config, is_active, is_system]);
    return result.lastInsertRowId;
};

export const updateThemePresetDb = (id: number, config: string, name?: string) => {
    if (name) {
        const stmt = db.prepareSync("UPDATE theme_presets SET name = ?, config = ? WHERE id = ?");
        stmt.executeSync([name, config, id]);
    } else {
        const stmt = db.prepareSync("UPDATE theme_presets SET config = ? WHERE id = ?");
        stmt.executeSync([config, id]);
    }
};

export const deleteThemePresetDb = (id: number) => {
    // Don't delete system themes
    const stmt = db.prepareSync("DELETE FROM theme_presets WHERE id = ? AND is_system = 0");
    stmt.executeSync([id]);
};

export const setActiveThemePresetDb = (id: number) => {
    db.execSync("UPDATE theme_presets SET is_active = 0");
    const stmt = db.prepareSync("UPDATE theme_presets SET is_active = 1 WHERE id = ?");
    stmt.executeSync([id]);
};

// --- Reset Database ---
export const resetDatabaseDb = () => {
    // playback_data may not exist on newer DB versions (migrated into videos table).
    try {
        db.execSync("DELETE FROM playback_data");
    } catch {}
    db.execSync("DELETE FROM albums");
    db.execSync("DELETE FROM videos");
    db.execSync("DELETE FROM sync_metadata");
    db.execSync("DELETE FROM theme_presets");
    db.execSync("DELETE FROM logs");
    db.execSync("DELETE FROM pending_media_data");
};

// --- Logs Functions ---
export const addLogDb = (level: "INFO" | "ERROR" | "WARNING", action: string, message: string, details?: any) => {
    const stmt = db.prepareSync("INSERT INTO logs (timestamp, level, action, message, details) VALUES (?, ?, ?, ?, ?)");
    stmt.executeSync([Date.now(), level, action, message, details ? JSON.stringify(details) : null]);
};

export const getLogsDb = (limit: number = 200) => {
    return db.getAllSync<any>("SELECT * FROM logs ORDER BY timestamp DESC LIMIT ?", [limit]);
};

export const clearLogsDb = () => {
    db.execSync("DELETE FROM logs");
};

// --- Pending Media Data ---
export const savePendingMediaDataDb = (uri: string, type: "video" | "album", data: any) => {
    const stmt = db.prepareSync("INSERT OR REPLACE INTO pending_media_data (uri, type, data) VALUES (?, ?, ?)");
    stmt.executeSync([uri, type, JSON.stringify(data)]);
};

export const getPendingMediaDataDb = (uri: string) => {
    const result = db.getFirstSync<{ type: string; data: string }>("SELECT type, data FROM pending_media_data WHERE uri = ?", [
        uri,
    ]);
    if (result) {
        return { type: result.type, data: JSON.parse(result.data) };
    }
    return null;
};

export const deletePendingMediaDataDb = (uri: string) => {
    const stmt = db.prepareSync("DELETE FROM pending_media_data WHERE uri = ?");
    stmt.executeSync([uri]);
};

// --- VPC Export Functions ---
export interface VpcExport {
    id: number;
    timestamp: number;
    filepath: string;
    filename: string;
    config_json: string;
}

export const addVpcExportDb = (filepath: string, filename: string, configJson: string) => {
    const stmt = db.prepareSync(
        "INSERT OR REPLACE INTO vpc_exports (timestamp, filepath, filename, config_json) VALUES (?, ?, ?, ?)",
    );
    stmt.executeSync([Date.now(), filepath, filename, configJson]);
};

export const getVpcExportsDb = (): VpcExport[] => {
    return db.getAllSync<VpcExport>("SELECT * FROM vpc_exports ORDER BY timestamp DESC");
};

export const deleteVpcExportDb = (id: number) => {
    const stmt = db.prepareSync("DELETE FROM vpc_exports WHERE id = ?");
    stmt.executeSync([id]);
};

export const deleteVpcExportByPathDb = (filepath: string) => {
    const stmt = db.prepareSync("DELETE FROM vpc_exports WHERE filepath = ?");
    stmt.executeSync([filepath]);
};
