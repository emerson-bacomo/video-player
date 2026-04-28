import { AlbumVideos } from "@/components/AlbumVideos";
import { useMedia } from "@/hooks/useMedia";
import { DEFAULT_SORT_SCOPE } from "@/constants/defaults";
import { useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect } from "react";

const AlbumVideosScreen = () => {
    const { id } = useLocalSearchParams<{ id: string }>();
    const { allAlbum, allAlbumsVideos, performSmartSync, getActiveVideoSort } = useMedia();
    const [isSyncing, setIsSyncing] = React.useState(false);
    const [isLoading, setIsLoading] = React.useState(true);


    const album = allAlbum[id] || null;
    const videos = allAlbumsVideos[id] || null;

    const activeVideoSort = getActiveVideoSort(album);
    const videoSortMode = album?.videoSortSettingScope || DEFAULT_SORT_SCOPE;

    const startSyncCachedData = useCallback((isManual: boolean = false) => {
        if (!id) return;
        const controller = new AbortController();
        if (isManual) {
            setIsSyncing(true);
        }
        performSmartSync(controller.signal).finally(() => {
            if (!controller.signal.aborted) {
                setIsLoading(false);
                setIsSyncing(false);
            }
        });
        return controller;
    }, [id, performSmartSync]);

    const handleRefresh = () => {
        startSyncCachedData(true);
    };

    useEffect(() => {
        const controller = startSyncCachedData(false);
        return () => controller?.abort();
    }, [startSyncCachedData]);


    return (
        <AlbumVideos
            album={album}
            videos={videos}
            onRefresh={handleRefresh}
            isSyncing={isSyncing}
            isLoading={isLoading}
            activeVideoSort={activeVideoSort}
            videoSortMode={videoSortMode}
        />
    );
};

export default AlbumVideosScreen;
