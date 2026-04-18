import * as FileSystem from "expo-file-system/legacy";
import * as MediaLibrary from "expo-media-library";
import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { unstable_batchedUpdates } from "react-native";
// @ts-ignore - local module
import { LoadingTask } from "@/components/LoadingStatus";
import ExpoFFmpeg from "../modules/expo-ffmpeg";

import { extractEpisode, extractPrefix } from "@/utils/videoUtils";
import {
    clearAllThumbnails,
    getAlbums,
    getAllPlaybackData,
    getAllVideos,
    getLastSyncTimestamp,
    getSetting,
    getVideoById,
    getVideosForAlbum,
    resetDatabase as resetDB,
    saveAlbums,
    saveSetting,
    saveVideos,
    searchVideosByName,
    setLastSyncTimestamp,
    updateAlbumThumbnail,
    updateVideoThumbnail,
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
    duration: number;
    width: number;
    height: number;
    creationTime: number;
    modificationTime: number;
    thumbnail?: string;
    baseThumbnailUri: string; // Persistent URI, used to track if generation is done
    lastPlayedSec: number;
    prefix?: string;      // Extracted series/season prefix
    episode?: number;     // Extracted numeric episode number
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
    currentAlbum: Album | null;
    setCurrentAlbum: (album: Album | null) => void;
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
        album: { id: string; title?: string; assetCount?: number; thumbnail?: string; lastModified?: number },
        force?: boolean,
        taskId?: string,
    ) => Promise<void>;
    refreshPlaybackProgress: () => void;
    updateVideoProgress: (videoId: string, sec: number) => void;
    generateThumbnail: (uri: string, id: string, albumId?: string) => Promise<string | undefined>;
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
    searchMedia: (query: string) => VideoMedia[];
}

const MediaContext = createContext<MediaContextType | null>(null);

export const MediaProvider = ({ children }: { children: React.ReactNode }) => {
    const [currentAlbumVideos, setCurrentAlbumVideos] = useState<VideoMedia[]>([]);
    const [albums, setAlbums] = useState<Album[]>([]);
    const [currentAlbum, setCurrentAlbum] = useState<Album | null>(null);
    const [allVideosCache, setAllVideosCache] = useState<Record<string, VideoMedia[]>>({});
    const [manualRefresh, setManualRefresh] = useState(false);
    const [loadingId, setLoadingId] = useState<string | null>(null);
    const [loadingTask, setLoadingTask] = useState<LoadingTask | null>({
        label: "Initializing",
        detail: "Loading media library...",
        isImportant: false,
    });
    const [error, setError] = useState<string | null>(null);
    const [isLoadingVisible, setIsLoadingVisible] = useState(false);
    const [isLoadingExpanded, setIsLoadingExpanded] = useState(false);

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

    const [albumSort, setAlbumSort] = useState<{ by: SortBy; order: SortOrder }>({ by: "date", order: "desc" });
    const [videoSort, setVideoSort] = useState<{ by: SortBy; order: SortOrder }>({ by: "episode", order: "asc" });
    const [folderFilters, setFolderFilters] = useState<Record<string, string[]>>({});

    const setFolderFilter = (albumId: string, filters: string[]) => {
        setFolderFilters((prev) => {
            const next = { ...prev, [albumId]: filters };
            saveSetting("folderFilters", JSON.stringify(next));
            return next;
        });
    };

    // Live State Refs to prevent stale closures inside background queue async workers
    const currentAlbumRef = React.useRef(currentAlbum);
    const videoSortRef = React.useRef(videoSort);
    const albumSortRef = React.useRef(albumSort);
    const albumsRef = React.useRef<Record<string, Album>>({}); // Changed to dictionary for O(1) lookup
    const albumRankRef = React.useRef<Map<string, number>>(new Map()); // id → sort rank, O(1) lookup
    const allVideosCacheRef = React.useRef(allVideosCache);
    const videoDictRef = React.useRef<Map<string, VideoMedia>>(new Map()); // videoId → VideoMedia, O(1) lookup
    const lastSortKeyRef = React.useRef<string>(""); // Track last sort priority to avoid redundant sorts

    useEffect(() => {
        currentAlbumRef.current = currentAlbum;
    }, [currentAlbum]);
    useEffect(() => {
        videoSortRef.current = videoSort;
    }, [videoSort]);
    useEffect(() => {
        albumSortRef.current = albumSort;
    }, [albumSort]);
    useEffect(() => {
        const dict: Record<string, Album> = {};
        albums.forEach((a) => (dict[a.id] = a));
        albumsRef.current = dict;
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
        saveSetting("albumSort", JSON.stringify(albumSort));
    }, [albumSort]);

    useEffect(() => {
        saveSetting("videoSort", JSON.stringify(videoSort));
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

    // Pure FFMPEG + DB: no setState here — all state flows through drainResults for sync UI updates
    const generateThumbnail = async (videoUri: string, videoId: string, albumId?: string) => {
        const thumbUri = getThumbnailUri(videoId);
        const affectedAlbumId = albumId || currentAlbumRef.current?.id || "";

        // Find filename for the loading status label
        const video = Object.values(allVideosCacheRef.current)
            .flat()
            .find((v) => v.id === videoId);

        try {
            const fileInfo = await FileSystem.getInfoAsync(thumbUri);
            const alreadyExists = fileInfo.exists;

            if (alreadyExists || (await ExpoFFmpeg.generateThumbnail(videoUri, thumbUri))) {
                const bustedUri = `${thumbUri}?t=${Date.now()}`;
                // Update DB immediately so it's marked as complete if the user quits during reveal
                updateVideoThumbnail(videoId, bustedUri);

                resultQueue.current.push({
                    videoId,
                    albumId: affectedAlbumId,
                    thumbUri,
                    bustedUri,
                    filename: video?.filename ?? videoId,
                });
                return thumbUri;
            }
            return undefined;
        } catch (e) {
            return undefined;
        }
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
            comp = (a.modificationTime || a.creationTime || 0) - (b.modificationTime || b.creationTime || 0);
        } else if (vSort.by === "duration") {
            comp = (a.duration || 0) - (b.duration || 0);
        }
        return vSort.order === "asc" ? comp : -comp;
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
                            updateAlbumThumbnail(album.id, matchingUpdate.bustedUri);
                            return { ...album, thumbnail: matchingUpdate.bustedUri };
                        });
                        return changed ? next : prev;
                    });
                }
            });

            scheduleNext(RESULT_DRAIN_INTERVAL_MS);
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
                    updateVideoThumbnail(task.id, bustedUri);

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
        }
    };

    const regenerateAllThumbnails = async () => {
        // Prevent double-clicking or initiating while a background generation is already actively running
        if (hasActiveThumbnailWork() || thumbnailQueue.current.length > 0) return;

        try {
            await clearThumbnailCache();

            setLoadingTask({ label: "Clearing Thumbnails", detail: "Updating database...", isImportant: true });
            clearAllThumbnails();

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
            console.log("[Media] Syncing database with storage...");
            const playbackData = getAllPlaybackData();
            let deletedCount = 0;

            for (const record of playbackData) {
                try {
                    const asset = await MediaLibrary.getAssetInfoAsync(record.video_id);
                    if (!asset) throw new Error("Missing");
                } catch (e) {
                    console.log(`[Media] Removing stale record for ${record.video_id}`);
                    const thumbUri = getThumbnailUri(record.video_id);
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
            resetDB();
            setAlbums([]);
            setCurrentAlbumVideos([]);
            setAllVideosCache({});
            setCurrentAlbum(null);
            await performSmartSync(true, true);
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
                const cleanA = cachedAlbums.map((a: any) => ({
                    ...a,
                    displayName: cleanName(a.title),
                }));
                setAlbums(cleanA);

                // Pre-fill video cache from DB for all albums
                const fullVideoCache: Record<string, VideoMedia[]> = {};
                for (const album of cachedAlbums) {
                    const cachedVideos = getVideosForAlbum(album.id);
                    if (cachedVideos.length > 0) {
                        fullVideoCache[album.id] = cachedVideos.map((v: any) => {
                            const displayName = cleanName(v.filename);
                            return {
                                ...v,
                                displayName,
                                thumbnail: v.thumbnail || undefined,
                                baseThumbnailUri: getThumbnailUri(v.id),
                                prefix: extractPrefix(displayName),
                                episode: extractEpisode(displayName),
                            };
                        });
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
            const savedAlbumSort = getSetting("albumSort");
            if (savedAlbumSort) setAlbumSort(JSON.parse(savedAlbumSort));
            const savedVideoSort = getSetting("videoSort");
            if (savedVideoSort) setVideoSort(JSON.parse(savedVideoSort));
            const savedFilters = getSetting("folderFilters");
            if (savedFilters) setFolderFilters(JSON.parse(savedFilters));
            setLoadingTask(null);
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
                        .filter((v) => !v.thumbnail && !v.baseThumbnailUri)
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
                setLoadingTask(null);
                return;
            }

            console.log("[Media] Library changed or force requested. Starting deep scan...");
            await syncDatabaseWithStorage();

            const fetchedAlbums = await MediaLibrary.getAlbumsAsync();
            const playbackData = getAllPlaybackData();
            const playbackMap = new Map<string, number>();
            playbackData.forEach((p) => playbackMap.set(p.video_id, p.last_played_sec));

            const newAlbums: Album[] = [];
            const newAllVideosCache: Record<string, VideoMedia[]> = {};
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

                    const rawVideos: VideoMedia[] = await Promise.all(
                        albumAssets.map(async (asset) => {
                            const vThumb = await getThumbnailCached(asset.id);
                            const displayName = cleanName(asset.filename);
                            const video: VideoMedia = {
                                id: asset.id,
                                filename: asset.filename,
                                displayName,
                                uri: asset.uri,
                                duration: asset.duration,
                                width: asset.width,
                                height: asset.height,
                                creationTime: asset.creationTime,
                                modificationTime: asset.modificationTime,
                                thumbnail: vThumb,
                                baseThumbnailUri: vThumb,
                                lastPlayedSec: playbackMap.get(asset.id) ?? -1,
                                prefix: extractPrefix(displayName),
                                episode: extractEpisode(displayName),
                            };

                            // If we don't have a thumbnail revealed yet, queue it — spawnWorker will decide to generate or just push to reveal
                            if (!video.thumbnail) {
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

                    // Save to database (now includes displayName)
                    saveVideos(a.id, rawVideos);

                    const albumThumbnail = getAlbumThumbnailForVideos(rawVideos);
                    const albumObj: Album = {
                        id: a.id,
                        title: a.title,
                        displayName: cleanName(a.title),
                        assetCount: totalCount,
                        lastModified: latestDate,
                        thumbnail: albumThumbnail,
                        hasNew,
                    };
                    newAlbums.push(albumObj);
                    newAllVideosCache[a.id] = rawVideos;
                }),
            );

            // Sort and Save
            const sortedAlbums = newAlbums.sort((a, b) => (b.lastModified || 0) - (a.lastModified || 0));
            saveAlbums(sortedAlbums);
            setAlbums(sortedAlbums);
            setAllVideosCache(newAllVideosCache);

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
        } else {
            if (albums.length === 0) {
                await loadDataFromDB();
            }
            // Fast check on every navigation
            performSmartSync(false, false);
        }
    };

    const fetchVideosInAlbum = async (
        album: { id: string; title?: string; assetCount?: number; thumbnail?: string; lastModified?: number },
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
            playbackData.forEach((p) => playbackMap.set(p.video_id, p.last_played_sec));

            const videos: VideoMedia[] = await Promise.all(
                albumAssets.map(async (asset) => {
                    const thumbnail = await getThumbnailCached(asset.id);
                    const displayName = cleanName(asset.filename);
                    return {
                        id: asset.id,
                        filename: asset.filename,
                        displayName,
                        uri: asset.uri,
                        duration: asset.duration,
                        width: asset.width,
                        height: asset.height,
                        creationTime: asset.creationTime,
                        modificationTime: asset.modificationTime,
                        thumbnail,
                        baseThumbnailUri: thumbnail,
                        lastPlayedSec: playbackMap.get(asset.id) ?? -1,
                        prefix: extractPrefix(displayName),
                        episode: extractEpisode(displayName),
                    };
                }),
            );

            const sortedVideos = [...videos].sort((a, b) => compareByVideoSort(a, b, videoSort));

            saveVideos(album.id, sortedVideos);
            setCurrentAlbumVideos(sortedVideos);
            setAllVideosCache((prev) => ({ ...prev, [album.id]: sortedVideos }));
            setCurrentAlbum(albumsRef.current[album.id] || (album as Album));

            // Update album thumbnail to match the first video in current sort
            const firstThumb = getAlbumThumbnailForVideos(videos);
            if (firstThumb) {
                updateAlbumThumbnail(album.id, firstThumb);
                setAlbums((prev) => prev.map((a) => (a.id === album.id ? { ...a, thumbnail: firstThumb } : a)));
            }

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
            const cached = allVideosCache[album.id];
            if (cached) {
                setCurrentAlbumVideos(cached);
                const fullAlbum = albumsRef.current[album.id] || (album as Album);
                setCurrentAlbum(fullAlbum);
            } else {
                setLoadingTask({ label: "Loading Database", detail: "Fetching cached videos...", isImportant: false });
                setLoadingId(album.id);
                const dbVideos = getVideosForAlbum(album.id);
                if (dbVideos.length > 0) {
                    const mappedVideos = dbVideos.map((v: any) => ({
                        ...v,
                        thumbnail: v.thumbnail || undefined,
                        baseThumbnailUri: getThumbnailUri(v.id),
                    }));
                    setCurrentAlbumVideos(mappedVideos);
                    setAllVideosCache((prev) => ({ ...prev, [album.id]: mappedVideos }));
                    const fullAlbum = albumsRef.current[album.id] || (album as Album);
                    setCurrentAlbum(fullAlbum);
                } else {
                    // This case should be rare after the initial full scan
                    await fetchAlbums(true);
                    const freshVideos = getVideosForAlbum(album.id);
                    if (freshVideos.length > 0) {
                        const mappedVideos = freshVideos.map((v: any) => ({
                            ...v,
                            thumbnail: v.thumbnail || undefined,
                            baseThumbnailUri: getThumbnailUri(v.id),
                        }));
                        setCurrentAlbumVideos(mappedVideos);
                        setAllVideosCache((prev) => ({ ...prev, [album.id]: mappedVideos }));
                        setCurrentAlbum(album as Album);
                    }
                }
                setLoadingTask(null);
                setLoadingId(null);
            }
            // Fast check on every navigation
            performSmartSync(false, false);
        }
    };

    const openAlbumByVideoId = useCallback(
        async (videoId: string) => {
            // 1. Try cache first
            let albumId = Object.keys(allVideosCache).find((aid) => allVideosCache[aid].some((v) => v.id === videoId));

            // 2. Try DB if cache failed
            if (!albumId) {
                const dbVideo = getVideoById(videoId);
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

    useEffect(() => {
        // The 'active' variable serves as a cleanup guard.
        // It ensures that state updates (like setLoadingTask) don't occur
        // if this provider unmounts while an asynchronous operation is still pending.
        let active = true;

        const initialize = async () => {
            if (!permissionResponse || settingsLoading) return;

            if (permissionResponse.status !== "granted") {
                if (active) setLoadingTask(null);
                return;
            }

            try {
                await loadDataFromDB();

                // Only perform an automatic sync if the user has completed a manual scan before.
                // This prevents the 'Auto Deep Scan' on fresh installs until the user clicks 'Scan Device'.
                const lastSync = getLastSyncTimestamp();
                if (lastSync !== 0 && active) {
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
    }, [permissionResponse, settingsLoading]);

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

    // Update album thumbnails when video sort changes
    useEffect(() => {
        if (albums.length > 0) {
            setAlbums((prev) => {
                let changed = false;
                const next = prev.map((album) => {
                    const albumVids = allVideosCache[album.id];
                    if (!albumVids || albumVids.length === 0) return album;

                    const sorted = [...albumVids].sort((a, b) => compareByVideoSort(a, b, videoSort));

                    const firstThumb = sorted[0]?.thumbnail;
                    if (firstThumb && firstThumb !== album.thumbnail) {
                        changed = true;
                        updateAlbumThumbnail(album.id, firstThumb);
                        return { ...album, thumbnail: firstThumb };
                    }
                    return album;
                });
                return changed ? next : prev;
            });
        }
    }, [videoSort, allVideosCache]);

    const searchMedia = (query: string) => {
        const dbResults = searchVideosByName(query);
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

    return (
        <MediaContext.Provider
            value={{
                albums,
                currentAlbumVideos,
                currentAlbum,
                setCurrentAlbum,
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
