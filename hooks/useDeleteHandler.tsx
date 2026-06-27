import { useMedia } from "@/hooks/useMedia";
import { router } from "expo-router";
import { useCallback, useState } from "react";
import { toast } from "sonner-native";

/**
 * Reusable deletion handler.
 *
 * @param type      The kind of items being deleted.
 * @param idList    The IDs to delete. For video/album this maps to DB IDs; for
 *                  screenshot this is also used to derive URIs via `itemUris`.
 * @param itemCount Number of items (for the success message).
 * @param itemUris  Required for `screenshot` type — the file URIs to delete.
 * @param onSuccess Optional callback run after a successful deletion instead of
 *                  the default "dismiss all + replace to albums" navigation.
 */
export const useDeleteHandler = ({
    type,
    idList,
    itemCount,
    itemUris,
    onSuccess,
}: {
    type: "video" | "album" | "screenshot";
    idList: string[];
    itemCount: number;
    itemUris?: string[];
    onSuccess?: () => void;
}) => {
    const { deleteMultipleVideos, deleteMultipleAlbums, deleteMultipleImages, fetchScreenshots, clearSelection } =
        useMedia();

    const [isDeleting, setIsDeleting] = useState(false);

    const handleDelete = useCallback(async () => {
        setIsDeleting(true);
        try {
            let success = true;
            if (type === "video") {
                success = await deleteMultipleVideos(idList);
            } else if (type === "screenshot") {
                const uris = (itemUris ?? []).filter(Boolean);
                success = await deleteMultipleImages(uris);
                await fetchScreenshots();
            } else {
                success = await deleteMultipleAlbums(idList);
            }

            if (success) {
                toast.success(`Successfully deleted ${itemCount} item${itemCount !== 1 ? "s" : ""}`);
                clearSelection();
                if (onSuccess) {
                    onSuccess();
                } else {
                    router.dismissAll();
                    router.replace("/(tabs)/(videos)");
                }
            } else {
                toast.error("Failed to delete some items. They may be read-only or in use.");
            }
        } catch (error) {
            console.error("Delete error", error);
            toast.error("An error occurred during deletion.");
        } finally {
            setIsDeleting(false);
        }
    }, [type, idList, itemCount, itemUris, onSuccess, deleteMultipleVideos, deleteMultipleAlbums, deleteMultipleImages, fetchScreenshots, clearSelection]);

    return { handleDelete, isDeleting };
};
