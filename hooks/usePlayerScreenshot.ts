import { useState, useRef } from "react";
import ExpoFFmpeg from "@/modules/expo-ffmpeg/src/index";
import { Screenshot } from "@/hooks/domain/Screenshot";
import { resolveAndPersistDestination, alertIfDestinationInvalid } from "@/utils/mediaDestination";
import { buildScreenshotName } from "@/utils/fileNaming";
import { useMediaStore } from "@/hooks/MediaStoreBridge/MediaStoreProvider";
import { useSettings } from "@/hooks/useSettings";
import type { Video } from "@/hooks/domain/Video";
import { useManageExternalStorageToast } from "@/hooks/useManageExternalStorageToast";

interface UsePlayerScreenshotProps {
    activeVideo: Video | null;
    currentDisplayTime: number;
    setLoadingTask: (task: any) => void;
}

export const usePlayerScreenshot = ({ activeVideo, currentDisplayTime, setLoadingTask }: UsePlayerScreenshotProps) => {
    const store = useMediaStore();
    const { settingsRef, updateSettings } = useSettings();
    const { showPermissionToast } = useManageExternalStorageToast();

    const isTakingRef = useRef(false);

    const [screenshotOverlayVisible, setScreenshotOverlayVisible] = useState(false);
    const [screenshotUri, setScreenshotUri] = useState<string | null>(null);
    const [screenshotFilepath, setScreenshotFilepath] = useState<string | null>(null);

    const onScreenshot = async () => {
        if (isTakingRef.current || !activeVideo) return;
        isTakingRef.current = true;
        let directoryName = "";

        try {
            // Resolve the destination using the shared utility function
            const resolvedDest = await resolveAndPersistDestination({
                currentDestination: settingsRef.current.screenshotDestination,
                settingsKey: "screenshotDestination",
                updateSettings,
                labelPrefix: "Screenshot",
                setLoadingTask,
            });

            if (!resolvedDest) {
                isTakingRef.current = false;
                return;
            }

            const destDir = resolvedDest.replace(/\/+$/, "");
            directoryName = destDir.split("/").pop() || destDir;

            if (!(await alertIfDestinationInvalid({ destDir, labelPrefix: "Screenshot", setLoadingTask }))) {
                isTakingRef.current = false;
                return;
            }

            const filename = buildScreenshotName(activeVideo.title, currentDisplayTime);
            const outPath = `${destDir}/${filename}`;
            const displayPath = outPath.split("/0/")[1] || filename;

            setLoadingTask({
                id: "screenshot",
                label: "Saving Screenshot",
                detail: `Saving to ${displayPath}`,
                importance: "SHOW_POPUP",
                progress: 0,
            });

            // Capture via the native ffmpeg module
            const resultUri = await ExpoFFmpeg.takeScreenshot(activeVideo.uri, outPath, currentDisplayTime);

            if (!resultUri) {
                setLoadingTask({
                    label: "Screenshot Failed",
                    detail: "Could not capture the current frame.",
                    importance: "SHOW_POPUP",
                    dismissAfter: 4000,
                    status: "error",
                });
                isTakingRef.current = false;
                return;
            }

            // The native module returns the final path (with frame number appended)
            // Strip file:// prefix for scanning and display
            const finalPath = resultUri.startsWith("file://") ? resultUri.replace("file://", "") : resultUri;
            const finalDisplayPath = finalPath.split("/0/")[1] || finalPath.split("/").pop() || finalPath;

            // Scan into the media library (same as clip post-processing)
            try {
                await ExpoFFmpeg.scanFile(finalPath);
            } catch (scanErr) {
                console.warn("[usePlayerScreenshot] Media scan failed (non-fatal)", scanErr);
            }

            // Show the animated overlay with the saved image
            setScreenshotUri(resultUri);
            setScreenshotFilepath(finalDisplayPath);
            setScreenshotOverlayVisible(true);

            // Scan screenshots to update the list in real-time
            Screenshot.scan(store).catch(() => {});
        } catch (e: any) {
            console.error("[usePlayerScreenshot] Error:", e);
            const isStorageError = e?.message?.includes("Failed to write screenshot");
            if (isStorageError) {
                showPermissionToast(directoryName);
            } else {
                setLoadingTask({
                    label: "Screenshot Error",
                    detail: "An unexpected error occurred.",
                    importance: "SHOW_POPUP",
                    dismissAfter: 4000,
                    status: "error",
                });
            }
        } finally {
            isTakingRef.current = false;
        }
    };

    const dismissScreenshot = () => {
        setScreenshotOverlayVisible(false);
    };

    return {
        onScreenshot,
        screenshotOverlayVisible,
        screenshotUri,
        screenshotFilepath,
        dismissScreenshot,
    };
};
