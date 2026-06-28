import { useCallback } from "react";
import { useMediaStore } from "@/hooks/MediaStoreBridge/MediaStoreProvider";
import type { VideoData } from "@/types/useMedia";

export function useMediaStoreUnfilteredVideos() {
    const store = useMediaStore();

    const getUnfilteredVideosForAlbum = useCallback(
        async (albumId: string): Promise<VideoData[]> => {
            return store.repo.getVideos(albumId, true);
        },
        [store],
    );

    return { getUnfilteredVideosForAlbum };
}
