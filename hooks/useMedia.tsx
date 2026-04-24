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
    getHiddenAlbumsDb,
    getHiddenVideosDb,
    getLastSyncTimestampDb,
    getSettingDb,
    getVideosForAlbumDb,
    renameAlbumDb,
    renameVideoDb,
    resetDatabaseDb,
    saveAlbumsDb,
    savePlaybackDataDb,
    saveSettingDb,
    saveVideosDb,
    setAlbumHiddenDb,
    setLastSyncTimestampDb,
    setVideoHiddenDb,
    updateAlbumThumbnailDb,
    updateVideoThumbnailDb,
} from "../utils/db";
import { useSettings } from "./useSettings";

const MAX_WORKERS = 4;
const RESULT_BATCH_SIZE = 3;
const RESULT_DRAIN_INTERVAL_MS = 16;
const RESULT_IDLE_POLL_MS = 32;
const THUMBNAIL_SUCCESS_MS = 1000;

import type { Album, VideoMedia } from "../types/useMedia";
import { getThumbnailUri } from "../utils/videoUtils";

import { useMediaPrefixFilter } from "./useMediaPrefixFilter";
import { AlbumSortBy, AlbumSortConfig, SortBy, SortOrder, useMediaSort, VideoSortConfig } from "./useMediaSort";

export type { AlbumSortBy, AlbumSortConfig, SortBy, SortOrder, VideoSortConfig };

// Centralized task IDs for tracking specific background work
const TASK_IDS = {
    MEDIA_SYNC: "media-sync",
    THUMBNAIL_GEN: "thumbnail-gen",
    CACHE_CLEAR: "cache-clear",
    LIBRARY_RESET: "library-reset",
    LIBRARY_LOAD: "library-load",
} as const;

export interface MediaContextType {
    albums: Album[];
    allAlbums: Album[];
    allAlbumsVideos: Record<string, VideoMedia[]>;
    loadingTask: LoadingTask | null;
    error: string | null;
    albumSort: { by: AlbumSortBy; order: SortOrder };
    setAlbumSort: React.Dispatch<React.SetStateAction<{ by: AlbumSortBy; order: SortOrder }>>;
    getActiveVideoSort: (album: Album | null) => { by: SortBy; order: SortOrder };
    updateVideoSort: (
        albumId: string,
        s: React.SetStateAction<VideoSortConfig>,
        targetVideoSortSettingScope: "local" | "global",
    ) => void;
    fetchAlbums: () => Promise<void>;
    syncCurrentAlbum: (albumId: string, signal?: AbortSignal) => Promise<void>;
    updateVideoProgress: (videoId: string, sec: number) => void;
    clearThumbnailCache: () => Promise<void>;
    regenerateAllThumbnails: () => Promise<void>;
    syncDatabaseWithStorage: () => Promise<void>;
    resetToAlbums: () => void;
    resetEverything: () => Promise<void>;
    requestPermissionAndFetch: () => Promise<void>;
    loadDataFromDB: () => Promise<void>;

    allAlbum: Record<string, Album>;
    selectedVideoPrefixFilters: Record<string, string[]>;
    updatePrefixFilter: (albumId: string, rawPrefix: string, isSelected: boolean) => void;
    clearPrefixFilters: (albumId: string) => void;
    isLoadingPopupVisible: boolean;
    setIsLoadingPopupVisible: React.Dispatch<React.SetStateAction<boolean>>;
    isLoadingExpanded: boolean;
    setIsLoadingExpanded: React.Dispatch<React.SetStateAction<boolean>>;
    setLoadingTask: React.Dispatch<React.SetStateAction<LoadingTask | null>>;
    renameVideo: (videoId: string, newName: string) => void;
    renameAlbum: (albumId: string, newName: string) => void;
    updateMultipleVideoProgress: (videoIds: string[], sec: number) => void;
    isSelectionMode: boolean;
    selectedIds: Set<string>;
    toggleSelection: (id: string) => void;
    clearSelection: () => void;
    selectAll: (items?: { id: string }[]) => void;
    togglePrefixSelection: (prefix: string, albumId: string) => void;
    selectPrefixesOfSelected: (albumId: string) => void;
    hideVideo: (videoId: string) => Promise<void>;
    hideAlbum: (albumId: string) => Promise<void>;
    hideMultipleVideos: (videoIds: string[]) => Promise<void>;
    hideMultipleAlbums: (albumIds: string[]) => Promise<void>;
    unhideVideo: (videoId: string) => Promise<void>;
    unhideAlbum: (albumId: string) => Promise<void>;
    unhideMultipleVideos: (videoIds: string[]) => Promise<void>;
    unhideMultipleAlbums: (albumIds: string[]) => Promise<void>;
    fetchHiddenMedia: () => Promise<{ albums: Album[]; videos: VideoMedia[] }>;
    searchMedia: (query: string) => VideoMedia[];
    getVideosForAlbum: (albumId: string) => VideoMedia[];
    getVideoById: (videoId: string) => VideoMedia | null;

    permissionResponse: MediaLibrary.PermissionResponse | null;
    setVideoSortSettingScope: (albumId: string, scope: "global" | "local") => void;
    compareByVideoSort: (a: VideoMedia, b: VideoMedia, vSort?: { by: SortBy; order: SortOrder }) => number;
    compareByAlbumSort: (a: Album, b: Album, aSort?: { by: AlbumSortBy; order: SortOrder }) => number;
}

const MediaContext = createContext<MediaContextType | null>(null);

export const MediaProvider = ({ children }: { children: React.ReactNode }) => {
    const [albums, setAlbums] = useState<Album[]>([]);
    const [loadingTask, setLoadingTaskInternal] = useState<LoadingTask | null>({
        label: "Initializing",
        detail: "Loading media library...",
        isImportant: false,
    });

    const setLoadingTask = useCallback((task: LoadingTask | null | ((prev: LoadingTask | null) => LoadingTask | null)) => {
        setLoadingTaskInternal(task);
    }, []);

    const [isSelectionMode, setIsSelectionMode] = useState(false);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

    const toggleSelection = useCallback((id: string) => {
        setIsSelectionMode(true);
        setSelectedIds((prev) => {
            const next = new Set(prev);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }
            return next;
        });
    }, []);

    const clearSelection = useCallback(() => {
        setIsSelectionMode(false);
        setSelectedIds(new Set());
    }, []);

    const selectAll = useCallback(
        (items?: { id: string }[]) => {
            if (items) {
                const allIds = items.map((i) => i.id);
                if (selectedIds.size === allIds.length) {
                    setSelectedIds(new Set());
                } else {
                    setSelectedIds(new Set(allIds));
                    setIsSelectionMode(true);
                }
            }
        },
        [selectedIds.size],
    );
    const lastTaskIdRef = React.useRef<string | null>(null);

    // Side-effects for loading task changes: Visibility & Auto-Expansion
    // This is separated from the setter to avoid "Maximum update depth exceeded" errors
    useEffect(() => {
        if (!loadingTask) {
            lastTaskIdRef.current = null;
            return;
        }

        if (loadingTask.isImportant) {
            setIsLoadingPopupVisible(true);

            // Only auto-adjust expansion if it's a NEW task (different ID)
            // This prevents status-text updates from fighting user-toggled expansion
            if (loadingTask.id !== lastTaskIdRef.current) {
                lastTaskIdRef.current = loadingTask.id ?? null;
                if (loadingTask.minimizeAfter) {
                    setIsLoadingExpanded(true);
                } else {
                    setIsLoadingExpanded(false);
                }
            }
        }
    }, [loadingTask]);
    const [error, setError] = useState<string | null>(null);
    const [isLoadingPopupVisible, setIsLoadingPopupVisible] = useState(false);
    const [isLoadingExpanded, setIsLoadingExpanded] = useState(false);

    // Refs declared before useMediaSort so they can be passed in
    const albumsRef = React.useRef<Record<string, Album>>({}); // Dictionary for O(1) lookup
    const [allAlbumsVideos, setAllAlbumsVideos] = useState<Record<string, VideoMedia[]>>({}); // All videos per album, sorted

    const {
        albumSort,
        getActiveVideoSort,
        globalVideoSortRef,
        albumSortRef,
        updateVideoSort,
        setAlbumSort,
        setVideoSortSettingScope,
        initializeSort,
        compareByVideoSort,
        compareByAlbumSort,
    } = useMediaSort(setAlbums, setAllAlbumsVideos, albumsRef);

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
                setIsLoadingPopupVisible(false);
                minimizeTimeoutRef.current = null;
            }, loadingTask.minimizeAfter);
        }

        return () => {
            if (dismissTimeoutRef.current) clearTimeout(dismissTimeoutRef.current);
            if (minimizeTimeoutRef.current) clearTimeout(minimizeTimeoutRef.current);
        };
    }, [loadingTask]);

    // Live State Refs to prevent stale closures inside background queue async workers
    const albumRankRef = React.useRef<Map<string, number>>(new Map()); // id → sort rank, O(1) lookup
    const lastSortKeyRef = React.useRef<string>(""); // Track last sort priority to avoid redundant sorts
    const isSyncingRef = React.useRef(false); // Prevent parallel smart syncs

    const { settings, loading: settingsLoading } = useSettings();

    const allAlbum = useMemo(() => {
        const dict: Record<string, Album> = {};
        albums.forEach((a) => (dict[a.id] = a));
        return dict;
    }, [albums]);

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

    const mapVideoMetadata = useCallback(
        (v: any): VideoMedia => {
            const title = cleanName(v.filename);
            return {
                ...v,
                title,
                thumbnail: v.thumbnail || undefined,
                baseThumbnailUri: getThumbnailUri(v.id),
                rawPrefix: extractPrefix(v.filename),
                prefix: extractPrefix(title),
                episode: extractEpisode(title),
                size: v.size || undefined,
                path: v.path || v.uri,
            };
        },
        [cleanName],
    );

    // Refs for background worker state
    const thumbnailQueue = React.useRef<VideoMedia[]>([]);
    const activeWorkers = React.useRef(0);
    const resultQueue = React.useRef<(VideoMedia & { thumbUri: string; bustedUri: string })[]>([]);
    const isDraining = React.useRef(false);
    const drainTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
    const successTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
    const lastLoadingDetailRef = React.useRef<string | null>(null);
    const completedThumbnailCountRef = React.useRef(0);
    const thumbnailSessionRef = React.useRef(0);
    const onQueueEmptyRef = React.useRef<(() => void) | null>(null);

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

    const getAlbumThumbnailForVideos = (albumVideos: VideoMedia[], sortToUse?: VideoSortConfig) => {
        if (albumVideos.length === 0) return undefined;
        const sortedVideos = [...albumVideos].sort((a, b) => compareByVideoSort(a, b, sortToUse));
        const firstVideo = sortedVideos[0];
        return firstVideo?.thumbnail || firstVideo?.baseThumbnailUri || (firstVideo ? getThumbnailUri(firstVideo.id) : undefined);
    };

    const sortByPriority = (a: VideoMedia, b: VideoMedia): number => {
        const albumRank = albumRankRef.current;

        if (a.albumId !== b.albumId) {
            return (albumRank.get(a.albumId) ?? 9999) - (albumRank.get(b.albumId) ?? 9999);
        }

        const album = albumsRef.current[a.albumId];
        const activeSort = getActiveVideoSort(album || null);
        return compareByVideoSort(a, b, activeSort);
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
                id: TASK_IDS.THUMBNAIL_GEN,
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

            resultQueue.current.sort((a, b) => sortByPriority(a, b));
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
                albumUpdates.set(item.id, {
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
                        id: TASK_IDS.THUMBNAIL_GEN,
                        label: "Generating Thumbnails",
                        detail: latestFilename,
                        isImportant: true,
                    });
                }

                if (updatesByAlbum.size > 0) {
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

            // Only sort if priority might have shifted (album change, video sort change, or album sort change)
            const sortKey = `${globalVideoSortRef.current.by}-${globalVideoSortRef.current.order}-${albumSortRef.current.by}-${albumSortRef.current.order}`;
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
                        ...task,
                        thumbUri,
                        bustedUri,
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
            setLoadingTask({
                id: TASK_IDS.CACHE_CLEAR,
                label: "Clearing Thumbnails",
                detail: "Removing cache files...",
                isImportant: true,
            });
            const files = await FileSystem.readDirectoryAsync(FileSystem.cacheDirectory!);
            const thumbFiles = files.filter((f) => f.startsWith("thumb_"));
            await Promise.all(
                thumbFiles.map((f) => FileSystem.deleteAsync(`${FileSystem.cacheDirectory}${f}`, { idempotent: true })),
            );
            cancelThumbnailSession();
            setAlbums((prev) => prev.map((a) => ({ ...a, thumbnail: undefined })));
            setAlbums((prev) => prev.map((a) => ({ ...a, thumbnail: undefined })));
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

                setLoadingTask({
                    id: TASK_IDS.CACHE_CLEAR,
                    label: "Clearing Thumbnails",
                    detail: "Updating database...",
                    isImportant: true,
                });
                // clearAllThumbnails wipes the 'thumbnail' property in the DB
                clearAllThumbnailsDb();
            }

            setLoadingTask({
                id: TASK_IDS.THUMBNAIL_GEN,
                label: "Generating Thumbnails",
                detail: "Queuing assets...",
                isImportant: true,
            });
            const allVideos = getAllVideosDb();
            const toQueue = allVideos
                .filter((v: any) => !v.thumbnail)
                .map((v: any) => ({
                    ...mapVideoMetadata(v),
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

            // 2. Update prefix options for affected albums
            for (const albumId of affectedAlbums) {
                const albumVids = getVideosForAlbumDb(albumId);
                recomputePrefixOptions(albumId, albumVids);
            }

            // 3. Validate Affected Albums
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
            setLoadingTask({
                id: TASK_IDS.LIBRARY_RESET,
                label: "Resetting Library",
                detail: "Waiting for workers to stop...",
                isImportant: true,
            });

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
            initializeFilters();
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
                id: TASK_IDS.LIBRARY_LOAD,
                label: "Loading Library",
                detail: "Reading cached data from database...",
                isImportant: lastSync === 0,
            });

            const savedAlbumSort = getSettingDb("albumSort");
            const savedGlobalVideoSort = getSettingDb("globalVideoSort");
            initializeSort(savedAlbumSort, savedGlobalVideoSort);

            const cachedAlbums = getAlbumsDb();

            if (cachedAlbums.length > 0) {
                const sortedAlbums = cachedAlbums
                    .map((a: any) => ({
                        ...a,
                        title: cleanName(a.folderName),
                    }))
                    .sort((a: any, b: any) => compareByAlbumSort(a, b));

                setAlbums(sortedAlbums);
                sortedAlbums.forEach((a) => {
                    albumsRef.current[a.id] = a;
                });

                // Initialize filters so that applyFiltersToVideos can read them
                initializeFilters();

                // Fetch ALL videos for every album and store in memory
                const videosMap: Record<string, VideoMedia[]> = {};
                sortedAlbums.forEach((a) => {
                    const sort = getActiveVideoSort(a);
                    const vids = getVideosForAlbumDb(a.id);
                    const mapped = vids.map(mapVideoMetadata).sort((x, y) => compareByVideoSort(x, y, sort));

                    // Recompute filters first to validate selection and save to DB
                    recomputePrefixOptions(a.id, mapped);

                    videosMap[a.id] = applyFiltersToVideos(a.id, mapped);
                });
                setAllAlbumsVideos(videosMap);
            } else {
                initializeFilters();
            }
        } catch (e) {
            console.error("[Media] DB Load failed:", e);
        } finally {
            setLoadingTask(null);
        }
    };

    const performSmartSync = async (signal?: AbortSignal) => {
        if (isSyncingRef.current || signal?.aborted) return;

        // Guard: Disable sync if no permissions granted
        const hasPermission = await checkPermission();
        if (!hasPermission) return;

        isSyncingRef.current = true;
        try {
            const lastSync = getLastSyncTimestampDb();
            const syncLabel = "Syncing Media";

            // 1. Fast Check: Get the newest asset in the entire library
            const { assets: latestAssets } = await MediaLibrary.getAssetsAsync({
                mediaType: "video",
                sortBy: [["modificationTime", false]],
                first: 1,
            });

            const newestTimestamp = latestAssets[0]?.modificationTime || 0;

            if (lastSync !== 0 && newestTimestamp !== 0 && newestTimestamp <= lastSync) {
                console.log("[Media] Library is clean (Smart Sync). Skipping delta scan.");
                await syncDatabaseWithStorage();
                setLoadingTask(null);
                return;
            }

            console.log("[Media] Library changed. Starting delta scan...");
            // Switch to visible now that we know there are actual changes
            setLoadingTask({ id: TASK_IDS.MEDIA_SYNC, label: syncLabel, detail: "Processing changes...", isImportant: true });
            await syncDatabaseWithStorage();

            const playbackData = getAllPlaybackDataDb();
            const playbackMap = new Map(playbackData.map((p: any) => [p.video_id, p.last_played_sec]));

            // 2. Fetch all albums upfront — needed for title lookup and parallelism
            const fetchedAlbums = await MediaLibrary.getAlbumsAsync();
            const albumTitleMap = new Map<string, string>(fetchedAlbums.map((a) => [a.id, a.title]));

            let totalNewFound = 0;

            // 3. Parallel Per-Album Paginated Scan
            //    Albums are independent → Promise.all; pages within each album stay sequential.
            await Promise.all(
                fetchedAlbums.map(async (a) => {
                    if (signal?.aborted) return;
                    let hasMore = true;
                    let after: string | undefined = undefined;
                    let albumNewFound = 0;

                    // Get existing videos for this album to avoid redundant processing
                    const existingVids = getVideosForAlbumDb(a.id);
                    const existingMap = new Map(existingVids.map((v) => [v.id, v]));

                    while (hasMore && !signal?.aborted) {
                        const { assets, hasNextPage, endCursor } = await MediaLibrary.getAssetsAsync({
                            album: a.id,
                            mediaType: "video",
                            first: 50,
                            sortBy: [["modificationTime", false]],
                            after,
                        });

                        const newVideos: VideoMedia[] = [];
                        let foundStopPoint = false;

                        for (const asset of assets) {
                            const time = asset.modificationTime || 0;
                            if (lastSync !== 0 && time <= lastSync) {
                                foundStopPoint = true;
                                break;
                            }

                            // Skip if already in DB with complete metadata
                            const existing = existingMap.get(asset.id);
                            if (
                                existing &&
                                existing.modificationTime === asset.modificationTime &&
                                existing.size &&
                                existing.size > 0 &&
                                existing.path
                            ) {
                                continue;
                            }

                            const thumbUri = await getThumbnailCached(asset.id);
                            const info = await FileSystem.getInfoAsync(asset.uri);
                            const video = mapVideoMetadata({
                                id: asset.id,
                                filename: asset.filename,
                                uri: asset.uri,
                                duration: asset.duration,
                                width: asset.width,
                                height: asset.height,
                                modificationTime: asset.modificationTime,
                                lastPlayedSec: playbackMap.get(asset.id) ?? -1,
                                size: info.exists ? (info as any).size : undefined,
                            });

                            if (thumbUri) {
                                video.thumbnail = thumbUri;
                                video.baseThumbnailUri = thumbUri;
                            }

                            newVideos.push(video);
                            albumNewFound++;
                        }

                        // Flush this album's batch to DB immediately, but defer setAlbums until the end
                        if (newVideos.length > 0) {
                            totalNewFound += newVideos.length;

                            const existingVideos = getVideosForAlbumDb(a.id);
                            const merged = [...existingVideos];
                            for (const nv of newVideos) {
                                const idx = merged.findIndex((v) => v.id === nv.id);
                                if (idx !== -1) merged[idx] = nv;
                                else merged.push(nv);
                            }

                            const sorted = merged.sort((x, y) =>
                                compareByVideoSort(x, y, getActiveVideoSort(albumsRef.current[a.id] || null)),
                            );
                            saveVideosDb(a.id, sorted);
                            const firstVideoPath = sorted[0]?.path;
                            const albumPath = firstVideoPath
                                ? firstVideoPath.substring(0, firstVideoPath.lastIndexOf("/"))
                                : undefined;

                            const albumObj: Album = {
                                id: a.id,
                                title: cleanName(albumTitleMap.get(a.id)!),
                                folderName: albumTitleMap.get(a.id)!,
                                assetCount: sorted.length,
                                path: albumPath,
                                thumbnail: getAlbumThumbnailForVideos(sorted),
                                hasNew: true,
                                lastModified: Math.max(...sorted.map((v) => v.modificationTime || 0)),
                                videoSortSettingScope: albumsRef.current[a.id]?.videoSortSettingScope || "global",
                                videoSortType: albumsRef.current[a.id]?.videoSortType,
                            };

                            // Update our ref so we can build the final album list at the end
                            albumsRef.current[a.id] = albumObj;
                        }

                        if (foundStopPoint) break;
                        hasMore = hasNextPage;
                        after = endCursor || undefined;
                    }

                    // Report once per album after all pages are done
                    if (albumNewFound > 0) {
                        setLoadingTask({
                            id: TASK_IDS.MEDIA_SYNC,
                            label: syncLabel,
                            detail: `Found ${albumNewFound} new video${albumNewFound !== 1 ? "s" : ""} in ${cleanName(albumTitleMap.get(a.id) || a.title)}.`,
                            isImportant: true,
                            minimizeAfter: 5000,
                        });
                    }
                }),
            );

            // 4. Final Finalize: Batch update the albums list ONLY once at the end
            //    This keeps the skeleton visible (albums.length === 0) until the entire scan is done.
            const finalAlbums = Object.values(albumsRef.current).sort((x, y) => compareByAlbumSort(x, y));
            saveAlbumsDb(finalAlbums);

            // Update rank ref immediately so background workers use the new sort order instantly
            albumRankRef.current = new Map(finalAlbums.map((a, i) => [a.id, i]));

            setAlbums(finalAlbums);

            // Refresh all in-memory videos after sync
            const syncedVideosMap: Record<string, VideoMedia[]> = {};
            finalAlbums.forEach((a) => {
                const sort = getActiveVideoSort(a);
                const vids = getVideosForAlbumDb(a.id);
                const mapped = vids.map(mapVideoMetadata).sort((x, y) => compareByVideoSort(x, y, sort));
                syncedVideosMap[a.id] = applyFiltersToVideos(a.id, mapped);

                // If this album was updated (or we just want to be sure), recompute prefix options
                // In a smarter version, we'd only do this if totalNewFound > 0 for this album
                // but for now, we'll do it if it's new or changed.
                recomputePrefixOptions(a.id, mapped);
            });
            setAllAlbumsVideos(syncedVideosMap);

            generateThumbnails(false);
            setLastSyncTimestampDb(newestTimestamp);
            console.log(`[Media] Delta sync complete. Processed ${totalNewFound} items.`);
        } catch (e) {
            console.error("[Media] Delta sync failed:", e);
            setError("Background sync failed");
        } finally {
            isSyncingRef.current = false;
            if (!hasActiveThumbnailWork()) setLoadingTask(null);
        }
    };

    const searchMedia = useCallback(
        (query: string) => {
            const q = query.trim().toLowerCase();
            if (!q) return [];

            const results: VideoMedia[] = [];
            for (const albumId in allAlbumsVideos) {
                const videos = allAlbumsVideos[albumId];
                for (const v of videos) {
                    if (v.title.toLowerCase().includes(q) || v.filename.toLowerCase().includes(q)) {
                        results.push(v);
                    }
                }
            }
            return results;
        },
        [allAlbumsVideos],
    );

    const getVideosForAlbum = useCallback(
        (albumId: string) => {
            const album = albumsRef.current[albumId];
            const activeSort = getActiveVideoSort(album || null);
            const videos = getVideosForAlbumDb(albumId);
            return videos.map(mapVideoMetadata).sort((a, b) => compareByVideoSort(a, b, activeSort));
        },
        [getActiveVideoSort, mapVideoMetadata, compareByVideoSort],
    );

    const {
        selectedVideoPrefixFilters,
        initializeFilters,
        applyFiltersToVideos,
        updatePrefixFilter,
        clearPrefixFilters,
        recomputePrefixOptions,
    } = useMediaPrefixFilter(setAlbums, setAllAlbumsVideos, albumsRef, getVideosForAlbum);

    const getVideoById = useCallback(
        (videoId: string) => {
            const v = getAllVideosDb().find((v) => v.id === videoId);
            return v ? mapVideoMetadata(v) : null;
        },
        [mapVideoMetadata],
    );

    const fetchAlbums = async () => {
        await performSmartSync();
        await loadDataFromDB();
    };

    const syncCurrentAlbum = async (_albumId: string, signal?: AbortSignal) => {
        if (signal?.aborted) return;
        await performSmartSync(signal);
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
            await performSmartSync();
        } else {
            setError("Permission denied. Cannot scan media.");
        }
    };

    const updateVideoProgress = React.useCallback((videoId: string, sec: number) => {
        savePlaybackDataDb(videoId, sec);

        setAllAlbumsVideos((prev) => {
            const next = { ...prev };
            let changed = false;
            for (const albumId in next) {
                const videos = next[albumId];
                const index = videos.findIndex((v) => v.id === videoId);
                if (index !== -1) {
                    const newVideos = [...videos];
                    newVideos[index] = { ...newVideos[index], lastPlayedSec: sec };
                    next[albumId] = newVideos;
                    changed = true;
                }
            }
            return changed ? next : prev;
        });
    }, []);

    const hasInitializedRef = React.useRef(false);

    useEffect(() => {
        const controller = new AbortController();
        const { signal } = controller;

        const initialize = async () => {
            if (!permissionResponse || settingsLoading || hasInitializedRef.current) return;

            try {
                // 1. Load cached data from DB immediately
                await loadDataFromDB();

                // 2. Permission Guard for MediaLibrary scans
                if (permissionResponse.status !== "granted") {
                    if (!signal.aborted) setLoadingTask(null);
                    return;
                }

                hasInitializedRef.current = true;

                // 3. Only perform sync if permission is granted
                if (!signal.aborted) {
                    await performSmartSync(signal);
                }
            } catch (e) {
                if (!signal.aborted) console.error("[Media] Initial load failed:", e);
            } finally {
                if (!signal.aborted) {
                    setLoadingTask(null);
                }
            }
        };
        initialize();
        return () => {
            controller.abort();
        };
    }, [permissionResponse, settingsLoading]);

    // Re-sort albums immediately when sort order changes
    useEffect(() => {
        saveSettingDb("albumSort", JSON.stringify(albumSort));
    }, [albumSort]);

    const togglePrefixSelection = useCallback((prefix: string, albumId: string) => {
        if (!prefix) return;

        const albumVideos = getVideosForAlbumDb(albumId);
        setIsSelectionMode(true);
        setSelectedIds((prev) => {
            const next = new Set(prev);
            const prefixedVideos = albumVideos.filter((v) => extractPrefix(v.filename) === prefix);
            prefixedVideos.forEach((v) => next.add(v.id));
            return next;
        });
    }, []);

    const hideVideo = useCallback(async (videoId: string) => {
        setVideoHiddenDb(videoId, true);
    }, []);

    const hideAlbum = useCallback(async (albumId: string) => {
        setAlbumHiddenDb(albumId, true);
        setAlbums((prev) => prev.filter((a) => a.id !== albumId));
    }, []);

    const hideMultipleVideos = useCallback(
        async (videoIds: string[]) => {
            videoIds.forEach((id) => setVideoHiddenDb(id, true));
            clearSelection();
        },
        [clearSelection],
    );

    const hideMultipleAlbums = useCallback(
        async (albumIds: string[]) => {
            const idSet = new Set(albumIds);
            albumIds.forEach((id) => setAlbumHiddenDb(id, true));
            setAlbums((prev) => prev.filter((a) => !idSet.has(a.id)));
            clearSelection();
        },
        [clearSelection],
    );

    const unhideVideo = useCallback(
        async (videoId: string) => {
            setVideoHiddenDb(videoId, false);
            // Refresh albums and videos
            fetchAlbums();
        },
        [fetchAlbums],
    );

    const unhideAlbum = useCallback(
        async (albumId: string) => {
            setAlbumHiddenDb(albumId, false);
            fetchAlbums();
        },
        [fetchAlbums],
    );

    const unhideMultipleVideos = useCallback(
        async (videoIds: string[]) => {
            videoIds.forEach((id) => setVideoHiddenDb(id, false));
            fetchAlbums();
            clearSelection();
        },
        [fetchAlbums, clearSelection],
    );

    const unhideMultipleAlbums = useCallback(
        async (albumIds: string[]) => {
            albumIds.forEach((id) => setAlbumHiddenDb(id, false));
            fetchAlbums();
            clearSelection();
        },
        [fetchAlbums, clearSelection],
    );

    const fetchHiddenMedia = useCallback(async () => {
        const albums = getHiddenAlbumsDb();
        const videos = getHiddenVideosDb();
        return { albums, videos };
    }, []);

    const selectPrefixesOfSelected = useCallback(
        (albumId: string) => {
            if (selectedIds.size === 0) return;
            const albumVideos = getVideosForAlbumDb(albumId);
            const currentPrefixes = new Set<string>();
            albumVideos.forEach((v) => {
                const raw = extractPrefix(v.filename);
                if (selectedIds.has(v.id) && raw) {
                    currentPrefixes.add(raw);
                }
            });
            if (currentPrefixes.size === 0) return;
            setSelectedIds((prev) => {
                const next = new Set(prev);
                albumVideos.forEach((v) => {
                    const raw = extractPrefix(v.filename);
                    if (raw && currentPrefixes.has(raw)) {
                        next.add(v.id);
                    }
                });
                return next;
            });
        },
        [selectedIds],
    );

    const renameVideo = useCallback(
        async (videoId: string, newName: string) => {
            // 1. Rename in DB
            renameVideoDb(videoId, newName);

            // 2. Physical rename (best effort)
            const video = getAllVideosDb().find((v) => v.id === videoId);
            if (video && video.path && video.path.startsWith("file://")) {
                try {
                    const oldPath = video.path;
                    const extension = oldPath.substring(oldPath.lastIndexOf("."));
                    const parentPath = oldPath.substring(0, oldPath.lastIndexOf("/"));
                    const newPath = `${parentPath}/${newName}${extension}`;

                    console.log(`[Media] Physically renaming file from ${oldPath} to ${newPath}`);
                    await FileSystem.moveAsync({
                        from: oldPath,
                        to: newPath,
                    });
                } catch (e) {
                    console.error("[Media] Physical file rename failed:", e);
                }
            }
        },
        [mapVideoMetadata],
    );

    const renameAlbum = useCallback(
        async (albumId: string, newName: string) => {
            // 1. Rename in DB
            renameAlbumDb(albumId, newName);

            // 2. Physical rename (best effort)
            const albumVids = getVideosForAlbumDb(albumId);
            if (albumVids.length > 0) {
                const firstVid = albumVids[0];
                if (firstVid.path && firstVid.path.startsWith("file://")) {
                    try {
                        const oldPath = firstVid.path;
                        const pathParts = oldPath.split("/");
                        pathParts.pop(); // remove filename
                        const dirPath = pathParts.join("/");
                        pathParts.pop(); // remove last dir name to get parent
                        const parentPath = pathParts.join("/");
                        const newDirPath = `${parentPath}/${newName}`;

                        if (dirPath !== newDirPath) {
                            console.log(`[Media] Physically renaming folder from ${dirPath} to ${newDirPath}`);
                            await FileSystem.moveAsync({
                                from: dirPath,
                                to: newDirPath,
                            });

                            // 3. Update all videos in this album to their new paths to maintain consistency
                            const updatedVideos = albumVids.map((v) => {
                                const filename = v.path.split("/").pop();
                                const newVPath = `${newDirPath}/${filename}`;
                                return { ...v, path: newVPath, uri: newVPath };
                            });

                            saveVideosDb(albumId, updatedVideos);
                        }
                    } catch (e) {
                        console.error("[Media] Physical folder rename failed:", e);
                    }
                }
            }

            setAlbums((prev) => {
                const index = prev.findIndex((a) => a.id === albumId);
                if (index === -1) return prev;
                const next = [...prev];
                next[index] = { ...next[index], title: newName };
                return next.sort((a, b) => compareByAlbumSort(a, b));
            });
        },
        [compareByAlbumSort],
    );

    const updateMultipleVideoProgress = useCallback((videoIds: string[], sec: number) => {
        // 1. Update DB
        videoIds.forEach((id) => savePlaybackDataDb(id, sec));
    }, []);

    const resetToAlbums = useCallback(() => {
        setSelectedIds(new Set());
        setIsSelectionMode(false);
    }, []);

    const contextValue = useMemo(
        () => ({
            albums,
            allAlbums: albums,
            allAlbumsVideos,
            loadingTask,
            setLoadingTask,
            error,
            albumSort,
            setAlbumSort,
            getActiveVideoSort,
            updateVideoSort,
            fetchAlbums,
            syncCurrentAlbum,
            clearThumbnailCache,
            regenerateAllThumbnails,
            syncDatabaseWithStorage,
            updateVideoProgress,
            resetToAlbums,
            resetEverything,
            requestPermissionAndFetch,
            loadDataFromDB,
            isLoadingPopupVisible,
            setIsLoadingPopupVisible,
            isLoadingExpanded,
            setIsLoadingExpanded,
            searchMedia,
            renameVideo,
            renameAlbum,
            updateMultipleVideoProgress,
            isSelectionMode,
            selectedIds,
            toggleSelection,
            clearSelection,
            selectAll,
            togglePrefixSelection,
            selectPrefixesOfSelected,
            hideVideo,
            hideAlbum,
            hideMultipleVideos,
            hideMultipleAlbums,
            unhideVideo,
            unhideAlbum,
            unhideMultipleVideos,
            unhideMultipleAlbums,
            fetchHiddenMedia,
            getVideosForAlbum,
            getVideoById,
            allAlbum,
            selectedVideoPrefixFilters,
            updatePrefixFilter,
            clearPrefixFilters,
            permissionResponse,
            setVideoSortSettingScope,
            compareByVideoSort,
            compareByAlbumSort,
        }),
        [
            albums,
            allAlbumsVideos,
            loadingTask,
            setLoadingTask,
            error,
            albumSort,
            setAlbumSort,
            getActiveVideoSort,
            updateVideoSort,
            fetchAlbums,
            clearThumbnailCache,
            regenerateAllThumbnails,
            syncDatabaseWithStorage,
            updateVideoProgress,
            resetEverything,
            requestPermissionAndFetch,
            loadDataFromDB,
            getVideosForAlbum,
            getVideoById,
            allAlbum,
            selectedVideoPrefixFilters,
            updatePrefixFilter,
            clearPrefixFilters,
            isLoadingPopupVisible,
            setIsLoadingPopupVisible,
            isLoadingExpanded,
            setIsLoadingExpanded,
            searchMedia,
            renameVideo,
            renameAlbum,
            hideVideo,
            hideAlbum,
            hideMultipleVideos,
            hideMultipleAlbums,
            unhideVideo,
            unhideAlbum,
            unhideMultipleVideos,
            unhideMultipleAlbums,
            fetchHiddenMedia,
            updateMultipleVideoProgress,
            isSelectionMode,
            selectedIds,
            toggleSelection,
            clearSelection,
            selectAll,
            togglePrefixSelection,
            selectPrefixesOfSelected,
            permissionResponse,
            setVideoSortSettingScope,
            compareByVideoSort,
            compareByAlbumSort,
        ],
    );

    useEffect(() => {
        const subscription = AppState.addEventListener("change", (nextAppState: AppStateStatus) => {
            if (nextAppState === "active") {
                // If we've already done the initial heavy lifting, just do a smart check
                console.log("[Media] App focused, running Smart Sync...");
                performSmartSync();
            }
        });

        return () => {
            subscription.remove();
        };
    }, [performSmartSync]);

    return <MediaContext.Provider value={contextValue}>{children}</MediaContext.Provider>;
};

export const useMedia = () => {
    const context = useContext(MediaContext);
    if (!context) {
        throw new Error("useMedia must be used within a MediaProvider");
    }
    return context;
};
