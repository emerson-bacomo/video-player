import { AlbumVideos } from "@/components/AlbumVideos";
import { Album, VideoMedia } from "@/types/useMedia";
import { getRecentlyPlayedVideosDb } from "@/utils/db";
import React, { useCallback, useEffect, useMemo } from "react";

const RecentlyPlayedScreen = () => {
    const [isLoading, setIsLoading] = React.useState(true);
    const [isSyncing, setIsSyncing] = React.useState(false);
    const [videos, setVideos] = React.useState<VideoMedia[]>([]);

    const recentlyPlayedAlbum = useMemo<Album>(
        () => ({
            id: "recently-played",
            title: "Recently Played",
            albumName: "Recently Played",
            assetCount: videos.length,
            uri: "",
        }),
        [videos?.length],
    );

    const fetchRecentlyPlayedVideos = useCallback(() => {
        const data = getRecentlyPlayedVideosDb(200);
        // to test in release built, definitely has loading time delay, to choose between longer startup or navigation delay
        setVideos(data);
        setIsLoading(false);
        setIsSyncing(false);
    }, []);

    const handleRefresh = useCallback(async () => {
        setIsSyncing(true);
        fetchRecentlyPlayedVideos();
    }, [fetchRecentlyPlayedVideos]);

    useEffect(() => {
        fetchRecentlyPlayedVideos();
    }, [fetchRecentlyPlayedVideos]);

    return (
        <AlbumVideos
            album={recentlyPlayedAlbum}
            videos={videos}
            onRefresh={handleRefresh}
            isSyncing={isSyncing}
            isLoading={isLoading}
            activeVideoSort={null}
            videoSortMode={null}
        />
    );
};

export default RecentlyPlayedScreen;
