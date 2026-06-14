import * as FileSystem from "expo-file-system/legacy";

const EPISODE_PATTERN =
    /(?:ep?|episode)\s*0*(\d+(?:\.\d+)?)|(?<![a-z])e0*(\d+(?:\.\d+)?)|(?<!s|season)(?<!\d[\s\-_])[\s\-_]0*(\d{1,3}(?:\.\d+)?)(?=[v\s\-_]|$)/i;
const SEASON_PATTERN = /(?:s|season)[\s_\-]*0*(\d+)/i;
// Combines season+episode patterns (e.g. "S01E02", "Season 1 Episode 2"), bare number pairs ("Name 2 1"),
// and 1x02 format. Negative lookahead on trailing separator prevents matching inside timestamps like 00-03-45.
// Groups: alt1: 1=season,2=episode | alt2: 3=season,4=episode | alt3: 5=season,6=episode
const SEASON_EPISODE_PATTERN = /(?:s|season)[\s_\-]*0*(\d+)[\s_\-]*(?:ep?|episode)\s*0*(\d+(?:\.\d+)?)|(?:(?<!\d)[\s\-_]|^)(\d{1,2})[\s\-_](\d{1,3})(?:(?![\s\-_]\d{1,3}(?:[\s\-_]|$))[\s\-_]|v|$)|(?:(?<!\d)[\s\-_]|^)(\d{1,2})x(\d{1,3})(?:(?![\s\-_]\d{1,3}(?:[\s\-_]|$))[\s\-_]|v|$)/i;

/**
 * Extracts a prefix from a filename to group related videos.
 * Heuristics:
 * 1. Takes text before common episode indicators like ' - ', ' EP ', ' episode ', etc.
 * 2. Takes text before the first numeric sequence that looks like an episode number.
 * 3. Handles patterns like [Group] Title - 01.mp4 and Titles_01_720p.mkv.
 */
export const extractPrefix = (filename: string): string => {
    if (!filename) return "Unknown";

    const epMatch = EPISODE_PATTERN.exec(filename);
    if (epMatch && typeof epMatch.index === "number") {
        const prefix = filename
            .slice(0, epMatch.index)
            .replace(/\.[^.]+$/, "")
            .replace(/[\s\-_|~]+$/, "")
            .trim();
        if (prefix.length > 1) return prefix;
    }

    // Fallback: split by common separators and take first part
    const separators = [" - ", " _ ", " | "];
    for (const sep of separators) {
        const parts = filename.split(sep);
        if (parts.length > 1 && parts[0].trim().length > 1) {
            return parts[0].trim();
        }
    }

    // If no prefix found, or name is too short, return first 5-10 chars
    return filename.substring(0, 10).trim() || "Unknown";
};

/**
 * Extracts a numeric episode number for sorting.
 * Returns -1 if no episode pattern is found.
 */
export const extractEpisode = (filename: string): number => {
    if (!filename) return -1;
    // Check for "Season Episode" pair first so the season number isn't mistaken for the episode
    const seMatch = filename.match(SEASON_EPISODE_PATTERN);
    if (seMatch) {
        const ep = seMatch[2] || seMatch[4] || seMatch[6];
        if (ep) return parseFloat(ep);
    }
    const epMatch = filename.match(EPISODE_PATTERN);
    const episodeStr = epMatch ? epMatch[1] || epMatch[2] || epMatch[3] : null;
    return episodeStr ? parseFloat(episodeStr) : -1;
};

/**
 * Extracts a numeric season number.
 * Returns -1 if no season pattern is found.
 */
export const extractSeason = (filename: string): number => {
    if (!filename) return -1;
    // Explicit S/Season prefix takes priority
    const sMatch = filename.match(SEASON_PATTERN);
    if (sMatch) return parseInt(sMatch[1], 10);
    // Fall back to "Season Episode" pair
    const seMatch = filename.match(SEASON_EPISODE_PATTERN);
    if (seMatch) {
        const s = seMatch[1] || seMatch[3] || seMatch[5];
        if (s) return parseInt(s, 10);
    }
    return -1;
};

export const getThumbnailUri = (videoId: string) => `${FileSystem.cacheDirectory}thumb_${videoId}.jpg`;
