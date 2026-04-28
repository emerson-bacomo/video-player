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
}

