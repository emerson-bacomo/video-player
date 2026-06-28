import { SetLoadingTask } from "./useMediaLoadingTask";
import * as FileSystem from "expo-file-system/legacy";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Dispatch, SetStateAction, RefObject } from "react";
import { unstable_batchedUpdates } from "react-native";
import ExpoFFmpeg from "../modules/expo-ffmpeg";
import type { AlbumData, VideoData } from "@/types/useMedia";
import { clearAllThumbnailsDb, getAllVideosDb, updateAlbumThumbnailDb, updateVideoThumbnailDb } from "../utils/db";
import { getThumbnailUri } from "@/utils/videoUtils";
import type { VideoSortConfig } from "@/types/useMedia";
import type { MediaStore } from "@/hooks/MediaStore";
import { Album } from "./domain/Album";
import { Video } from "./domain/Video";

const MAX_WORKERS = 4;
const RESULT_BATCH_SIZE = 3;
const RESULT_DRAIN_INTERVAL_MS = 16;
const RESULT_IDLE_POLL_MS = 32;
const THUMBNAIL_SUCCESS_MS = 1000;

const TASK_IDS = {
    THUMBNAIL_GEN: "thumbnail-gen",
    CACHE_CLEAR: "cache-clear",
} as const;

interface UseMediaThumbnailGenerationProps {
    setAlbums: Dispatch<SetStateAction<AlbumData[]>>;
    setAllAlbumsVideos: Dispatch<SetStateAction<Record<string, VideoData[]>>>;
    albumsRef: RefObject<Record<string, AlbumData>>;
    store: MediaStore;
    setLoadingTask: SetLoadingTask;
    mapVideoMetadata: (v: any) => VideoData;
}

const compareByVideoSort = (a: VideoData, b: VideoData, vSort?: VideoSortConfig) =>
    Video.compareBySort(a, b, vSort);

export const useMediaThumbnailGeneration = ({
    setAlbums,
    setAllAlbumsVideos,
    albumsRef,
    store,
    setLoadingTask,
    mapVideoMetadata,
}: UseMediaThumbnailGenerationProps) => {
    const [isRegeneratingThumbnails, setIsRegeneratingThumbnails] = useState(false);
    const isRegeneratingThumbnailsRef = useRef(false);

    // Refs for background worker state
    const thumbnailQueue = useRef<VideoData[]>([]);
    const activeWorkers = useRef(0);
    const resultQueue = useRef<(VideoData & { thumbUri: string; bustedUri: string })[]>([]);
    const isDraining = useRef(false);
    const drainTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const lastLoadingDetailRef = useRef<string | null>(null);
    const completedThumbnailCountRef = useRef(0);
    const totalThumbnailCountRef = useRef(0);
    const thumbnailSessionRef = useRef(0);
    const lastProgressUpdateRef = useRef(0);
    const onQueueEmptyRef = useRef<(() => void) | null>(null);

    // Album currently being viewed — its videos are always queued first for thumbnail generation
    const thumbnailGenerationPriorityAlbumIdRef = useRef<string | null>(null);
    const albumRankRef = useRef<Map<string, number>>(new Map()); // id → sort rank, O(1) lookup
    const lastSortKeyRef = useRef<string>(""); // Track last sort priority to avoid redundant sorts

    useEffect(() => {
        return () => {
            if (drainTimerRef.current) {
                clearTimeout(drainTimerRef.current);
                drainTimerRef.current = null;
            }
        };
    }, []);

    const setThumbnailPriorityAlbum = useCallback((albumId: string | null) => {
        thumbnailGenerationPriorityAlbumIdRef.current = albumId;
        // Re-sort the in-flight queue immediately so the new priority takes effect right away
        if (albumId) lastSortKeyRef.current = "";
    }, []);

    const updateAlbumRank = useCallback((albums: AlbumData[]) => {
        albumRankRef.current = new Map(albums.map((a, i) => [a.id, i]));
        lastSortKeyRef.current = ""; // Force workers to re-sort since the rank has changed
    }, []);

    const getThumbnailCached = useCallback(async (videoId: string) => {
        const thumbUri = getThumbnailUri(videoId);
        try {
            const fileInfo = await FileSystem.getInfoAsync(thumbUri);
            if (fileInfo.exists) return thumbUri;
        } catch (e) {}
        return "";
    }, []);

    const resolveQueueEmpty = useCallback(() => {
        onQueueEmptyRef.current?.();
        onQueueEmptyRef.current = null;
    }, []);

    const startThumbnailSession = useCallback(() => {
        thumbnailSessionRef.current += 1;
        resultQueue.current = [];
        completedThumbnailCountRef.current = 0;
        // Preserve total count if set by generateThumbnails, otherwise set from queue
        if (totalThumbnailCountRef.current <= 0) {
            totalThumbnailCountRef.current = thumbnailQueue.current.length;
        }
        lastSortKeyRef.current = "";
        lastLoadingDetailRef.current = null;
        return thumbnailSessionRef.current;
    }, []);

    const cancelThumbnailSession = useCallback(() => {
        thumbnailSessionRef.current += 1;
        resultQueue.current = [];
        completedThumbnailCountRef.current = 0;
        totalThumbnailCountRef.current = 0;
        lastSortKeyRef.current = "";
        lastLoadingDetailRef.current = null;
        resolveQueueEmpty();
    }, []);

    const hasActiveThumbnailWork = useCallback(() => activeWorkers.current > 0 || isDraining.current, []);

    const getAlbumThumbnailForVideos = useCallback(
        (albumVideos: VideoData[], sortToUse: VideoSortConfig) => {
            if (albumVideos.length === 0) return undefined;

            const sortedVideos = [...albumVideos].sort((a, b) => compareByVideoSort(a, b, sortToUse));
            return sortedVideos[0]?.thumbnail;
        },
        [compareByVideoSort],
    );

    const sortByPriority = useCallback(
        (a: VideoData, b: VideoData): number => {
            const albumRank = albumRankRef.current;
            const priorityAlbumId = thumbnailGenerationPriorityAlbumIdRef.current;

            // If the user is inside an album, always put its videos first regardless of global rank
            if (priorityAlbumId) {
                const aIsPriority = a.albumId === priorityAlbumId;
                const bIsPriority = b.albumId === priorityAlbumId;
                if (aIsPriority && !bIsPriority) return -1;
                if (!aIsPriority && bIsPriority) return 1;
            }

            if (a.albumId !== b.albumId) {
                return (albumRank.get(a.albumId) ?? 9999) - (albumRank.get(b.albumId) ?? 9999);
            }

            const album = albumsRef.current[a.albumId];
            const activeSort = store.getAlbum(album?.id ?? "")?.videoSort ?? Video.globalSortConfig;
            return compareByVideoSort(a, b, activeSort);
        },
        [compareByVideoSort, albumsRef, store],
    );

    const finishDraining = useCallback(() => {
        if (drainTimerRef.current) {
            clearTimeout(drainTimerRef.current);
            drainTimerRef.current = null;
        }
        isDraining.current = false;
        lastSortKeyRef.current = "";
        lastLoadingDetailRef.current = null;
        if (completedThumbnailCountRef.current > 0) {
            const completedCount = completedThumbnailCountRef.current;
            completedThumbnailCountRef.current = 0;
            totalThumbnailCountRef.current = 0;
            setLoadingTask({
                id: TASK_IDS.THUMBNAIL_GEN,
                label: "Thumbnail Success",
                detail: completedCount === 1 ? "Generated 1 thumbnail." : `Generated ${completedCount} thumbnails.`,
                importance: "SHOW_POPUP",
                dismissAfter: THUMBNAIL_SUCCESS_MS,
            });
        } else {
            setLoadingTask(null, TASK_IDS.THUMBNAIL_GEN);
        }
        completedThumbnailCountRef.current = 0;
        totalThumbnailCountRef.current = 0;
        resolveQueueEmpty();
    }, [resolveQueueEmpty, setLoadingTask]);

    const drainResults = useCallback(
        (sessionId: number) => {
            if (isDraining.current) return;
            isDraining.current = true;

            const scheduleNext = (delay: number) => {
                if (drainTimerRef.current) clearTimeout(drainTimerRef.current);
                drainTimerRef.current = setTimeout(runDrainStep, delay);
            };

            const runDrainStep = () => {
                drainTimerRef.current = null;

                if (thumbnailSessionRef.current !== sessionId) {
                    isDraining.current = false;
                    return;
                }

                if (resultQueue.current.length === 0) {
                    if (activeWorkers.current > 0) {
                        scheduleNext(RESULT_IDLE_POLL_MS);
                        return;
                    }
                    finishDraining();
                    return;
                }

                resultQueue.current.sort((a, b) => sortByPriority(a, b));
                const batchSize = thumbnailQueue.current.length === 0 ? resultQueue.current.length : RESULT_BATCH_SIZE;
                const batch = resultQueue.current.splice(0, batchSize);
                const updatesByAlbum = new Map<string, Map<string, { thumbUri: string; bustedUri: string; title: string }>>();

                for (const item of batch) {
                    if (!item.albumId) continue;
                    let albumUpdates = updatesByAlbum.get(item.albumId);
                    if (!albumUpdates) {
                        albumUpdates = new Map();
                        updatesByAlbum.set(item.albumId, albumUpdates);
                    }
                    albumUpdates.set(item.id, {
                        thumbUri: item.thumbUri,
                        bustedUri: item.bustedUri,
                        title: item.title,
                    });
                }
                completedThumbnailCountRef.current += batch.length;

                const latestTitle = batch[batch.length - 1]?.title ?? null;
                const now = Date.now();
                const shouldUpdateTask =
                    latestTitle && (lastLoadingDetailRef.current !== latestTitle || now - lastProgressUpdateRef.current > 100);

                unstable_batchedUpdates(() => {
                    if (shouldUpdateTask) {
                        lastLoadingDetailRef.current = latestTitle;
                        lastProgressUpdateRef.current = now;
                        const total = totalThumbnailCountRef.current;
                        const done = completedThumbnailCountRef.current;
                        const thumbProgress = total > 0 ? done / total : undefined;
                        setLoadingTask({
                            id: TASK_IDS.THUMBNAIL_GEN,
                            label: "Generating Thumbnails",
                            detail: latestTitle!,
                            importance: "SHOW_POPUP",
                            progress: thumbProgress,
                        });
                    }

                    if (updatesByAlbum.size > 0) {
                        setAlbums((prev) => {
                            let changed = false;
                            const next = prev.map((album) => {
                                const albumUpdates = updatesByAlbum.get(album.id);
                                if (!albumUpdates) return album;

                                let matchingUpdate: { thumbUri: string; bustedUri: string } | undefined;

                                if (album.thumbnail) {
                                    matchingUpdate = Array.from(albumUpdates.values()).find((update) =>
                                        album.thumbnail?.startsWith(update.thumbUri),
                                    );
                                } else {
                                    matchingUpdate = Array.from(albumUpdates.values())[0];
                                }

                                if (!matchingUpdate) return album;

                                changed = true;
                                updateAlbumThumbnailDb(album.id, matchingUpdate.bustedUri);
                                return { ...album, thumbnail: matchingUpdate.bustedUri };
                            });
                            return changed ? next : prev;
                        });

                        setAllAlbumsVideos((prev) => {
                            let changed = false;
                            const next = { ...prev };
                            for (const [albumId, albumUpdates] of updatesByAlbum.entries()) {
                                const videos = next[albumId];
                                if (!videos) continue;

                                let albumChanged = false;
                                const nextVideos = videos.map((video) => {
                                    const update = albumUpdates.get(video.id);
                                    if (!update) return video;
                                    albumChanged = true;
                                    return { ...video, thumbnail: update.bustedUri, baseThumbnailUri: update.thumbUri };
                                });

                                if (albumChanged) {
                                    next[albumId] = nextVideos;
                                    changed = true;
                                }
                            }
                            return changed ? next : prev;
                        });
                    }
                });

                if (resultQueue.current.length > 0 || activeWorkers.current > 0) {
                    scheduleNext(RESULT_DRAIN_INTERVAL_MS);
                } else {
                    isDraining.current = false;
                    finishDraining();
                }
            };

            runDrainStep();
        },
        [finishDraining, setAlbums, setAllAlbumsVideos, setLoadingTask, sortByPriority],
    );

    const spawnWorker = useCallback(
        async (sessionId: number) => {
            activeWorkers.current++;

            while (thumbnailQueue.current.length > 0) {
                if (thumbnailSessionRef.current !== sessionId) break;

                const sortKey = `${Video.globalSortConfig.by}-${Video.globalSortConfig.order}-${Album.globalSortConfig.by}-${Album.globalSortConfig.order}`;
                if (lastSortKeyRef.current !== sortKey) {
                    thumbnailQueue.current.sort((a, b) => sortByPriority(a, b));
                    lastSortKeyRef.current = sortKey;
                }

                const task = thumbnailQueue.current.shift();
                if (!task) break;

                try {
                    const thumbUri = getThumbnailUri(task.id);
                    const fileInfo = await FileSystem.getInfoAsync(thumbUri);
                    const alreadyExists = fileInfo.exists;

                    if (alreadyExists || (await ExpoFFmpeg.generateThumbnail(task.uri, thumbUri))) {
                        if (thumbnailSessionRef.current !== sessionId) continue;
                        const bustedUri = `${thumbUri}?t=${Date.now()}`;
                        updateVideoThumbnailDb(task.id, bustedUri);

                        resultQueue.current.push({
                            ...task,
                            thumbUri,
                            bustedUri,
                        });
                    }
                } catch (e) {}

                await new Promise((r) => setTimeout(r, 0)); // yield to event loop
            }

            activeWorkers.current--;
        },
        [sortByPriority],
    );

    const processQueue = useCallback(() => {
        if (thumbnailQueue.current.length === 0 || hasActiveThumbnailWork()) return;
        const sessionId = startThumbnailSession();
        const toSpawn = Math.min(MAX_WORKERS, thumbnailQueue.current.length);
        for (let i = 0; i < toSpawn; i++) spawnWorker(sessionId);
        drainResults(sessionId);
    }, [hasActiveThumbnailWork, startThumbnailSession, spawnWorker, drainResults]);

    const clearThumbnailCache = useCallback(async () => {
        try {
            setLoadingTask({
                id: TASK_IDS.CACHE_CLEAR,
                label: "Clearing Thumbnails",
                detail: "Removing cache files...",
                importance: "SHOW_POPUP",
            });
            const files = await FileSystem.readDirectoryAsync(FileSystem.cacheDirectory!);
            const thumbFiles = files.filter((f) => f.startsWith("thumb_"));
            await Promise.all(
                thumbFiles.map((f) => FileSystem.deleteAsync(`${FileSystem.cacheDirectory}${f}`, { idempotent: true })),
            );
            cancelThumbnailSession();
            setAlbums((prev) => prev.map((a) => ({ ...a, thumbnail: undefined })));
            setAllAlbumsVideos((prev) => {
                const next = { ...prev };
                for (const albumId in next) {
                    next[albumId] = next[albumId].map((v) => ({ ...v, thumbnail: undefined }));
                }
                return next;
            });
        } catch (e) {
            console.error("[useMediaThumbnailGeneration] Failed to clear cache:", e);
        } finally {
            setLoadingTask(null, TASK_IDS.CACHE_CLEAR);
        }
    }, [setAlbums, setAllAlbumsVideos, setLoadingTask, cancelThumbnailSession]);

    const regenerateVideoThumbnails = useCallback(
        async (videos: VideoData[]) => {
            if (videos.length === 0) return;

            try {
                const videoIds = new Set(videos.map((v) => v.id));
                const albumIds = new Set(videos.map((v) => v.albumId));

                // 1. Delete thumbnail files and update DB for all videos
                await Promise.all(
                    videos.map(async (v) => {
                        const thumbUri = getThumbnailUri(v.id);
                        await FileSystem.deleteAsync(thumbUri, { idempotent: true });
                        updateVideoThumbnailDb(v.id, "");
                    }),
                );

                // 2. Update state in memory
                unstable_batchedUpdates(() => {
                    setAllAlbumsVideos((prev) => {
                        const next = { ...prev };
                        albumIds.forEach((albumId) => {
                            if (albumId && next[albumId]) {
                                next[albumId] = next[albumId].map((v) => {
                                    if (videoIds.has(v.id)) {
                                        return { ...v, thumbnail: undefined, baseThumbnailUri: getThumbnailUri(v.id) };
                                    }
                                    return v;
                                });
                            }
                        });
                        return next;
                    });

                    setAlbums((prev) => {
                        let changed = false;
                        const next = prev.map((album) => {
                            if (!albumIds.has(album.id)) return album;
                            // If the album's current thumbnail was one of the ones we just cleared,
                            // we should probably clear it or wait for the new one.
                            // The easiest way is to check if it points to a thumb_ file of a video we cleared.
                            const matchingVideo = videos.find((v) => v.albumId === album.id && album.thumbnail?.includes(v.id));
                            if (matchingVideo) {
                                changed = true;
                                updateAlbumThumbnailDb(album.id, "");
                                return { ...album, thumbnail: undefined };
                            }
                            return album;
                        });
                        return changed ? next : prev;
                    });
                });

                // 3. Add to queue
                const newToQueue: VideoData[] = [];
                videos.forEach((v) => {
                    const videoToQueue = mapVideoMetadata({ ...v, thumbnail: undefined });
                    if (!thumbnailQueue.current.some((p) => p.id === videoToQueue.id)) {
                        newToQueue.push(videoToQueue);
                    }
                });

                if (newToQueue.length > 0) {
                    thumbnailQueue.current.push(...newToQueue);
                    totalThumbnailCountRef.current = thumbnailQueue.current.length;
                    processQueue();
                }
            } catch (e) {
                console.error("[useMediaThumbnailGeneration] Failed to regenerate thumbnails:", e);
            }
        },
        [setAllAlbumsVideos, setAlbums, mapVideoMetadata, processQueue],
    );

    const generateThumbnails = useCallback(
        async (regenerate: boolean = false): Promise<void> => {
            if (hasActiveThumbnailWork() || thumbnailQueue.current.length > 0) return;
            let didQueue = false;

            try {
                if (regenerate) {
                    await clearThumbnailCache();

                    setLoadingTask({
                        id: TASK_IDS.CACHE_CLEAR,
                        label: "Clearing Thumbnails",
                        detail: "Updating database...",
                        importance: "SHOW_POPUP",
                    });
                    clearAllThumbnailsDb();
                }

                setLoadingTask({
                    id: TASK_IDS.THUMBNAIL_GEN,
                    label: "Generating Thumbnails",
                    detail: "Queuing assets...",
                    importance: "SHOW_POPUP",
                });
                const allVideos = getAllVideosDb();
                const toQueue = allVideos
                    .filter((v: any) => !v.thumbnail)
                    .map((v: any) => ({
                        ...mapVideoMetadata(v),
                    }));

                if (toQueue.length > 0) {
                    didQueue = true;
                    const newItems = toQueue.filter((m: any) => !thumbnailQueue.current.some((p) => p.id === m.id));
                    thumbnailQueue.current.push(...newItems);
                    totalThumbnailCountRef.current = thumbnailQueue.current.length;
                    setLoadingTask({
                        id: TASK_IDS.THUMBNAIL_GEN,
                        label: "Generating Thumbnails",
                        detail: `Queuing ${newItems.length} asset${newItems.length !== 1 ? "s" : ""}...`,
                        importance: "SHOW_POPUP",
                        progress: 0,
                    });

                    const done = new Promise<void>((resolve) => {
                        onQueueEmptyRef.current = resolve;
                    });
                    processQueue();
                    await done;
                    return;
                }
            } catch (e) {
                console.error("[useMediaThumbnailGeneration] Generation failed:", e);
            } finally {
                if (!didQueue && thumbnailQueue.current.length === 0) {
                    setLoadingTask(null, TASK_IDS.THUMBNAIL_GEN);
                }
            }
        },
        [hasActiveThumbnailWork, clearThumbnailCache, setLoadingTask, mapVideoMetadata],
    );

    const regenerateAllThumbnails = useCallback(async () => {
        if (isRegeneratingThumbnailsRef.current) return;
        isRegeneratingThumbnailsRef.current = true;
        setIsRegeneratingThumbnails(true);
        try {
            await generateThumbnails(true);
        } finally {
            isRegeneratingThumbnailsRef.current = false;
            setIsRegeneratingThumbnails(false);
        }
    }, [generateThumbnails]);

    return {
        isRegeneratingThumbnails,
        isRegeneratingThumbnailsRef,
        setThumbnailPriorityAlbum,
        generateThumbnails,
        regenerateAllThumbnails,
        clearThumbnailCache,
        cancelThumbnailSession,
        hasActiveThumbnailWork,
        getAlbumThumbnailForVideos,
        getThumbnailCached,
        updateAlbumRank,
        regenerateVideoThumbnails,
        thumbnailQueue,
    };
};
