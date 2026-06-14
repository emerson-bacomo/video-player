import { useSafeNavigation } from "@/hooks/useSafeNavigation";
import React, { useCallback } from "react";
import { Album } from "../types/useMedia";
import { AlbumItem } from "./AlbumItem";

interface ScreenshotsAlbumProps {
    item: Album;
    width?: number;
}

export const ScreenshotsAlbum = React.memo(({ item, width }: ScreenshotsAlbumProps) => {
    const { safePush } = useSafeNavigation();

    const handlePress = useCallback(() => {
        safePush({
            pathname: "/(tabs)/(videos)/screenshots" as any,
        });
    }, []);

    return <AlbumItem item={item} onPress={handlePress} width={width} />;
});
