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
import JSZip from "jszip";
import { normalizeMediaDestination } from "@/utils/mediaDestination";
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

export const exportConfig = async (
    currentSettings: any,
    overrideConfig?: ConfigData,
): Promise<{ success: boolean; cancelled?: boolean }> => {
    try {
        addLogDb("INFO", "Export Data", "Starting config export");

        const config = overrideConfig || generateConfigData(currentSettings);
        const json = JSON.stringify(config, null, 2);

        // 2. Create Zip
        const zip = new JSZip();
        zip.file("config.json", json);
        const base64 = await zip.generateAsync({ type: "base64", compression: "DEFLATE" });

        const dateSuffix = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
        const fileName = `config-${dateSuffix}.vpc`;

        // 4. Determine save directory
        let rawDirectoryUri: string | null = getSettingDb("lastExportDirectoryUri");

        if (rawDirectoryUri) {
            try {
                const perms = await FileSystem.StorageAccessFramework.readDirectoryAsync(rawDirectoryUri);
                void perms;
            } catch {
                rawDirectoryUri = "";
                saveSettingDb("lastExportDirectoryUri", "");
            }
        }

        if (!rawDirectoryUri) {
            const result = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
            if (!result.granted) {
                addLogDb("INFO", "Export Data", "Export cancelled by user");
                return { success: false, cancelled: true };
            }

            rawDirectoryUri = result.directoryUri;
            saveSettingDb("lastExportDirectoryUri", rawDirectoryUri);
        }

        // Write via SAF
        const fileContentUri = await FileSystem.StorageAccessFramework.createFileAsync(
            rawDirectoryUri,
            fileName,
            "application/octet-stream",
        );
        await FileSystem.writeAsStringAsync(fileContentUri, base64, { encoding: FileSystem.EncodingType.Base64 });

        // Track in DB
        const displayPath = normalizeMediaDestination(rawDirectoryUri) ?? rawDirectoryUri;
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

export const applyConfigData = async (
    config: ConfigData,
    onSettingsLoaded: (settings: any) => Promise<void>,
    onDataChanged?: () => Promise<void>,
) => {
    // 1. Apply Settings - Merge sparse with defaults
    if (config.settings) {
        try {
            const mergedSettings = { ...DEFAULT_SETTINGS, ...config.settings };

            // Check clipDestination permission if it's a content URI
            if (mergedSettings.clipDestination && mergedSettings.clipDestination.startsWith("content://")) {
                console.log("[Import] Checking permission for clip destination:", mergedSettings.clipDestination);
                let hasPermission = false;
                try {
                    // Try to read directory to check permission
                    await FileSystem.StorageAccessFramework.readDirectoryAsync(mergedSettings.clipDestination);
                    hasPermission = true;
                } catch (e) {
                    hasPermission = false;
                }

                if (!hasPermission) {
                    console.log("[Import] Permission missing for clip destination, asking user...");
                    toast.info("Please grant permission for the imported clip destination.");
                    const result = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync(
                        mergedSettings.clipDestination,
                    );
                    if (result.granted) {
                        mergedSettings.clipDestination = result.directoryUri;
                    } else {
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

    if (onDataChanged) {
        // Small delay to ensure settings are flushed to context/refs
        setTimeout(async () => {
            await onDataChanged();
        }, 100);
    }
};

export const pickAndValidateVpcLegacy = async (assetUri: string): Promise<ConfigData | null> => {
    try {
        const content = await FileSystem.readAsStringAsync(assetUri);
        const config: ConfigData = JSON.parse(content);
        if (!config || !config.settings || !Array.isArray(config.videos) || !Array.isArray(config.albums)) {
            return null;
        }
        return config;
    } catch {
        return null;
    }
};

export const pickAndValidateVpc = async (): Promise<ConfigData | null> => {
    try {
        const result = await DocumentPicker.getDocumentAsync({
            type: ["*/*"],
            copyToCacheDirectory: true,
        });

        if (result.canceled || !result.assets || result.assets.length === 0) {
            return null;
        }

        const asset = result.assets[0];
        const isJson = asset.name.toLowerCase().endsWith(".json");
        const isVpc = asset.name.toLowerCase().endsWith(".vpc");

        if (!isJson && !isVpc) {
            toast.error("Invalid file type. Please select a .vpc or .json file.");
            return null;
        }

        // Try as Zip first (New Format)
        try {
            const contentBase64 = await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.Base64 });
            const zip = await JSZip.loadAsync(contentBase64, { base64: true });
            const configFile = zip.file("config.json");

            if (configFile) {
                const content = await configFile.async("string");
                const config: ConfigData = JSON.parse(content);
                if (config && config.settings) return config;
            }
        } catch (e) {
            // Not a zip, continue to legacy check
        }

        // Fallback to Legacy JSON
        const legacyConfig = await pickAndValidateVpcLegacy(asset.uri);
        if (legacyConfig) {
            if (isVpc) toast.info("Imported legacy .vpc format");
            return legacyConfig;
        }

        toast.error("Invalid file content.");
        return null;
    } catch (error: any) {
        toast.error("Failed to read file: " + error.message);
        return null;
    }
};
