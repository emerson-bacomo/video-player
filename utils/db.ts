import * as SQLite from 'expo-sqlite';

export const db = SQLite.openDatabaseSync('player.db');

export const initDB = () => {
  db.execSync(`
    CREATE TABLE IF NOT EXISTS playback_data (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      video_id TEXT UNIQUE,
      last_played_ms INTEGER DEFAULT -1
    );
    CREATE TABLE IF NOT EXISTS albums (
      id TEXT PRIMARY KEY,
      title TEXT,
      assetCount INTEGER,
      lastModified INTEGER,
      thumbnail TEXT,
      hasNew INTEGER DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS videos (
      id TEXT PRIMARY KEY,
      albumId TEXT,
      filename TEXT,
      uri TEXT,
      duration REAL,
      width INTEGER,
      height INTEGER,
      creationTime INTEGER,
      modificationTime INTEGER,
      thumbnail TEXT,
      lastPlayedMs INTEGER DEFAULT -1
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
};

export const savePlaybackData = (videoId: string, lastPlayedMs: number) => {
  const stmt = db.prepareSync('INSERT OR REPLACE INTO playback_data (video_id, last_played_ms) VALUES (?, ?)');
  stmt.executeSync([videoId, lastPlayedMs]);
};

export const getPlaybackData = (videoId: string): number => {
  const result = db.getFirstSync<{ last_played_ms: number }>('SELECT last_played_ms FROM playback_data WHERE video_id = ?', [videoId]);
  return result ? result.last_played_ms : -1;
};

export const getAllPlaybackData = () => {
  return db.getAllSync<{ video_id: string, last_played_ms: number }>('SELECT * FROM playback_data');
};

// --- Album Functions ---
export const saveAlbums = (albums: any[]) => {
  db.execSync('DELETE FROM albums');
  const stmt = db.prepareSync('INSERT INTO albums (id, title, assetCount, lastModified, thumbnail, hasNew) VALUES (?, ?, ?, ?, ?, ?)');
  albums.forEach(a => {
    stmt.executeSync([a.id, a.title, a.assetCount, a.lastModified || 0, a.thumbnail || '', a.hasNew ? 1 : 0]);
  });
};

export const getAlbums = () => {
  const results = db.getAllSync<any>('SELECT * FROM albums');
  return results.map(a => ({ ...a, hasNew: !!a.hasNew }));
};
 
export const updateAlbumThumbnail = (albumId: string, thumbUri: string) => {
  const stmt = db.prepareSync('UPDATE albums SET thumbnail = ? WHERE id = ?');
  stmt.executeSync([thumbUri, albumId]);
};

// --- Video Functions ---
export const saveVideos = (albumId: string | null, videos: any[]) => {
  if (albumId) {
    db.execSync(`DELETE FROM videos WHERE albumId = '${albumId}'`);
  } else {
    db.execSync('DELETE FROM videos');
  }
  const stmt = db.prepareSync(`
    INSERT INTO videos (id, albumId, filename, uri, duration, width, height, creationTime, modificationTime, thumbnail, lastPlayedMs)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  videos.forEach(v => {
    stmt.executeSync([
      v.id, v.albumId || albumId || '', v.filename, v.uri, v.duration, v.width, v.height,
      v.creationTime, v.modificationTime, v.thumbnail || '', v.lastPlayedMs || -1
    ]);
  });
};

export const getAllVideos = () => {
  return db.getAllSync<any>('SELECT * FROM videos');
};

export const getVideosForAlbum = (albumId: string) => {
  return db.getAllSync<any>('SELECT * FROM videos WHERE albumId = ?', [albumId]);
};

export const updateVideoThumbnail = (videoId: string, thumbUri: string) => {
  const stmt = db.prepareSync('UPDATE videos SET thumbnail = ? WHERE id = ?');
  stmt.executeSync([thumbUri, videoId]);
};

// --- Sync Metadata ---
export const setLastSyncTimestamp = (timestamp: number) => {
  const stmt = db.prepareSync('INSERT OR REPLACE INTO sync_metadata (key, value) VALUES (?, ?)');
  stmt.executeSync(['lastFullScanTimestamp', timestamp.toString()]);
};

export const getLastSyncTimestamp = (): number => {
  const result = db.getFirstSync<{ value: string }>('SELECT value FROM sync_metadata WHERE key = ?', ['lastFullScanTimestamp']);
  return result ? parseInt(result.value) : 0;
};

export const saveSetting = (key: string, value: string) => {
  const stmt = db.prepareSync('INSERT OR REPLACE INTO sync_metadata (key, value) VALUES (?, ?)');
  stmt.executeSync([key, value]);
};

export const getSetting = (key: string): string | null => {
  const result = db.getFirstSync<{ value: string }>('SELECT value FROM sync_metadata WHERE key = ?', [key]);
  return result ? result.value : null;
};

export const clearAllThumbnails = () => {
  db.execSync('UPDATE albums SET thumbnail = ""');
  db.execSync('UPDATE videos SET thumbnail = ""');
};

// --- Theme Functions ---
export const getThemePresets = () => {
  return db.getAllSync<any>('SELECT * FROM theme_presets ORDER BY is_system DESC, id ASC');
};

export const getActiveThemePreset = () => {
  return db.getFirstSync<any>('SELECT * FROM theme_presets WHERE is_active = 1');
};

export const saveThemePreset = (name: string, config: string, is_active: number = 0, is_system: number = 0) => {
  if (is_active === 1) {
    db.execSync('UPDATE theme_presets SET is_active = 0');
  }
  const stmt = db.prepareSync('INSERT INTO theme_presets (name, config, is_active, is_system) VALUES (?, ?, ?, ?)');
  const result = stmt.executeSync([name, config, is_active, is_system]);
  return result.lastInsertRowId;
};

export const updateThemePreset = (id: number, config: string, name?: string) => {
  if (name) {
    const stmt = db.prepareSync('UPDATE theme_presets SET name = ?, config = ? WHERE id = ?');
    stmt.executeSync([name, config, id]);
  } else {
    const stmt = db.prepareSync('UPDATE theme_presets SET config = ? WHERE id = ?');
    stmt.executeSync([config, id]);
  }
};

export const deleteThemePreset = (id: number) => {
  // Don't delete system themes
  const stmt = db.prepareSync('DELETE FROM theme_presets WHERE id = ? AND is_system = 0');
  stmt.executeSync([id]);
};

export const setActiveThemePreset = (id: number) => {
  db.execSync('UPDATE theme_presets SET is_active = 0');
  const stmt = db.prepareSync('UPDATE theme_presets SET is_active = 1 WHERE id = ?');
  stmt.executeSync([id]);
};

// --- Reset Database ---
export const resetDatabase = () => {
  db.execSync('DELETE FROM playback_data');
  db.execSync('DELETE FROM albums');
  db.execSync('DELETE FROM videos');
  db.execSync('DELETE FROM sync_metadata');
  db.execSync('DELETE FROM theme_presets');
};
