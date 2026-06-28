import { useCallback } from "react";
import { useMediaStore } from "@/hooks/MediaStoreBridge/MediaStoreProvider";
import type { VideoData } from "@/types/useMedia";

export function useMediaStoreSearch() {
    const store = useMediaStore();
    const searchMedia = useCallback(async (query: string): Promise<VideoData[]> => {
        if (!query.trim()) return [];
        return store.repo.searchVideos(query.trim());
    }, [store]);
    return { searchMedia };
}
