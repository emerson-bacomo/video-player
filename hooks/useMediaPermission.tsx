import * as MediaLibrary from "expo-media-library";
import { useCallback } from "react";

export const REQUIRED_MEDIA_PERMISSIONS: MediaLibrary.GranularPermission[] = ["video"];

export const useMediaPermission = (
    setError: (error: string | null) => void,
) => {
    const [permissionResponse] = MediaLibrary.usePermissions({
        writeOnly: false,
        granularPermissions: REQUIRED_MEDIA_PERMISSIONS,
    });

    const checkPermission = useCallback(async (): Promise<"granted" | "denied" | "blocked"> => {
        // Read current OS state directly to avoid stale hook snapshots after partial grants.
        const current = await MediaLibrary.getPermissionsAsync(false, REQUIRED_MEDIA_PERMISSIONS);
        if (current.granted || current.status === "granted") return "granted";
        if (current.canAskAgain === false) return "blocked";

        // Request only the permission this app actually needs for syncing videos.
        const requested = await MediaLibrary.requestPermissionsAsync(false, REQUIRED_MEDIA_PERMISSIONS);
        if (requested.granted || requested.status === "granted") return "granted";
        return requested.canAskAgain === false ? "blocked" : "denied";
    }, []);

    const requestPermissionAndFetch = useCallback(async (onSuccess: () => Promise<void>): Promise<string | null> => {
        const permissionState = await checkPermission();
        if (permissionState === "granted") {
            await onSuccess();
            return null;
        } else {
            if (permissionState === "blocked") {
                const message = "Permission blocked. Open app settings and allow media access.";
                setError(message);
                return message;
            } else {
                const message = "Permission denied. Cannot scan media.";
                setError(message);
                return message;
            }
        }
    }, [checkPermission, setError]);

    return {
        permissionResponse,
        checkPermission,
        requestPermissionAndFetch,
    };
};
