import { secondsToFileStamp } from "@/utils/secondsToHhmmss";

const VIDEO_EXTENSION_RE = /\.(mp4|mkv|mov|avi|flv|wmv|webm|m4v)$/i;

export const sanitizeFilename = (name: string): string => {
    return name.replace(/[<>:"/\\|?*]/g, "_").trim();
};

const sanitizeDefaultName = (name: string): string => {
    return name
        .replace(/[\\/:*?"<>|]/g, "_")
        .replace(/[\x00-\x1F\x7F]/g, "")
        .replace(/^\.+|\.+$/g, "")
        .replace(/\s+/g, "_")
        .replace(/_+/g, "_")
        .trim();
};

export const buildClipDefaultName = (videoTitle: string, segments: { start: number; end: number }[]): string => {
    const baseName = videoTitle.replace(VIDEO_EXTENSION_RE, "");
    const cleanName = sanitizeDefaultName(baseName);

    const timeSegments = segments
        .map((s) => `${secondsToFileStamp(s.start)}_${s.end ? secondsToFileStamp(s.end) : "end"}`)
        .join("__");

    return `${cleanName}_${timeSegments}`;
};

export const buildScreenshotName = (videoTitle: string, timestampSeconds: number): string => {
    const baseName = videoTitle.replace(VIDEO_EXTENSION_RE, "");
    const cleanName = sanitizeDefaultName(baseName) || "Screenshot";

    return `${cleanName}_${secondsToFileStamp(timestampSeconds)}.jpg`;
};
