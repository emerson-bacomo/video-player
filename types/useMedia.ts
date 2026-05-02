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

export type SessionClip = VideoMedia & {
    segments: { start: number; end: number }[];
    exportOptions: ExportOptions;
    sessionCreatedAt?: number;
};

export interface VideoMedia {
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
    size?: number;
    isPlaceholder?: boolean;
    albumId: string;
    markers?: { time: number; markerId: string }[];
    lastOpenedTime?: number;
    clipSourceUri?: string;
    isNewOverride?: boolean;
}

export interface Album {
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
