import { Album } from "@/hooks/domain/Album";
import { Screenshot } from "@/hooks/domain/Screenshot";
import { Video } from "@/hooks/domain/Video";
import { useMediaStore } from "@/hooks/MediaStoreBridge/MediaStoreProvider";
import { useSelection } from "@/context/SelectionContext";
import { router } from "expo-router";
import { useCallback, useState } from "react";
import { toast } from "sonner-native";

/**
 * Reusable deletion handler.
 *
 * @param type      The kind of items being deleted.
 * @param idList    The IDs to delete.
 * @param itemCount Number of items (for the success message).
 * @param onSuccess Optional callback run after a successful deletion instead of
 *                  the default "dismiss all + replace to albums" navigation.
 */
export const useDeleteHandler = ({
    type,
    idList,
    itemCount,
    onSuccess,
}: {
    type: "video" | "album" | "screenshot";
    idList: string[];
    itemCount: number;
    onSuccess?: () => void;
}) => {
    const store = useMediaStore();
    const { clearSelection } = useSelection();

    const [isDeleting, setIsDeleting] = useState(false);

    const handleDelete = useCallback(async () => {
        setIsDeleting(true);
        try {
            let success = true;
            if (type === "video") {
                success = await Video.deleteMany(idList, store);
            } else if (type === "screenshot") {
                success = await Screenshot.deleteMany(idList, store);
            } else {
                success = await Album.deleteMany(idList, store);
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
    }, [type, idList, itemCount, onSuccess, store, clearSelection]);

    return { handleDelete, isDeleting };
};
