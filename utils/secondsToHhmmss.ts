/** Format seconds as HH:MM:SS for display (e.g. "01:24:07") */
export const secondsToHhmmss = (totalSeconds: number): string => {
    const s = Math.max(0, Math.floor(totalSeconds));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return [h, m, sec].map((v) => v.toString().padStart(2, "0")).join(":");
};

/** Format seconds as HH-MM-SS for use in filenames (e.g. "01-24-07") */
export const secondsToFileStamp = (totalSeconds: number, omitEmptyHour = false): string => {
    const s = Math.max(0, Math.floor(totalSeconds));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    
    if (omitEmptyHour && h === 0) {
        return [m, sec].map((v) => v.toString().padStart(2, "0")).join("-");
    }
    return [h, m, sec].map((v) => v.toString().padStart(2, "0")).join("-");
};
