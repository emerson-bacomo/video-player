import { useSafeNavigation } from "@/hooks/useSafeNavigation";
import React, { memo, useCallback } from "react";
import type { Album } from "@/hooks/domain/Album";
import { AlbumItem } from "./AlbumItem";

interface ScreenshotsAlbumProps {
    item: Album;
    width?: number;
}

export const ScreenshotsAlbum = memo(function ScreenshotsAlbum({ item, width }: ScreenshotsAlbumProps) {
    const { safePush } = useSafeNavigation();

    const handlePress = useCallback(() => {
        safePush({
            pathname: "/(tabs)/(videos)/screenshots" as any,
        });
    }, [safePush]);

    return <AlbumItem item={item} onPress={handlePress} width={width} />;
});
