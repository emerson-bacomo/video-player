import type { Album, VideoMedia } from "@/types/useMedia";
import { DEFAULT_SORT_SCOPE } from "@/constants/defaults";
import {
    getVideosForAlbumDb,
    saveSettingDb,
    updateAlbumVideoSortScopeDb,
    updateAlbumVideoSortTypeDb,
    updateAlbumThumbnailDb,
} from "@/utils/db";
import React, { useCallback, useRef, useState } from "react";

export type SortBy = "name" | "date" | "duration" | "episode";
export type AlbumSortBy = "name" | "date" | "count";
export type SortOrder = "asc" | "desc";

export interface VideoSortConfig {
    by: SortBy;
    order: SortOrder;
}

export interface AlbumSortConfig {
    by: AlbumSortBy;
    order: SortOrder;
}

export const useMediaSort = (
    setAlbums: React.Dispatch<React.SetStateAction<Album[]>>,
    setAllAlbumsVideos: React.Dispatch<React.SetStateAction<Record<string, VideoMedia[]>>>,
    albumsRef: React.RefObject<Record<string, Album>>,
    mapVideoMetadata: (v: any) => VideoMedia,
) => {
    const [albumSort, setAlbumSortState] = useState<AlbumSortConfig>({ by: "date", order: "desc" });
    const [globalVideoSort, setGlobalVideoSort] = useState<VideoSortConfig>({ by: "episode", order: "asc" });

    const albumSortRef = useRef<AlbumSortConfig>(albumSort);
    const globalVideoSortRef = useRef<VideoSortConfig>(globalVideoSort);

    const getAlbumThumbnail = useCallback((videos: VideoMedia[]) => {
        return videos[0]?.thumbnail;
    }, []);

    // Re-sort albums immediately when sort order changes
    React.useEffect(() => {
        saveSettingDb("albumSort", JSON.stringify(albumSort));
    }, [albumSort]);

    const getActiveVideoSort = useCallback(
        (album: Album | null) => {
            if (album?.videoSortSettingScope === "local" && album.videoSortType) {
                try {
                    return JSON.parse(album.videoSortType) as VideoSortConfig;
                } catch (e) {
                    console.warn("[MediaSort] Failed to parse local sort for album", album.id, e);
                }
            }
            return globalVideoSort;
        },
        [globalVideoSort],
    );

    const initializeSort = useCallback((savedAlbumSort: string | null, savedGlobalVideoSort: string | null) => {
        if (savedAlbumSort) {
            const parsed = JSON.parse(savedAlbumSort);
            setAlbumSortState(parsed);
            albumSortRef.current = parsed;
        }
        if (savedGlobalVideoSort) {
            const parsed = JSON.parse(savedGlobalVideoSort);
            setGlobalVideoSort(parsed);
            globalVideoSortRef.current = parsed;
        }
    }, []);

    const compareByVideoSort = useCallback((a: VideoMedia, b: VideoMedia, vSort = globalVideoSortRef.current) => {
        let comp = 0;
        if (vSort.by === "episode") {
            const prefixA = a.prefix ?? "";
            const prefixB = b.prefix ?? "";
            const prefixComp = prefixA.localeCompare(prefixB);
            if (prefixComp !== 0) {
                comp = prefixComp;
            } else {
                // Sort season first (no season → treat as season 0 so untagged files group first)
                const seasonA = (a.season ?? -1) < 0 ? 0 : (a.season ?? 0);
                const seasonB = (b.season ?? -1) < 0 ? 0 : (b.season ?? 0);
                const seasonComp = seasonA - seasonB;
                if (seasonComp !== 0) {
                    comp = seasonComp;
                } else {
                    comp = (a.episode ?? 0) - (b.episode ?? 0);
                }
            }
        } else if (vSort.by === "name") {
            comp = a.title.localeCompare(b.title);
        } else if (vSort.by === "date") {
            comp = (a.modificationTime || 0) - (b.modificationTime || 0);
        } else if (vSort.by === "duration") {
            comp = (a.duration || 0) - (b.duration || 0);
        }
        return vSort.order === "asc" ? comp : -comp;
    }, []);

    const compareByAlbumSort = useCallback((a: Album, b: Album, aSort = albumSortRef.current) => {
        let comp = 0;
        if (aSort.by === "date") {
            comp = (a.lastModified || 0) - (b.lastModified || 0);
        } else if (aSort.by === "name") {
            comp = a.title.localeCompare(b.title);
        } else if (aSort.by === "count") {
            comp = (a.assetCount || 0) - (b.assetCount || 0);
        }
        return aSort.order === "asc" ? comp : -comp;
    }, []);

    const updateVideoSort = useCallback(
        (targetAlbumId: string, s: React.SetStateAction<VideoSortConfig>, targetVideoSortSettingScope: "local" | "global") => {
            if (targetVideoSortSettingScope === "global") {
                const prev = globalVideoSortRef.current;
                const next = typeof s === "function" ? s(prev) : s;
                if (prev.by === next.by && prev.order === next.order) return;

                globalVideoSortRef.current = next;
                saveSettingDb("globalVideoSort", JSON.stringify(next));
                setGlobalVideoSort(next);

                // Re-sort all albums that use global sort
                setAllAlbumsVideos((prevVideos) => {
                    const updated: Record<string, VideoMedia[]> = {};
                    const albumThumbUpdates: Record<string, string> = {};

                    Object.entries(prevVideos).forEach(([albumId, videos]) => {
                        const album = albumsRef.current[albumId];
                        if (album?.videoSortSettingScope === "local" && album.videoSortType) {
                            updated[albumId] = videos; // local sort unchanged
                        } else {
                            const nextVideos = [...videos].sort((x, y) => compareByVideoSort(x, y, next));
                            updated[albumId] = nextVideos;

                            const newThumb = getAlbumThumbnail(nextVideos);
                            if (album && album.thumbnail !== newThumb) {
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
                // Compute next sort eagerly from the ref so we can use it in both setters
                const current = albumsRef.current[targetAlbumId];
                if (!current) return;

                const prevSort: VideoSortConfig = current.videoSortType
                    ? JSON.parse(current.videoSortType)
                    : globalVideoSortRef.current;
                const nextSort = typeof s === "function" ? s(prevSort) : s;

                if (prevSort.by === nextSort.by && prevSort.order === nextSort.order && current.videoSortSettingScope === "local")
                    return;

                const nextSortStr = JSON.stringify(nextSort);
                const updatedAlbum: Album = { ...current, videoSortType: nextSortStr, videoSortSettingScope: "local" };

                updateAlbumVideoSortTypeDb(current.id, nextSortStr);
                updateAlbumVideoSortScopeDb(current.id, "local");
                albumsRef.current[targetAlbumId] = updatedAlbum;

                setAlbums((prevAlbums) => prevAlbums.map((a) => (a.id === targetAlbumId ? updatedAlbum : a)));

                // Re-sort only this album's videos
                setAllAlbumsVideos((prev) => {
                    if (!prev[targetAlbumId]) return prev;
                    const nextVideos = [...prev[targetAlbumId]].sort((x, y) => compareByVideoSort(x, y, nextSort));

                    const newThumb = getAlbumThumbnail(nextVideos);
                    if (updatedAlbum.thumbnail !== newThumb) {
                        updatedAlbum.thumbnail = newThumb;
                        updateAlbumThumbnailDb(targetAlbumId, newThumb || "");
                        // updatedAlbum is already in albumsRef.current[targetAlbumId] and setAlbums was called above with the old thumbnail,
                        // so we call setAlbums again or we could have done it once.
                        // To be clean, let's ensure setAlbums uses the final updatedAlbum.
                        setAlbums((prevAlbums) => prevAlbums.map((a) => (a.id === targetAlbumId ? updatedAlbum : a)));
                    }

                    return {
                        ...prev,
                        [targetAlbumId]: nextVideos,
                    };
                });
            }
        },
        [setAlbums, setAllAlbumsVideos, albumsRef, compareByVideoSort],
    );

    const setAlbumSort = useCallback(
        (s: React.SetStateAction<AlbumSortConfig>) => {
            const prev = albumSortRef.current;
            const next = typeof s === "function" ? s(prev) : s;
            if (prev.by === next.by && prev.order === next.order) return;

            albumSortRef.current = next;
            saveSettingDb("albumSort", JSON.stringify(next));
            setAlbumSortState(next);
            setAlbums((prevAlbums) => [...prevAlbums].sort((a, b) => compareByAlbumSort(a, b, next)));
        },
        [setAlbums, compareByAlbumSort],
    );

    const setVideoSortSettingScope = useCallback(
        (albumId: string, scope: "local" | "global") => {
            const current = albumsRef.current[albumId];
            if (!current) return;

            const currentScope = current.videoSortSettingScope || DEFAULT_SORT_SCOPE;
            if (currentScope === scope) return;

            console.log(`[MediaSort] Switching scope for album ${current.id} from ${currentScope} to ${scope}`);

            let nextSortType = current.videoSortType;
            if (scope === "local" && !nextSortType) {
                nextSortType = JSON.stringify(globalVideoSortRef.current);
            }

            const updatedAlbum: Album = { ...current, videoSortSettingScope: scope, videoSortType: nextSortType };

            updateAlbumVideoSortScopeDb(current.id, scope);
            if (scope === "local" && nextSortType) {
                updateAlbumVideoSortTypeDb(current.id, nextSortType);
            }

            albumsRef.current[albumId] = updatedAlbum;
            setAlbums((prevAlbums) => prevAlbums.map((a) => (a.id === albumId ? updatedAlbum : a)));

            // Re-sort this album's videos with the newly active sort
            const activeSort = scope === "local" && nextSortType ? JSON.parse(nextSortType) : globalVideoSortRef.current;
            setAllAlbumsVideos((prev) => {
                if (!prev[albumId]) return prev;
                const nextVideos = [...prev[albumId]].sort((x, y) => compareByVideoSort(x, y, activeSort));

                const newThumb = getAlbumThumbnail(nextVideos);
                if (updatedAlbum.thumbnail !== newThumb) {
                    updatedAlbum.thumbnail = newThumb;
                    updateAlbumThumbnailDb(albumId, newThumb || "");
                    setAlbums((prevAlbums) => prevAlbums.map((a) => (a.id === albumId ? updatedAlbum : a)));
                }

                return {
                    ...prev,
                    [albumId]: nextVideos,
                };
            });
        },
        [setAlbums, setAllAlbumsVideos, albumsRef, compareByVideoSort],
    );

    const getUnfilteredVideosForAlbum = useCallback(
        (albumId: string) => {
            const album = albumsRef.current[albumId];
            const activeSort = getActiveVideoSort(album || null);
            const videos = getVideosForAlbumDb(albumId);
            return videos.map(mapVideoMetadata).sort((a, b) => compareByVideoSort(a, b, activeSort));
        },
        [getActiveVideoSort, mapVideoMetadata, compareByVideoSort, albumsRef],
    );

    return {
        albumSort,
        globalVideoSort,
        getActiveVideoSort,
        albumSortRef,
        globalVideoSortRef,
        updateVideoSort,
        setAlbumSort,
        setVideoSortSettingScope,
        initializeSort,
        compareByVideoSort,
        compareByAlbumSort,
        getUnfilteredVideosForAlbum,
    };
};
