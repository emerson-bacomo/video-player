import { Album } from "@/types/useMedia";
import * as SQLite from "expo-sqlite";

export const db = SQLite.openDatabaseSync("player.db");

export const initDB = () => {
    db.execSync(`
    CREATE TABLE IF NOT EXISTS albums (
      id TEXT PRIMARY KEY,
      title TEXT,
      assetCount INTEGER,
      lastModified INTEGER,
      thumbnail TEXT,
      hasNew INTEGER DEFAULT 0,
      videoSortSettingScope TEXT DEFAULT 'global',
      videoSortType TEXT,
      prefixOptions TEXT,
      selectedPrefixOptions TEXT,
      folderName TEXT,
      path TEXT
    );
    CREATE TABLE IF NOT EXISTS videos (
      id TEXT PRIMARY KEY,
      albumId TEXT,
      filename TEXT,
      title TEXT,
      uri TEXT,
      path TEXT,
      duration REAL,
      width INTEGER,
      height INTEGER,
      modificationTime INTEGER,
      thumbnail TEXT,
      lastPlayedSec REAL DEFAULT -1,
      size INTEGER
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
  `);
    // Column migrations (safe for fresh & existing installs)
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
        db.execSync("ALTER TABLE videos ADD COLUMN path TEXT");
    } catch {}
    try {
        db.execSync("ALTER TABLE albums ADD COLUMN isHidden INTEGER DEFAULT 0");
    } catch {}
    try {
        db.execSync("ALTER TABLE videos ADD COLUMN isHidden INTEGER DEFAULT 0");
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
        db.execSync("ALTER TABLE albums ADD COLUMN folderName TEXT");
    } catch {}
    try {
        db.execSync("ALTER TABLE albums ADD COLUMN prefixOptions TEXT");
    } catch {}
    try {
        db.execSync("ALTER TABLE albums ADD COLUMN path TEXT");
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

export const getAllPlaybackDataDb = () => {
    return db.getAllSync<{ video_id: string; last_played_sec: number }>(
        "SELECT id as video_id, lastPlayedSec as last_played_sec FROM videos WHERE lastPlayedSec >= 0",
    );
};

// --- Album Functions ---
export const getHiddenAlbumsDb = (): Album[] => {
    const results = db.getAllSync<any>("SELECT * FROM albums WHERE isHidden = 1");
    return results.map((a) => {
        let folderName = a.folderName;
        let path = a.path;
        if (!folderName || !path) {
            const firstVideo = db.getFirstSync<{ path: string }>("SELECT path FROM videos WHERE albumId = ? LIMIT 1", [a.id]);
            if (firstVideo && firstVideo.path) {
                if (!path) path = firstVideo.path.substring(0, firstVideo.path.lastIndexOf("/"));
                if (!folderName) folderName = path ? path.split("/").pop() : a.title;
            }
            if (!folderName) folderName = a.title || "Unknown";
            if (!path) path = ""; // Fallback
            // Save migrated data right away
            try {
                const stmt = db.prepareSync("UPDATE albums SET folderName = ?, path = ? WHERE id = ?");
                stmt.executeSync([folderName, path, a.id]);
            } catch (e) {
                console.warn("[DB] Failed to save migration data for hidden album", a.id, e);
            }
        }
        return { ...a, hasNew: !!a.hasNew, isHidden: !!a.isHidden, folderName, path };
    });
};

export const saveAlbumsDb = (albums: Album[]) => {
    db.execSync("DELETE FROM albums");
    const stmt = db.prepareSync(
        "INSERT INTO albums (id, title, assetCount, lastModified, thumbnail, hasNew, videoSortSettingScope, videoSortType, folderName, path) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    );
    albums.forEach((a) => {
        stmt.executeSync([
            a.id,
            a.title,
            a.assetCount,
            a.lastModified || 0,
            a.thumbnail || "",
            a.hasNew ? 1 : 0,
            a.videoSortSettingScope || "global",
            a.videoSortType || null,
            a.folderName,
            a.path,
        ]);
    });
};

// Incremental, non-destructive album persistence for long-running syncs.
// This avoids losing scanned progress when the app is terminated before final bulk save.
export const upsertAlbumDb = (album: Album) => {
    const insertStmt = db.prepareSync(
        "INSERT OR IGNORE INTO albums (id, title, assetCount, lastModified, thumbnail, hasNew, videoSortSettingScope, videoSortType, folderName, path) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    );
    insertStmt.executeSync([
        album.id,
        album.title,
        album.assetCount,
        album.lastModified || 0,
        album.thumbnail || "",
        album.hasNew ? 1 : 0,
        album.videoSortSettingScope || "global",
        album.videoSortType || null,
        album.folderName,
        album.path,
    ]);

    const updateStmt = db.prepareSync(
        "UPDATE albums SET title = ?, assetCount = ?, lastModified = ?, thumbnail = ?, hasNew = ?, videoSortSettingScope = ?, videoSortType = ?, folderName = ?, path = ? WHERE id = ?",
    );
    updateStmt.executeSync([
        album.title,
        album.assetCount,
        album.lastModified || 0,
        album.thumbnail || "",
        album.hasNew ? 1 : 0,
        album.videoSortSettingScope || "global",
        album.videoSortType || null,
        album.folderName,
        album.path,
        album.id,
    ]);
};

export const getAlbumsDb = (): Album[] => {
    const results = db.getAllSync<any>("SELECT * FROM albums WHERE isHidden = 0");
    return results.map((a) => {
        let folderName = a.folderName;
        let path = a.path;
        if (!folderName || !path) {
            const firstVideo = db.getFirstSync<{ path: string }>("SELECT path FROM videos WHERE albumId = ? LIMIT 1", [a.id]);
            if (firstVideo && firstVideo.path) {
                if (!path) path = firstVideo.path.substring(0, firstVideo.path.lastIndexOf("/"));
                if (!folderName) folderName = path ? path.split("/").pop() : a.title;
            }
            if (!folderName) folderName = a.title || "Unknown";
            if (!path) path = ""; // Fallback
            // Save migrated data right away
            console.log("[DB] Migrating album", a.id, folderName, path);
            try {
                const stmt = db.prepareSync("UPDATE albums SET folderName = ?, path = ? WHERE id = ?");
                stmt.executeSync([folderName, path, a.id]);
            } catch (e) {
                console.warn("[DB] Failed to save migration data for album", a.id, e);
            }
        }
        return { ...a, hasNew: !!a.hasNew, isHidden: !!a.isHidden, folderName, path };
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
export const saveVideosDb = (albumId: string | null, videos: any[]) => {
    if (albumId) {
        db.execSync(`DELETE FROM videos WHERE albumId = '${albumId}'`);
    } else {
        db.execSync("DELETE FROM videos");
    }
    const stmt = db.prepareSync(`
    INSERT INTO videos (id, albumId, filename, title, uri, path, duration, width, height, modificationTime, thumbnail, lastPlayedSec, size)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
    videos.forEach((v) => {
        stmt.executeSync([
            v.id,
            v.albumId || albumId || "",
            v.filename,
            v.title,
            v.uri,
            v.path || v.uri,
            v.duration,
            v.width,
            v.height,
            v.modificationTime,
            v.thumbnail || "",
            v.lastPlayedSec ?? v.lastPlayedMs ?? -1, // fallback covers old field name
            v.size || 0,
        ]);
    });
};

export const getAllVideosDb = () => {
    return db.getAllSync<any>("SELECT * FROM videos WHERE isHidden = 0");
};

export const getVideoByIdDb = (id: string) => {
    return db.getFirstSync<any>("SELECT * FROM videos WHERE id = ?", [id]);
};

export const getVideosForAlbumDb = (albumId: string) => {
    return db.getAllSync<any>("SELECT * FROM videos WHERE albumId = ? AND isHidden = 0", [albumId]);
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
};
