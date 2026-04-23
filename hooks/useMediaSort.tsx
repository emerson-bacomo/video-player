import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getSettingDb, saveSettingDb, updateAlbumVideoSortScopeDb, updateAlbumVideoSortTypeDb } from "../utils/db";
import type { Album } from "./useMedia";

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
    currentAlbum: Album | null,
    setCurrentAlbum: (a: Album | null | ((prev: Album | null) => Album | null)) => void,
    currentAlbumRef: React.MutableRefObject<Album | null>,
) => {
    const [albumSort, setAlbumSortState] = useState<AlbumSortConfig>({ by: "date", order: "desc" });
    const [globalVideoSort, setGlobalVideoSort] = useState<VideoSortConfig>({ by: "episode", order: "asc" });

    const albumSortRef = useRef<AlbumSortConfig>(albumSort);
    const globalVideoSortRef = useRef<VideoSortConfig>(globalVideoSort);

    // Derived values
    const videoSortMode = currentAlbum?.videoSortSettingScope || "global";

    const activeVideoSort = useMemo(() => {
        if (currentAlbum?.videoSortSettingScope === "local" && currentAlbum.videoSortType) {
            try {
                return JSON.parse(currentAlbum.videoSortType) as VideoSortConfig;
            } catch (e) {
                console.warn("[MediaSort] Failed to parse local sort for album", currentAlbum.id, e);
            }
        }
        return globalVideoSort;
    }, [currentAlbum, globalVideoSort]);

    const activeVideoSortRef = useRef<VideoSortConfig>(activeVideoSort);

    useEffect(() => {
        activeVideoSortRef.current = activeVideoSort;
    }, [activeVideoSort]);

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

    const updateVideoSort = useCallback(
        (s: React.SetStateAction<VideoSortConfig>) => {
            setCurrentAlbum((prev) => {
                const current = prev || currentAlbumRef.current;
                if (!current || current.videoSortSettingScope !== "local") {
                    const prevGlobal = globalVideoSortRef.current;
                    const nextGlobal = typeof s === "function" ? s(prevGlobal) : s;

                    if (prevGlobal.by !== nextGlobal.by || prevGlobal.order !== nextGlobal.order) {
                        setGlobalVideoSort(nextGlobal);
                        globalVideoSortRef.current = nextGlobal;
                        saveSettingDb("globalVideoSort", JSON.stringify(nextGlobal));
                    }
                    return prev;
                }

                const prevSort = current.videoSortType ? JSON.parse(current.videoSortType) : globalVideoSortRef.current;
                const nextSort = typeof s === "function" ? s(prevSort) : s;

                if (prevSort.by === nextSort.by && prevSort.order === nextSort.order) return prev;

                const nextSortStr = JSON.stringify(nextSort);
                const updatedAlbum = { ...current, videoSortType: nextSortStr };

                setAlbums((prevAlbums) => prevAlbums.map((a) => (a.id === updatedAlbum.id ? updatedAlbum : a)));
                updateAlbumVideoSortTypeDb(current.id, nextSortStr);

                return updatedAlbum;
            });
        },
        [setAlbums, setCurrentAlbum, currentAlbumRef],
    );

    const setAlbumSort = useCallback((s: React.SetStateAction<AlbumSortConfig>) => {
        setAlbumSortState((prev) => {
            const next = typeof s === "function" ? s(prev) : s;
            if (prev.by === next.by && prev.order === next.order) return prev;
            albumSortRef.current = next;
            saveSettingDb("albumSort", JSON.stringify(next));
            return next;
        });
    }, []);

    const setVideoSortSettingScope = useCallback(
        (scope: "local" | "global") => {
            setCurrentAlbum((prev) => {
                // Priority: latest state (prev) or latest ref
                const current = prev || currentAlbumRef.current;
                if (!current) return prev;

                const currentScope = current.videoSortSettingScope || "global";
                if (currentScope === scope) return prev;

                console.log(`[MediaSort] Switching scope for album ${current.id} from ${currentScope} to ${scope}`);

                let nextSortType = current.videoSortType;
                if (scope === "local" && !nextSortType) {
                    nextSortType = JSON.stringify(globalVideoSortRef.current);
                }

                const updatedAlbum: Album = {
                    ...current,
                    videoSortSettingScope: scope,
                    videoSortType: nextSortType,
                };

                // side-effects
                setAlbums((prevAlbums) => prevAlbums.map((a) => (a.id === updatedAlbum.id ? updatedAlbum : a)));
                updateAlbumVideoSortScopeDb(current.id, scope);
                if (scope === "local" && nextSortType) {
                    updateAlbumVideoSortTypeDb(current.id, nextSortType);
                }

                return updatedAlbum;
            });
        },
        [setAlbums, setCurrentAlbum, currentAlbumRef],
    );

    const compareByVideoSort = useCallback((a: any, b: any, vSort = activeVideoSortRef.current) => {
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
    }, []);

    const compareByAlbumSort = useCallback((a: any, b: any, aSort = albumSortRef.current) => {
        let comp = 0;
        if (aSort.by === "date") {
            comp = (a.lastModified || 0) - (b.lastModified || 0);
        } else if (aSort.by === "name") {
            comp = a.displayName.localeCompare(b.displayName);
        } else if (aSort.by === "count") {
            comp = (a.assetCount || 0) - (b.assetCount || 0);
        }
        return aSort.order === "asc" ? comp : -comp;
    }, []);


    return {
        albumSort,
        activeVideoSort,
        globalVideoSort,
        videoSortMode,
        activeVideoSortRef,
        albumSortRef,
        updateVideoSort,
        setAlbumSort,
        setVideoSortSettingScope,
        initializeSort,
        compareByVideoSort,
        compareByAlbumSort,
    };
};
