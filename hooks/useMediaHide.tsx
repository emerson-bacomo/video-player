import type { Album, VideoMedia } from "@/types/useMedia";
import { addLogDb, getHiddenAlbumsDb, getHiddenVideosDb, setAlbumHiddenDb, setVideoHiddenDb } from "@/utils/db";
import { useCallback } from "react";

export const useMediaHide = (
    setAlbums: React.Dispatch<React.SetStateAction<Album[]>>,
    fetchAlbums: () => Promise<void>,
    clearSelection: () => void,
    albumsRef: React.RefObject<Record<string, Album>>,
    setAllAlbumsVideos: React.Dispatch<React.SetStateAction<Record<string, VideoMedia[]>>>,
) => {
    const hideVideo = useCallback(
        async (videoId: string) => {
            setVideoHiddenDb(videoId, true);
            addLogDb("INFO", "Hide Media", `Hid video ID: ${videoId}`);

            // Remove video from allAlbumsVideos immediately
            setAllAlbumsVideos((prev) => {
                const next = { ...prev };
                for (const albumId in next) {
                    const idx = next[albumId].findIndex((v) => v.id === videoId);
                    if (idx !== -1) {
                        const newVids = [...next[albumId]];
                        newVids.splice(idx, 1);
                        next[albumId] = newVids;
                        break;
                    }
                }
                return next;
            });
        },
        [setAllAlbumsVideos],
    );

    const hideAlbum = useCallback(
        async (albumId: string) => {
            setAlbumHiddenDb(albumId, true);
            addLogDb("INFO", "Hide Media", `Hid album ID: ${albumId}`);
            setAlbums((prev) => prev.filter((a) => a.id !== albumId));
            delete albumsRef.current[albumId];
            setAllAlbumsVideos((prev) => {
                const next = { ...prev };
                delete next[albumId];
                return next;
            });
        },
        [setAlbums, albumsRef, setAllAlbumsVideos],
    );

    const hideMultipleVideos = useCallback(
        async (videoIds: string[]) => {
            videoIds.forEach((id) => setVideoHiddenDb(id, true));
            clearSelection();

            // Remove videos from allAlbumsVideos immediately
            setAllAlbumsVideos((prev) => {
                const idSet = new Set(videoIds);
                const next = { ...prev };
                for (const albumId in next) {
                    const filtered = next[albumId].filter((v) => !idSet.has(v.id));
                    if (filtered.length !== next[albumId].length) {
                        next[albumId] = filtered;
                    }
                }
                return next;
            });
        },
        [clearSelection, setAllAlbumsVideos],
    );

    const hideMultipleAlbums = useCallback(
        async (albumIds: string[]) => {
            const idSet = new Set(albumIds);
            albumIds.forEach((id) => setAlbumHiddenDb(id, true));
            setAlbums((prev) => prev.filter((a) => !idSet.has(a.id)));
            albumIds.forEach((id) => delete albumsRef.current[id]);
            setAllAlbumsVideos((prev) => {
                const next = { ...prev };
                albumIds.forEach((id) => delete next[id]);
                return next;
            });
            clearSelection();
        },
        [setAlbums, albumsRef, setAllAlbumsVideos, clearSelection],
    );

    const unhideVideo = useCallback(
        async (videoId: string) => {
            setVideoHiddenDb(videoId, false);
            fetchAlbums();
        },
        [fetchAlbums],
    );

    const unhideAlbum = useCallback(
        async (albumId: string) => {
            setAlbumHiddenDb(albumId, false);
            fetchAlbums();
        },
        [fetchAlbums],
    );

    const unhideMultipleVideos = useCallback(
        async (videoIds: string[]) => {
            videoIds.forEach((id) => setVideoHiddenDb(id, false));
            fetchAlbums();
            clearSelection();
        },
        [fetchAlbums, clearSelection],
    );

    const unhideMultipleAlbums = useCallback(
        async (albumIds: string[]) => {
            albumIds.forEach((id) => setAlbumHiddenDb(id, false));
            fetchAlbums();
            clearSelection();
        },
        [fetchAlbums, clearSelection],
    );

    const fetchHiddenMedia = useCallback(async () => {
        const albums = getHiddenAlbumsDb();
        const videos = getHiddenVideosDb();
        return { albums, videos };
    }, []);

    return {
        hideVideo,
        hideAlbum,
        hideMultipleVideos,
        hideMultipleAlbums,
        unhideVideo,
        unhideAlbum,
        unhideMultipleVideos,
        unhideMultipleAlbums,
        fetchHiddenMedia,
    };
};
