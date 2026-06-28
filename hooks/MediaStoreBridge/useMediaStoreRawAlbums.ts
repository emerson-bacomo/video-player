import { useSyncExternalStore, useReducer, useEffect } from "react";
import { useMediaStore } from "@/hooks/MediaStoreBridge/MediaStoreProvider";
import type { AlbumData, VideoData } from "@/types/useMedia";

export function useRawAlbum(id: string | undefined): AlbumData | undefined {
    const store = useMediaStore();
    return useSyncExternalStore(
        (onChange) => {
            if (!id) return () => {};
            return store.subscribe(id, onChange);
        },
        () => (id ? store.getAlbum(id)?.toJSON() : undefined),
    );
}

export function useRawAlbums(): AlbumData[] {
    const store = useMediaStore();
    const [, forceUpdate] = useReducer((x: number) => x + 1, 0);

    useEffect(() => {
        return store.subscribe("list:albums", forceUpdate);
    }, [store]);

    return store.getAlbums().map((a) => a.toJSON());
}

export function useRawAlbumVideos(albumId: string): VideoData[] {
    const store = useMediaStore();
    const [, forceUpdate] = useReducer((x: number) => x + 1, 0);

    useEffect(() => {
        const unsubs: (() => void)[] = [];
        const videos = store.getAlbumVideos(albumId);
        for (const v of videos) {
            unsubs.push(store.subscribe(v.id, forceUpdate));
        }
        const unsubList = store.subscribe(`videos:${albumId}`, forceUpdate);
        return () => {
            for (const fn of unsubs) fn();
            unsubList();
        };
    }, [store, albumId]);

    return store.getAlbumVideos(albumId).map((v) => v.toJSON());
}
