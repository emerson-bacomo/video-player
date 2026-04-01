import * as FileSystem from "expo-file-system/legacy";
import * as MediaLibrary from "expo-media-library";
import React, { createContext, useContext, useEffect, useState } from "react";
// @ts-ignore - local module
import { LoadingTask } from "@/components/LoadingStatus";
import ExpoFFmpeg from "../modules/expo-ffmpeg";

import {
    getAlbums,
    getAllPlaybackData,
    getLastSyncTimestamp,
    getVideosForAlbum,
    resetDatabase as resetDB,
    saveAlbums,
    saveVideos,
    setLastSyncTimestamp,
    updateAlbumThumbnail,
    updateVideoThumbnail,
} from "../utils/db";

export interface VideoMedia {
    id: string;
    filename: string;
    uri: string;
    duration: number;
    width: number;
    height: number;
    creationTime: number;
    modificationTime: number;
    thumbnail?: string;
    lastPlayedMs: number;
    isPlaceholder?: boolean;
}

export type SortBy = "name" | "date" | "duration" | "episode";
export type SortOrder = "asc" | "desc";

export interface Album {
    id: string;
    title: string;
    assetCount: number;
    type?: string;
    thumbnail?: string;
    lastModified?: number;
    hasNew?: boolean;
    isPlaceholder?: boolean;
}

export interface MediaContextType {
    albums: Album[];
    videos: VideoMedia[];
    currentAlbum: Album | null;
    manualRefresh: boolean;
    loadingId: string | null;
    loadingTask: LoadingTask | null;
    error: string | null;
    albumSort: { by: SortBy; order: SortOrder };
    setAlbumSort: React.Dispatch<React.SetStateAction<{ by: SortBy; order: SortOrder }>>;
    videoSort: { by: SortBy; order: SortOrder };
    setVideoSort: React.Dispatch<React.SetStateAction<{ by: SortBy; order: SortOrder }>>;
    fetchAlbums: (force?: boolean, isImportant?: boolean, taskId?: string) => Promise<void>;
    fetchVideosInAlbum: (
        album: { id: string; title?: string; assetCount?: number },
        force?: boolean,
        taskId?: string,
    ) => Promise<void>;
    refreshPlaybackProgress: () => void;
    generateThumbnail: (uri: string, id: string, albumId?: string) => Promise<string | undefined>;
    clearThumbnailCache: () => Promise<void>;
    regenerateAllThumbnails: () => Promise<void>;
    syncDatabaseWithStorage: () => Promise<void>;
    resetToAlbums: () => void;
    resetEverything: () => Promise<void>;
    requestPermissionAndFetch: () => Promise<void>;
}

const MediaContext = createContext<MediaContextType | null>(null);

export const MediaProvider = ({ children }: { children: React.ReactNode }) => {
    const [videos, setVideos] = useState<VideoMedia[]>([]);
    const [albums, setAlbums] = useState<Album[]>([]);
    const [currentAlbum, setCurrentAlbum] = useState<Album | null>(null);
    const [manualRefresh, setManualRefresh] = useState(false);
    const [loadingId, setLoadingId] = useState<string | null>(null);
    const [loadingTask, setLoadingTask] = useState<LoadingTask | null>({
        label: "Initializing",
        detail: "Loading media library...",
        isImportant: true,
    });
    const [error, setError] = useState<string | null>(null);

    const [videoCache, setVideoCache] = useState<Record<string, VideoMedia[]>>({});

    // Refs for heavy background worker state to prevent infinite loops
    const thumbnailQueue = React.useRef<{ id: string; uri: string; albumId: string; filename: string }[]>([]);
    const activeWorkers = React.useRef(0);

    const MAX_CONCURRENT_THUMBNAILS = 3;

    const [albumSort, setAlbumSort] = useState<{ by: SortBy; order: SortOrder }>({ by: "date", order: "desc" });
    const [videoSort, setVideoSort] = useState<{ by: SortBy; order: SortOrder }>({ by: "episode", order: "asc" });

    const [permissionResponse, requestPermission] = MediaLibrary.usePermissions();

    const getThumbnailCached = async (videoId: string) => {
        const filename = `thumb_${videoId}.jpg`;
        const thumbUri = `${FileSystem.cacheDirectory}${filename}`;
        try {
            const fileInfo = await FileSystem.getInfoAsync(thumbUri);
            if (fileInfo.exists) return thumbUri;
        } catch (e) {}
        return undefined;
    };

    const generateThumbnail = async (videoUri: string, videoId: string, albumId?: string) => {
        const filename = `thumb_${videoId}.jpg`;
        const thumbUri = `${FileSystem.cacheDirectory}${filename}`;
        try {
            const success = await ExpoFFmpeg.generateThumbnail(videoUri, thumbUri);

            if (success) {
                // 1. Update DB
                updateVideoThumbnail(videoId, thumbUri);

                // 2. Update States (Atomic/Consolidated)
                const affectedAlbumId = albumId || currentAlbum?.id;

                if (affectedAlbumId) {
                    setVideoCache((prev) => {
                        const albumVids = prev[affectedAlbumId];
                        if (albumVids) {
                            const updated = albumVids.map((v) => (v.id === videoId ? { ...v, thumbnail: thumbUri } : v));
                            return { ...prev, [affectedAlbumId]: updated };
                        }
                        return prev;
                    });

                    // Force update 'videos' state only if it's the current view
                    if (currentAlbum?.id === affectedAlbumId) {
                        setVideos((prev) => prev.map((v) => (v.id === videoId ? { ...v, thumbnail: thumbUri } : v)));
                    }

                    // Update album thumbnail if it lacks a cover
                    setAlbums((aPrev) =>
                        aPrev.map((a) => {
                            if (a.id === affectedAlbumId && !a.thumbnail) {
                                updateAlbumThumbnail(affectedAlbumId, thumbUri);
                                return { ...a, thumbnail: thumbUri };
                            }
                            return a;
                        }),
                    );
                }
                return thumbUri;
            }
            return undefined;
        } catch (e) {
            return undefined;
        }
    };

    // Robust Background Worker
    const processQueue = async () => {
        if (thumbnailQueue.current.length === 0 || activeWorkers.current >= MAX_CONCURRENT_THUMBNAILS) return;

        activeWorkers.current++;

        while (thumbnailQueue.current.length > 0) {
            const priorityId = currentAlbum?.id;
            let index = thumbnailQueue.current.findIndex((t) => t.albumId === priorityId);
            if (index === -1) index = 0;

            const task = thumbnailQueue.current.splice(index, 1)[0];
            if (!task) break;

            setLoadingTask({ label: "Generating Thumbnails", detail: task.filename, isImportant: true });
            await generateThumbnail(task.uri, task.id, task.albumId);
        }

        activeWorkers.current--;
        if (activeWorkers.current === 0 && thumbnailQueue.current.length === 0) {
            setLoadingTask(null);
        }
    };

    // Trigger worker when queue changes or room opens up
    useEffect(() => {
        if (thumbnailQueue.current.length > 0 && activeWorkers.current < MAX_CONCURRENT_THUMBNAILS) {
            processQueue();
        }
    }, [thumbnailQueue.current.length, currentAlbum?.id]);

    const clearThumbnailCache = async () => {
        try {
            console.log("[Media] Clearing thumbnail cache...");
            setLoadingTask({ label: "Clearing Thumbnails", detail: "Removing cache files...", isImportant: true });
            const files = await FileSystem.readDirectoryAsync(FileSystem.cacheDirectory!);
            const thumbFiles = files.filter((f) => f.startsWith("thumb_"));
            await Promise.all(
                thumbFiles.map((f) => FileSystem.deleteAsync(`${FileSystem.cacheDirectory}${f}`, { idempotent: true })),
            );
            setVideoCache((prev) => {
                const next: Record<string, VideoMedia[]> = {};
                for (const k in prev) {
                    next[k] = prev[k].map((v) => ({ ...v, thumbnail: undefined }));
                }
                return next;
            });
            console.log("[Media] Thumbnail cache cleared.");
        } catch (e) {
            console.error("[Media] Failed to clear cache:", e);
        }
    };

    const regenerateAllThumbnails = async () => {
        try {
            await clearThumbnailCache();

            setLoadingTask({ label: "Clearing Thumbnails", detail: "Updating database...", isImportant: true });
            // @ts-ignore
            const { clearAllThumbnails: clearAllThumbnailsDB, getAllVideos } = require("../utils/db");
            clearAllThumbnailsDB();

            // Immediate UI update: Clear thumbnails from state
            setAlbums((prev) => prev.map((a) => ({ ...a, thumbnail: undefined })));
            setVideos((prev) => prev.map((v) => ({ ...v, thumbnail: undefined })));
            setVideoCache((prev) => {
                const next: Record<string, VideoMedia[]> = {};
                for (const k in prev) {
                    next[k] = prev[k].map((v) => ({ ...v, thumbnail: undefined }));
                }
                return next;
            });

            setLoadingTask({ label: "Generating Thumbnails", detail: "Queuing assets...", isImportant: true });
            const allVideos = getAllVideos();
            const toQueue = allVideos.map((v: any) => ({
                id: v.id,
                uri: v.uri,
                albumId: v.albumId,
                filename: v.filename,
            }));

            if (toQueue.length > 0) {
                const newItems = toQueue.filter((m: any) => !thumbnailQueue.current.some((p) => p.id === m.id));
                thumbnailQueue.current.push(...newItems);
                processQueue();
            }
        } catch (e) {
            console.error("[Media] Regeneration failed:", e);
        } finally {
            // Task will be cleared by the worker when queue is empty,
            // but we can set it to null here if no items were added.
            if (thumbnailQueue.current.length === 0) {
                setLoadingTask(null);
            }
        }
    };

    const syncDatabaseWithStorage = async () => {
        try {
            console.log("[Media] Syncing database with storage...");
            const playbackData = getAllPlaybackData();
            let deletedCount = 0;

            for (const record of playbackData) {
                try {
                    const asset = await MediaLibrary.getAssetInfoAsync(record.video_id);
                    if (!asset) throw new Error("Missing");
                } catch (e) {
                    console.log(`[Media] Removing stale record for ${record.video_id}`);
                    const thumbUri = `${FileSystem.cacheDirectory}thumb_${record.video_id}.jpg`;
                    await FileSystem.deleteAsync(thumbUri, { idempotent: true });
                    // @ts-ignore
                    const { db: database } = require("../utils/db");
                    database.execSync(`DELETE FROM playback_data WHERE video_id = '${record.video_id}'`);
                    database.execSync(`DELETE FROM videos WHERE id = '${record.video_id}'`);
                    deletedCount++;
                }
            }
            if (deletedCount > 0) console.log(`[Media] Cleaned up ${deletedCount} stale entries.`);
        } catch (e) {
            console.error("[Media] Sync failed:", e);
        }
    };

    const resetEverything = async () => {
        try {
            setLoadingTask({ label: "Resetting Library", detail: "Waiting for workers to stop...", isImportant: true });
            setError(null);
            await clearThumbnailCache();
            resetDB();
            setAlbums([]);
            setVideos([]);
            setVideoCache({});
            setCurrentAlbum(null);
            console.log("[Media] Full database and cache reset complete.");
        } catch (e) {
            setError("Failed to reset database");
        } finally {
            setLoadingTask(null);
        }
    };

    const loadDataFromDB = async () => {
        try {
            console.log("[Media] Loading initial data from DB...");
            const lastSync = getLastSyncTimestamp();
            setLoadingTask({
                label: "Loading Library",
                detail: "Reading cached data from database...",
                isImportant: lastSync === 0,
            });
            const cachedAlbums = getAlbums();
            if (cachedAlbums.length > 0) {
                setAlbums(cachedAlbums);

                // Pre-fill video cache from DB for all albums
                const fullVideoCache: Record<string, VideoMedia[]> = {};
                for (const album of cachedAlbums) {
                    const cachedVideos = getVideosForAlbum(album.id);
                    if (cachedVideos.length > 0) {
                        fullVideoCache[album.id] = cachedVideos;
                    }
                }
                setVideoCache(fullVideoCache);
            }
        } catch (e) {
            console.error("[Media] DB Load failed:", e);
        }
    };

    const performSmartSync = async (forceDeep = false, isImportant = true) => {
        try {
            const lastSync = getLastSyncTimestamp();
            const shouldBeImportant = isImportant && lastSync === 0; // Only auto show status on initial sync
            setLoadingTask({ label: "Scanning Media", detail: "Checking for new videos...", isImportant: shouldBeImportant });

            // Fast check: get the single most recent asset in the whole library
            const { assets: latestAssets } = await MediaLibrary.getAssetsAsync({
                mediaType: "video",
                sortBy: [["modificationTime", false]],
                first: 1,
            });

            const latestTimestamp = latestAssets[0]?.modificationTime || latestAssets[0]?.creationTime || 0;

            if (!forceDeep && lastSync !== 0 && latestTimestamp !== 0 && latestTimestamp <= lastSync) {
                console.log("[Media] Library is clean (Smart Sync). Skipping deep scan.");

                // Even if sync is skipped, ensure we check for missing thumbnails in DB records
                const cachedAlbums = getAlbums();
                const allMissing: { id: string; uri: string; albumId: string; filename: string }[] = [];
                for (const album of cachedAlbums) {
                    const dbVideos = getVideosForAlbum(album.id);
                    const missing = dbVideos
                        .filter((v) => !v.thumbnail)
                        .map((v) => ({
                            id: v.id,
                            uri: v.uri,
                            albumId: album.id,
                            filename: v.filename,
                        }));
                    allMissing.push(...missing);
                }
                if (allMissing.length > 0) {
                    const newItems = allMissing.filter((m) => !thumbnailQueue.current.some((p) => p.id === m.id));
                    thumbnailQueue.current.push(...newItems);
                    processQueue();
                }
                return;
            }

            console.log("[Media] Library changed or force requested. Starting deep scan...");
            await syncDatabaseWithStorage();

            const fetchedAlbums = await MediaLibrary.getAlbumsAsync();
            const playbackData = getAllPlaybackData();
            const playbackMap = new Map<string, number>();
            playbackData.forEach((p) => playbackMap.set(p.video_id, p.last_played_ms));

            const newAlbums: Album[] = [];
            const newVideoCache: Record<string, VideoMedia[]> = {};
            const allMissingToQueue: { id: string; uri: string; albumId: string; filename: string }[] = [];

            // Deep scan all albums and videos
            await Promise.all(
                fetchedAlbums.map(async (a) => {
                    const { assets: albumAssets, totalCount } = await MediaLibrary.getAssetsAsync({
                        album: a.id,
                        mediaType: "video",
                        first: 1000,
                        sortBy: [["modificationTime", false]],
                    });

                    if (albumAssets.length === 0) return;

                    const latestDate = Math.max(...albumAssets.map((asset) => asset.modificationTime || asset.creationTime || 0));
                    const hasNew = albumAssets.some((asset) => (playbackMap.get(asset.id) ?? -1) === -1);
                    const thumbnail = await getThumbnailCached(albumAssets[0].id);

                    const albumObj: Album = {
                        id: a.id,
                        title: a.title,
                        assetCount: totalCount,
                        lastModified: latestDate,
                        thumbnail,
                        hasNew,
                    };
                    newAlbums.push(albumObj);

                    const albumVideos: VideoMedia[] = await Promise.all(
                        albumAssets.map(async (asset) => {
                            const vThumb = await getThumbnailCached(asset.id);
                            const video = {
                                id: asset.id,
                                filename: asset.filename,
                                uri: asset.uri,
                                duration: asset.duration,
                                width: asset.width,
                                height: asset.height,
                                creationTime: asset.creationTime,
                                modificationTime: asset.modificationTime,
                                thumbnail: vThumb,
                                lastPlayedMs: playbackMap.get(asset.id) ?? -1,
                            };

                            if (!vThumb) {
                                allMissingToQueue.push({
                                    id: asset.id,
                                    uri: asset.uri,
                                    albumId: a.id,
                                    filename: asset.filename,
                                });
                            }
                            return video;
                        }),
                    );
                    newVideoCache[a.id] = albumVideos;
                    saveVideos(a.id, albumVideos);
                }),
            );

            // Sort and Save
            const sortedAlbums = newAlbums.sort((a, b) => (b.lastModified || 0) - (a.lastModified || 0));
            saveAlbums(sortedAlbums);
            setAlbums(sortedAlbums);
            setVideoCache(newVideoCache);

            if (allMissingToQueue.length > 0) {
                const newItems = allMissingToQueue.filter((m) => !thumbnailQueue.current.some((p) => p.id === m.id));
                thumbnailQueue.current.push(...newItems);
                processQueue();
            }

            setLastSyncTimestamp(latestTimestamp);
            setLoadingTask(null);
            console.log("[Media] Deep sync complete.");
        } catch (e) {
            console.error("[Media] Sync failed:", e);
            setError("Background sync failed");
        }
    };

    const fetchAlbums = async (force: boolean = false, isImportant: boolean = false, taskId?: string) => {
        if (force) {
            setLoadingTask({ id: taskId, label: "Loading Albums", detail: "Refreshing folders...", isImportant: isImportant });
            setManualRefresh(true);
            setLoadingId("albums");
            // Pull-to-refresh: perform scan but don't auto-show popup
            await performSmartSync(true, isImportant);
            setLoadingTask(null);
            setManualRefresh(false);
            setLoadingId(null);
        } else if (albums.length === 0) {
            await loadDataFromDB();
        }
    };

    const fetchVideosInAlbum = async (
        album: { id: string; title?: string; assetCount?: number },
        force: boolean = false,
        taskId?: string,
    ) => {
        if (loadingTask && !force && loadingId === album.id) return;

        if (force) {
            setLoadingTask({ id: taskId, label: "Loading Videos", detail: "Refreshing folder contents...", isImportant: false });
            setLoadingId(album.id);

            // Re-sync this specific directory
            const { assets: albumAssets } = await MediaLibrary.getAssetsAsync({
                album: album.id,
                mediaType: "video",
                first: 1000,
                sortBy: [["modificationTime", false]],
            });

            const playbackData = getAllPlaybackData();
            const playbackMap = new Map<string, number>();
            playbackData.forEach((p) => playbackMap.set(p.video_id, p.last_played_ms));

            const videos: VideoMedia[] = await Promise.all(
                albumAssets.map(async (asset) => {
                    const thumbnail = await getThumbnailCached(asset.id);
                    return {
                        id: asset.id,
                        filename: asset.filename,
                        uri: asset.uri,
                        duration: asset.duration,
                        width: asset.width,
                        height: asset.height,
                        creationTime: asset.creationTime,
                        modificationTime: asset.modificationTime,
                        thumbnail,
                        lastPlayedMs: playbackMap.get(asset.id) ?? -1,
                    };
                }),
            );

            saveVideos(album.id, videos);
            setVideos(videos);
            setVideoCache((prev) => ({ ...prev, [album.id]: videos }));
            setCurrentAlbum(album as Album);

            // Queue missing thumbnails
            const missing = videos
                .filter((v) => !v.thumbnail)
                .map((v) => ({
                    id: v.id,
                    uri: v.uri,
                    albumId: album.id,
                    filename: v.filename,
                }));
            if (missing.length > 0) {
                const newItems = missing.filter((m) => !thumbnailQueue.current.some((p) => p.id === m.id));
                thumbnailQueue.current.push(...newItems);
                processQueue();
            }

            setLoadingTask(null);
            setManualRefresh(false);
            setLoadingId(null);
        } else {
            // Instant load from memory/cache
            const cached = videoCache[album.id];
            if (cached) {
                setVideos(cached);
                setCurrentAlbum(album as Album);
            } else {
                setLoadingTask({ label: "Loading Database", detail: "Fetching cached videos...", isImportant: false });
                setLoadingId(album.id);
                const dbVideos = getVideosForAlbum(album.id);
                if (dbVideos.length > 0) {
                    setVideos(dbVideos);
                    setVideoCache((prev) => ({ ...prev, [album.id]: dbVideos }));
                    setCurrentAlbum(album as Album);
                } else {
                    // This case should be rare after the initial full scan
                    await fetchAlbums(true);
                    const freshVideos = getVideosForAlbum(album.id);
                    if (freshVideos.length > 0) {
                        setVideos(freshVideos);
                        setVideoCache((prev) => ({ ...prev, [album.id]: freshVideos }));
                        setCurrentAlbum(album as Album);
                    }
                }
                setLoadingTask(null);
                setLoadingId(null);
            }
        }
    };

    const checkPermission = async () => {
        if (permissionResponse?.status !== "granted") {
            const { status } = await requestPermission();
            return status === "granted";
        }
        return true;
    };

    const requestPermissionAndFetch = async () => {
        const granted = await checkPermission();
        if (granted) {
            // Important manual scan (e.g. Scan Device button)
            await performSmartSync(true, true);
        } else {
            setError("Permission denied. Cannot scan media.");
        }
    };

    const refreshPlaybackProgress = React.useCallback(() => {
        try {
            // @ts-ignore
            const { getAllPlaybackData } = require("../utils/db");
            const playbackData = getAllPlaybackData();
            const playbackMap = new Map<string, number>();
            playbackData.forEach((p: any) => playbackMap.set(p.video_id, p.last_played_ms));

            setVideos((prev) => {
                let changed = false;
                const next = prev.map((v) => {
                    const updatedMs = playbackMap.get(v.id) ?? -1;
                    if (v.lastPlayedMs !== updatedMs) changed = true;
                    return v.lastPlayedMs !== updatedMs ? { ...v, lastPlayedMs: updatedMs } : v;
                });
                return changed ? next : prev;
            });

            setVideoCache((prev) => {
                let cacheChanged = false;
                const next: Record<string, VideoMedia[]> = {};
                for (const key in prev) {
                    const mapped = prev[key].map((v) => {
                        const updatedMs = playbackMap.get(v.id) ?? -1;
                        if (v.lastPlayedMs !== updatedMs) cacheChanged = true;
                        return v.lastPlayedMs !== updatedMs ? { ...v, lastPlayedMs: updatedMs } : v;
                    });
                    next[key] = mapped;
                }
                return cacheChanged ? next : prev;
            });
        } catch (e) {
            console.error("[Media] Failed to refresh playback progress:", e);
        }
    }, []);

    useEffect(() => {
        // The 'active' variable serves as a cleanup guard.
        // It ensures that state updates (like setLoadingTask) don't occur
        // if this provider unmounts while an asynchronous operation is still pending.
        let active = true;

        const initialize = async () => {
            if (!permissionResponse) return;

            if (permissionResponse.status !== "granted") {
                if (active) setLoadingTask(null);
                return;
            }

            try {
                await loadDataFromDB();

                // Only perform an automatic sync if the user has completed a manual scan before.
                // This prevents the 'Auto Deep Scan' on fresh installs until the user clicks 'Scan Device'.
                const lastSync = getLastSyncTimestamp();
                if (lastSync !== 0) {
                    await performSmartSync(false, false);
                }
            } catch (e) {
                console.error("[Media] Initial load failed:", e);
            } finally {
                if (active) setLoadingTask(null);
            }
        };
        initialize();
        return () => {
            active = false;
        };
    }, [permissionResponse]);

    // Re-sort albums immediately when sort order changes
    useEffect(() => {
        if (albums.length > 0 && !loadingTask) {
            const sortFunction = (a: any, b: any) => {
                let comparison = 0;
                if (albumSort.by === "name") {
                    comparison = a.title.localeCompare(b.title);
                } else if (albumSort.by === "date") {
                    comparison = (a.lastModified || 0) - (b.lastModified || 0);
                } else if (albumSort.by === "duration") {
                    comparison = a.assetCount - b.assetCount;
                }
                return albumSort.order === "asc" ? comparison : -comparison;
            };
            setAlbums((prev) => [...prev].sort(sortFunction));
        }
    }, [albumSort]);

    return (
        <MediaContext.Provider
            value={{
                albums,
                videos,
                currentAlbum,
                manualRefresh,
                loadingId,
                loadingTask,
                error,
                albumSort,
                setAlbumSort,
                videoSort,
                setVideoSort,
                fetchAlbums,
                fetchVideosInAlbum,
                generateThumbnail,
                clearThumbnailCache,
                regenerateAllThumbnails,
                syncDatabaseWithStorage,
                refreshPlaybackProgress,
                resetToAlbums: () => {
                    setVideos([]);
                    setCurrentAlbum(null);
                },
                resetEverything,
                requestPermissionAndFetch,
            }}
        >
            {children}
        </MediaContext.Provider>
    );
};

export const useMedia = () => {
    const context = useContext(MediaContext);
    if (!context) {
        throw new Error("useMedia must be used within a MediaProvider");
    }
    return context;
};
