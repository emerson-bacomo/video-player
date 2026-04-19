import * as SQLite from "expo-sqlite";

export const db = SQLite.openDatabaseSync("player.db");

export const initDB = () => {
    db.execSync(`
    CREATE TABLE IF NOT EXISTS playback_data (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      video_id TEXT UNIQUE,
      last_played_sec REAL DEFAULT -1
    );
    CREATE TABLE IF NOT EXISTS albums (
      id TEXT PRIMARY KEY,
      title TEXT,
      displayName TEXT,
      assetCount INTEGER,
      lastModified INTEGER,
      thumbnail TEXT,
      hasNew INTEGER DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS videos (
      id TEXT PRIMARY KEY,
      albumId TEXT,
      filename TEXT,
      displayName TEXT,
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
        db.execSync("ALTER TABLE albums ADD COLUMN displayName TEXT");
    } catch {}
    try {
        db.execSync("ALTER TABLE videos ADD COLUMN displayName TEXT");
    } catch {}
    try {
        db.execSync("ALTER TABLE videos ADD COLUMN size INTEGER");
    } catch {}
    try {
        db.execSync("ALTER TABLE videos ADD COLUMN path TEXT");
    } catch {}

    // v2: ms → sec unit migration
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
};

export const savePlaybackDataDb = (videoId: string, lastPlayedSec: number) => {
    const stmt = db.prepareSync("INSERT OR REPLACE INTO playback_data (video_id, last_played_sec) VALUES (?, ?)");
    stmt.executeSync([videoId, lastPlayedSec]);
};

export const getPlaybackDataDb = (videoId: string): number => {
    const result = db.getFirstSync<{ last_played_sec: number }>("SELECT last_played_sec FROM playback_data WHERE video_id = ?", [
        videoId,
    ]);
    return result ? result.last_played_sec : -1;
};

export const getAllPlaybackDataDb = () => {
    return db.getAllSync<{ video_id: string; last_played_sec: number }>("SELECT video_id, last_played_sec FROM playback_data");
};

// --- Album Functions ---
export const saveAlbumsDb = (albums: any[]) => {
    db.execSync("DELETE FROM albums");
    const stmt = db.prepareSync(
        "INSERT INTO albums (id, title, displayName, assetCount, lastModified, thumbnail, hasNew) VALUES (?, ?, ?, ?, ?, ?, ?)",
    );
    albums.forEach((a) => {
        stmt.executeSync([
            a.id,
            a.title,
            a.displayName || a.title,
            a.assetCount,
            a.lastModified || 0,
            a.thumbnail || "",
            a.hasNew ? 1 : 0,
        ]);
    });
};

export const getAlbumsDb = () => {
    const results = db.getAllSync<any>("SELECT * FROM albums");
    return results.map((a) => ({ ...a, hasNew: !!a.hasNew }));
};

export const updateAlbumThumbnailDb = (albumId: string, thumbUri: string) => {
    const stmt = db.prepareSync("UPDATE albums SET thumbnail = ? WHERE id = ?");
    stmt.executeSync([thumbUri, albumId]);
};

// --- Video Functions ---
export const saveVideosDb = (albumId: string | null, videos: any[]) => {
    if (albumId) {
        db.execSync(`DELETE FROM videos WHERE albumId = '${albumId}'`);
    } else {
        db.execSync("DELETE FROM videos");
    }
    const stmt = db.prepareSync(`
    INSERT INTO videos (id, albumId, filename, displayName, uri, path, duration, width, height, modificationTime, thumbnail, lastPlayedSec, size)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
    videos.forEach((v) => {
        stmt.executeSync([
            v.id,
            v.albumId || albumId || "",
            v.filename,
            v.displayName,
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
    return db.getAllSync<any>(`
        SELECT v.*, COALESCE(p.last_played_sec, v.lastPlayedSec) as lastPlayedSec 
        FROM videos v 
        LEFT JOIN playback_data p ON v.id = p.video_id
    `);
};

export const getVideoByIdDb = (id: string) => {
    return db.getFirstSync<any>(`
        SELECT v.*, COALESCE(p.last_played_sec, v.lastPlayedSec) as lastPlayedSec 
        FROM videos v 
        LEFT JOIN playback_data p ON v.id = p.video_id 
        WHERE v.id = ?
    `, [id]);
};

export const getVideosForAlbumDb = (albumId: string) => {
    return db.getAllSync<any>(`
        SELECT v.*, COALESCE(p.last_played_sec, v.lastPlayedSec) as lastPlayedSec 
        FROM videos v 
        LEFT JOIN playback_data p ON v.id = p.video_id 
        WHERE v.albumId = ?
    `, [albumId]);
};

export const searchVideosByNameDb = (query: string) => {
    return db.getAllSync<any>("SELECT * FROM videos WHERE displayName LIKE ? OR filename LIKE ?", [`%${query}%`, `%${query}%`]);
};

export const updateVideoThumbnailDb = (videoId: string, thumbUri: string) => {
    const stmt = db.prepareSync("UPDATE videos SET thumbnail = ? WHERE id = ?");
    stmt.executeSync([thumbUri, videoId]);
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

export const setIsInitialScanCompleteDb = (complete: boolean) => {
    const stmt = db.prepareSync("INSERT OR REPLACE INTO sync_metadata (key, value) VALUES (?, ?)");
    stmt.executeSync(["isInitialScanComplete", complete ? "1" : "0"]);
};

export const getIsInitialScanCompleteDb = (): boolean => {
    const result = db.getFirstSync<{ value: string }>("SELECT value FROM sync_metadata WHERE key = ?", ["isInitialScanComplete"]);
    return result?.value === "1";
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
    db.execSync("DELETE FROM playback_data");
    db.execSync("DELETE FROM albums");
    db.execSync("DELETE FROM videos");
    db.execSync("DELETE FROM sync_metadata");
    db.execSync("DELETE FROM theme_presets");
};
