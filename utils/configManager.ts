import {
    DEFAULT_OPENED_TIME,
    DEFAULT_PLAYED_SEC,
    DEFAULT_SETTINGS,
    DEFAULT_SORT_SCOPE,
    DEFAULT_SORT_TYPE,
} from "@/constants/defaults";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import { toast } from "sonner-native";
import { normalizeClipDestination } from "./clipDestination";
import {
    addLogDb,
    addVpcExportDb,
    db,
    getSettingDb,
    getThemePresetsDb,
    savePendingMediaDataDb,
    saveSettingDb,
    saveThemePresetDb,
    updateThemePresetDb,
} from "./db";

let pendingImportData: ConfigData | null = null;

export const setPendingImportData = (data: ConfigData | null) => {
    pendingImportData = data;
};

export const getPendingImportData = () => pendingImportData;

export interface ConfigData {
    settings: any;
    themes: any[];
    videos: {
        uri: string;
        lastPlayedSec?: number;
        lastOpenedTime?: number;
        isHidden?: boolean;
        markers?: any[];
    }[];
    albums: {
        uri: string;
        videoSortType?: string | null;
        videoSortSettingScope?: string;
        isHidden?: boolean;
    }[];
}

export const generateConfigData = (currentSettings: any): ConfigData => {
    // 0. Sparse Settings - Only export what changed from defaults
    const sparseSettings: any = {};
    Object.entries(currentSettings).forEach(([key, value]) => {
        const defaultValue = (DEFAULT_SETTINGS as any)[key];
        // For simple values and empty arrays/objects, we can do a basic compare
        if (JSON.stringify(value) !== JSON.stringify(defaultValue)) {
            sparseSettings[key] = value;
        }
    });

    // 1. Collect Themes
    const themes = getThemePresetsDb();

    // 2. Collect Videos - Filter only those with actual metadata changes
    const allVideos = db.getAllSync<any>("SELECT uri, lastPlayedSec, lastOpenedTime, isHidden, markers FROM videos");
    const filteredVideos = allVideos
        .map((v) => {
            const out: any = { uri: v.uri };
            const markers = v.markers ? JSON.parse(v.markers) : [];

            if (!!v.isHidden) out.isHidden = true;
            if (v.lastPlayedSec !== DEFAULT_PLAYED_SEC) out.lastPlayedSec = v.lastPlayedSec;
            if (v.lastOpenedTime !== DEFAULT_OPENED_TIME) out.lastOpenedTime = v.lastOpenedTime;
            if (markers.length > 0) out.markers = markers;

            return out;
        })
        .filter((v) => Object.keys(v).length > 1); // Only those with more than just 'uri'

    // 3. Collect Albums - Filter only those with custom settings
    const allAlbums = db.getAllSync<any>("SELECT uri, videoSortType, videoSortSettingScope, isHidden FROM albums");
    const filteredAlbums = allAlbums
        .map((a) => {
            const out: any = { uri: a.uri };

            if (!!a.isHidden) out.isHidden = true;
            if (a.videoSortSettingScope !== DEFAULT_SORT_SCOPE) out.videoSortSettingScope = a.videoSortSettingScope;
            if (a.videoSortType !== DEFAULT_SORT_TYPE) out.videoSortType = a.videoSortType;

            return out;
        })
        .filter((a) => Object.keys(a).length > 1); // Only those with more than just 'uri'

    return {
        settings: sparseSettings,
        themes,
        videos: filteredVideos,
        albums: filteredAlbums,
    };
};

export const exportConfig = async (currentSettings: any): Promise<{ success: boolean; cancelled?: boolean }> => {
    try {
        addLogDb("INFO", "Export Data", "Starting config export");

        const config = generateConfigData(currentSettings);

        const json = JSON.stringify(config, null, 2);
        const dateSuffix = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
        const fileName = `config-${dateSuffix}.vpc`;

        // 4. Determine save directory — store the raw SAF tree URI, NOT the normalized file path
        let rawDirectoryUri: string | null = getSettingDb("lastExportDirectoryUri");

        if (rawDirectoryUri) {
            try {
                // Validate the SAF tree is still accessible
                const perms = await FileSystem.StorageAccessFramework.readDirectoryAsync(rawDirectoryUri);
                void perms; // just checking it doesn't throw
            } catch {
                rawDirectoryUri = "";
                saveSettingDb("lastExportDirectoryUri", "");
            }
        }

        if (!rawDirectoryUri) {
            // Use the legacy SAF picker — it returns a guaranteed content:// tree URI
            // compatible with createFileAsync. The new Directory.pickDirectoryAsync() may
            // return a file:// URI which breaks the SAF write flow.
            const result = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
            if (!result.granted) {
                addLogDb("INFO", "Export Data", "Export cancelled by user");
                return { success: false, cancelled: true };
            }

            rawDirectoryUri = result.directoryUri;
            saveSettingDb("lastExportDirectoryUri", rawDirectoryUri);
            addLogDb("INFO", "Export Data", "Saved new export directory", rawDirectoryUri);
        }

        // Write via SAF — createFileAsync returns a writable content:// document URI
        const fileContentUri = await FileSystem.StorageAccessFramework.createFileAsync(
            rawDirectoryUri,
            fileName,
            "application/json",
        );
        await FileSystem.writeAsStringAsync(fileContentUri, json);

        // Track in DB with whatever display path we have
        const displayPath = normalizeClipDestination(rawDirectoryUri) ?? rawDirectoryUri;
        const trackingPath = `${displayPath}/${fileName}`;
        addVpcExportDb(trackingPath, fileName, json);

        addLogDb("INFO", "Export Data", "Config exported successfully", trackingPath);
        return { success: true };
    } catch (error: any) {
        addLogDb("ERROR", "Export Data", "Failed to export config", error.message);
        console.error("Export failed", error);
        return { success: false };
    }
};

export const applyConfigData = async (config: ConfigData, onSettingsLoaded: (settings: any) => Promise<void>) => {
    // 1. Apply Settings - Merge sparse with defaults
    if (config.settings) {
        try {
            const mergedSettings = { ...DEFAULT_SETTINGS, ...config.settings };

            // Check clipDestination permission if it's a content URI
            if (mergedSettings.clipDestination && mergedSettings.clipDestination.startsWith("content://")) {
                try {
                    // Try to read directory to check permission
                    await FileSystem.StorageAccessFramework.readDirectoryAsync(mergedSettings.clipDestination);
                } catch (e) {
                    console.log("[Import] Permission missing for clip destination, asking user...");
                    const result = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync(
                        mergedSettings.clipDestination,
                    );
                    if (result.granted) {
                        mergedSettings.clipDestination = result.directoryUri;
                    } else {
                        // User denied, maybe reset it or keep as is (will fail later)
                        toast.error("Permission denied for clip destination. It may not work until updated in settings.");
                    }
                }
            }

            await onSettingsLoaded(mergedSettings);
            addLogDb("INFO", "Import Data", "Applied settings from config");
        } catch (error: any) {
            addLogDb("ERROR", "Import Data", "Failed to apply settings", error.message);
        }
    }

    // 2. Apply Themes
    if (config.themes) {
        try {
            for (const theme of config.themes) {
                const existing = db.getFirstSync<any>("SELECT id FROM theme_presets WHERE name = ?", [theme.name]);
                if (existing) {
                    updateThemePresetDb(existing.id, theme.config, theme.name);
                } else {
                    saveThemePresetDb(theme.name, theme.config, theme.is_active, theme.is_system);
                }
            }
            addLogDb("INFO", "Import Data", `Imported ${config.themes.length} themes`);
        } catch (error: any) {
            addLogDb("ERROR", "Import Data", "Failed to apply themes", error.message);
        }
    }

    // 3. Apply Media Data
    if (config.videos) {
        try {
            for (const vConfig of config.videos) {
                if (!vConfig.uri) continue;

                const existing = db.getFirstSync<any>("SELECT id FROM videos WHERE uri = ?", [vConfig.uri]);

                const lastPlayedSec = vConfig.lastPlayedSec ?? DEFAULT_PLAYED_SEC;
                const lastOpenedTime = vConfig.lastOpenedTime ?? DEFAULT_OPENED_TIME;
                const isHidden = vConfig.isHidden ?? false;
                const markers = vConfig.markers ?? [];

                if (existing) {
                    const stmt = db.prepareSync(`
                        UPDATE videos 
                        SET lastPlayedSec = ?, lastOpenedTime = ?, isHidden = ?, markers = ? 
                        WHERE id = ?
                    `);
                    stmt.executeSync([lastPlayedSec, lastOpenedTime, isHidden ? 1 : 0, JSON.stringify(markers), existing.id]);
                } else {
                    // Store as pending
                    savePendingMediaDataDb(vConfig.uri, "video", {
                        lastPlayedSec,
                        lastOpenedTime,
                        isHidden,
                        markers,
                    });
                }
            }
            addLogDb("INFO", "Import Data", `Processed ${config.videos.length} video configs`);
        } catch (error: any) {
            addLogDb("ERROR", "Import Data", "Failed to apply video data", error.message);
        }
    }

    if (config.albums) {
        try {
            for (const aConfig of config.albums) {
                if (!aConfig.uri) continue;

                const existing = db.getFirstSync<any>("SELECT id FROM albums WHERE uri = ?", [aConfig.uri]);

                const videoSortType = aConfig.videoSortType ?? DEFAULT_SORT_TYPE;
                const videoSortSettingScope = aConfig.videoSortSettingScope ?? DEFAULT_SORT_SCOPE;
                const isHidden = aConfig.isHidden ?? false;

                if (existing) {
                    const stmt = db.prepareSync(`
                        UPDATE albums 
                        SET videoSortType = ?, videoSortSettingScope = ?, isHidden = ? 
                        WHERE id = ?
                    `);
                    stmt.executeSync([videoSortType, videoSortSettingScope, isHidden ? 1 : 0, existing.id]);
                } else {
                    // Store as pending
                    savePendingMediaDataDb(aConfig.uri, "album", {
                        videoSortType,
                        videoSortSettingScope,
                        isHidden,
                    });
                }
            }
            addLogDb("INFO", "Import Data", `Processed ${config.albums.length} album configs`);
        } catch (error: any) {
            addLogDb("ERROR", "Import Data", "Failed to apply album data", error.message);
        }
    }
};


export const pickAndValidateVpc = async (): Promise<ConfigData | null> => {
    try {
        const result = await DocumentPicker.getDocumentAsync({
            type: "*/*",
            copyToCacheDirectory: true,
        });

        if (result.canceled || !result.assets || result.assets.length === 0) {
            return null;
        }

        const asset = result.assets[0];
        // if (!asset.name.toLowerCase().endsWith(".vpc")) {
        //     toast.error("Invalid file type. Please select a .vpc file.");
        //     return null;
        // }

        const content = await FileSystem.readAsStringAsync(asset.uri);
        const config: ConfigData = JSON.parse(content);

        if (!config || !config.settings || !Array.isArray(config.videos) || !Array.isArray(config.albums)) {
            toast.error("Invalid .vpc file content.");
            return null;
        }

        return config;
    } catch (error: any) {
        toast.error("Failed to read file: " + error.message);
        return null;
    }
};

export const importConfig = async (
    onSettingsLoaded: (settings: any) => Promise<void>,
): Promise<{ success: boolean; cancelled?: boolean }> => {
    // Legacy support or direct import if needed
    const config = await pickAndValidateVpc();
    if (!config) return { success: false, cancelled: true };

    await applyConfigData(config, onSettingsLoaded);
    return { success: true };
};

