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
    getSettingDb,
    getVideoByIdDb,
    getVideosForAlbumDb,
    renameAlbumDb,
    renameVideoDb,
    resetDatabaseDb,
    saveAlbumsDb,
    savePlaybackDataDb,
    saveSettingDb,
    saveVideosDb,
    setAlbumHiddenDb,
    setVideoHiddenDb,
    searchVideosByNameDb,
    getLastSyncTimestampDb,
    setLastSyncTimestampDb,
    updateAlbumThumbnailDb,
    updateVideoThumbnailDb,
    updateAlbumSortDb,
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
export type AlbumSortBy = "name" | "date" | "count";

// Centralized task IDs for tracking specific background work
const TASK_IDS = {
    MEDIA_SYNC: "media-sync",
    THUMBNAIL_GEN: "thumbnail-gen",
    CACHE_CLEAR: "cache-clear",
    LIBRARY_RESET: "library-reset",
    LIBRARY_LOAD: "library-load",
} as const;
export type SortOrder = "asc" | "desc";

export interface Album {
    id: string;
    title: string;
    displayName: string;
    assetCount: number;
    path?: string;
    type?: string;
    thumbnail?: string;
    lastModified?: number;
    hasNew?: boolean;
    isPlaceholder?: boolean;
    sortConfig?: string;
}

export interface MediaContextType {
    albums: Album[];
    currentAlbumVideos: VideoMedia[];
    setCurrentAlbumVideos: React.Dispatch<React.SetStateAction<VideoMedia[]>>;
    currentAlbum: Album | null;
    setCurrentAlbum: (album: Album | null) => void;
    loadingTask: LoadingTask | null;
    error: string | null;
    albumSort: { by: AlbumSortBy; order: SortOrder };
    setAlbumSort: React.Dispatch<React.SetStateAction<{ by: AlbumSortBy; order: SortOrder }>>;
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
    selectAll: () => void;
    togglePrefixSelection: (prefix: string) => void;
    selectPrefixesOfSelected: () => void;
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
    getVideoById: (id: string) => VideoMedia | null;
    permissionResponse: MediaLibrary.PermissionResponse | null;
    videoSortMode: "global" | "local";
    switchVideoSortMode: (mode: "global" | "local") => void;
    albumSortOverrides: Record<string, { by: SortBy; order: SortOrder }>;
    compareByVideoSort: (a: VideoMedia, b: VideoMedia, vSort?: { by: SortBy; order: SortOrder }) => number;
    compareByAlbumSort: (a: Album, b: Album, aSort?: { by: AlbumSortBy; order: SortOrder }) => number;
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

    const selectAll = useCallback(() => {
        if (currentAlbum) {
            const allIds = currentAlbumVideos.map((v) => v.id);
            if (selectedIds.size === allIds.length) {
                setSelectedIds(new Set());
            } else {
                setSelectedIds(new Set(allIds));
                setIsSelectionMode(true);
            }
        } else {
            const allIds = albums.map((a) => a.id);
            if (selectedIds.size === allIds.length) {
                setSelectedIds(new Set());
            } else {
                setSelectedIds(new Set(allIds));
                setIsSelectionMode(true);
            }
        }
    }, [currentAlbum, currentAlbumVideos, albums, selectedIds.size]);
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
    const [albumSort, setAlbumSortState] = useState<{ by: AlbumSortBy; order: SortOrder }>({ by: "date", order: "desc" });
    const [videoSort, setVideoSortState] = useState<{ by: SortBy; order: SortOrder }>({ by: "episode", order: "asc" });
    const [globalVideoSort, setGlobalVideoSort] = useState<{ by: SortBy; order: SortOrder }>({ by: "episode", order: "asc" });
    const [videoSortMode, setVideoSortMode] = useState<"global" | "local">("global");
    const [albumSortOverrides, setAlbumSortOverrides] = useState<Record<string, { by: SortBy; order: SortOrder }>>({});
    const albumSortOverridesRef = React.useRef<Record<string, { by: SortBy; order: SortOrder }>>({});
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
    const currentAlbumRef = React.useRef<Album | null>(null);
    const videoSortRef = React.useRef({ by: "episode" as SortBy, order: "asc" as SortOrder });
    const albumSortRef = React.useRef({ by: "date" as AlbumSortBy, order: "desc" as SortOrder });
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

    const setVideoSort = useCallback(
        (s: React.SetStateAction<{ by: SortBy; order: SortOrder }>) => {
            const prev = videoSortRef.current;
            const next = typeof s === "function" ? s(prev) : s;

            if (prev.by === next.by && prev.order === next.order) return;

            // 1. Update State & Ref (Pure)
            setVideoSortState(next);
            videoSortRef.current = next;

            // 2. Perform Side Effects (Outside of State Updater)
            if (videoSortMode === "global") {
                setGlobalVideoSort(next);
                saveSettingDb("videoSort", JSON.stringify(next));
            } else if (currentAlbumRef.current) {
                const albumId = currentAlbumRef.current.id;
                console.log("[Media] Saving local sort for album:", albumId, next);
                
                updateAlbumSortDb(albumId, JSON.stringify(next));
                
                setAlbumSortOverrides(prev => {
                    const nextOverrides = { ...prev, [albumId]: next };
                    albumSortOverridesRef.current = nextOverrides;
                    return nextOverrides;
                });
            }
        },
        [videoSortMode],
    );

    const switchVideoSortMode = useCallback(
        (mode: "global" | "local") => {
            if (mode === videoSortMode) return;
            setVideoSortMode(mode);

            if (mode === "global") {
                setVideoSortState(globalVideoSort);
                videoSortRef.current = globalVideoSort;
            } else if (currentAlbumRef.current) {
                const albumId = currentAlbumRef.current.id;
                const localSort = albumSortOverridesRef.current[albumId];
                
                console.log("[Media] Switching to local mode for album:", albumId, "LocalSort:", localSort);
                
                if (localSort) {
                    setVideoSortState(localSort);
                    videoSortRef.current = localSort;
                } else {
                    // Default local to global if not set, and IMMEDIATELY persist it
                    console.log("[Media] Initializing local sort from global for album:", albumId);
                    setVideoSortState(globalVideoSort);
                    videoSortRef.current = globalVideoSort;
                    
                    updateAlbumSortDb(albumId, JSON.stringify(globalVideoSort));
                    setAlbumSortOverrides(prev => {
                        const nextOverrides = { ...prev, [albumId]: globalVideoSort };
                        albumSortOverridesRef.current = nextOverrides;
                        return nextOverrides;
                    });
                }
            }
        },
        [videoSortMode, globalVideoSort],
    );

    const setAlbumSort = useCallback((s: React.SetStateAction<{ by: AlbumSortBy; order: SortOrder }>) => {
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
        } else if (aSort.by === "count") {
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
                        id: TASK_IDS.THUMBNAIL_GEN,
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

            // Only sort if priority might have shifted (album change, video sort change, or album sort change)
            const sortKey = `${currentAlbumRef.current?.id}-${videoSortRef.current.by}-${videoSortRef.current.order}-${albumSortRef.current.by}-${albumSortRef.current.order}`;
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
            setCurrentAlbumVideos([]);
            setAllVideosCache({});
            setCurrentAlbum(null);
            setAlbumSort({ by: "date", order: "desc" });
            setVideoSort({ by: "episode", order: "asc" });
            setFolderFilters({});
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
            const cachedAlbums = getAlbumsDb();
            if (cachedAlbums.length > 0) {
                const cleanA = cachedAlbums.map((a: any) => ({
                    ...a,
                    displayName: cleanName(a.title),
                }));
                setAlbums(cleanA);
                cleanA.forEach((a) => {
                    albumsRef.current[a.id] = a;
                    if (a.sortConfig) {
                        try {
                            const parsed = JSON.parse(a.sortConfig);
                            albumSortOverridesRef.current[a.id] = parsed;
                        } catch (e) {}
                    }
                });
                setAlbumSortOverrides({ ...albumSortOverridesRef.current });

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
            if (savedVideoSort) {
                const parsed = JSON.parse(savedVideoSort);
                setVideoSortState(parsed);
                setGlobalVideoSort(parsed);
                videoSortRef.current = parsed;
            }
            const savedFilters = getSettingDb("folderFilters");
            if (savedFilters) setFolderFilters(JSON.parse(savedFilters));
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
            setLoadingTask({
                id: TASK_IDS.MEDIA_SYNC,
                label: syncLabel,
                detail: "Checking for new videos...",
                isImportant: false,
            });

            // 1. Fast Check: Get the newest asset in the entire library
            const { assets: latestAssets } = await MediaLibrary.getAssetsAsync({
                mediaType: "video",
                sortBy: [["modificationTime", false]],
                first: 1,
            });

            const newestTimestamp = latestAssets[0]?.modificationTime || 0;

            if (lastSync !== 0 && newestTimestamp !== 0 && newestTimestamp <= lastSync) {
                console.log("[Media] Library is clean (Smart Sync). Skipping delta scan.");
                setLoadingTask({
                    id: TASK_IDS.MEDIA_SYNC,
                    label: syncLabel,
                    detail: "Validating local files...",
                    isImportant: false,
                });
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
                    let hasMore = true;
                    let after: string | undefined = undefined;
                    let albumNewFound = 0;

                    while (hasMore) {
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
                            const existing = videoDictRef.current.get(asset.id);
                            if (
                                existing &&
                                existing.modificationTime === asset.modificationTime &&
                                existing.size &&
                                existing.size > 0 &&
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

                            const sorted = merged.sort((x, y) => compareByVideoSort(x, y, videoSortRef.current));
                            saveVideosDb(a.id, sorted);
                            allVideosCacheRef.current[a.id] = sorted;

                            const firstVideoPath = sorted[0]?.path;
                            const albumPath = firstVideoPath
                                ? firstVideoPath.substring(0, firstVideoPath.lastIndexOf("/"))
                                : undefined;
                            const albumObj: Album = {
                                id: a.id,
                                title: albumTitleMap.get(a.id) || "Unknown",
                                displayName: cleanName(albumTitleMap.get(a.id) || "Unknown"),
                                assetCount: sorted.length,
                                path: albumPath,
                                thumbnail: getAlbumThumbnailForVideos(sorted),
                                hasNew: true,
                                lastModified: Math.max(...sorted.map((v) => v.modificationTime || 0)),
                            };

                            // Update our ref so we can build the final album list at the end
                            albumsRef.current[a.id] = albumObj;

                            // We only update state for the current folder being viewed
                            unstable_batchedUpdates(() => {
                                setAllVideosCache({ ...allVideosCacheRef.current });
                                const activeId = currentAlbumRef.current?.id;
                                if (activeId === a.id) {
                                    setCurrentAlbumVideos(sorted);
                                    setCurrentAlbum(albumObj);
                                }
                            });
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

    const searchMedia = useCallback((query: string) => {
        const q = query.toLowerCase().trim();
        if (!q) return [];
        const results: VideoMedia[] = [];
        for (const video of videoDictRef.current.values()) {
            if (video.displayName.toLowerCase().includes(q)) {
                results.push(video);
            }
        }
        return results;
    }, []);

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
        // 0. Resolve the FULL album record to ensure we have 'sortConfig'
        let fullAlbumRecord = albumsRef.current[album.id];
        if (!fullAlbumRecord) {
            const allCached = getAlbumsDb();
            const matching = allCached.find((a) => a.id === album.id);
            if (matching) {
                fullAlbumRecord = { ...matching, displayName: cleanName(matching.title) };
                albumsRef.current[album.id] = fullAlbumRecord;
            }
        }

        currentAlbumRef.current = fullAlbumRecord || (album as Album);
        setCurrentAlbum(currentAlbumRef.current);

        // 1. Show data IMMEDIATELY from in-memory cache (zero latency)
        const cached = allVideosCacheRef.current[album.id];
        if (cached && cached.length > 0) {
            setCurrentAlbumVideos(cached);
        } else {
            // 2. Cache miss — load synchronously from DB (fast, no async I/O)
            loadAlbumFromDb(album.id);
        }

        // 3. Initialize sorting mode based on local config
        const localSort = albumSortOverridesRef.current[album.id];
        if (localSort) {
            console.log("[Media] Initializing folder with local sort:", album.id, localSort);
            setVideoSortState(localSort);
            videoSortRef.current = localSort;
            setVideoSortMode("local");
        } else {
            setVideoSortMode("global");
            setVideoSortState(globalVideoSort);
            videoSortRef.current = globalVideoSort;
        }

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
        saveSettingDb("albumSort", JSON.stringify(albumSort));
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

    const togglePrefixSelection = useCallback((prefix: string) => {
        if (!prefix) return;
        
        setIsSelectionMode(true);
        setSelectedIds((prev) => {
            const next = new Set(prev);
            const prefixedVideos = currentAlbumVideos.filter(v => v.prefix === prefix);
            prefixedVideos.forEach(v => next.add(v.id));
            return next;
        });
    }, [currentAlbumVideos]);

    const hideVideo = useCallback(async (videoId: string) => {
        setVideoHiddenDb(videoId, true);
        
        setCurrentAlbumVideos(prev => prev.filter(v => v.id !== videoId));
        setAllVideosCache(prev => {
            const next = { ...prev };
            for (const albumId in next) {
                next[albumId] = next[albumId].filter(v => v.id !== videoId);
            }
            return next;
        });
    }, []);

    const hideAlbum = useCallback(async (albumId: string) => {
        setAlbumHiddenDb(albumId, true);
        setAlbums(prev => prev.filter(a => a.id !== albumId));
    }, []);

    const hideMultipleVideos = useCallback(async (videoIds: string[]) => {
        const idSet = new Set(videoIds);
        videoIds.forEach(id => setVideoHiddenDb(id, true));

        setCurrentAlbumVideos(prev => prev.filter(v => !idSet.has(v.id)));
        setAllVideosCache(prev => {
            const next = { ...prev };
            for (const albumId in next) {
                next[albumId] = next[albumId].filter(v => !idSet.has(v.id));
            }
            return next;
        });
        clearSelection();
    }, [clearSelection]);

    const hideMultipleAlbums = useCallback(async (albumIds: string[]) => {
        const idSet = new Set(albumIds);
        albumIds.forEach(id => setAlbumHiddenDb(id, true));
        setAlbums(prev => prev.filter(a => !idSet.has(a.id)));
        clearSelection();
    }, [clearSelection]);

    const unhideVideo = useCallback(async (videoId: string) => {
        setVideoHiddenDb(videoId, false);
        // Refresh albums and videos
        fetchAlbums();
        if (currentAlbumRef.current) fetchVideosInAlbum(currentAlbumRef.current);
    }, [fetchAlbums, fetchVideosInAlbum]);

    const unhideAlbum = useCallback(async (albumId: string) => {
        setAlbumHiddenDb(albumId, false);
        fetchAlbums();
    }, [fetchAlbums]);

    const unhideMultipleVideos = useCallback(async (videoIds: string[]) => {
        videoIds.forEach(id => setVideoHiddenDb(id, false));
        fetchAlbums();
        if (currentAlbumRef.current) fetchVideosInAlbum(currentAlbumRef.current);
        clearSelection();
    }, [fetchAlbums, fetchVideosInAlbum, clearSelection]);

    const unhideMultipleAlbums = useCallback(async (albumIds: string[]) => {
        albumIds.forEach(id => setAlbumHiddenDb(id, false));
        fetchAlbums();
        clearSelection();
    }, [fetchAlbums, clearSelection]);

    const fetchHiddenMedia = useCallback(async () => {
        const albums = getHiddenAlbumsDb();
        const videos = getHiddenVideosDb();
        return { albums, videos };
    }, []);

    const selectPrefixesOfSelected = useCallback(() => {
        if (selectedIds.size === 0) return;
        
        const currentPrefixes = new Set<string>();
        currentAlbumVideos.forEach(v => {
            if (selectedIds.has(v.id) && v.prefix) {
                currentPrefixes.add(v.prefix);
            }
        });
        
        if (currentPrefixes.size === 0) return;
        
        setSelectedIds(prev => {
            const next = new Set(prev);
            currentAlbumVideos.forEach(v => {
                if (v.prefix && currentPrefixes.has(v.prefix)) {
                    next.add(v.id);
                }
            });
            return next;
        });
    }, [selectedIds, currentAlbumVideos]);

    const renameVideo = useCallback(async (videoId: string, newName: string) => {
        // 1. Rename in DB
        renameVideoDb(videoId, newName);

        // 2. Physical rename (best effort)
        const video = videoDictRef.current.get(videoId);
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

        // Update local state
        setCurrentAlbumVideos((prev) => {
            const index = prev.findIndex((v) => v.id === videoId);
            if (index === -1) return prev;
            const next = [...prev];
            next[index] = { ...next[index], displayName: newName };
            return next;
        });

        setAllVideosCache((prev) => {
            const next = { ...prev };
            for (const key in next) {
                const arr = next[key];
                const vIndex = arr.findIndex((v) => v.id === videoId);
                if (vIndex !== -1) {
                    const nextArr = [...arr];
                    nextArr[vIndex] = { ...nextArr[vIndex], displayName: newName };
                    next[key] = nextArr;
                    break;
                }
            }
            return next;
        });
    }, []);

    const renameAlbum = useCallback(async (albumId: string, newName: string) => {
        // 1. Rename in DB
        renameAlbumDb(albumId, newName);

        // 2. Physical rename (best effort)
        const albumVids = allVideosCacheRef.current[albumId] || [];
        if (albumVids.length > 0) {
            const firstVid = albumVids[0];
            if (firstVid.path && firstVid.path.startsWith("file://")) {
                try {
                    const oldPath = firstVid.path;
                    const pathParts = oldPath.split("/");
                    pathParts.pop(); // remove filename
                    const dirPath = pathParts.join("/");
                    const lastDirName = pathParts.pop();
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
                        allVideosCacheRef.current[albumId] = updatedVideos;
                        setAllVideosCache((prev) => ({ ...prev, [albumId]: updatedVideos }));
                        if (currentAlbumRef.current?.id === albumId) {
                            setCurrentAlbumVideos(updatedVideos);
                        }
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
            next[index] = { ...next[index], displayName: newName };
            return next.sort((a, b) => compareByAlbumSort(a, b));
        });

        if (currentAlbum?.id === albumId) {
            setCurrentAlbum({ ...currentAlbum, displayName: newName });
        }
    }, [currentAlbum]);

    const updateMultipleVideoProgress = useCallback((videoIds: string[], sec: number) => {
        // 1. Update DB
        videoIds.forEach((id) => savePlaybackDataDb(id, sec));

        // 2. Update local state
        setCurrentAlbumVideos((prev) => {
            let changed = false;
            const next = prev.map((v) => {
                if (videoIds.includes(v.id)) {
                    changed = true;
                    return { ...v, lastPlayedSec: sec };
                }
                return v;
            });
            return changed ? next : prev;
        });

        setAllVideosCache((prev) => {
            const next = { ...prev };
            let changedGlobal = false;
            for (const albumId in next) {
                let changedInAlbum = false;
                next[albumId] = next[albumId].map((v) => {
                    if (videoIds.includes(v.id)) {
                        changedInAlbum = true;
                        changedGlobal = true;
                        return { ...v, lastPlayedSec: sec };
                    }
                    return v;
                });
            }
            return changedGlobal ? next : prev;
        });
    }, []);


    const getVideoById = useCallback((id: string) => {
        const v = getVideoByIdDb(id);
        if (!v) return null;
        const rawName = v.displayName || v.filename;
        const displayName = cleanName(rawName);
        return {
            ...v,
            displayName,
            thumbnail: v.thumbnail || undefined,
            baseThumbnailUri: getThumbnailUri(v.id),
            prefix: extractPrefix(displayName),
            episode: extractEpisode(displayName),
        } as VideoMedia;
    }, []);

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
            getVideoById,
            permissionResponse,
            videoSortMode,
            switchVideoSortMode,
            albumSortOverrides,
            compareByVideoSort,
            compareByAlbumSort,
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
            getVideoById,
            searchMedia,
            updateMultipleVideoProgress,
            isSelectionMode,
            selectedIds,
            toggleSelection,
            clearSelection,
            selectAll,
            togglePrefixSelection,
            selectPrefixesOfSelected,
            permissionResponse,
            videoSortMode,
            switchVideoSortMode,
            albumSortOverrides,
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
