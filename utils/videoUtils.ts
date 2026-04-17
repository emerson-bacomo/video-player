const EPISODE_PATTERN =
    /(?:ep?|episode)\s*0*(\d+(?:\.\d+)?)|(?<![a-z])e0*(\d+(?:\.\d+)?)|(?<!s|season)(?<!\d[\s\-_])[\s\-_]0*(\d{1,3}(?:\.\d+)?)(?=[v\s\-_]|$)/i;

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
    const epMatch = filename.match(EPISODE_PATTERN);
    const episodeStr = epMatch ? epMatch[1] || epMatch[2] || epMatch[3] : null;
    return episodeStr ? parseFloat(episodeStr) : -1;
};
