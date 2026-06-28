export type TransitionStyle = "crossfade" | "slide-left" | "slide-right" | "smear-left" | "smear-right";

export interface Marker {
    time: number;
    markerId: string;
}

export interface MarkerPair {
    id: string;
    start: Marker;
    end: Marker;
}

export interface ExportOptions {
    name: string;
    quality: "high" | "balanced" | "low" | "custom";
    resolution: string;
    format: "mp4" | "gif" | "mkv" | "mov" | "avi";
    removeAudio: boolean;
    removeMarkers: boolean;
    crf: number;
    preset: string;
    useTransition: boolean;
    transitionDuration: number;
    transitionStyle: TransitionStyle;
}

export interface VideoData {
    id: string;
    filename: string;
    title: string;
    uri: string;
    duration: number;
    width: number;
    height: number;
    modificationTime: number;
    thumbnail?: string;
    baseThumbnailUri: string;
    lastPlayedSec: number;
    prefix?: string;
    rawPrefix?: string;
    episode?: number;
    season?: number;
    size?: number;
    isPlaceholder?: boolean;
    albumId: string;
    markers?: Marker[];
    lastOpenedTime?: number;
    clipSourceUri?: string;
    isNewOverride?: boolean;
}

export interface AlbumData {
    id: string;
    title: string;
    albumName: string;
    assetCount: number;
    uri: string;
    thumbnail?: string;
    lastModified?: number;
    videoSortSettingScope?: "global" | "local";
    videoSortType?: string;
    prefixOptions?: string;
    selectedPrefixOptions?: string;
    isHidden?: number;
}

export interface ScreenshotData {
    id: string;
    uri: string;
    filename: string;
    videoTitle?: string;
    videoId?: string;
    albumId?: string;
    captureTimestamp?: number;
    createdAt: number;
    width?: number;
    height?: number;
    fileSize?: number;
    thumbnail?: string;
}

// ── Sort types ────────────────────────────────────────────────────────

export type SortBy = "name" | "date" | "duration" | "episode";
export type AlbumSortBy = "name" | "date" | "count";
export type SortOrder = "asc" | "desc";

export interface VideoSortConfig {
    by: SortBy;
    order: SortOrder;
}

export interface AlbumSortConfig {
    by: AlbumSortBy;
    order: SortOrder;
}

export interface SessionClip {
    id: string;
    filename: string;
    title: string;
    uri: string;
    duration: number;
    width: number;
    height: number;
    thumbnail?: string;
    baseThumbnailUri: string;
    lastPlayedSec: number;
    albumId: string;
    markers?: Marker[];
    clipSourceUri?: string;
    segments: { start: number; end: number }[];
    exportOptions: ExportOptions;
    sessionCreatedAt?: number;
}
