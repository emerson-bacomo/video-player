import { useSafeNavigation } from "@/hooks/useSafeNavigation";
import React, { memo, useCallback } from "react";
import type { Album } from "@/hooks/domain/Album";
import { AlbumItem } from "./AlbumItem";

interface RecentlyPlayedAlbumProps {
    item: Album;
    width?: number;
}

export const RecentlyPlayedAlbum = memo(function RecentlyPlayedAlbum({ item, width }: RecentlyPlayedAlbumProps) {
    const { safePush } = useSafeNavigation();

    const handlePress = useCallback(() => {
        safePush({
            pathname: "/(tabs)/(videos)/recently-played",
        });
    }, [safePush]);

    return <AlbumItem item={item} onPress={handlePress} width={width} />;
});
