import { AlbumVideos } from "@/components/AlbumVideos";
import { useMedia } from "@/hooks/useMedia";
import { useAlbum, useAlbumVideos } from "@/hooks/MediaStoreBridge/useMediaStoreAlbums";
import { router, useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";

const AlbumVideosScreen = () => {
    const { id } = useLocalSearchParams<{ id: string }>();
    const { performSmartSync } = useMedia();
    const [isSyncing, setIsSyncing] = useState(false);
    const [isLoading, setIsLoading] = useState(true);

    const album = useAlbum(id ?? "") ?? null;
    const videos = useAlbumVideos(id ?? "");

    const startSyncCachedData = useCallback(
        (isManual: boolean = false) => {
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
        },
        [id, performSmartSync],
    );

    const handleRefresh = () => {
        startSyncCachedData(true);
    };

    useEffect(() => {
        const controller = startSyncCachedData(false);
        return () => controller?.abort();
    }, [startSyncCachedData]);

    useEffect(() => {
        if (!isLoading && !album) {
            if (router.canGoBack()) {
                router.back();
            } else {
                router.replace("/(tabs)/(videos)");
            }
        }
    }, [album, isLoading]);

    if (!album) return null;

    return (
        <AlbumVideos
            album={album}
            videos={videos}
            onRefresh={handleRefresh}
            isSyncing={isSyncing}
            isLoading={isLoading}
            activeVideoSort={album.videoSort}
            videoSortMode={album.videoSortMode}
        />
    );
};

export default AlbumVideosScreen;
