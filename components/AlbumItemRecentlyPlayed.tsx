import { useSafeNavigation } from "@/hooks/useSafeNavigation";
import { router } from "expo-router";
import React, { useCallback } from "react";
import { Album } from "../types/useMedia";
import { AlbumItem } from "./AlbumItem";

interface RecentlyPlayedAlbumProps {
    item: Album;
    width?: number;
}

export const RecentlyPlayedAlbum = React.memo(({ item, width }: RecentlyPlayedAlbumProps) => {
    const { safePush } = useSafeNavigation();

    const handlePress = useCallback(() => {
        safePush({
            pathname: "/(tabs)/(videos)/recently-played",
        });
    }, [router]);

    return <AlbumItem item={item} onPress={handlePress} width={width} />;
});
