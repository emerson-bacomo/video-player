import { useState, useRef } from "react";
import ExpoFFmpeg from "@/modules/expo-ffmpeg/src/index";
import { resolveAndPersistDestination, alertIfDestinationInvalid } from "@/utils/mediaDestination";
import { buildScreenshotName } from "@/utils/fileNaming";
import { useSettings } from "@/hooks/useSettings";
import { VideoMedia } from "@/types/useMedia";
import { useMedia } from "@/hooks/useMedia";
import { useManageExternalStorageToast } from "@/hooks/useManageExternalStorageToast";

interface UsePlayerScreenshotProps {
    activeVideo: VideoMedia | null;
    currentDisplayTime: number;
    setLoadingTask: (task: any) => void;
}

export const usePlayerScreenshot = ({ activeVideo, currentDisplayTime, setLoadingTask }: UsePlayerScreenshotProps) => {
    const { settingsRef, updateSettings } = useSettings();
    const { fetchScreenshots } = useMedia();
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

            // Scan into the media library (same as clip post-processing)
            try {
                await ExpoFFmpeg.scanFile(outPath);
            } catch (scanErr) {
                console.warn("[usePlayerScreenshot] Media scan failed (non-fatal)", scanErr);
            }

            // Show the animated overlay with the saved image
            setScreenshotUri(`file://${outPath}`);
            setScreenshotFilepath(displayPath);
            setScreenshotOverlayVisible(true);

            // Fetch screenshots to update albums list in real-time
            fetchScreenshots().catch(() => {});
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
