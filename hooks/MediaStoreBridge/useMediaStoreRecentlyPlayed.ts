import { useEffect, useReducer } from "react";
import { useMediaStore } from "@/hooks/MediaStoreBridge/MediaStoreProvider";
import type { VideoData } from "@/types/useMedia";

export function useMediaStoreRecentlyPlayed() {
    const store = useMediaStore();
    const [, forceUpdate] = useReducer((x: number) => x + 1, 0);

    useEffect(() => {
        return store.subscribe("list:albums", forceUpdate);
    }, [store]);

    const allVideos = store.getAllVideos();
    const sorted = [...allVideos]
        .filter((v) => (v.lastOpenedTime ?? 0) > 0)
        .sort((a, b) => (b.lastOpenedTime ?? 0) - (a.lastOpenedTime ?? 0))
        .slice(0, 200);

    const recentlyPlayedVideos: VideoData[] = sorted.map((v) => v.toJSON());
    const recentlyPlayedCount = recentlyPlayedVideos.length;

    return { recentlyPlayedVideos, recentlyPlayedCount };
}
