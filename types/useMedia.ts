export interface VideoMedia {
    id: string;
    filename: string;
    title: string;
    uri: string;
    path: string;
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
}

export interface Album {
    id: string;
    title: string;
    folderName: string;
    assetCount: number;
    path: string;
    thumbnail?: string;
    lastModified?: number;
    hasNew?: boolean;
    videoSortSettingScope?: "global" | "local";
    videoSortType?: string;
}
