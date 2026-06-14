import { useEffect, useRef, useCallback } from "react";
import { AppState } from "react-native";
import { toast } from "sonner-native";
import ExpoFFmpeg from "@/modules/expo-ffmpeg/src/index";

export const useManageExternalStorageToast = () => {
    const toastIdRef = useRef<string | number | null>(null);

    const checkAndDismiss = useCallback(async () => {
        if (toastIdRef.current === null) return;
        const granted = await ExpoFFmpeg.checkManageExternalStorage();
        if (granted) {
            toast.dismiss(toastIdRef.current);
            toastIdRef.current = null;
        }
    }, []);

    useEffect(() => {
        const subscription = AppState.addEventListener("change", (nextAppState) => {
            if (nextAppState === "active") {
                checkAndDismiss();
            }
        });
        return () => subscription.remove();
    }, [checkAndDismiss]);

    const showPermissionToast = useCallback((directoryName?: string) => {
        if (toastIdRef.current !== null) return;

        const dirLabel = directoryName || "this directory";
        toastIdRef.current = toast.error("All Files Access Required", {
            description: `"${dirLabel}" is not an image directory. Grant All Files Access to export screenshots.`,
            duration: Infinity,
            action: {
                label: "Settings",
                onClick: () => {
                    ExpoFFmpeg.requestManageExternalStorage();
                },
            },
            onDismiss: () => {
                toastIdRef.current = null;
            },
        });
    }, []);

    return { showPermissionToast };
};