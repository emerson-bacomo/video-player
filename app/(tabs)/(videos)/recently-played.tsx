import { AlbumVideos } from "@/components/AlbumVideos";
import { useMedia } from "@/hooks/useMedia";
import { Album } from "@/types/useMedia";
import React, { useMemo } from "react";

const RecentlyPlayedScreen = () => {
    const { recentlyPlayedVideos, recentlyPlayedCount, fetchAlbums, isSyncing, loadingTask } = useMedia();

    const recentlyPlayedAlbum = useMemo<Album>(
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
            album={recentlyPlayedAlbum}
            videos={recentlyPlayedVideos}
            onRefresh={handleRefresh}
            isSyncing={isSyncing}
            isLoading={recentlyPlayedCount === 0 && !!loadingTask}
            activeVideoSort={null}
            videoSortMode={null}
        />
    );
};

export default RecentlyPlayedScreen;
