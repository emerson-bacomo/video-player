import { useSyncExternalStore, useReducer, useEffect } from "react";
import { useMediaStore } from "@/hooks/MediaStoreBridge/MediaStoreProvider";
import type { Album } from "@/hooks/domain/Album";
import type { Video } from "@/hooks/domain/Video";

export function useAlbum(id: string): Album | undefined {
    const store = useMediaStore();
    return useSyncExternalStore(
        (onChange) => store.subscribe(id, onChange),
        () => store.getAlbum(id),
    );
}

export function useAlbums(): Album[] {
    const store = useMediaStore();
    const [, forceUpdate] = useReducer((x: number) => x + 1, 0);

    useEffect(() => {
        return store.subscribe("list:albums", forceUpdate);
    }, [store]);

    return store.getAlbums();
}

export function useAlbumVideos(albumId: string): Video[] {
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

    return store.getAlbumVideos(albumId);
}
