/**
 * Extracts a prefix from a filename to group related videos.
 * Heuristics:
 * 1. Takes text before common episode indicators like ' - ', ' EP ', ' episode ', etc.
 * 2. Takes text before the first numeric sequence that looks like an episode number.
 * 3. Handles patterns like [Group] Title - 01.mp4 and Titles_01_720p.mkv.
 */
export const extractPrefix = (filename: string): string => {
    // 1. Common series/anime episode markers
    const sepMatch = filename.match(/^(.*?)(?:\s*[-_|~]\s*(?:ep?|episode|e)?\s*\d+|\s+(?:ep?|episode|e)\s*\d+)/i);
    if (sepMatch && sepMatch[1]) {
        let prefix = sepMatch[1].trim();
        // Remove trailing hyphens, underscores, or markers
        prefix = prefix.replace(/[\s\-_|~]+$/, "").trim();
        if (prefix) return prefix;
    }

    // 2. Fallback: text before the first digit (if it's not the year 20xx or 19xx)
    const digitMatch = filename.match(/^(.*?)(\s*\d+.*)/);
    if (digitMatch && digitMatch[1]) {
        let prefix = digitMatch[1].trim();
        // If it's just a bracketed group name, keep it.
        // e.g. [Group] Show 01 -> [Group] Show
        prefix = prefix.replace(/[\s\-_|~]+$/, "").trim();
        if (prefix && prefix.length > 2) return prefix;
    }

    // 3. Fallback: split by common separators and take first part
    const separators = [" - ", " _ ", " | "];
    for (const sep of separators) {
        const parts = filename.split(sep);
        if (parts.length > 1 && parts[0].trim().length > 1) {
            return parts[0].trim();
        }
    }

    // If no prefix found, or name is too short, return first 5 chars
    return filename.substring(0, 10).trim();
};

/**
 * Extracts a numeric episode number for sorting.
 * Returns -1 if no episode pattern is found.
 */
export const extractEpisode = (filename: string): number => {
    const epMatch = filename.match(/(?:ep?|episode)\s*0*(\d+)|e0*(\d+)|_0*(\d{1,3})_|_0*(\d{1,3})v/i);
    const episodeStr = epMatch ? epMatch[1] || epMatch[2] || epMatch[3] || epMatch[4] : null;
    return episodeStr ? parseInt(episodeStr, 10) : -1;
};
