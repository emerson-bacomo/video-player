import { getVideosForAlbumDb } from "@/utils/db";
import { extractPrefix } from "@/utils/videoUtils";
import { useCallback, useState } from "react";

export const useMediaSelection = () => {
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

    const resetToAlbums = useCallback(() => {
        setSelectedIds(new Set());
        setIsSelectionMode(false);
    }, []);

    return {
        isSelectionMode,
        selectedIds,
        toggleSelection,
        clearSelection,
        selectAll,
        togglePrefixSelection,
        selectPrefixesOfSelected,
        resetToAlbums,
    };
};
