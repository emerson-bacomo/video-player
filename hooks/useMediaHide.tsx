import { Album } from "@/types/useMedia";
import { addLogDb, getHiddenAlbumsDb, getHiddenVideosDb, setAlbumHiddenDb, setVideoHiddenDb } from "@/utils/db";
import { useCallback } from "react";

export const useMediaHide = (
    setAlbums: React.Dispatch<React.SetStateAction<Album[]>>,
    fetchAlbums: () => Promise<void>,
    clearSelection: () => void,
) => {
    const hideVideo = useCallback(async (videoId: string) => {
        setVideoHiddenDb(videoId, true);
        addLogDb("INFO", "Hide Media", `Hid video ID: ${videoId}`);
    }, []);

    const hideAlbum = useCallback(
        async (albumId: string) => {
            setAlbumHiddenDb(albumId, true);
            addLogDb("INFO", "Hide Media", `Hid album ID: ${albumId}`);
            setAlbums((prev) => prev.filter((a) => a.id !== albumId));
        },
        [setAlbums],
    );

    const hideMultipleVideos = useCallback(
        async (videoIds: string[]) => {
            videoIds.forEach((id) => setVideoHiddenDb(id, true));
            clearSelection();
        },
        [clearSelection],
    );

    const hideMultipleAlbums = useCallback(
        async (albumIds: string[]) => {
            const idSet = new Set(albumIds);
            albumIds.forEach((id) => setAlbumHiddenDb(id, true));
            setAlbums((prev) => prev.filter((a) => !idSet.has(a.id)));
            clearSelection();
        },
        [setAlbums, clearSelection],
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
