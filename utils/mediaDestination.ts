import * as FileSystem from "expo-file-system/legacy";
import { Directory } from "expo-file-system";

export const normalizeMediaDestination = (rawPath: string): string | null => {
    const input = (rawPath || "").trim();
    if (!input) return null;

    if (input.startsWith("/")) {
        return input;
    }

    if (input.startsWith("file://")) {
        return decodeURIComponent(input.replace(/^file:\/\//, ""));
    }

    if (!input.startsWith("content://")) {
        return null;
    }

    const treePrefix = "content://com.android.externalstorage.documents/tree/";
    if (!input.startsWith(treePrefix)) {
        return null;
    }

    const encodedDocId = input.slice(treePrefix.length).split("/")[0];
    if (!encodedDocId) return null;

    const docId = decodeURIComponent(encodedDocId);
    const colonIndex = docId.indexOf(":");
    if (colonIndex === -1) return null;

    const volume = docId.slice(0, colonIndex);
    const relativePath = docId.slice(colonIndex + 1).replace(/^\/+/, "");

    if (volume === "primary") {
        return relativePath ? `/storage/emulated/0/${relativePath}` : "/storage/emulated/0";
    }

    return relativePath ? `/storage/${volume}/${relativePath}` : `/storage/${volume}`;
};

export const validateMediaDestination = async (rawPath: string): Promise<boolean> => {
    const resolved = normalizeMediaDestination(rawPath);
    if (!resolved) return false;

    const info = await FileSystem.getInfoAsync(`file://${resolved}`);
    return info.exists && Boolean((info as any).isDirectory);
};

export const resolveAndPersistDestination = async ({
    currentDestination,
    settingsKey,
    updateSettings,
    labelPrefix,
    setLoadingTask,
}: {
    currentDestination: string | null | undefined;
    settingsKey: "screenshotDestination" | "clipDestination";
    updateSettings: (settings: any) => Promise<void>;
    labelPrefix: string;
    setLoadingTask: (task: any) => void;
}): Promise<string | null> => {
    let resolvedDest = normalizeMediaDestination(currentDestination || "");
    if (resolvedDest) {
        return resolvedDest;
    }

    try {
        const directory = await Directory.pickDirectoryAsync();
        if (!directory?.uri) {
            setLoadingTask({
                label: "Config Error",
                detail: `${labelPrefix} destination is not set. Change it in Settings.`,
                importance: "SHOW_POPUP",
                dismissAfter: 4000,
            });
            return null;
        }
        resolvedDest = normalizeMediaDestination(directory.uri);
        if (!resolvedDest) {
            setLoadingTask({
                label: "Config Error",
                detail: `${labelPrefix} destination is not valid. Change it in Settings.`,
                importance: "SHOW_POPUP",
                dismissAfter: 4000,
            });
            return null;
        }
        await updateSettings({ [settingsKey]: resolvedDest });
        return resolvedDest;
    } catch (pickerError) {
        console.warn(`[resolveAndPersistDestination] Failed to pick ${labelPrefix} destination`, pickerError);
        setLoadingTask({
            label: "Config Error",
            detail: `${labelPrefix} destination is not valid. Change it in Settings.`,
            importance: "SHOW_POPUP",
            dismissAfter: 4000,
        });
        return null;
    }
};

export const alertIfDestinationInvalid = async ({
    destDir,
    labelPrefix,
    setLoadingTask,
}: {
    destDir: string;
    labelPrefix: string;
    setLoadingTask: (task: any) => void;
}): Promise<boolean> => {
    const destInfo = await FileSystem.getInfoAsync(`file://${destDir}`);
    if (!destInfo.exists || !(destInfo as any).isDirectory) {
        setLoadingTask({
            label: "File Error",
            detail: `${labelPrefix} destination directory not found. Change it in Settings.`,
            importance: "SHOW_POPUP",
            dismissAfter: 4000,
        });
        return false;
    }
    return true;
};
