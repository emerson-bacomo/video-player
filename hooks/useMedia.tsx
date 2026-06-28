import * as FileSystem from "expo-file-system/legacy";
import * as MediaLibrary from "expo-media-library";
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { Dispatch, SetStateAction, ReactNode } from "react";
import { AppState, AppStateStatus } from "react-native";

import { MediaRepository } from "@/hooks/MediaRepository";
import { MediaStore } from "@/hooks/MediaStore";
import { MediaStoreProvider } from "@/hooks/MediaStoreBridge/MediaStoreProvider";
import { DEFAULT_SORT_SCOPE } from "@/constants/defaults";
import { extractEpisode, extractPrefix, extractSeason, getThumbnailUri } from "@/utils/videoUtils";
import {
    addLogDb,
    addPendingClipAssignmentDb,
    addVideosDb,
    clearOldPendingClipAssignmentsDb,
    deleteMultipleAlbumsDb,
    deleteMultipleVideosDb,
    deletePendingClipAssignmentDb,
    deletePendingMediaDataDb,
    getAlbumsDb,
    getAllPendingClipAssignmentsDb,
    getAllPlaybackDataDb,
    getAllVideosDb,
    getHiddenAlbumsDb,
    getLastSyncTimestampDb,
    getPendingMediaDataDb,
    getSettingDb,
    getVideosForAlbumDb,
    resetDatabaseDb,
    saveAlbumsDb,
    saveSettingDb,
    setAlbumHiddenDb,
    setLastSyncTimestampDb,
    setVideoHiddenDb,
    updateAlbumThumbnailDb,
} from "../utils/db";
import { useSettings } from "./useSettings";
import { ExportLabels, useMediaExport } from "./useMediaExport";

import type { AlbumData, ExportOptions, SessionClip, VideoData } from "../types/useMedia";
import { TASK_IDS } from "./useMediaLoadingTask";
import { useLoadingTask } from "@/context/LoadingTaskContext";
import { REQUIRED_MEDIA_PERMISSIONS, useMediaPermission } from "./useMediaPermission";
import { useMediaPrefixFilter } from "./useMediaPrefixFilter";
import { useMediaThumbnailGeneration } from "./useMediaThumbnailGeneration";
import { Album } from "./domain/Album";
import { Video } from "./domain/Video";
import type { AlbumSortBy, AlbumSortConfig, SortBy, SortOrder, VideoSortConfig } from "../types/useMedia";

export type { AlbumSortBy, AlbumSortConfig, SortBy, SortOrder, VideoSortConfig };

export interface MediaContextType {
    allAlbumsVideos: Record<string, VideoData[]>;
    albumSort: AlbumSortConfig;
    setAlbumSort: Dispatch<SetStateAction<AlbumSortConfig>>;
    updateVideoSort: (
        albumId: string,
        s: SetStateAction<VideoSortConfig>,
        targetVideoSortSettingScope: "local" | "global",
    ) => void;
    fetchAlbums: () => Promise<void>;
    performSmartSync: (signal?: AbortSignal) => Promise<void>;
    resetEverything: () => Promise<void>;
    isSyncing: boolean;
    isResettingDatabase: boolean;
    isRegeneratingThumbnails: boolean;
    requestPermissionAndFetch: () => Promise<string | null>;
    loadDataFromDB: () => Promise<void>;

    allAlbum: Record<string, AlbumData>;
    selectedVideoPrefixFilters: Record<string, string[]>;
    updatePrefixFilter: (albumId: string, rawPrefix: string, isSelected: boolean) => void;
    clearPrefixFilters: (albumId: string) => void;

    permissionResponse: MediaLibrary.PermissionResponse | null;
    setVideoSortSettingScope: (albumId: string, scope: "global" | "local") => void;
    compareByVideoSort: (a: VideoData, b: VideoData, vSort?: { by: SortBy; order: SortOrder }) => number;
    compareByAlbumSort: (a: AlbumData, b: AlbumData, aSort?: { by: AlbumSortBy; order: SortOrder }) => number;
    setThumbnailPriorityAlbum: (albumId: string | null) => void;
    sessionClips: Record<string, SessionClip>;
    hasNewClips: boolean;
    markClipsAsViewed: () => void;
    performExport: (
        inputUri: string,
        segments: { start: number; end: number }[],
        options: ExportOptions,
        labels: ExportLabels,
        onSuccess?: (outPathStr: string) => void,
    ) => Promise<void>;
    executeReexport: (clip: SessionClip, options: ExportOptions) => Promise<void>;
}

const MediaContext = createContext<MediaContextType | null>(null);

export const MediaProvider = ({ children }: { children: ReactNode }) => {
    const [albums, setAlbums] = useState<AlbumData[]>([]);
    const { loading: settingsLoading, settingsRef } = useSettings();

    // New domain store — created eagerly so bridge hooks work from first render
    const repoRef = useRef<MediaRepository>(null!);
    if (!repoRef.current) repoRef.current = new MediaRepository();
    const [store] = useState(() => new MediaStore(repoRef.current));

    const { setLoadingTask } = useLoadingTask();

    const [, setError] = useState<string | null>(null);
    const handleSetError = useCallback((err: string | null) => setError(err), []);

    const {
        permissionResponse,
        requestPermissionAndFetch: internalRequestPermissionAndFetch,
        checkPermission,
    } = useMediaPermission(handleSetError);

    const albumsRef = useRef<Record<string, AlbumData>>({}); // Dictionary for O(1) lookup
    const [allAlbumsVideos, setAllAlbumsVideos] = useState<Record<string, VideoData[]>>({}); // All videos per album, sorted
    const [sessionClips, setSessionClips] = useState<Record<string, SessionClip>>({});
    const [hasNewClips, setHasNewClips] = useState(false);

    const markClipsAsViewed = useCallback(() => {
        setHasNewClips(false);
    }, []);

    const cleanName = useCallback(
        (name: string) => {
            const currentSettings = settingsRef.current;
            if (!currentSettings.nameReplacements || currentSettings.nameReplacements.length === 0) return name;
            let cleaned = name;
            currentSettings.nameReplacements.forEach((rule) => {
                if (rule.active && rule.find) {
                    cleaned = cleaned.split(rule.find).join(rule.replace || "");
                }
            });
            return cleaned;
        },
        [settingsRef],
    );

    const mapVideoMetadata = useCallback(
        (v: any): VideoData => {
            const title = cleanName(v.filename);
            return {
                ...v,
                title,
                thumbnail: v.thumbnail || undefined,
                baseThumbnailUri: getThumbnailUri(v.id),
                rawPrefix: extractPrefix(v.filename),
                prefix: extractPrefix(title),
                episode: extractEpisode(title),
                season: extractSeason(title),
                size: v.size || undefined,
                uri: v.uri,
                markers: v.markers ? (typeof v.markers === "string" ? JSON.parse(v.markers) : v.markers) : undefined,
                lastOpenedTime: v.lastOpenedTime || 0,
                clipSourceUri: v.clipSourceUri,
                isNewOverride: !!v.isNewOverride,
            };
        },
        [cleanName],
    );

    // ── Sort state ─────────────────────────────────────────────────────────
    const [albumSort, setAlbumSortState] = useState<AlbumSortConfig>(Album.globalSortConfig);
    const [globalVideoSort, setGlobalVideoSortState] = useState<VideoSortConfig>(Video.globalSortConfig);

    const albumSortRef = useRef<AlbumSortConfig>(albumSort);
    const globalVideoSortRef = useRef<VideoSortConfig>(globalVideoSort);

    useEffect(() => {
        Album.globalSortConfig = albumSort;
        Video.globalSortConfig = globalVideoSort;
    }, [albumSort, globalVideoSort]);

    const compareByVideoSort = useCallback(
        (a: VideoData, b: VideoData, vSort?: VideoSortConfig) => Video.compareBySort(a, b, vSort),
        [],
    );

    const compareByAlbumSort = useCallback(
        (a: AlbumData, b: AlbumData, aSort?: AlbumSortConfig) => Album.compareBySort(a, b, aSort),
        [],
    );

    const getAlbumThumbnail = useCallback((videos: VideoData[]) => {
        return videos[0]?.thumbnail;
    }, []);

    useEffect(() => {
        saveSettingDb("albumSort", JSON.stringify(albumSort));
    }, [albumSort]);

    const initializeSort = useCallback((savedAlbumSort: string | null, savedGlobalVideoSort: string | null) => {
        if (savedAlbumSort) {
            const parsed = JSON.parse(savedAlbumSort) as AlbumSortConfig;
            setAlbumSortState(parsed);
            albumSortRef.current = parsed;
            Album.globalSortConfig = parsed;
        }
        if (savedGlobalVideoSort) {
            const parsed = JSON.parse(savedGlobalVideoSort) as VideoSortConfig;
            setGlobalVideoSortState(parsed);
            globalVideoSortRef.current = parsed;
            Video.globalSortConfig = parsed;
        }
    }, []);

    const updateVideoSort = useCallback(
        (targetAlbumId: string, s: SetStateAction<VideoSortConfig>, targetVideoSortSettingScope: "local" | "global") => {
            if (targetVideoSortSettingScope === "global") {
                const prev = globalVideoSortRef.current;
                const next = typeof s === "function" ? s(prev) : s;
                if (prev.by === next.by && prev.order === next.order) return;

                globalVideoSortRef.current = next;
                Video.globalSortConfig = next;
                saveSettingDb("globalVideoSort", JSON.stringify(next));
                setGlobalVideoSortState(next);

                setAllAlbumsVideos((prevVideos) => {
                    const updated: Record<string, VideoData[]> = {};
                    const albumThumbUpdates: Record<string, string> = {};

                    Object.entries(prevVideos).forEach(([albumId, videos]) => {
                        const album = store.getAlbum(albumId);
                        if (album?.videoSortMode === "local") {
                            updated[albumId] = videos;
                        } else {
                            const nextVideos = [...videos].sort((x, y) => Video.compareBySort(x, y, next));
                            updated[albumId] = nextVideos;

                            const albumData = albumsRef.current[albumId];
                            const newThumb = getAlbumThumbnail(nextVideos);
                            if (albumData && albumData.thumbnail !== newThumb) {
                                albumThumbUpdates[albumId] = newThumb || "";
                            }
                        }
                    });

                    if (Object.keys(albumThumbUpdates).length > 0) {
                        setAlbums((prevAlbums) =>
                            prevAlbums.map((a) => {
                                if (albumThumbUpdates[a.id] !== undefined) {
                                    const newThumb = albumThumbUpdates[a.id];
                                    if (newThumb !== a.thumbnail) {
                                        updateAlbumThumbnailDb(a.id, newThumb);
                                        const updatedAlbum = { ...a, thumbnail: newThumb };
                                        albumsRef.current[a.id] = updatedAlbum;
                                        return updatedAlbum;
                                    }
                                }
                                return a;
                            }),
                        );
                    }

                    return updated;
                });
            } else {
                const album = store.getAlbum(targetAlbumId);
                if (!album) return;

                const current = albumsRef.current[targetAlbumId];
                const prevSort: VideoSortConfig = current?.videoSortType
                    ? JSON.parse(current.videoSortType)
                    : globalVideoSortRef.current;
                const nextSort = typeof s === "function" ? s(prevSort) : s;

                if (
                    prevSort.by === nextSort.by &&
                    prevSort.order === nextSort.order &&
                    current?.videoSortSettingScope === "local"
                )
                    return;

                album.videoSort = nextSort;
                const updatedData = album.toJSON();
                albumsRef.current[targetAlbumId] = updatedData;
                setAlbums((prev) => prev.map((a) => (a.id === targetAlbumId ? updatedData : a)));

                setAllAlbumsVideos((prev) => {
                    if (!prev[targetAlbumId]) return prev;
                    const nextVideos = [...prev[targetAlbumId]].sort((x, y) => Video.compareBySort(x, y, nextSort));

                    const newThumb = getAlbumThumbnail(nextVideos);
                    if (updatedData.thumbnail !== newThumb) {
                        updateAlbumThumbnailDb(targetAlbumId, newThumb || "");
                        setAlbums((prevAlbums) =>
                            prevAlbums.map((a) => (a.id === targetAlbumId ? { ...updatedData, thumbnail: newThumb } : a)),
                        );
                    }

                    return { ...prev, [targetAlbumId]: nextVideos };
                });
            }
        },
        [setAllAlbumsVideos, albumsRef, getAlbumThumbnail, setAlbums, store],
    );

    const setAlbumSort = useCallback(
        (s: SetStateAction<AlbumSortConfig>) => {
            const prev = albumSortRef.current;
            const next = typeof s === "function" ? s(prev) : s;
            if (prev.by === next.by && prev.order === next.order) return;

            albumSortRef.current = next;
            Album.globalSortConfig = next;
            saveSettingDb("albumSort", JSON.stringify(next));
            setAlbumSortState(next);
            setAlbums((prevAlbums) => [...prevAlbums].sort((a, b) => Album.compareBySort(a, b, next)));
        },
        [setAlbums],
    );

    const setVideoSortSettingScope = useCallback(
        async (albumId: string, scope: "global" | "local") => {
            const album = store.getAlbum(albumId);
            if (!album || album.videoSortMode === scope) return;

            console.log(`[Media] Switching scope for album ${albumId} from ${album.videoSortMode} to ${scope}`);
            album.videoSortMode = scope;

            const updatedData = album.toJSON();
            albumsRef.current[albumId] = updatedData;
            setAlbums((prev) => prev.map((a) => (a.id === albumId ? updatedData : a)));

            const activeSort = album.videoSort;
            setAllAlbumsVideos((prev) => {
                if (!prev[albumId]) return prev;
                const nextVideos = [...prev[albumId]].sort((x, y) => Video.compareBySort(x, y, activeSort));

                const newThumb = getAlbumThumbnail(nextVideos);
                if (updatedData.thumbnail !== newThumb) {
                    await repoRef.current.updateAlbumThumbnail(albumId, newThumb || "");
                    setAlbums((prevAlbums) =>
                        prevAlbums.map((a) => (a.id === albumId ? { ...updatedData, thumbnail: newThumb } : a)),
                    );
                }

                return { ...prev, [albumId]: nextVideos };
            });
        },
        [store, albumsRef, setAlbums, setAllAlbumsVideos, getAlbumThumbnail],
    );

    const getUnfilteredVideosForAlbum = useCallback(
        (albumId: string) => {
            const activeSort = store.getAlbum(albumId)?.videoSort ?? Video.globalSortConfig;
            const videos = getVideosForAlbumDb(albumId);
            return videos.map(mapVideoMetadata).sort((a, b) => Video.compareBySort(a, b, activeSort));
        },
        [mapVideoMetadata, store],
    );

    const {
        selectedVideoPrefixFilters,
        initializeFilters,
        applyFiltersToVideos,
        updatePrefixFilter,
        clearPrefixFilters,
        recomputePrefixOptions,
    } = useMediaPrefixFilter(setAlbums, setAllAlbumsVideos, albumsRef, getUnfilteredVideosForAlbum);

    const isSyncingRef = useRef(false); // Prevent parallel smart syncs
    const [isSyncing, setIsSyncing] = useState(false);
    const isResettingDatabaseRef = useRef(false); // Immediate guard against re-entrant resets
    const [isResettingDatabase, setIsResettingDatabase] = useState(false);

    const {
        isRegeneratingThumbnails,
        isRegeneratingThumbnailsRef,
        setThumbnailPriorityAlbum,
        generateThumbnails,
        clearThumbnailCache,
        cancelThumbnailSession,
        hasActiveThumbnailWork,
        getAlbumThumbnailForVideos,
        getThumbnailCached,
        updateAlbumRank,
        thumbnailQueue,
    } = useMediaThumbnailGeneration({
        setAlbums,
        setAllAlbumsVideos,
        albumsRef,
        store,
        setLoadingTask,
        mapVideoMetadata,
    });

    useEffect(() => {
        updateAlbumRank(albums);
    }, [albums, updateAlbumRank]);

    const hasInitializedRef = useRef(false);

    const allAlbum = useMemo(() => {
        const dict: Record<string, AlbumData> = {};
        albums.forEach((a) => (dict[a.id] = a));
        return dict;
    }, [albums]);

    const registerSessionClip = useCallback(
        (video: VideoData, segments: { start: number; end: number }[], options: ExportOptions, clipSourceUri: string) => {
            const videoWithMetadata: SessionClip = {
                ...video,
                clipSourceUri,
                segments,
                exportOptions: options,
                sessionCreatedAt: Date.now(),
            };

            setSessionClips((prev) => ({
                ...prev,
                [videoWithMetadata.uri]: videoWithMetadata,
            }));
            setHasNewClips(true);
        },
        [],
    );

    const addPendingClipAssignment = useCallback((outputUri: string, sourceUri: string) => {
        addPendingClipAssignmentDb(outputUri, sourceUri);
    }, []);

    const syncDatabaseWithStorage = useCallback(async () => {
        try {
            console.log("[Media] Performing fast file-system sync...");
            const allVideos = await repoRef.current.getVideos();
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
                    await repoRef.current.deleteVideos([video.id]);

                    // Clean up floating player video if it was deleted
                    try {
                        const raw = await repoRef.current.getSetting("floatingPlayerVideo");
                        if (raw) {
                            const lastPlayed = JSON.parse(raw);
                            if (lastPlayed?.id === video.id) {
                                await repoRef.current.saveSetting("floatingPlayerVideo", "");
                            }
                        }
                    } catch (e) {
                        console.log("[Media] Failed to clean up lastPlayedVideo", e);
                    }

                    affectedAlbums.add(video.albumId);
                    deletedVideosCount++;
                }
            }

            // 2. Refresh local cache for affected albums
            if (affectedAlbums.size > 0) {
                setAllAlbumsVideos((prev) => {
                    const next = { ...prev };
                    for (const albumId of affectedAlbums) {
                        const unfiltered = getUnfilteredVideosForAlbum(albumId);
                        if (unfiltered.length === 0) {
                            delete next[albumId];
                        } else {
                            next[albumId] = unfiltered;
                        }
                    }
                    return next;
                });
            }

            // 3. Global Cleanup of Empty Albums and Update Metadata
            // Refactored to handle async FileSystem checks for thumbnail validity
            const currentAlbums = await new Promise<AlbumData[]>((resolve) => {
                setAlbums((prev) => {
                    resolve(prev);
                    return prev;
                });
            });

            const nextAlbums: AlbumData[] = [];
            let changed = false;
            let albumUpdatesCount = 0;

            for (const album of currentAlbums) {
                const albumVids = await repoRef.current.getVideos(album.id);
                if (albumVids.length === 0) {
                    console.log(`[Media] Cleaning up empty album: ${album.title}`);
                    await repoRef.current.deleteAlbums([album.id]);
                    changed = true;
                    continue;
                }

                let needsMetadataUpdate = affectedAlbums.has(album.id);
                if (!needsMetadataUpdate && album.thumbnail) {
                    const thumbInfo = await FileSystem.getInfoAsync(album.thumbnail);
                    if (!thumbInfo.exists) {
                        console.log(`[Media] Thumbnail missing for album ${album.title}, re-evaluating...`);
                        needsMetadataUpdate = true;
                    }
                }

                if (needsMetadataUpdate) {
                    recomputePrefixOptions(album.id, albumVids);
                    const newThumb = getAlbumThumbnailForVideos(
                        albumVids.map(mapVideoMetadata),
                        store.getAlbum(album.id)?.videoSort ?? Video.globalSortConfig,
                    );
                    if (newThumb !== album.thumbnail) {
                        await repoRef.current.updateAlbumThumbnail(album.id, newThumb || "");
                        albumUpdatesCount++;
                        changed = true;
                        nextAlbums.push({ ...album, thumbnail: newThumb || "", assetCount: albumVids.length });
                    } else if (album.assetCount !== albumVids.length) {
                        changed = true;
                        nextAlbums.push({ ...album, assetCount: albumVids.length });
                    } else {
                        nextAlbums.push(album);
                    }
                } else {
                    nextAlbums.push(album);
                }
            }

            if (changed) {
                setAlbums(nextAlbums);
            }

            if (deletedVideosCount > 0 || albumUpdatesCount > 0) {
                console.log(
                    `[Media] Cleaned up ${deletedVideosCount} ghost records and updated ${albumUpdatesCount} album thumbnails.`,
                );
            }
        } catch (e) {
            console.error("[Media] Fast sync failed:", e);
        }
    }, [getAlbumThumbnailForVideos, getUnfilteredVideosForAlbum, mapVideoMetadata, recomputePrefixOptions, store]);

    const loadDataFromDB = useCallback(
        async (options?: { deferTaskClear?: boolean }) => {
            try {
                console.log("[Media] Loading initial data from DB...");
                const lastSync = await repoRef.current.getLastSyncTimestamp();

                setLoadingTask({
                    id: TASK_IDS.LIBRARY_LOAD,
                    label: "Loading Library",
                    detail: "Reading cached data from database...",
                    importance: lastSync === 0 ? "SHOW_POPUP" : undefined,
                });

                const savedAlbumSort = await repoRef.current.getSetting("albumSort");
                const savedGlobalVideoSort = await repoRef.current.getSetting("globalVideoSort");
                initializeSort(savedAlbumSort, savedGlobalVideoSort);

                const cachedVisibleAlbums = await repoRef.current.getAlbums();
                const cachedHiddenAlbums = await repoRef.current.getHiddenAlbums();
                const cachedAlbums = [...cachedVisibleAlbums, ...cachedHiddenAlbums];

                if (cachedAlbums.length > 0) {
                    const sortedAlbums = cachedVisibleAlbums
                        .map((a: any) => ({
                            ...a,
                            title: cleanName(a.albumName),
                        }))
                        .sort((a: any, b: any) => compareByAlbumSort(a, b));

                    const hiddenAlbums = cachedHiddenAlbums.map((a: any) => ({
                        ...a,
                        title: cleanName(a.albumName),
                    }));

                    setAlbums(sortedAlbums);

                    // Populate albumsRef with ALL albums (visible and hidden)
                    [...sortedAlbums, ...hiddenAlbums].forEach((a) => {
                        albumsRef.current[a.id] = a;
                    });

                    // Initialize filters so that applyFiltersToVideos can read them
                    initializeFilters();

                    // Fetch ALL videos for every album and store in memory
                    const videosMap: Record<string, VideoData[]> = {};
                    sortedAlbums.forEach((a) => {
                        const mapped = getUnfilteredVideosForAlbum(a.id);

                        // Recompute filters first to validate selection and save to DB
                        recomputePrefixOptions(a.id, mapped);

                        videosMap[a.id] = applyFiltersToVideos(a.id, mapped);
                    });
                    setAllAlbumsVideos(videosMap);
                } else {
                    initializeFilters();
                }
                hasInitializedRef.current = true;
            } catch (e) {
                console.error("[Media] DB Load failed:", e);
            } finally {
                if (!options?.deferTaskClear) {
                    // deferTaskClear: Keep LIBRARY_LOAD visible during the startup handoff from DB read -> smart sync,...
                    // ...so EmptyAlbumState doesn't flash briefly when reopening mid-scan.
                    setLoadingTask((prev) => (prev?.id === TASK_IDS.LIBRARY_LOAD ? null : prev));
                }
            }
        },
        [
            cleanName,
            compareByAlbumSort,
            getUnfilteredVideosForAlbum,
            initializeFilters,
            initializeSort,
            recomputePrefixOptions,
            applyFiltersToVideos,
            setLoadingTask,
        ],
    );

    const performSmartSync = useCallback(
        async (signal?: AbortSignal) => {
            console.log("[Media] Smart Sync called...");
            if (isSyncingRef.current || signal?.aborted) {
                setLoadingTask(null, TASK_IDS.LIBRARY_LOAD);
                return;
            }

            // Guard: Disable sync if no permissions granted
            const permissionState = await checkPermission();
            if (permissionState !== "granted") {
                if (permissionState === "blocked") {
                    setError("Media permission is blocked. Enable video/audio access in system settings.");
                }
                setLoadingTask(null, TASK_IDS.LIBRARY_LOAD);
                return;
            }

            isSyncingRef.current = true;
            setIsSyncing(true);
            try {
                const lastSync = await repoRef.current.getLastSyncTimestamp();
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
                    setLoadingTask((prev) => (prev?.id === TASK_IDS.MEDIA_SYNC ? null : prev));
                    isSyncingRef.current = false;
                    setIsSyncing(false);
                    return;
                }

                console.log("[Media] Library changed. Starting delta scan...");
                // Switch to visible now that we know there are actual changes
                const detailText = lastSync === 0 ? "Scanning library..." : "Processing changes...";
                setLoadingTask({
                    id: TASK_IDS.MEDIA_SYNC,
                    label: syncLabel,
                    detail: detailText,
                    importance: lastSync === 0 ? "SHOW_POPUP" : undefined,
                });
                await syncDatabaseWithStorage();

                const playbackData = await repoRef.current.getAllPlaybackData();
                const playbackMap = new Map(playbackData.map((p: any) => [p.video_id, p.last_played_sec]));

                const pendingAssignments = await repoRef.current.getAllPendingClipAssignments();
                const assignmentMap = new Map(pendingAssignments.map((a) => [a.outputUri, a.sourceUri]));

                // 2. Fetch all albums upfront — needed for title lookup and parallelism
                const fetchedAlbums = await MediaLibrary.getAlbumsAsync();
                const albumTitleMap = new Map<string, string>(fetchedAlbums.map((a) => [a.id, a.title]));

                let totalNewFound = 0;
                let albumsProcessed = 0;
                const totalAlbums = fetchedAlbums.length;

                // 3. Parallel Per-Album Paginated Scan
                //    Albums are independent → Promise.all; pages within each album stay sequential.
                await Promise.all(
                    fetchedAlbums.map(async (a) => {
                        if (signal?.aborted) return;
                        let hasMore = true;
                        let after: string | undefined = undefined;
                        let albumNewFound = 0;

                        // Get existing videos for this album to avoid redundant processing
                        const existingVids = await repoRef.current.getVideos(a.id);
                        const existingMap = new Map(existingVids.map((v) => [v.id, v]));

                        while (hasMore && !signal?.aborted) {
                            const { assets, hasNextPage, endCursor } = await MediaLibrary.getAssetsAsync({
                                album: a.id,
                                mediaType: "video",
                                first: 50,
                                sortBy: [["modificationTime", false]],
                                after,
                            });

                            const newVideos: VideoData[] = [];
                            const newHiddenVideos: VideoData[] = [];
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
                                    existing.size > 0
                                ) {
                                    continue;
                                }

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

                                // Check for pending data by uri FIRST
                                const videoUri = video.uri;
                                const pending = await repoRef.current.getPendingMediaData(videoUri);
                                let isVideoHidden = false;
                                if (pending && pending.type === "video") {
                                    await repoRef.current.addLog(
                                        "INFO",
                                        "Apply Pending Data",
                                        `Applying pending data for ${video.filename}`,
                                        pending.data,
                                    );
                                    if (pending.data.lastPlayedSec !== undefined) {
                                        video.lastPlayedSec = pending.data.lastPlayedSec;
                                    }
                                    if (pending.data.isHidden !== undefined) {
                                        isVideoHidden = pending.data.isHidden;
                                        await repoRef.current.setVideoHidden(video.id, true);
                                    }
                                    if (pending.data.markers !== undefined) {
                                        video.markers = pending.data.markers;
                                    }
                                    if (pending.data.lastOpenedTime !== undefined) {
                                        video.lastOpenedTime = pending.data.lastOpenedTime;
                                    }
                                    if (pending.data.isNewOverride !== undefined) {
                                        video.isNewOverride = pending.data.isNewOverride;
                                    }
                                    await repoRef.current.deletePendingMediaData(videoUri);
                                }

                                // Check for pending clip source assignment
                                if (assignmentMap.has(videoUri)) {
                                    video.clipSourceUri = assignmentMap.get(videoUri);
                                    await repoRef.current.addLog(
                                        "INFO",
                                        "Apply Pending Assignment",
                                        `Applying source ${video.clipSourceUri} to ${video.filename}`,
                                    );
                                    await repoRef.current.deletePendingClipAssignment(videoUri);
                                }

                                // Generate/Fetch thumbnail ONLY if not hidden
                                if (!isVideoHidden) {
                                    const thumbUri = await getThumbnailCached(asset.id);
                                    if (thumbUri) {
                                        video.thumbnail = thumbUri;
                                        video.baseThumbnailUri = thumbUri;
                                    }
                                    newVideos.push(video);
                                    albumNewFound++;
                                } else {
                                    newHiddenVideos.push(video);
                                    // Don't increment albumNewFound for hidden videos so they don't trigger unnecessary UI refreshes
                                    // Also don't generate thumbnail for hidden videos yet, they'll only generate once you enter hidden media album for the first time
                                }
                                albumNewFound++;
                            }

                            if (newVideos.length > 0 || newHiddenVideos.length > 0) {
                                totalNewFound += newVideos.length + newHiddenVideos.length;

                                // Direct persistence without needing to fetch existing videos first
                                const allNewVideos = [...newVideos, ...newHiddenVideos];
                                allNewVideos.forEach((v) => (v.albumId = a.id));
                                await repoRef.current.addVideos(allNewVideos);

                                // Refresh the sorted visible list for this album to update album metadata
                                const sorted = getUnfilteredVideosForAlbum(a.id);

                                const firstVideoUri = sorted[0]?.uri;
                                const albumUri = firstVideoUri ? firstVideoUri.substring(0, firstVideoUri.lastIndexOf("/")) : "";

                                const albumObj: AlbumData = {
                                    id: a.id,
                                    title: cleanName(albumTitleMap.get(a.id)!),
                                    albumName: albumTitleMap.get(a.id)!,
                                    assetCount: sorted.length,
                                    uri: albumUri,
                                    thumbnail: getAlbumThumbnailForVideos(
                                        sorted,
                                        store.getAlbum(a.id)?.videoSort ?? Video.globalSortConfig,
                                    ),
                                    lastModified: Math.max(...sorted.map((v) => v.modificationTime || 0)),
                                    videoSortSettingScope: albumsRef.current[a.id]?.videoSortSettingScope || DEFAULT_SORT_SCOPE,
                                    videoSortType: albumsRef.current[a.id]?.videoSortType,
                                    prefixOptions: albumsRef.current[a.id]?.prefixOptions,
                                    selectedPrefixOptions: albumsRef.current[a.id]?.selectedPrefixOptions,
                                    isHidden: albumsRef.current[a.id]?.isHidden,
                                };

                                // Apply pending album data
                                let isAlbumHidden = false;
                                if (albumUri) {
                                    const pendingAlbum = await repoRef.current.getPendingMediaData(albumUri);
                                    if (pendingAlbum && pendingAlbum.type === "album") {
                                        await repoRef.current.addLog(
                                            "INFO",
                                            "Apply Pending Data",
                                            `Applying pending data for album ${albumObj.title}`,
                                            pendingAlbum.data,
                                        );
                                        if (pendingAlbum.data.videoSortType !== undefined) {
                                            albumObj.videoSortType = pendingAlbum.data.videoSortType;
                                        }
                                        if (pendingAlbum.data.videoSortSettingScope !== undefined) {
                                            albumObj.videoSortSettingScope = pendingAlbum.data.videoSortSettingScope;
                                        }
                                        if (pendingAlbum.data.isHidden !== undefined) {
                                            isAlbumHidden = pendingAlbum.data.isHidden;
                                            await repoRef.current.setAlbumHidden(albumObj.id, isAlbumHidden);
                                        }
                                        await repoRef.current.deletePendingMediaData(albumUri);
                                    }
                                }

                                // Update our ref so we can build the final album list at the end
                                if (!isAlbumHidden) {
                                    albumsRef.current[a.id] = albumObj;
                                }
                            }

                            if (foundStopPoint) break;
                            hasMore = hasNextPage;
                            after = endCursor || undefined;
                        }

                        // Report once per album after all pages are done
                        albumsProcessed++;
                        const syncProgress = totalAlbums > 0 ? albumsProcessed / totalAlbums : undefined;
                        if (albumNewFound > 0) {
                            setLoadingTask({
                                id: TASK_IDS.MEDIA_SYNC,
                                label: syncLabel,
                                detail: `Found ${albumNewFound} new video${albumNewFound !== 1 ? "s" : ""} in ${cleanName(albumTitleMap.get(a.id) || a.title)}.`,
                                importance: "SHOW_POPUP",
                                progress: syncProgress,
                            });
                        } else {
                            setLoadingTask({
                                id: TASK_IDS.MEDIA_SYNC,
                                label: syncLabel,
                                detail: detailText,
                                importance: "SHOW_POPUP",
                                progress: syncProgress,
                            });
                        }
                    }),
                );

                // 4. Final Finalize: Batch update the albums list ONLY once at the end
                //    This keeps the skeleton visible (albums.length === 0) until the entire scan is done.
                const finalAlbums = Object.values(albumsRef.current).sort((x, y) => compareByAlbumSort(x, y));
                await repoRef.current.saveAlbums(finalAlbums);

                // Update rank ref immediately so background workers use the new sort order instantly
                updateAlbumRank(finalAlbums);

                setAlbums(finalAlbums);

                // Refresh all in-memory videos after sync
                const syncedVideosMap: Record<string, VideoData[]> = {};
                finalAlbums.forEach((a) => {
                    const mapped = getUnfilteredVideosForAlbum(a.id);
                    syncedVideosMap[a.id] = applyFiltersToVideos(a.id, mapped);

                    // If this album was updated (or we just want to be sure), recompute prefix options
                    // In a smarter version, we'd only do this if totalNewFound > 0 for this album
                    // but for now, we'll do it if it's new or changed.
                    recomputePrefixOptions(a.id, mapped);
                });
                setAllAlbumsVideos(syncedVideosMap);

                await repoRef.current.setLastSyncTimestamp(newestTimestamp);
                hasInitializedRef.current = true;
                await generateThumbnails(false);
                console.log(`[Media] Delta sync complete. Processed ${totalNewFound} items.`);
            } catch (e) {
                console.error("[Media] Delta sync failed:", e);
                setError("Background sync failed");
            } finally {
                isSyncingRef.current = false;
                setIsSyncing(false);
                await repoRef.current.clearOldPendingClipAssignments();
                if (!hasActiveThumbnailWork()) {
                    setLoadingTask(null, TASK_IDS.MEDIA_SYNC);
                }
                setLoadingTask(null, TASK_IDS.LIBRARY_LOAD);
            }
        },
        [
            checkPermission,
            setLoadingTask,
            syncDatabaseWithStorage,
            updateAlbumRank,
            generateThumbnails,
            mapVideoMetadata,
            getThumbnailCached,
            getUnfilteredVideosForAlbum,
            cleanName,
            getAlbumThumbnailForVideos,
            store,
            compareByAlbumSort,
            applyFiltersToVideos,
            recomputePrefixOptions,
            hasActiveThumbnailWork,
        ],
    );

    const resetEverything = useCallback(async () => {
        if (isResettingDatabaseRef.current || isRegeneratingThumbnailsRef.current || isSyncingRef.current) return;
        isResettingDatabaseRef.current = true;
        setIsResettingDatabase(true);

        try {
            setLoadingTask({
                id: TASK_IDS.LIBRARY_RESET,
                label: "Resetting Library",
                detail: "Waiting for workers to stop...",
                importance: "SHOW_POPUP",
            });

            // Immediately halt background worker and results queue
            cancelThumbnailSession();
            thumbnailQueue.current = [];

            while (hasActiveThumbnailWork()) {
                // If we've cleared both queues, workers will exit after current task
                // and drainResults will exit once resultQueue is empty and activeWorkers is 0.
                await new Promise((r) => setTimeout(r, 100));
            }

            // If a smart sync is currently writing DB rows, wait until it finishes
            // to avoid reset contention/hangs on DELETE statements.
            while (isSyncingRef.current) {
                await new Promise((r) => setTimeout(r, 100));
            }

            setError(null);
            await clearThumbnailCache();
            await repoRef.current.reset();
            setAlbums([]);
            initializeFilters();
            await performSmartSync();
            console.log("[Media] Full database and cache reset complete.");
        } catch {
            setError("Failed to reset database");
        } finally {
            isResettingDatabaseRef.current = false;
            setIsResettingDatabase(false);
            isSyncingRef.current = false;
            setIsSyncing(false);
            setLoadingTask(null, TASK_IDS.LIBRARY_RESET);
        }
    }, [
        cancelThumbnailSession,
        clearThumbnailCache,
        hasActiveThumbnailWork,
        initializeFilters,
        isRegeneratingThumbnailsRef,
        performSmartSync,
        setLoadingTask,
        thumbnailQueue,
    ]);

    const fetchAlbums = useCallback(async () => {
        await performSmartSync();
        await loadDataFromDB();
    }, [loadDataFromDB, performSmartSync]);

    const { performExport, executeReexport } = useMediaExport({
        setLoadingTask,
        fetchAlbums,
        registerSessionClip,
        allAlbumsVideos,
        addPendingClipAssignment,
    });

    const requestPermissionAndFetch = useCallback(
        () => internalRequestPermissionAndFetch(performSmartSync),
        [internalRequestPermissionAndFetch, performSmartSync],
    );

    useEffect(() => {
        const controller = new AbortController();
        const { signal } = controller;

        const initialize = async () => {
            if (!permissionResponse || settingsLoading || hasInitializedRef.current) return;

            try {
                // 1. Load cached data from DB immediately
                await loadDataFromDB({ deferTaskClear: true });

                // 2. Permission Guard for MediaLibrary scans
                if (permissionResponse.status !== "granted") {
                    if (!signal.aborted) {
                        setLoadingTask(null, TASK_IDS.LIBRARY_LOAD);
                    }
                    return;
                }

                hasInitializedRef.current = true;

                // 3. Only perform sync if permission is granted
                if (!signal.aborted) {
                    await performSmartSync(signal);
                }

                // Populate domain store from DB
                await store.loadFromDb();
            } catch (e) {
                if (!signal.aborted) console.error("[Media] Initial load failed:", e);
            } finally {
                if (!signal.aborted) {
                    setLoadingTask(null, TASK_IDS.LIBRARY_LOAD);
                }
            }
        };
        initialize();
        return () => {
            controller.abort();
        };
    }, [loadDataFromDB, performSmartSync, permissionResponse, setLoadingTask, settingsLoading, store]);

    const contextValue = useMemo(
        () => ({
            albums,
            allAlbumsVideos,

            albumSort,
            setAlbumSort,
            updateVideoSort,
            fetchAlbums,
            performSmartSync,
            resetEverything,
            isSyncing,
            isResettingDatabase,
            isRegeneratingThumbnails,
            requestPermissionAndFetch,
            loadDataFromDB,
            allAlbum,
            selectedVideoPrefixFilters,
            updatePrefixFilter,
            clearPrefixFilters,
            permissionResponse,
            setVideoSortSettingScope,
            compareByVideoSort,
            compareByAlbumSort,
            setThumbnailPriorityAlbum,
            sessionClips,
            performExport,
            executeReexport,
            hasNewClips,
            markClipsAsViewed,
        }),
        [
            albums,
            allAlbumsVideos,
            albumSort,
            setAlbumSort,
            updateVideoSort,
            fetchAlbums,
            performSmartSync,
            resetEverything,
            isSyncing,
            isResettingDatabase,
            isRegeneratingThumbnails,
            requestPermissionAndFetch,
            loadDataFromDB,
            allAlbum,
            selectedVideoPrefixFilters,
            updatePrefixFilter,
            clearPrefixFilters,
            permissionResponse,
            setVideoSortSettingScope,
            compareByVideoSort,
            compareByAlbumSort,
            setThumbnailPriorityAlbum,
            sessionClips,
            performExport,
            executeReexport,
            hasNewClips,
            markClipsAsViewed,
        ],
    );

    useEffect(() => {
        const subscription = AppState.addEventListener("change", (nextAppState: AppStateStatus) => {
            // console.log("[Media] App state changed:", nextAppState);
            if (nextAppState === "active") {
                // Guard: never trigger sync from focus if required media permission is not granted.
                void (async () => {
                    const currentPermission = await MediaLibrary.getPermissionsAsync(false, REQUIRED_MEDIA_PERMISSIONS);
                    if (!(currentPermission.granted || currentPermission.status === "granted")) {
                        console.log("[Media] App focused, skipping Smart Sync (permission not granted).");
                        return;
                    }

                    // If we've already done the initial heavy lifting, just do a smart check
                    console.log("[Media] App focused, running Smart Sync...");
                    await performSmartSync();
                })();
            }
        });

        return () => {
            subscription.remove();
        };
    }, [performSmartSync]);

    return (
        <MediaStoreProvider store={store}>
            <MediaContext.Provider value={contextValue}>{children}</MediaContext.Provider>
        </MediaStoreProvider>
    );
};

export const useMedia = () => {
    const context = useContext(MediaContext);
    if (!context) {
        throw new Error("useMedia must be used within a MediaProvider");
    }
    return context;
};
