import * as FileSystem from "expo-file-system/legacy";
import * as MediaLibrary from "expo-media-library";
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { AppState, AppStateStatus, unstable_batchedUpdates } from "react-native";
// @ts-ignore - local module
import { LoadingTask } from "@/components/LoadingStatus";
import ExpoFFmpeg from "../modules/expo-ffmpeg";

import { extractEpisode, extractPrefix } from "@/utils/videoUtils";
import {
    clearAllThumbnailsDb,
    getAlbumsDb,
    getAllPlaybackDataDb,
    getAllVideosDb,
    getIsInitialScanCompleteDb,
    getLastSyncTimestampDb,
    getSettingDb,
    getVideoByIdDb,
    getVideosForAlbumDb,
    resetDatabaseDb,
    saveAlbumsDb,
    savePlaybackDataDb,
    saveSettingDb,
    saveVideosDb,
    searchVideosByNameDb,
    setIsInitialScanCompleteDb,
    setLastSyncTimestampDb,
    updateAlbumThumbnailDb,
    updateVideoThumbnailDb,
} from "../utils/db";
import { useSettings } from "./useSettings";

const MAX_WORKERS = 4;
const RESULT_BATCH_SIZE = 3;
const RESULT_DRAIN_INTERVAL_MS = 16;
const RESULT_IDLE_POLL_MS = 32;
const THUMBNAIL_SUCCESS_MS = 1000;

export const getThumbnailUri = (videoId: string) => `${FileSystem.cacheDirectory}thumb_${videoId}.jpg`;

export interface VideoMedia {
    id: string;
    filename: string;
    displayName: string;
    uri: string;
    path: string;
    duration: number;
    width: number;
    height: number;
    modificationTime: number;
    thumbnail?: string;
    baseThumbnailUri: string; // Persistent URI, used to track if generation is done
    lastPlayedSec: number;
    prefix?: string; // Extracted series/season prefix
    episode?: number; // Extracted numeric episode number
    size?: number; // File size in bytes
    isPlaceholder?: boolean;
}

export type SortBy = "name" | "date" | "duration" | "episode";
export type SortOrder = "asc" | "desc";

export interface Album {
    id: string;
    title: string;
    displayName: string;
    assetCount: number;
    type?: string;
    thumbnail?: string;
    lastModified?: number;
    hasNew?: boolean;
    isPlaceholder?: boolean;
}

export interface MediaContextType {
    albums: Album[];
    currentAlbumVideos: VideoMedia[];
    setCurrentAlbumVideos: React.Dispatch<React.SetStateAction<VideoMedia[]>>;
    currentAlbum: Album | null;
    setCurrentAlbum: (album: Album | null) => void;
    loadingTask: LoadingTask | null;
    error: string | null;
    albumSort: { by: SortBy; order: SortOrder };
    setAlbumSort: React.Dispatch<React.SetStateAction<{ by: SortBy; order: SortOrder }>>;
    videoSort: { by: SortBy; order: SortOrder };
    setVideoSort: React.Dispatch<React.SetStateAction<{ by: SortBy; order: SortOrder }>>;
    fetchAlbums: () => Promise<void>;
    fetchVideosInAlbum: (album: {
        id: string;
        title?: string;
        assetCount?: number;
        thumbnail?: string;
        lastModified?: number;
    }) => Promise<void>;
    refreshPlaybackProgress: () => void;
    updateVideoProgress: (videoId: string, sec: number) => void;
    clearThumbnailCache: () => Promise<void>;
    regenerateAllThumbnails: () => Promise<void>;
    syncDatabaseWithStorage: () => Promise<void>;
    resetToAlbums: () => void;
    resetEverything: () => Promise<void>;
    requestPermissionAndFetch: () => Promise<void>;
    loadDataFromDB: () => Promise<void>;
    openAlbumByVideoId: (videoId: string) => Promise<void>;
    allVideosCache: Record<string, VideoMedia[]>;
    folderFilters: Record<string, string[]>;
    setFolderFilter: (albumId: string, filters: string[]) => void;
    isLoadingVisible: boolean;
    setIsLoadingVisible: React.Dispatch<React.SetStateAction<boolean>>;
    isLoadingExpanded: boolean;
    setIsLoadingExpanded: React.Dispatch<React.SetStateAction<boolean>>;
    setLoadingTask: React.Dispatch<React.SetStateAction<LoadingTask | null>>;
    searchMedia: (query: string) => VideoMedia[];
    permissionResponse: MediaLibrary.PermissionResponse | null;
    isInitialScanComplete: boolean;
}

const MediaContext = createContext<MediaContextType | null>(null);

export const MediaProvider = ({ children }: { children: React.ReactNode }) => {
    const [currentAlbumVideos, setCurrentAlbumVideos] = useState<VideoMedia[]>([]);
    const [albums, setAlbums] = useState<Album[]>([]);
    const [currentAlbum, setCurrentAlbumState] = useState<Album | null>(null);
    const [allVideosCache, setAllVideosCache] = useState<Record<string, VideoMedia[]>>({});
    const [loadingTask, setLoadingTaskInternal] = useState<LoadingTask | null>({
        label: "Initializing",
        detail: "Loading media library...",
        isImportant: false,
    });

    const setLoadingTask = useCallback((task: LoadingTask | null | ((prev: LoadingTask | null) => LoadingTask | null)) => {
        setLoadingTaskInternal((prev) => {
            const next = typeof task === "function" ? task(prev) : task;
            if (next?.isImportant) {
                setIsLoadingVisible(true);
            }
            return next;
        });
    }, []);
    const [error, setError] = useState<string | null>(null);
    const [isLoadingVisible, setIsLoadingVisible] = useState(false);
    const [isLoadingExpanded, setIsLoadingExpanded] = useState(false);
    const [albumSort, setAlbumSortState] = useState<{ by: SortBy; order: SortOrder }>({ by: "date", order: "desc" });
    const [videoSort, setVideoSortState] = useState<{ by: SortBy; order: SortOrder }>({ by: "episode", order: "asc" });
    const [isInitialScanComplete, setIsInitialScanComplete] = useState(false);
    const dismissTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
    const minimizeTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
    const pendingDismissRef = React.useRef<(() => void) | null>(null);

    // Auto-dismiss and auto-minimize loading tasks
    useEffect(() => {
        if (dismissTimeoutRef.current) {
            clearTimeout(dismissTimeoutRef.current);
            dismissTimeoutRef.current = null;
        }
        if (minimizeTimeoutRef.current) {
            clearTimeout(minimizeTimeoutRef.current);
            minimizeTimeoutRef.current = null;
        }

        // Store the callback for when this specific task is dismissed
        pendingDismissRef.current = loadingTask?.onDismiss || null;

        if (loadingTask?.dismissAfter) {
            dismissTimeoutRef.current = setTimeout(() => {
                const callback = pendingDismissRef.current;
                console.log("[Media] Task dismissed, calling onDismiss...");
                setLoadingTask(null);
                dismissTimeoutRef.current = null;
                // Execute callback AFTER state update to ensure UI is ready
                callback?.();
            }, loadingTask.dismissAfter);
        }

        if (loadingTask?.minimizeAfter) {
            minimizeTimeoutRef.current = setTimeout(() => {
                setIsLoadingExpanded(false);
                minimizeTimeoutRef.current = null;
            }, loadingTask.minimizeAfter);
        }

        return () => {
            if (dismissTimeoutRef.current) clearTimeout(dismissTimeoutRef.current);
            if (minimizeTimeoutRef.current) clearTimeout(minimizeTimeoutRef.current);
        };
    }, [loadingTask]);

    // Live State Refs to prevent stale closures inside background queue async workers
    const currentAlbumRef = React.useRef<Album | null>(null);
    const videoSortRef = React.useRef({ by: "episode" as SortBy, order: "asc" as SortOrder });
    const albumSortRef = React.useRef({ by: "date" as SortBy, order: "desc" as SortOrder });
    const albumsRef = React.useRef<Record<string, Album>>({}); // Dictionary for O(1) lookup
    const albumRankRef = React.useRef<Map<string, number>>(new Map()); // id → sort rank, O(1) lookup
    const allVideosCacheRef = React.useRef<Record<string, VideoMedia[]>>({});
    const videoDictRef = React.useRef<Map<string, VideoMedia>>(new Map()); // videoId → VideoMedia, O(1) lookup
    const lastSortKeyRef = React.useRef<string>(""); // Track last sort priority to avoid redundant sorts
    const isSyncingRef = React.useRef(false); // Prevent parallel smart syncs

    const setCurrentAlbum = useCallback((a: Album | null) => {
        if (currentAlbumRef.current?.id === a?.id) return;
        currentAlbumRef.current = a;
        setCurrentAlbumState(a);
    }, []);

    const setVideoSort = useCallback((s: React.SetStateAction<{ by: SortBy; order: SortOrder }>) => {
        setVideoSortState((prev) => {
            const next = typeof s === "function" ? s(prev) : s;
            if (prev.by === next.by && prev.order === next.order) return prev;
            videoSortRef.current = next;
            return next;
        });
    }, []);

    const setAlbumSort = useCallback((s: React.SetStateAction<{ by: SortBy; order: SortOrder }>) => {
        setAlbumSortState((prev) => {
            const next = typeof s === "function" ? s(prev) : s;
            if (prev.by === next.by && prev.order === next.order) return prev;
            albumSortRef.current = next;
            return next;
        });
    }, []);

    const { settings, loading: settingsLoading } = useSettings();

    const cleanName = React.useCallback(
        (name: string) => {
            if (!settings.nameReplacements || settings.nameReplacements.length === 0) return name;
            let cleaned = name;
            settings.nameReplacements.forEach((rule) => {
                if (rule.active && rule.find) {
                    cleaned = cleaned.split(rule.find).join(rule.replace || "");
                }
            });
            return cleaned;
        },
        [settings.nameReplacements],
    );

    // Refs for background worker state
    const thumbnailQueue = React.useRef<{ id: string; uri: string; albumId: string; filename: string }[]>([]);
    const activeWorkers = React.useRef(0);
    const resultQueue = React.useRef<
        { videoId: string; albumId: string; thumbUri: string; bustedUri: string; filename: string }[]
    >([]);
    const isDraining = React.useRef(false);
    const drainTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
    const successTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
    const lastLoadingDetailRef = React.useRef<string | null>(null);
    const completedThumbnailCountRef = React.useRef(0);
    const thumbnailSessionRef = React.useRef(0);
    const onQueueEmptyRef = React.useRef<(() => void) | null>(null);

    const [folderFilters, setFolderFilters] = useState<Record<string, string[]>>({});

    const setFolderFilter = useCallback((albumId: string, filters: string[]) => {
        setFolderFilters((prev) => {
            const next = { ...prev, [albumId]: filters };
            saveSettingDb("folderFilters", JSON.stringify(next));
            return next;
        });
    }, []);

    useEffect(() => {
        const dict: Record<string, Album> = {};
        albums.forEach((a) => (dict[a.id] = a));
        albumsRef.current = dict;
        // Rank is already updated in performSmartSync; only override here on user-sort triggered re-renders.
        albumRankRef.current = new Map(albums.map((a, i) => [a.id, i]));
    }, [albums]);
    useEffect(() => {
        allVideosCacheRef.current = allVideosCache;
        const dict = new Map<string, VideoMedia>();
        for (const vids of Object.values(allVideosCache)) {
            for (const v of vids) dict.set(v.id, v);
        }
        videoDictRef.current = dict;
    }, [allVideosCache]);
    useEffect(() => {
        return () => {
            if (drainTimerRef.current) {
                clearTimeout(drainTimerRef.current);
                drainTimerRef.current = null;
            }
            if (successTimerRef.current) {
                clearTimeout(successTimerRef.current);
                successTimerRef.current = null;
            }
        };
    }, []);

    // Sync sort settings to DB
    useEffect(() => {
        saveSettingDb("albumSort", JSON.stringify(albumSort));
    }, [albumSort]);

    useEffect(() => {
        saveSettingDb("videoSort", JSON.stringify(videoSort));
        // Also re-sort current videos in state if they exist
        if (currentAlbumVideos.length > 0) {
            setCurrentAlbumVideos((prev) => [...prev].sort((a, b) => compareByVideoSort(a, b, videoSort)));
        }
    }, [videoSort]);

    const [permissionResponse, requestPermission] = MediaLibrary.usePermissions();

    const getThumbnailCached = async (videoId: string) => {
        const thumbUri = getThumbnailUri(videoId);
        try {
            const fileInfo = await FileSystem.getInfoAsync(thumbUri);
            // We return the stable URI but let the UI decide when to show it via the staggered 'thumbnail' property
            if (fileInfo.exists) return thumbUri;
        } catch (e) {}
        return "";
    };

    // Shared priority comparator — used by both spawnWorker (thumbnailQueue) and drainResults (resultQueue)
    const compareByVideoSort = (a: VideoMedia, b: VideoMedia, vSort = videoSortRef.current) => {
        let comp = 0;

        if (vSort.by === "episode") {
            const prefixA = a.prefix ?? "";
            const prefixB = b.prefix ?? "";
            const prefixComp = prefixA.localeCompare(prefixB);
            if (prefixComp !== 0) {
                comp = prefixComp;
            } else {
                comp = (a.episode ?? 0) - (b.episode ?? 0);
            }
        } else if (vSort.by === "name") {
            comp = a.displayName.localeCompare(b.displayName);
        } else if (vSort.by === "date") {
            comp = (a.modificationTime || 0) - (b.modificationTime || 0);
        } else if (vSort.by === "duration") {
            comp = (a.duration || 0) - (b.duration || 0);
        }
        return vSort.order === "asc" ? comp : -comp;
    };

    // Parallel comparator for albums — mirrors compareByVideoSort
    const compareByAlbumSort = (a: Album, b: Album, aSort = albumSortRef.current) => {
        let comp = 0;
        if (aSort.by === "date") {
            comp = (a.lastModified || 0) - (b.lastModified || 0);
        } else if (aSort.by === "name") {
            comp = a.displayName.localeCompare(b.displayName);
        } else if (aSort.by === "duration") {
            // "duration" maps to assetCount for albums
            comp = (a.assetCount || 0) - (b.assetCount || 0);
        }
        return aSort.order === "asc" ? comp : -comp;
    };

    const clearSuccessTimer = () => {
        if (successTimerRef.current) {
            clearTimeout(successTimerRef.current);
            successTimerRef.current = null;
        }
    };

    const resolveQueueEmpty = () => {
        onQueueEmptyRef.current?.();
        onQueueEmptyRef.current = null;
    };

    const startThumbnailSession = () => {
        thumbnailSessionRef.current += 1;
        resultQueue.current = [];
        completedThumbnailCountRef.current = 0;
        lastSortKeyRef.current = "";
        lastLoadingDetailRef.current = null;
        clearSuccessTimer();
        return thumbnailSessionRef.current;
    };

    const cancelThumbnailSession = () => {
        thumbnailSessionRef.current += 1;
        resultQueue.current = [];
        completedThumbnailCountRef.current = 0;
        lastSortKeyRef.current = "";
        lastLoadingDetailRef.current = null;
        clearSuccessTimer();
        resolveQueueEmpty();
    };

    const hasActiveThumbnailWork = () => activeWorkers.current > 0 || isDraining.current;

    const getAlbumThumbnailForVideos = (albumVideos: VideoMedia[]) => {
        if (albumVideos.length === 0) return undefined;
        const sortedVideos = [...albumVideos].sort((a, b) => compareByVideoSort(a, b));
        const firstVideo = sortedVideos[0];
        return firstVideo?.thumbnail || firstVideo?.baseThumbnailUri || (firstVideo ? getThumbnailUri(firstVideo.id) : undefined);
    };

    const sortByPriority = (a: { albumId: string; id: string }, b: { albumId: string; id: string }): number => {
        const openAlbumId = currentAlbumRef.current?.id;
        const albumRank = albumRankRef.current;
        const videoDict = videoDictRef.current;

        const aIsPriority = a.albumId === openAlbumId;
        const bIsPriority = b.albumId === openAlbumId;
        if (aIsPriority && !bIsPriority) return -1;
        if (!aIsPriority && bIsPriority) return 1;
        if (a.albumId !== b.albumId) {
            return (albumRank.get(a.albumId) ?? 9999) - (albumRank.get(b.albumId) ?? 9999);
        }
        const vA = videoDict.get(a.id);
        const vB = videoDict.get(b.id);
        if (!vA || !vB) return 0;
        return compareByVideoSort(vA, vB);
    };

    const finishDraining = () => {
        if (drainTimerRef.current) {
            clearTimeout(drainTimerRef.current);
            drainTimerRef.current = null;
        }
        isDraining.current = false;
        lastSortKeyRef.current = "";
        lastLoadingDetailRef.current = null;
        clearSuccessTimer();
        if (completedThumbnailCountRef.current > 0) {
            const completedCount = completedThumbnailCountRef.current;
            completedThumbnailCountRef.current = 0;
            setLoadingTask({
                label: "Thumbnail Success",
                detail: completedCount === 1 ? "Generated 1 thumbnail." : `Generated ${completedCount} thumbnails.`,
                isImportant: true,
            });
            successTimerRef.current = setTimeout(() => {
                setLoadingTask((prev) => (prev?.label === "Thumbnail Success" ? null : prev));
                successTimerRef.current = null;
            }, THUMBNAIL_SUCCESS_MS);
        } else {
            setLoadingTask(null);
        }
        resolveQueueEmpty();
    };

    // Drains thumbnail results in small batches on a short timer so UI updates stay fast without deep recursion.
    const drainResults = (sessionId: number) => {
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

            resultQueue.current.sort((a, b) =>
                sortByPriority({ albumId: a.albumId, id: a.videoId }, { albumId: b.albumId, id: b.videoId }),
            );
            const batchSize = thumbnailQueue.current.length === 0 ? resultQueue.current.length : RESULT_BATCH_SIZE;
            const batch = resultQueue.current.splice(0, batchSize);
            const updatesByAlbum = new Map<string, Map<string, { thumbUri: string; bustedUri: string; filename: string }>>();

            for (const item of batch) {
                if (!item.albumId) continue;
                let albumUpdates = updatesByAlbum.get(item.albumId);
                if (!albumUpdates) {
                    albumUpdates = new Map();
                    updatesByAlbum.set(item.albumId, albumUpdates);
                }
                albumUpdates.set(item.videoId, {
                    thumbUri: item.thumbUri,
                    bustedUri: item.bustedUri,
                    filename: item.filename,
                });
            }
            completedThumbnailCountRef.current += batch.length;

            const latestFilename = batch[batch.length - 1]?.filename ?? null;

            unstable_batchedUpdates(() => {
                if (latestFilename && lastLoadingDetailRef.current !== latestFilename) {
                    lastLoadingDetailRef.current = latestFilename;
                    setLoadingTask({
                        label: "Generating Thumbnails",
                        detail: latestFilename,
                        isImportant: true,
                    });
                }

                if (updatesByAlbum.size > 0) {
                    setAllVideosCache((prev) => {
                        let changed = false;
                        const next = { ...prev };

                        for (const [albumId, albumUpdates] of updatesByAlbum) {
                            const albumVids = prev[albumId];
                            if (!albumVids) continue;

                            let albumChanged = false;
                            const mapped = albumVids.map((v) => {
                                const update = albumUpdates.get(v.id);
                                if (!update) return v;
                                albumChanged = true;
                                return { ...v, thumbnail: update.bustedUri, baseThumbnailUri: update.thumbUri };
                            });

                            if (albumChanged) {
                                next[albumId] = mapped;
                                changed = true;
                            }
                        }

                        return changed ? next : prev;
                    });

                    const currentAlbumId = currentAlbumRef.current?.id;
                    if (currentAlbumId) {
                        const currentAlbumUpdates = updatesByAlbum.get(currentAlbumId);
                        if (currentAlbumUpdates) {
                            setCurrentAlbumVideos((prev) => {
                                let changed = false;
                                const next = prev.map((v) => {
                                    const update = currentAlbumUpdates.get(v.id);
                                    if (!update) return v;
                                    changed = true;
                                    return { ...v, thumbnail: update.bustedUri, baseThumbnailUri: update.thumbUri };
                                });
                                return changed ? next : prev;
                            });
                        }
                    }

                    setAlbums((prev) => {
                        let changed = false;
                        const next = prev.map((album) => {
                            const albumUpdates = updatesByAlbum.get(album.id);
                            if (!albumUpdates || !album.thumbnail) return album;

                            const matchingUpdate = Array.from(albumUpdates.values()).find((update) =>
                                album.thumbnail?.startsWith(update.thumbUri),
                            );
                            if (!matchingUpdate) return album;

                            changed = true;
                            updateAlbumThumbnailDb(album.id, matchingUpdate.bustedUri);
                            return { ...album, thumbnail: matchingUpdate.bustedUri };
                        });
                        return changed ? next : prev;
                    });
                }
            });

            // Only schedule more draining if there is still pending work.
            // An unconditional scheduleNext here was causing an infinite setState loop.
            if (resultQueue.current.length > 0 || activeWorkers.current > 0) {
                scheduleNext(RESULT_DRAIN_INTERVAL_MS);
            } else {
                isDraining.current = false;
                finishDraining();
            }
        };

        runDrainStep();
    };

    // Pure IO worker: runs FFMPEG in parallel, pushes results to resultQueue — zero setState
    const spawnWorker = async (sessionId: number) => {
        activeWorkers.current++;

        while (thumbnailQueue.current.length > 0) {
            if (thumbnailSessionRef.current !== sessionId) break;

            // Only sort if priority might have shifted (album change or new sort)
            const sortKey = `${currentAlbumRef.current?.id}-${videoSortRef.current.by}-${videoSortRef.current.order}`;
            if (lastSortKeyRef.current !== sortKey) {
                thumbnailQueue.current.sort((a, b) => sortByPriority(a, b));
                lastSortKeyRef.current = sortKey;
            }

            const task = thumbnailQueue.current.shift();
            if (!task) break;

            try {
                const thumbUri = getThumbnailUri(task.id);
                // Check if file already exists - if so, skip FFMPEG but push to resultQueue for staggered UI reveal
                const fileInfo = await FileSystem.getInfoAsync(thumbUri);
                const alreadyExists = fileInfo.exists;

                if (alreadyExists || (await ExpoFFmpeg.generateThumbnail(task.uri, thumbUri))) {
                    if (thumbnailSessionRef.current !== sessionId) continue;
                    const bustedUri = `${thumbUri}?t=${Date.now()}`;
                    // Update DB immediately so it's marked as complete if the user quits during reveal
                    updateVideoThumbnailDb(task.id, bustedUri);

                    resultQueue.current.push({
                        videoId: task.id,
                        albumId: task.albumId,
                        thumbUri,
                        bustedUri,
                        filename: task.filename,
                    });
                }
            } catch (e) {}

            await new Promise((r) => setTimeout(r, 0)); // yield to event loop
        }

        activeWorkers.current--;
    };

    // Spawns parallel FFMPEG workers + single drainer for controlled UI updates
    const processQueue = () => {
        if (thumbnailQueue.current.length === 0 || hasActiveThumbnailWork()) return;
        const sessionId = startThumbnailSession();
        const toSpawn = Math.min(MAX_WORKERS, thumbnailQueue.current.length);
        for (let i = 0; i < toSpawn; i++) spawnWorker(sessionId);
        drainResults(sessionId); // single sequential drainer started alongside workers
    };

    const clearThumbnailCache = async () => {
        try {
            console.log("[Media] Clearing thumbnail cache...");
            setLoadingTask({ label: "Clearing Thumbnails", detail: "Removing cache files...", isImportant: true });
            const files = await FileSystem.readDirectoryAsync(FileSystem.cacheDirectory!);
            const thumbFiles = files.filter((f) => f.startsWith("thumb_"));
            await Promise.all(
                thumbFiles.map((f) => FileSystem.deleteAsync(`${FileSystem.cacheDirectory}${f}`, { idempotent: true })),
            );
            cancelThumbnailSession();
            setAlbums((prev) => prev.map((a) => ({ ...a, thumbnail: undefined })));
            setCurrentAlbumVideos((prev) =>
                prev.map((v) => ({
                    ...v,
                    thumbnail: undefined,
                    baseThumbnailUri: "",
                })),
            );
            setAllVideosCache((prev) => {
                const next: Record<string, VideoMedia[]> = {};
                for (const k in prev) {
                    next[k] = prev[k].map((v) => ({
                        ...v,
                        thumbnail: undefined,
                        baseThumbnailUri: "",
                    }));
                }
                return next;
            });
            console.log("[Media] Thumbnail cache cleared.");
        } catch (e) {
            console.error("[Media] Failed to clear cache:", e);
        } finally {
            setLoadingTask(null);
        }
    };

    const regenerateAllThumbnails = async () => {
        await generateThumbnails(true);
    };

    const generateThumbnails = async (regenerate: boolean = false) => {
        // Prevent double-clicking or initiating while a background generation is already actively running
        if (hasActiveThumbnailWork() || thumbnailQueue.current.length > 0) return;

        try {
            if (regenerate) {
                await clearThumbnailCache();

                setLoadingTask({ label: "Clearing Thumbnails", detail: "Updating database...", isImportant: true });
                // clearAllThumbnails wipes the 'thumbnail' property in the DB
                clearAllThumbnailsDb();
            }

            setLoadingTask({ label: "Generating Thumbnails", detail: "Queuing assets...", isImportant: true });
            const allVideos = getAllVideosDb();
            const toQueue = allVideos
                .filter((v: any) => !v.thumbnail)
                .map((v: any) => ({
                    id: v.id,
                    uri: v.uri,
                    albumId: v.albumId,
                    filename: v.filename,
                }));

            if (toQueue.length > 0) {
                const newItems = toQueue.filter((m: any) => !thumbnailQueue.current.some((p) => p.id === m.id));
                thumbnailQueue.current.push(...newItems);

                // Instantly resolve when the worker finishes — no polling needed
                const done = new Promise<void>((resolve) => {
                    onQueueEmptyRef.current = resolve;
                });
                processQueue();
                return done;
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
            console.log("[Media] Performing fast file-system sync...");
            const allVideos = getAllVideosDb();
            let deletedVideosCount = 0;
            const affectedAlbums = new Set<string>();

            // 1. Fast FS check for each video using content/file URI
            for (const video of allVideos) {
                const fileInfo = await FileSystem.getInfoAsync(video.uri);
                if (!fileInfo.exists) {
                    console.log(`[Media] File missing: ${video.filename}. Removing from database...`);

                    // Clean up thumbnail
                    const thumbUri = getThumbnailUri(video.id);
                    await FileSystem.deleteAsync(thumbUri, { idempotent: true });

                    // Delete from DB
                    // @ts-ignore
                    const { db: database } = require("../utils/db");
                    database.execSync(`DELETE FROM playback_data WHERE video_id = '${video.id}'`);
                    database.execSync(`DELETE FROM videos WHERE id = '${video.id}'`);

                    affectedAlbums.add(video.albumId);
                    deletedVideosCount++;
                }
            }

            // 2. Validate Affected Albums
            if (affectedAlbums.size > 0) {
                let albumUpdatesCount = 0;
                setAlbums((prev) => {
                    let changed = false;
                    const next = prev
                        .map((album) => {
                            if (!affectedAlbums.has(album.id)) return album;

                            const albumVids = getVideosForAlbumDb(album.id);
                            if (albumVids.length === 0) {
                                // Folder is empty now
                                changed = true;
                                // @ts-ignore
                                const { db: database } = require("../utils/db");
                                database.execSync(`DELETE FROM albums WHERE id = '${album.id}'`);
                                return null;
                            }

                            const newThumb = getAlbumThumbnailForVideos(albumVids);
                            if (newThumb && newThumb !== album.thumbnail) {
                                updateAlbumThumbnailDb(album.id, newThumb);
                                albumUpdatesCount++;
                                changed = true;
                                return { ...album, thumbnail: newThumb, assetCount: albumVids.length };
                            }
                            return { ...album, assetCount: albumVids.length };
                        })
                        .filter(Boolean) as Album[];
                    return changed ? next : prev;
                });

                // Clear cache entries for affected albums to force re-fetch
                setAllVideosCache((prev) => {
                    const next = { ...prev };
                    affectedAlbums.forEach((aid) => delete next[aid]);
                    return next;
                });

                if (deletedVideosCount > 0 || albumUpdatesCount > 0) {
                    console.log(
                        `[Media] Cleaned up ${deletedVideosCount} ghost records and updated ${albumUpdatesCount} album thumbnails.`,
                    );
                }
            }
        } catch (e) {
            console.error("[Media] Fast sync failed:", e);
        }
    };

    const resetEverything = async () => {
        if (loadingTask?.label === "Resetting Library") return;

        try {
            setLoadingTask({ label: "Resetting Library", detail: "Waiting for workers to stop...", isImportant: true });

            // Immediately halt background worker and results queue
            cancelThumbnailSession();
            thumbnailQueue.current = [];

            while (hasActiveThumbnailWork()) {
                // If we've cleared both queues, workers will exit after current task
                // and drainResults will exit once resultQueue is empty and activeWorkers is 0.
                await new Promise((r) => setTimeout(r, 100));
            }

            setError(null);
            await clearThumbnailCache();
            resetDatabaseDb();
            setAlbums([]);
            setCurrentAlbumVideos([]);
            setAllVideosCache({});
            setCurrentAlbum(null);
            await performSmartSync();
            console.log("[Media] Full database and cache reset complete.");
        } catch (e) {
            setError("Failed to reset database");
        } finally {
            isSyncingRef.current = false;
            setLoadingTask(null);
        }
    };

    const loadDataFromDB = async () => {
        try {
            console.log("[Media] Loading initial data from DB...");
            const lastSync = getLastSyncTimestampDb();
            setLoadingTask({
                label: "Loading Library",
                detail: "Reading cached data from database...",
                isImportant: lastSync === 0,
            });
            const cachedAlbums = getAlbumsDb();
            if (cachedAlbums.length > 0) {
                const cleanA = cachedAlbums.map((a: any) => ({
                    ...a,
                    displayName: cleanName(a.title),
                }));
                setAlbums(cleanA);

                const fullVideoCache: Record<string, VideoMedia[]> = {};
                for (const album of cachedAlbums) {
                    const cachedVideos = getVideosForAlbumDb(album.id);
                    if (cachedVideos.length > 0) {
                        const list = cachedVideos
                            .map((v: any) => {
                                const displayName = cleanName(v.filename);
                                return {
                                    ...v,
                                    displayName,
                                    thumbnail: v.thumbnail || undefined,
                                    baseThumbnailUri: getThumbnailUri(v.id),
                                    prefix: extractPrefix(v.filename),
                                    episode: extractEpisode(v.filename),
                                    size: v.size || undefined,
                                    path: v.path || v.uri,
                                };
                            })
                            .sort((a, b) => compareByVideoSort(a, b));
                        fullVideoCache[album.id] = list;
                    }
                }
                setAllVideosCache(fullVideoCache);

                // Sync the active "videos" state and "currentAlbum" if we are inside a folder
                const activeAlbumId = currentAlbumRef.current?.id;
                if (activeAlbumId) {
                    const cleanActiveAlbum = cleanA.find((a) => a.id === activeAlbumId);
                    if (cleanActiveAlbum) setCurrentAlbum(cleanActiveAlbum);

                    if (fullVideoCache[activeAlbumId]) {
                        setCurrentAlbumVideos(fullVideoCache[activeAlbumId]);
                    }
                }
            }

            // Load sort preferences
            const savedAlbumSort = getSettingDb("albumSort");
            if (savedAlbumSort) setAlbumSort(JSON.parse(savedAlbumSort));
            const savedVideoSort = getSettingDb("videoSort");
            if (savedVideoSort) setVideoSort(JSON.parse(savedVideoSort));
            const savedFilters = getSettingDb("folderFilters");
            if (savedFilters) setFolderFilters(JSON.parse(savedFilters));

            const initialScanComplete = getIsInitialScanCompleteDb();
            setIsInitialScanComplete(initialScanComplete);
        } catch (e) {
            console.error("[Media] DB Load failed:", e);
        } finally {
            setLoadingTask(null);
        }
    };

    const performSmartSync = async () => {
        if (isSyncingRef.current) return;

        // Guard: Disable sync if no permissions granted
        const hasPermission = await checkPermission();
        if (!hasPermission) return;

        isSyncingRef.current = true;
        try {
            const lastSync = getLastSyncTimestampDb();
            const syncLabel = "Syncing Media";

            // Initial check remains silent
            setLoadingTask({ label: syncLabel, detail: "Checking for new videos...", isImportant: false });

            // 1. Fast Check: Get the newest asset in the entire library
            const { assets: latestAssets } = await MediaLibrary.getAssetsAsync({
                mediaType: "video",
                sortBy: [["modificationTime", false]],
                first: 1,
            });

            const newestTimestamp = latestAssets[0]?.modificationTime || 0;

            if (lastSync !== 0 && newestTimestamp !== 0 && newestTimestamp <= lastSync) {
                console.log("[Media] Library is clean (Smart Sync). Skipping delta scan.");
                setLoadingTask({ label: syncLabel, detail: "Validating local files...", isImportant: false });
                await syncDatabaseWithStorage();
                setLoadingTask(null);
                return;
            }

            console.log("[Media] Library changed. Starting delta scan...");
            // Switch to visible now that we know there are actual changes
            setLoadingTask({ label: syncLabel, detail: "Processing changes...", isImportant: true });
            await syncDatabaseWithStorage();

            const playbackData = getAllPlaybackDataDb();
            const playbackMap = new Map(playbackData.map((p: any) => [p.video_id, p.last_played_sec]));

            let hasMore = true;
            let after: string | undefined = undefined;
            let totalNewFound = 0;
            let isFirstBatch = true;

            // 2. Paginated Global Scan with Staggered Updates
            while (hasMore) {
                const { assets, hasNextPage, endCursor } = await MediaLibrary.getAssetsAsync({
                    mediaType: "video",
                    first: 50,
                    sortBy: [["modificationTime", false]],
                    after,
                });

                const batchDeltaByAlbum = new Map<string, VideoMedia[]>();
                let foundStopPoint = false;

                for (const asset of assets) {
                    const time = asset.modificationTime || 0;
                    if (lastSync !== 0 && time <= lastSync) {
                        foundStopPoint = true;
                        break;
                    }

                    // Skip if already in DB and all metadata (including size/path) is present
                    const existing = videoDictRef.current.get(asset.id);
                    if (existing && 
                        existing.modificationTime === asset.modificationTime && 
                        (existing.size && existing.size > 0) &&
                        existing.path
                    ) {
                        continue;
                    }

                    const displayName = cleanName(asset.filename);
                    const thumbUri = await getThumbnailCached(asset.id);
                    const info = await FileSystem.getInfoAsync(asset.uri);
                    const video: VideoMedia = {
                        id: asset.id,
                        filename: asset.filename,
                        displayName,
                        uri: asset.uri,
                        duration: asset.duration,
                        width: asset.width,
                        height: asset.height,
                        modificationTime: asset.modificationTime,
                        thumbnail: thumbUri ? thumbUri : undefined,
                        baseThumbnailUri: thumbUri ? thumbUri : getThumbnailUri(asset.id),
                        lastPlayedSec: playbackMap.get(asset.id) ?? -1,
                        prefix: extractPrefix(asset.filename),
                        episode: extractEpisode(asset.filename),
                        size: info.exists ? (info as any).size : undefined,
                        path: asset.uri,
                    };

                    const albumId = asset.albumId || "unknown";
                    let list = batchDeltaByAlbum.get(albumId) || [];
                    list.push(video);
                    batchDeltaByAlbum.set(albumId, list);
                    totalNewFound++;
                }

                // Apply batch updates to UI and DB immediately
                if (batchDeltaByAlbum.size > 0 || isFirstBatch) {
                    const albumMap = new Map<string, Album>();
                    Object.values(albumsRef.current).forEach((a) => albumMap.set(a.id, a));

                    for (const [albumId, newVideos] of batchDeltaByAlbum) {
                        const existingVideos = getVideosForAlbumDb(albumId);
                        const merged = [...existingVideos];
                        for (const nv of newVideos) {
                            const idx = merged.findIndex((v) => v.id === nv.id);
                            if (idx !== -1) merged[idx] = nv;
                            else merged.push(nv);
                        }

                        const sorted = merged.sort((x, y) => compareByVideoSort(x, y, videoSortRef.current));
                        saveVideosDb(albumId, sorted);
                        allVideosCacheRef.current[albumId] = sorted;

                        let albumObj = albumMap.get(albumId);
                        if (!albumObj) {
                            // Find the album in MediaLibrary to get the title
                            const mediaAlbums = await MediaLibrary.getAlbumsAsync();
                            const ma = mediaAlbums.find((a) => a.id === albumId);
                            albumObj = {
                                id: albumId,
                                title: ma?.title || "Unknown",
                                displayName: cleanName(ma?.title || "Unknown"),
                                assetCount: sorted.length,
                                thumbnail: getAlbumThumbnailForVideos(sorted),
                                hasNew: true,
                                lastModified: Math.max(...sorted.map((v) => v.modificationTime || 0)),
                            };
                            albumMap.set(albumId, albumObj);
                        }

                        if (albumObj) {
                            albumObj.assetCount = sorted.length;
                            albumObj.lastModified = Math.max(...sorted.map((v) => v.modificationTime || 0));
                            albumObj.thumbnail = getAlbumThumbnailForVideos(sorted);
                            albumObj.hasNew = true;
                        }
                    }

                    const finalAlbums = Array.from(albumMap.values()).sort((x, y) => compareByAlbumSort(x, y));
                    saveAlbumsDb(finalAlbums);

                    unstable_batchedUpdates(() => {
                        setAlbums(finalAlbums);
                        setAllVideosCache({ ...allVideosCacheRef.current });
                        const activeId = currentAlbumRef.current?.id;
                        if (activeId && batchDeltaByAlbum.has(activeId)) {
                            setCurrentAlbumVideos(allVideosCacheRef.current[activeId]);
                            const updatedActive = albumMap.get(activeId);
                            if (updatedActive) setCurrentAlbum(updatedActive);
                        }
                    });
                }

                if (foundStopPoint) break;
                hasMore = hasNextPage;
                after = endCursor || undefined;
                isFirstBatch = false;
                if (totalNewFound > 5000) {
                    hasMore = false;
                } else if (hasMore) {
                    // Discovery is important/visible
                    setLoadingTask({ label: syncLabel, detail: `Found ${totalNewFound} new videos...`, isImportant: true });
                }
            }

            generateThumbnails(false);
            setLastSyncTimestampDb(newestTimestamp);
            if (!isInitialScanComplete) {
                setIsInitialScanCompleteDb(true);
                setIsInitialScanComplete(true);
            }
            console.log(`[Media] Delta sync complete. Processed ${totalNewFound} items.`);
        } catch (e) {
            console.error("[Media] Delta sync failed:", e);
            setError("Background sync failed");
        } finally {
            isSyncingRef.current = false;
            if (!hasActiveThumbnailWork()) setLoadingTask(null);
        }
    };

    const fetchAlbums = async () => {
        await performSmartSync();
        await loadDataFromDB();
    };

    const loadAlbumFromDb = (albumId: string) => {
        const mapped = getVideosForAlbumDb(albumId)
            .map((v: any) => ({
                ...v,
                thumbnail: v.thumbnail || undefined,
                baseThumbnailUri: getThumbnailUri(v.id),
                prefix: extractPrefix(v.filename),
                episode: extractEpisode(v.filename),
            }))
            .sort((a: VideoMedia, b: VideoMedia) => compareByVideoSort(a, b));
        allVideosCacheRef.current[albumId] = mapped;
        setAllVideosCache((prev) => ({ ...prev, [albumId]: mapped }));
        setCurrentAlbumVideos(mapped);
    };

    const fetchVideosInAlbum = async (album: {
        id: string;
        title?: string;
        assetCount?: number;
        thumbnail?: string;
        lastModified?: number;
    }) => {
        // 0. Update currentAlbumRef FIRST so performSmartSync knows which album
        //    is active and doesn't push stale data from the previous album.
        currentAlbumRef.current = albumsRef.current[album.id] || (album as Album);
        const fullAlbum = () => albumsRef.current[album.id] || (album as Album);

        // 1. Show data IMMEDIATELY from in-memory cache (zero latency)
        const cached = allVideosCacheRef.current[album.id];
        if (cached && cached.length > 0) {
            setCurrentAlbumVideos(cached);
        } else {
            // 2. Cache miss — load synchronously from DB (fast, no async I/O)
            loadAlbumFromDb(album.id);
        }
        setCurrentAlbum(fullAlbum());

        // 3. Fire sync in the background — updates state if anything changed.
        //    When the sync finishes, reconcile the latest cache back into state
        //    so any additions or deletions are reflected automatically.
        performSmartSync().then(() => {
            const activeId = currentAlbumRef.current?.id;
            if (activeId !== album.id) return; // User navigated away, skip

            const latest = allVideosCacheRef.current[activeId];
            if (latest && latest.length > 0) {
                // Sync updated the cache — push the refreshed list
                setCurrentAlbumVideos(latest);
            } else if (!latest) {
                // Cache was invalidated (e.g. videos deleted) — re-query DB
                loadAlbumFromDb(activeId);
            }
            // Always refresh album metadata (count, thumbnail)
            const freshAlbum = albumsRef.current[activeId];
            if (freshAlbum) setCurrentAlbum(freshAlbum);
        });
    };

    const openAlbumByVideoId = useCallback(
        async (videoId: string) => {
            // 1. Try cache first
            let albumId = Object.keys(allVideosCache).find((aid) => allVideosCache[aid].some((v) => v.id === videoId));

            // 2. Try DB if cache failed
            if (!albumId) {
                const dbVideo = getVideoByIdDb(videoId);
                if (dbVideo) albumId = dbVideo.albumId;
            }

            if (albumId) {
                const targetAlbum = albums.find((a) => a.id === albumId);
                // If we have album in state, set it
                if (targetAlbum) {
                    setCurrentAlbum(targetAlbum);
                    await fetchVideosInAlbum(targetAlbum);
                } else {
                    // Fallback: pass minimal object if not in state yet
                    await fetchVideosInAlbum({ id: albumId });
                }
            }
        },
        [allVideosCache, albums, fetchVideosInAlbum],
    );

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
            await performSmartSync();
        } else {
            setError("Permission denied. Cannot scan media.");
        }
    };

    const refreshPlaybackProgress = React.useCallback(() => {
        try {
            // @ts-ignore
            const { getAllPlaybackDataDb } = require("../utils/db");
            const playbackData = getAllPlaybackDataDb();
            const playbackMap = new Map<string, number>();
            playbackData.forEach((p: any) => playbackMap.set(p.video_id, p.last_played_sec));

            setCurrentAlbumVideos((prev) => {
                let changed = false;
                const next = prev.map((v) => {
                    const updatedSec = playbackMap.get(v.id) ?? -1;
                    if (v.lastPlayedSec !== updatedSec) changed = true;
                    return v.lastPlayedSec !== updatedSec ? { ...v, lastPlayedSec: updatedSec } : v;
                });
                return changed ? next : prev;
            });

            setAllVideosCache((prev) => {
                let cacheChanged = false;
                const next: Record<string, VideoMedia[]> = {};
                for (const key in prev) {
                    const mapped = prev[key].map((v) => {
                        const updatedSec = playbackMap.get(v.id) ?? -1;
                        if (v.lastPlayedSec !== updatedSec) cacheChanged = true;
                        return v.lastPlayedSec !== updatedSec ? { ...v, lastPlayedSec: updatedSec } : v;
                    });
                    next[key] = mapped;
                }
                return cacheChanged ? next : prev;
            });
        } catch (e) {
            console.error("[Media] Failed to refresh playback progress:", e);
        }
    }, []);

    const updateVideoProgress = React.useCallback((videoId: string, sec: number) => {
        savePlaybackDataDb(videoId, sec);

        // Update Refs
        const cached = videoDictRef.current.get(videoId);
        if (cached) {
            const updated = { ...cached, lastPlayedSec: sec };
            videoDictRef.current.set(videoId, updated);

            // Also update allVideosCacheRef
            for (const albumId in allVideosCacheRef.current) {
                const arr = allVideosCacheRef.current[albumId];
                const idx = arr.findIndex((v) => v.id === videoId);
                if (idx !== -1) {
                    const nextArr = [...arr];
                    nextArr[idx] = updated;
                    allVideosCacheRef.current[albumId] = nextArr;
                    break;
                }
            }
        }

        setCurrentAlbumVideos((prev) => {
            const index = prev.findIndex((v) => v.id === videoId);
            if (index === -1) return prev;
            if (prev[index].lastPlayedSec === sec) return prev;
            const next = [...prev];
            next[index] = { ...next[index], lastPlayedSec: sec };
            return next;
        });

        setAllVideosCache((prev) => {
            let found = false;
            const next = { ...prev };
            for (const key in next) {
                const arr = next[key];
                const vIndex = arr.findIndex((v) => v.id === videoId);
                if (vIndex !== -1) {
                    if (arr[vIndex].lastPlayedSec === sec) return prev;
                    const nextArr = [...arr];
                    nextArr[vIndex] = { ...nextArr[vIndex], lastPlayedSec: sec };
                    next[key] = nextArr;
                    found = true;
                    break;
                }
            }
            return found ? next : prev;
        });
    }, []);

    const hasInitializedRef = React.useRef(false);

    useEffect(() => {
        // The 'active' variable serves as a cleanup guard.
        // It ensures that state updates (like setLoadingTask) don't occur
        // if this provider unmounts while an asynchronous operation is still pending.
        let active = true;

        const initialize = async () => {
            if (!permissionResponse || settingsLoading || hasInitializedRef.current) return;

            try {
                // 1. Load cached data from DB immediately
                await loadDataFromDB();

                // 2. Permission Guard for MediaLibrary scans
                if (permissionResponse.status !== "granted") {
                    if (active) setLoadingTask(null);
                    return;
                }

                hasInitializedRef.current = true;

                // 3. Only perform sync if permission is granted
                const lastSync = getLastSyncTimestampDb();
                if (active) {
                    await performSmartSync();
                }
            } catch (e) {
                console.error("[Media] Initial load failed:", e);
            } finally {
                if (active) {
                    setLoadingTask(null);
                }
            }
        };
        initialize();
        return () => {
            active = false;
        };
    }, [permissionResponse, settingsLoading]);

    // Re-sort albums immediately when sort order changes
    useEffect(() => {
        if (albums.length > 0 && !loadingTask) {
            setAlbums((prev) => [...prev].sort((a, b) => compareByAlbumSort(a, b)));
        }
    }, [albumSort]);

    // Update album thumbnails when video sort or prefix filters change
    useEffect(() => {
        if (albums.length > 0) {
            setAlbums((prev) => {
                let changed = false;
                const next = prev.map((album) => {
                    let albumVids = allVideosCache[album.id];
                    if (!albumVids || albumVids.length === 0) return album;

                    // 1. Respect Prefix Filters: if filters are applied to this album,
                    // use the first video from the filtered subset for the thumbnail.
                    const filters = folderFilters[album.id] || [];
                    if (filters.length > 0) {
                        albumVids = albumVids.filter((v) => {
                            const rawPrefix = extractPrefix(v.filename);
                            return filters.includes(rawPrefix);
                        });
                    }

                    if (albumVids.length === 0) return album;

                    // 2. Sort to find the 'first' video thumbnail
                    const sorted = [...albumVids].sort((a, b) => compareByVideoSort(a, b, videoSort));
                    const firstThumb = sorted[0]?.thumbnail || sorted[0]?.baseThumbnailUri || getThumbnailUri(sorted[0].id);

                    if (firstThumb && firstThumb !== album.thumbnail) {
                        changed = true;
                        updateAlbumThumbnailDb(album.id, firstThumb);
                        return { ...album, thumbnail: firstThumb };
                    }
                    return album;
                });
                return changed ? next : prev;
            });
        }
    }, [videoSort, allVideosCache, folderFilters]);

    const searchMedia = (query: string) => {
        const dbResults = searchVideosByNameDb(query);
        return dbResults.map((v: any) => {
            const rawName = v.displayName || v.filename;
            const displayName = cleanName(rawName);
            return {
                ...v,
                displayName,
                thumbnail: v.thumbnail || undefined,
                baseThumbnailUri: getThumbnailUri(v.id),
                prefix: extractPrefix(displayName),
                episode: extractEpisode(displayName),
            };
        });
    };

    const contextValue = useMemo(
        () => ({
            albums,
            currentAlbumVideos,
            setCurrentAlbumVideos,
            currentAlbum,
            setCurrentAlbum,
            loadingTask,
            setLoadingTask,
            error,
            albumSort,
            setAlbumSort,
            videoSort,
            setVideoSort,
            fetchAlbums,
            fetchVideosInAlbum,
            clearThumbnailCache,
            regenerateAllThumbnails,
            syncDatabaseWithStorage,
            refreshPlaybackProgress,
            updateVideoProgress,
            resetToAlbums: () => {
                setCurrentAlbumVideos([]);
                setCurrentAlbum(null);
            },
            resetEverything,
            requestPermissionAndFetch,
            loadDataFromDB,
            openAlbumByVideoId,
            allVideosCache,
            folderFilters,
            setFolderFilter,
            isLoadingVisible,
            setIsLoadingVisible,
            isLoadingExpanded,
            setIsLoadingExpanded,
            searchMedia,
            permissionResponse,
            isInitialScanComplete,
        }),
        [
            albums,
            currentAlbumVideos,
            setCurrentAlbumVideos,
            currentAlbum,
            setCurrentAlbum,
            loadingTask,
            setLoadingTask,
            error,
            albumSort,
            setAlbumSort,
            videoSort,
            setVideoSort,
            fetchAlbums,
            fetchVideosInAlbum,
            clearThumbnailCache,
            regenerateAllThumbnails,
            syncDatabaseWithStorage,
            refreshPlaybackProgress,
            updateVideoProgress,
            resetEverything,
            requestPermissionAndFetch,
            loadDataFromDB,
            openAlbumByVideoId,
            allVideosCache,
            folderFilters,
            setFolderFilter,
            isLoadingVisible,
            setIsLoadingVisible,
            isLoadingExpanded,
            setIsLoadingExpanded,
            searchMedia,
            permissionResponse,
            isInitialScanComplete,
        ],
    );

    useEffect(() => {
        const subscription = AppState.addEventListener("change", (nextAppState: AppStateStatus) => {
            if (nextAppState === "active") {
                // If we've already done the initial heavy lifting, just do a smart check
                if (isInitialScanComplete) {
                    console.log("[Media] App focused, running Smart Sync...");
                    performSmartSync();
                }
            }
        });

        return () => {
            subscription.remove();
        };
    }, [isInitialScanComplete, performSmartSync]);

    return <MediaContext.Provider value={contextValue}>{children}</MediaContext.Provider>;
};

export const useMedia = () => {
    const context = useContext(MediaContext);
    if (!context) {
        throw new Error("useMedia must be used within a MediaProvider");
    }
    return context;
};
