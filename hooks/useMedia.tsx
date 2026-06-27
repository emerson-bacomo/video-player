import { LoadingTask } from "@/components/LoadingStatus";
import * as FileSystem from "expo-file-system/legacy";
import * as MediaLibrary from "expo-media-library";
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { AppState, AppStateStatus } from "react-native";

import { DEFAULT_SORT_SCOPE } from "@/constants/defaults";
import { normalizeMediaDestination } from "@/utils/mediaDestination";
import { extractEpisode, extractPrefix, extractSeason, getThumbnailUri } from "@/utils/videoUtils";
import {
    addLogDb,
    addPendingClipAssignmentDb,
    addVideosDb,
    clearOldPendingClipAssignmentsDb,
    clearVideoClipSourceUriDb,
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
    getVideoByIdDb,
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
import { ExportLabels, ExportQueueItem, useMediaExport } from "./useMediaExport";

import type { Album, ExportOptions, SessionClip, VideoMedia } from "../types/useMedia";
import { useMediaDelete } from "./useMediaDelete";
import { useMediaHide } from "./useMediaHide";
import { OnBeforeSet, SetLoadingTask, TASK_IDS, useMediaLoadingTask } from "./useMediaLoadingTask";
import { REQUIRED_MEDIA_PERMISSIONS, useMediaPermission } from "./useMediaPermission";
import { useMediaPrefixFilter } from "./useMediaPrefixFilter";
import { useMediaRename } from "./useMediaRename";
import { useMediaSelection } from "./useMediaSelection";
import { AlbumSortBy, AlbumSortConfig, SortBy, SortOrder, useMediaSort, VideoSortConfig } from "./useMediaSort";
import { useMediaThumbnailGeneration } from "./useMediaThumbnailGeneration";
import { useMediaUpdateVideo } from "./useMediaUpdateVideo";

export type { AlbumSortBy, AlbumSortConfig, SortBy, SortOrder, VideoSortConfig };

export interface MediaContextType {
    albums: Album[];
    allAlbums: Album[];
    allAlbumsVideos: Record<string, VideoMedia[]>;
    loadingTask: LoadingTask | null;
    error: string | null;
    albumSort: AlbumSortConfig;
    setAlbumSort: React.Dispatch<React.SetStateAction<AlbumSortConfig>>;
    getActiveVideoSort: (album: Album | null) => VideoSortConfig;
    updateVideoSort: (
        albumId: string,
        s: React.SetStateAction<VideoSortConfig>,
        targetVideoSortSettingScope: "local" | "global",
    ) => void;
    fetchAlbums: () => Promise<void>;
    performSmartSync: (signal?: AbortSignal) => Promise<void>;
    updateVideoProgress: (videoId: string, sec: number) => void;
    updateVideoMarkers: (videoId: string, markers: { time: number; markerId: string }[] | null) => void;
    clearThumbnailCache: () => Promise<void>;
    regenerateAllThumbnails: () => Promise<void>;
    regenerateVideoThumbnails: (videos: VideoMedia[]) => Promise<void>;
    syncDatabaseWithStorage: () => Promise<void>;
    updateVideoLastOpenedTime: (videoId: string) => void;
    resetToAlbums: () => void;
    resetEverything: () => Promise<void>;
    isSyncing: boolean;
    isResettingDatabase: boolean;
    isRegeneratingThumbnails: boolean;
    requestPermissionAndFetch: () => Promise<string | null>;
    loadDataFromDB: () => Promise<void>;

    allAlbum: Record<string, Album>;
    selectedVideoPrefixFilters: Record<string, string[]>;
    updatePrefixFilter: (albumId: string, rawPrefix: string, isSelected: boolean) => void;
    clearPrefixFilters: (albumId: string) => void;
    isLoadingPopupVisible: boolean;
    setLoadingPopupVisible: (visible: boolean | ((prev: boolean) => boolean)) => void;
    isLoadingExpanded: boolean;
    setLoadingExpanded: (expanded: boolean | ((prev: boolean) => boolean)) => void;
    setLoadingTask: SetLoadingTask;
    setOnBeforeSet: (fn: OnBeforeSet | null) => void;
    renameVideo: (videoId: string, newName: string) => void;
    renameAlbum: (albumId: string, newName: string) => void;
    updateMultipleVideoProgress: (videoIds: string[], sec: number) => void;
    isSelectionMode: boolean;
    selectedIds: Set<string>;
    toggleSelection: (id: string) => void;
    clearSelection: () => void;
    hideSelectionBar: () => void;
    resumeSelectionIfNeeded: () => void;
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
    getUnfilteredVideosForAlbum: (albumId: string) => VideoMedia[];
    getVideoById: (videoId: string) => VideoMedia | null;
    deleteMultipleVideos: (videoIds: string[]) => Promise<boolean>;
    deleteMultipleAlbums: (albumIds: string[]) => Promise<boolean>;
    deleteMultipleImages: (imageIds: string[]) => Promise<boolean>;

    permissionResponse: MediaLibrary.PermissionResponse | null;
    setVideoSortSettingScope: (albumId: string, scope: "global" | "local") => void;
    compareByVideoSort: (a: VideoMedia, b: VideoMedia, vSort?: { by: SortBy; order: SortOrder }) => number;
    compareByAlbumSort: (a: Album, b: Album, aSort?: { by: AlbumSortBy; order: SortOrder }) => number;
    setThumbnailPriorityAlbum: (albumId: string | null) => void;
    recentlyPlayedCount: number;
    recentlyPlayedVideos: VideoMedia[];
    sessionClips: Record<string, SessionClip>;
    registerSessionClip: (
        video: VideoMedia,
        segments: { start: number; end: number }[],
        options: ExportOptions,
        clipSourceUri: string,
    ) => void;
    clearVideoClipSourceUri: (videoId: string) => void;
    addPendingClipAssignment: (outputUri: string, sourceUri: string) => void;
    performExport: (
        inputUri: string,
        segments: { start: number; end: number }[],
        options: ExportOptions,
        labels: ExportLabels,
        onSuccess?: (outPathStr: string) => void,
    ) => Promise<void>;
    executeReexport: (clip: SessionClip, options: ExportOptions) => Promise<void>;
    exportQueue: ExportQueueItem[];
    hasNewClips: boolean;
    markClipsAsViewed: () => void;
    screenshots: { id: string; uri: string; filename: string }[];
    screenshotsCount: number;
    fetchScreenshots: () => Promise<void>;
}

const MediaContext = createContext<MediaContextType | null>(null);

export const MediaProvider = ({ children }: { children: React.ReactNode }) => {
    const [albums, setAlbums] = useState<Album[]>([]);
    const { loading: settingsLoading, settingsRef } = useSettings();

    const [screenshots, setScreenshots] = useState<{ id: string; uri: string; filename: string }[]>([]);
    const screenshotsCount = screenshots.length;

    const fetchScreenshots = useCallback(async () => {
        try {
            const dest = settingsRef.current.screenshotDestination;
            if (!dest) {
                setScreenshots([]);
                return;
            }
            const destDir = normalizeMediaDestination(dest);
            if (!destDir) {
                setScreenshots([]);
                return;
            }
            const info = await FileSystem.getInfoAsync(`file://${destDir}`);
            if (!info.exists || !(info as any).isDirectory) {
                setScreenshots([]);
                return;
            }
            const files = await FileSystem.readDirectoryAsync(`file://${destDir}`);
            const screenshotFiles = files
                .filter((f) => /\.(jpg|jpeg|png)$/i.test(f))
                .sort((a, b) => b.localeCompare(a)) // Newest first based on timestamp naming
                .map((f) => ({
                    id: f,
                    uri: `file://${destDir}/${f}`,
                    filename: f,
                }));
            setScreenshots(screenshotFiles);
        } catch (err) {
            console.warn("[MediaProvider] Failed to fetch screenshots", err);
            setScreenshots([]);
        }
    }, [settingsRef]);

    const {
        loadingTask,
        setLoadingTask,
        setOnBeforeSet,
        isLoadingPopupVisible,
        setLoadingPopupVisible,
        isLoadingExpanded,
        setLoadingExpanded,
    } = useMediaLoadingTask({
        label: "Initializing",
        detail: "Loading media library...",
    });

    const [error, setError] = useState<string | null>(null);
    const handleSetError = useCallback((err: string | null) => setError(err), []);

    const {
        permissionResponse,
        requestPermissionAndFetch: internalRequestPermissionAndFetch,
        checkPermission,
    } = useMediaPermission(handleSetError);

    // Refs declared before useMediaSort so they can be passed in
    const albumsRef = React.useRef<Record<string, Album>>({}); // Dictionary for O(1) lookup
    const [allAlbumsVideos, setAllAlbumsVideos] = useState<Record<string, VideoMedia[]>>({}); // All videos per album, sorted
    const [sessionClips, setSessionClips] = useState<Record<string, SessionClip>>({});
    const [hasNewClips, setHasNewClips] = useState(false);

    const markClipsAsViewed = useCallback(() => {
        setHasNewClips(false);
    }, []);

    const cleanName = React.useCallback(
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
        getUnfilteredVideosForAlbum,
    } = useMediaSort(setAlbums, setAllAlbumsVideos, albumsRef, mapVideoMetadata);

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
        regenerateAllThumbnails,
        regenerateVideoThumbnails,
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
        globalVideoSortRef,
        albumSortRef,
        compareByVideoSort,
        getActiveVideoSort,
        setLoadingTask,
        mapVideoMetadata,
    });

    const {
        isSelectionMode,
        selectedIds,
        toggleSelection,
        clearSelection,
        hideSelectionBar,
        resumeSelectionIfNeeded,
        selectAll,
        togglePrefixSelection,
        selectPrefixesOfSelected,
        resetToAlbums,
    } = useMediaSelection();

    const { renameVideo, renameAlbum } = useMediaRename(setAlbums, compareByAlbumSort, albumsRef, setAllAlbumsVideos);

    const {
        hideVideo,
        hideAlbum,
        hideMultipleVideos,
        hideMultipleAlbums,
        unhideVideo,
        unhideAlbum,
        unhideMultipleVideos,
        unhideMultipleAlbums,
        fetchHiddenMedia,
    } = useMediaHide(setAlbums, () => fetchAlbums(), clearSelection, albumsRef, setAllAlbumsVideos);

    const { updateVideoLastOpenedTime, updateMultipleVideoProgress, updateVideoProgress, updateVideoMarkers } =
        useMediaUpdateVideo(setAllAlbumsVideos);

    useEffect(() => {
        updateAlbumRank(albums);
    }, [albums, updateAlbumRank]);

    const hasInitializedRef = React.useRef(false);

    const allAlbum = useMemo(() => {
        const dict: Record<string, Album> = {};
        albums.forEach((a) => (dict[a.id] = a));
        return dict;
    }, [albums]);

    const recentlyPlayedVideos = useMemo(() => {
        const allVids = Object.values(allAlbumsVideos).flat();
        const selectedPrefixes = selectedVideoPrefixFilters["recently-played"] || [];

        let filtered = allVids.filter((v) => (v.lastOpenedTime || 0) > 0);

        if (selectedPrefixes.length > 0) {
            filtered = filtered.filter((v) => v.prefix && selectedPrefixes.includes(v.prefix));
        }

        return filtered.sort((a, b) => (b.lastOpenedTime || 0) - (a.lastOpenedTime || 0));
    }, [allAlbumsVideos, selectedVideoPrefixFilters]);

    const recentlyPlayedCount = recentlyPlayedVideos.length;

    const registerSessionClip = useCallback(
        (video: VideoMedia, segments: { start: number; end: number }[], options: ExportOptions, clipSourceUri: string) => {
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

    const clearVideoClipSourceUri = useCallback((videoId: string) => {
        setAllAlbumsVideos((prev) => {
            const next = { ...prev };
            for (const albumId in next) {
                const idx = next[albumId].findIndex((v) => v.id === videoId);
                if (idx !== -1) {
                    next[albumId] = [...next[albumId]];
                    next[albumId][idx] = { ...next[albumId][idx], clipSourceUri: undefined };
                    break;
                }
            }
            return next;
        });
        clearVideoClipSourceUriDb(videoId);
    }, []);

    const addPendingClipAssignment = useCallback((outputUri: string, sourceUri: string) => {
        addPendingClipAssignmentDb(outputUri, sourceUri);
    }, []);

    const syncDatabaseWithStorage = useCallback(async () => {
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
                    deleteMultipleVideosDb([video.id]);

                    // Clean up floating player video if it was deleted
                    try {
                        const raw = getSettingDb("floatingPlayerVideo");
                        if (raw) {
                            const lastPlayed = JSON.parse(raw);
                            if (lastPlayed?.id === video.id) {
                                saveSettingDb("floatingPlayerVideo", "");
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
                        const albumVids = getVideosForAlbumDb(albumId);
                        if (albumVids.length === 0) {
                            delete next[albumId];
                        } else {
                            next[albumId] = albumVids
                                .map(mapVideoMetadata)
                                .sort((a, b) => compareByVideoSort(a, b, getActiveVideoSort(albumsRef.current[albumId] || null)));
                        }
                    }
                    return next;
                });
            }

            // 3. Global Cleanup of Empty Albums and Update Metadata
            // Refactored to handle async FileSystem checks for thumbnail validity
            const currentAlbums = await new Promise<Album[]>((resolve) => {
                setAlbums((prev) => {
                    resolve(prev);
                    return prev;
                });
            });

            const nextAlbums: Album[] = [];
            let changed = false;
            let albumUpdatesCount = 0;

            for (const album of currentAlbums) {
                const albumVids = getVideosForAlbumDb(album.id);
                if (albumVids.length === 0) {
                    console.log(`[Media] Cleaning up empty album: ${album.title}`);
                    deleteMultipleAlbumsDb([album.id]);
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
                    const newThumb = getAlbumThumbnailForVideos(albumVids.map(mapVideoMetadata), getActiveVideoSort(album));
                    if (newThumb !== album.thumbnail) {
                        updateAlbumThumbnailDb(album.id, newThumb || "");
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
    }, [compareByVideoSort, getActiveVideoSort, getAlbumThumbnailForVideos, mapVideoMetadata, recomputePrefixOptions]);

    const loadDataFromDB = useCallback(
        async (options?: { deferTaskClear?: boolean }) => {
            try {
                console.log("[Media] Loading initial data from DB...");
                const lastSync = getLastSyncTimestampDb();

                setLoadingTask({
                    id: TASK_IDS.LIBRARY_LOAD,
                    label: "Loading Library",
                    detail: "Reading cached data from database...",
                    importance: lastSync === 0 ? "SHOW_POPUP" : undefined,
                });

                const savedAlbumSort = getSettingDb("albumSort");
                const savedGlobalVideoSort = getSettingDb("globalVideoSort");
                initializeSort(savedAlbumSort, savedGlobalVideoSort);

                const cachedVisibleAlbums = getAlbumsDb();
                const cachedHiddenAlbums = getHiddenAlbumsDb();
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
            compareByVideoSort,
            getActiveVideoSort,
            initializeFilters,
            initializeSort,
            mapVideoMetadata,
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

                const playbackData = getAllPlaybackDataDb();
                const playbackMap = new Map(playbackData.map((p: any) => [p.video_id, p.last_played_sec]));

                const pendingAssignments = getAllPendingClipAssignmentsDb();
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
                            const newHiddenVideos: VideoMedia[] = [];
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
                                const pending = getPendingMediaDataDb(videoUri);
                                let isVideoHidden = false;
                                if (pending && pending.type === "video") {
                                    addLogDb(
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
                                        setVideoHiddenDb(video.id, true);
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
                                    deletePendingMediaDataDb(videoUri);
                                }

                                // Check for pending clip source assignment
                                if (assignmentMap.has(videoUri)) {
                                    video.clipSourceUri = assignmentMap.get(videoUri);
                                    addLogDb(
                                        "INFO",
                                        "Apply Pending Assignment",
                                        `Applying source ${video.clipSourceUri} to ${video.filename}`,
                                    );
                                    deletePendingClipAssignmentDb(videoUri);
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
                                addVideosDb(allNewVideos);

                                // Refresh the sorted visible list for this album to update album metadata
                                const sorted = getVideosForAlbumDb(a.id)
                                    .map(mapVideoMetadata)
                                    .sort((x, y) =>
                                        compareByVideoSort(x, y, getActiveVideoSort(albumsRef.current[a.id] || null)),
                                    );

                                const firstVideoUri = sorted[0]?.uri;
                                const albumUri = firstVideoUri ? firstVideoUri.substring(0, firstVideoUri.lastIndexOf("/")) : "";

                                const albumObj: Album = {
                                    id: a.id,
                                    title: cleanName(albumTitleMap.get(a.id)!),
                                    albumName: albumTitleMap.get(a.id)!,
                                    assetCount: sorted.length,
                                    uri: albumUri,
                                    thumbnail: getAlbumThumbnailForVideos(sorted, getActiveVideoSort(albumsRef.current[a.id])),
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
                                    const pendingAlbum = getPendingMediaDataDb(albumUri);
                                    if (pendingAlbum && pendingAlbum.type === "album") {
                                        addLogDb(
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
                                            setAlbumHiddenDb(albumObj.id, isAlbumHidden);
                                        }
                                        deletePendingMediaDataDb(albumUri);
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
                saveAlbumsDb(finalAlbums);

                // Update rank ref immediately so background workers use the new sort order instantly
                updateAlbumRank(finalAlbums);

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

                setLastSyncTimestampDb(newestTimestamp);
                hasInitializedRef.current = true;
                await generateThumbnails(false);
                console.log(`[Media] Delta sync complete. Processed ${totalNewFound} items.`);
            } catch (e) {
                console.error("[Media] Delta sync failed:", e);
                setError("Background sync failed");
            } finally {
                isSyncingRef.current = false;
                setIsSyncing(false);
                clearOldPendingClipAssignmentsDb();
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
            cleanName,
            getAlbumThumbnailForVideos,
            getActiveVideoSort,
            compareByVideoSort,
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
            resetDatabaseDb();
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

    const { deleteMultipleVideos, deleteMultipleAlbums, deleteMultipleImages } = useMediaDelete(performSmartSync);

    const getVideoById = useCallback(
        (videoId: string) => {
            const v = getVideoByIdDb(videoId);
            return v ? mapVideoMetadata(v) : null;
        },
        [mapVideoMetadata],
    );

    const fetchAlbums = useCallback(async () => {
        await performSmartSync();
        await loadDataFromDB();
    }, [loadDataFromDB, performSmartSync]);

    const { exportQueue, performExport, executeReexport } = useMediaExport({
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
                await fetchScreenshots();
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
    }, [fetchScreenshots, loadDataFromDB, performSmartSync, permissionResponse, setLoadingTask, settingsLoading]);

    const contextValue = useMemo(
        () => ({
            albums,
            allAlbums: albums,
            allAlbumsVideos,
            loadingTask,
            setLoadingTask,
            setOnBeforeSet,

            error,
            albumSort,
            setAlbumSort,
            getActiveVideoSort,
            updateVideoSort,
            fetchAlbums,
            performSmartSync,
            clearThumbnailCache,
            regenerateAllThumbnails,
            regenerateVideoThumbnails,
            syncDatabaseWithStorage,
            updateVideoProgress,
            updateVideoMarkers,
            updateVideoLastOpenedTime,
            resetToAlbums,
            resetEverything,
            isSyncing,
            isResettingDatabase,
            isRegeneratingThumbnails,
            requestPermissionAndFetch,
            loadDataFromDB,
            isLoadingPopupVisible,
            setLoadingPopupVisible,
            isLoadingExpanded,
            setLoadingExpanded,
            searchMedia,
            renameVideo,
            renameAlbum,
            updateMultipleVideoProgress,
            isSelectionMode,
            selectedIds,
            toggleSelection,
            clearSelection,
            hideSelectionBar,
            resumeSelectionIfNeeded,
            selectAll,
            togglePrefixSelection,
            selectPrefixesOfSelected,
            hideVideo,
            hideAlbum,
            hideMultipleVideos,
            hideMultipleAlbums,
            deleteMultipleVideos,
            deleteMultipleAlbums,
            deleteMultipleImages,
            unhideVideo,
            unhideAlbum,
            unhideMultipleVideos,
            unhideMultipleAlbums,
            fetchHiddenMedia,
            getUnfilteredVideosForAlbum,
            getVideoById,
            allAlbum,
            selectedVideoPrefixFilters,
            updatePrefixFilter,
            clearPrefixFilters,
            permissionResponse,
            setVideoSortSettingScope,
            compareByVideoSort,
            compareByAlbumSort,
            setThumbnailPriorityAlbum,
            recentlyPlayedCount,
            recentlyPlayedVideos,
            sessionClips,
            registerSessionClip,
            clearVideoClipSourceUri,
            addPendingClipAssignment,
            performExport,
            executeReexport,
            exportQueue,
            hasNewClips,
            markClipsAsViewed,
            screenshots,
            screenshotsCount,
            fetchScreenshots,
        }),
        [
            albums,
            allAlbumsVideos,
            loadingTask,
            setLoadingTask,
            setOnBeforeSet,
            error,
            albumSort,
            setAlbumSort,
            getActiveVideoSort,
            updateVideoSort,
            fetchAlbums,
            performSmartSync,
            clearThumbnailCache,
            regenerateAllThumbnails,
            regenerateVideoThumbnails,
            syncDatabaseWithStorage,
            updateVideoProgress,
            updateVideoMarkers,
            updateVideoLastOpenedTime,
            resetToAlbums,
            resetEverything,
            isSyncing,
            isResettingDatabase,
            isRegeneratingThumbnails,
            requestPermissionAndFetch,
            loadDataFromDB,
            isLoadingPopupVisible,
            setLoadingPopupVisible,
            isLoadingExpanded,
            setLoadingExpanded,
            searchMedia,
            renameVideo,
            renameAlbum,
            updateMultipleVideoProgress,
            isSelectionMode,
            selectedIds,
            toggleSelection,
            clearSelection,
            hideSelectionBar,
            resumeSelectionIfNeeded,
            selectAll,
            togglePrefixSelection,
            selectPrefixesOfSelected,
            hideVideo,
            hideAlbum,
            hideMultipleVideos,
            hideMultipleAlbums,
            deleteMultipleVideos,
            deleteMultipleAlbums,
            deleteMultipleImages,
            unhideVideo,
            unhideAlbum,
            unhideMultipleVideos,
            unhideMultipleAlbums,
            fetchHiddenMedia,
            getUnfilteredVideosForAlbum,
            getVideoById,
            allAlbum,
            selectedVideoPrefixFilters,
            updatePrefixFilter,
            clearPrefixFilters,
            permissionResponse,
            setVideoSortSettingScope,
            compareByVideoSort,
            compareByAlbumSort,
            setThumbnailPriorityAlbum,
            recentlyPlayedCount,
            recentlyPlayedVideos,
            sessionClips,
            registerSessionClip,
            clearVideoClipSourceUri,
            addPendingClipAssignment,
            performExport,
            executeReexport,
            exportQueue,
            hasNewClips,
            markClipsAsViewed,
            screenshots,
            screenshotsCount,
            fetchScreenshots,
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

    return <MediaContext.Provider value={contextValue}>{children}</MediaContext.Provider>;
};

export const useMedia = () => {
    const context = useContext(MediaContext);
    if (!context) {
        throw new Error("useMedia must be used within a MediaProvider");
    }
    return context;
};
