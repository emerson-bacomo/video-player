import { createContext, useContext, useCallback, useState } from "react";
import type { ReactNode } from "react";
import { getVideosForAlbumDb } from "@/utils/db";
import { extractPrefix } from "@/utils/videoUtils";

export interface SelectionContextType {
    isSelectionMode: boolean;
    selectedIds: Set<string>;
    toggleSelection: (id: string) => void;
    clearSelection: () => void;
    hideSelectionBar: () => void;
    resumeSelectionIfNeeded: () => void;
    selectAll: (items?: { id: string }[]) => void;
    togglePrefixSelection: (prefix: string, albumId: string) => void;
    selectPrefixesOfSelected: (albumId: string) => void;
    resetToAlbums: () => void;
}

const SelectionContext = createContext<SelectionContextType | null>(null);

export function useSelection(): SelectionContextType {
    const ctx = useContext(SelectionContext);
    if (!ctx) throw new Error("useSelection must be used within a SelectionProvider");
    return ctx;
}

export function SelectionProvider({ children }: { children: ReactNode }) {
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

    const hideSelectionBar = useCallback(() => {
        setIsSelectionMode(false);
    }, []);

    const resumeSelectionIfNeeded = useCallback(() => {
        setSelectedIds((prev) => {
            if (prev.size > 0) setIsSelectionMode(true);
            return prev;
        });
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

    return (
        <SelectionContext.Provider
            value={{
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
            }}
        >
            {children}
        </SelectionContext.Provider>
    );
}
