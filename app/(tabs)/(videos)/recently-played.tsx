import { AlbumVideos } from "@/components/AlbumVideos";
import { useMedia } from "@/hooks/useMedia";
import { useMediaStoreRecentlyPlayed } from "@/hooks/MediaStoreBridge/useMediaStoreRecentlyPlayed";
import { useLoadingTask } from "@/context/LoadingTaskContext";
import React, { useMemo } from "react";

const RecentlyPlayedScreen = () => {
    const { recentlyPlayedVideos, recentlyPlayedCount } = useMediaStoreRecentlyPlayed();
    const { fetchAlbums, isSyncing } = useMedia();
    const { loadingTask } = useLoadingTask();

    const recentlyPlayedAlbum = useMemo(
        () => ({
            id: "recently-played",
            title: "Recently Played",
            albumName: "Recently Played",
            assetCount: recentlyPlayedCount,
            uri: "",
        }),
        [recentlyPlayedCount],
    );

    const handleRefresh = async () => {
        await fetchAlbums();
    };

    return (
        <AlbumVideos
            album={recentlyPlayedAlbum as any}
            videos={recentlyPlayedVideos as any}
            onRefresh={handleRefresh}
            isSyncing={isSyncing}
            isLoading={recentlyPlayedCount === 0 && !!loadingTask}
            activeVideoSort={null}
            videoSortMode={null}
        />
    );
};

export default RecentlyPlayedScreen;
