import type { Album, VideoMedia } from "@/types/useMedia";
import {
    getAlbumPrefixOptionsDb,
    getAlbumSelectedPrefixOptionsDb,
    updateAlbumPrefixOptionsDb,
    updateAlbumSelectedPrefixOptionsDb,
    updateAlbumThumbnailDb,
} from "@/utils/db";
import { getThumbnailUri } from "@/utils/videoUtils";
import React, { useCallback, useRef, useState } from "react";

export const useMediaPrefixFilter = (
    setAlbums: React.Dispatch<React.SetStateAction<Album[]>>,
    setAllAlbumsVideos: React.Dispatch<React.SetStateAction<Record<string, VideoMedia[]>>>,
    albumsRef: React.RefObject<Record<string, Album>>,
    getVideosForAlbum: (albumId: string) => VideoMedia[],
) => {
    const [selectedVideoPrefixFilters, setSelectedVideoPrefixFiltersState] = useState<Record<string, string[]>>({});
    const selectedVideoPrefixFiltersRef = useRef<Record<string, string[]>>({});

    const initializeFilters = useCallback(() => {
        const initial: Record<string, string[]> = {};
        Object.keys(albumsRef.current).forEach((albumId) => {
            const selected = getAlbumSelectedPrefixOptionsDb(albumId);
            if (selected) {
                try {
                    initial[albumId] = JSON.parse(selected);
                } catch (e) {
                    console.error("[MediaPrefixFilter] Failed to parse selectedPrefixOptions for album", albumId, e);
                }
            }
        });
        setSelectedVideoPrefixFiltersState(initial);
        selectedVideoPrefixFiltersRef.current = initial;
    }, [albumsRef]);

    const applyFiltersToVideos = useCallback((albumId: string, allVideos: VideoMedia[]) => {
        const selectedPrefixes = selectedVideoPrefixFiltersRef.current[albumId] || [];
        if (selectedPrefixes.length === 0) return allVideos;
        return allVideos.filter((v) => v.rawPrefix && selectedPrefixes.includes(v.rawPrefix));
    }, []);

    const updatePrefixFilter = useCallback(
        (albumId: string, rawPrefix: string, isSelected: boolean) => {
            const currentFilters = selectedVideoPrefixFiltersRef.current[albumId] || [];
            let nextFilters: string[];

            if (isSelected) {
                if (currentFilters.includes(rawPrefix)) return;
                nextFilters = [...currentFilters, rawPrefix];
            } else {
                nextFilters = currentFilters.filter((p) => p !== rawPrefix);
            }

            const nextState = { ...selectedVideoPrefixFiltersRef.current, [albumId]: nextFilters };
            selectedVideoPrefixFiltersRef.current = nextState;
            setSelectedVideoPrefixFiltersState(nextState);

            const nextFiltersStr = JSON.stringify(nextFilters);
            updateAlbumSelectedPrefixOptionsDb(albumId, nextFiltersStr);

            // Update videos in memory
            const unfilteredVideos = getVideosForAlbum(albumId);
            const filteredVideos = applyFiltersToVideos(albumId, unfilteredVideos);

            setAllAlbumsVideos((prev) => ({
                ...prev,
                [albumId]: filteredVideos,
            }));

            // Update album thumbnail based on the first filtered video
            const firstVid = filteredVideos[0];
            const dynamicThumbnail =
                firstVid?.thumbnail || firstVid?.baseThumbnailUri || (firstVid ? getThumbnailUri(firstVid.id) : undefined);

            const album = albumsRef.current[albumId];
            if (album && dynamicThumbnail !== album.thumbnail) {
                const updatedAlbum = {
                    ...album,
                    thumbnail: dynamicThumbnail,
                };
                albumsRef.current[albumId] = updatedAlbum;
                if (dynamicThumbnail && dynamicThumbnail !== album.thumbnail) {
                    updateAlbumThumbnailDb(albumId, dynamicThumbnail);
                }
                setAlbums((prev) => prev.map((a) => (a.id === albumId ? updatedAlbum : a)));
            }
        },
        [albumsRef, setAlbums, applyFiltersToVideos, getVideosForAlbum, setAllAlbumsVideos],
    );

    const clearPrefixFilters = useCallback(
        (albumId: string) => {
            const nextState = { ...selectedVideoPrefixFiltersRef.current };
            delete nextState[albumId];

            selectedVideoPrefixFiltersRef.current = nextState;
            setSelectedVideoPrefixFiltersState(nextState);

            updateAlbumSelectedPrefixOptionsDb(albumId, null);

            // Update videos in memory
            const unfilteredVideos = getVideosForAlbum(albumId);
            setAllAlbumsVideos((prev) => ({
                ...prev,
                [albumId]: unfilteredVideos,
            }));

            // Update album thumbnail based on the first video
            const firstVid = unfilteredVideos[0];
            const dynamicThumbnail =
                firstVid?.thumbnail || firstVid?.baseThumbnailUri || (firstVid ? getThumbnailUri(firstVid.id) : undefined);

            const album = albumsRef.current[albumId];
            if (album && dynamicThumbnail !== album.thumbnail) {
                const updatedAlbum = {
                    ...album,
                    thumbnail: dynamicThumbnail,
                };
                albumsRef.current[albumId] = updatedAlbum;
                if (dynamicThumbnail && dynamicThumbnail !== album.thumbnail) {
                    updateAlbumThumbnailDb(albumId, dynamicThumbnail);
                }
                setAlbums((prev) => prev.map((a) => (a.id === albumId ? updatedAlbum : a)));
            }
        },
        [albumsRef, setAlbums, applyFiltersToVideos, getVideosForAlbum, setAllAlbumsVideos],
    );

    const recomputePrefixOptions = useCallback(
        (albumId: string, albumVids: VideoMedia[]) => {
            const prefixCounts: Record<string, number> = {};
            albumVids.forEach((v) => {
                if (v.rawPrefix) {
                    prefixCounts[v.rawPrefix] = (prefixCounts[v.rawPrefix] || 0) + 1;
                }
            });

            const options = Object.entries(prefixCounts)
                .filter(([_, count]) => count > 1) // only keep prefixes with >1 items
                .map(([prefix, count]) => ({
                    value: prefix,
                    label: prefix,
                    count,
                }))
                .sort((a, b) => a.label.localeCompare(b.label));

            const optionsStr = JSON.stringify(options);

            // Fetch DB current
            const currentDbStr = getAlbumPrefixOptionsDb(albumId);
            if (currentDbStr !== optionsStr) {
                updateAlbumPrefixOptionsDb(albumId, optionsStr);
            }

            // Validate active filters
            const selectedPrefixOptions = getAlbumSelectedPrefixOptionsDb(albumId);
            if (selectedPrefixOptions) {
                try {
                    const selected = JSON.parse(selectedPrefixOptions) as string[];
                    if (selected.length > 0) {
                        const validSelected = selected.filter((s) => options.some((o) => o.value === s));
                        if (validSelected.length !== selected.length) {
                            // Update selection
                            const nextFiltersStr = validSelected.length > 0 ? JSON.stringify(validSelected) : null;
                            updateAlbumSelectedPrefixOptionsDb(albumId, nextFiltersStr);

                            const nextState = { ...selectedVideoPrefixFiltersRef.current };
                            if (validSelected.length > 0) {
                                nextState[albumId] = validSelected;
                            } else {
                                delete nextState[albumId];
                            }
                            selectedVideoPrefixFiltersRef.current = nextState;
                            setSelectedVideoPrefixFiltersState(nextState);

                            // Re-filter memory videos
                            const unfiltered = getVideosForAlbum(albumId);
                            setAllAlbumsVideos((prev) => ({
                                ...prev,
                                [albumId]: applyFiltersToVideos(albumId, unfiltered),
                            }));
                        }
                    }
                } catch (e) {}
            }

            return options;
        },
        [applyFiltersToVideos, getVideosForAlbum, setAllAlbumsVideos],
    );

    return {
        selectedVideoPrefixFilters,
        selectedVideoPrefixFiltersRef,
        initializeFilters,
        applyFiltersToVideos,
        updatePrefixFilter,
        clearPrefixFilters,
        recomputePrefixOptions,
    };
};
