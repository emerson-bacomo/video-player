import { addLogDb, deleteMultipleAlbumsDb, deleteMultipleVideosDb } from "@/utils/db";
import { getThumbnailUri } from "@/utils/videoUtils";
import * as FileSystem from "expo-file-system/legacy";
import * as MediaLibrary from "expo-media-library";
import { useCallback } from "react";


export const useMediaDelete = (performSmartSync: (signal?: AbortSignal) => Promise<void>) => {
    const deleteMultipleVideos = useCallback(
        async (videoIds: string[]) => {
            try {
                addLogDb("INFO", "Delete Media", `Attempting to delete ${videoIds.length} videos`);
                const success = await MediaLibrary.deleteAssetsAsync(videoIds);
                if (success) {
                    addLogDb("INFO", "Delete Media", `Successfully deleted ${videoIds.length} videos`);
                    
                    // Clean up thumbnails from storage
                    for (const id of videoIds) {
                        try {
                            const thumbUri = getThumbnailUri(id);
                            await FileSystem.deleteAsync(thumbUri, { idempotent: true });
                        } catch (e) {
                            console.error(`[DeleteMedia] Failed to delete thumbnail for ${id}:`, e);
                        }
                    }

                    deleteMultipleVideosDb(videoIds);
                    await performSmartSync();

                    return true;
                }
            } catch (e) {
                addLogDb("ERROR", "Delete Media", "Failed to delete videos", e);
            }
            return false;
        },
        [performSmartSync],
    );

    const deleteMultipleAlbums = useCallback(
        async (albumIds: string[]) => {
            try {
                addLogDb("INFO", "Delete Media", `Attempting to delete ${albumIds.length} albums`);
                const success = await MediaLibrary.deleteAlbumsAsync(albumIds, true);
                if (success) {
                    addLogDb("INFO", "Delete Media", `Successfully deleted ${albumIds.length} albums`);
                    deleteMultipleAlbumsDb(albumIds);
                    await performSmartSync();
                    return true;
                }
            } catch (e) {
                addLogDb("ERROR", "Delete Media", "Failed to delete albums", e);
            }
            return false;
        },
        [performSmartSync],
    );

    return {
        deleteMultipleVideos,
        deleteMultipleAlbums,
    };
};
