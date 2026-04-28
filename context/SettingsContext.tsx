import { DEFAULT_SETTINGS, Settings } from "@/constants/defaults";
import { addLogDb } from "@/utils/db";
import * as FileSystem from "expo-file-system/legacy";
import React, { createContext, useCallback, useContext, useEffect, useState } from "react";

const SETTINGS_FILE = `${FileSystem.documentDirectory}settings.json`;

export type Orientation = "landscape" | "portrait" | "system";
export type CornerPosition = "top-left" | "top-right" | "bottom-left" | "bottom-right";

export interface PlayerOperation {
    id: string;
    type: "seek" | "custom";
    value: number;
    iconName: string;
    label: string;
}

interface SettingsContextType {
    settings: Settings;
    updateSettings: (newSettings: Partial<Settings>) => Promise<void>;
    loading: boolean;
    refreshSettings: () => Promise<void>;
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export const SettingsProvider = ({ children }: { children: React.ReactNode }) => {
    const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
    const [loading, setLoading] = useState(true);

    const loadSettings = useCallback(async () => {
        try {
            const info = await FileSystem.getInfoAsync(SETTINGS_FILE);
            if (info.exists) {
                const content = await FileSystem.readAsStringAsync(SETTINGS_FILE);
                setSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(content) });
            }
        } catch (e) {
            console.warn("Failed to load settings", e);
        } finally {
            setLoading(false);
        }
    }, []);

    const updateSettings = useCallback(async (newSettings: Partial<Settings>) => {
        try {
            setSettings((prev) => {
                const updated = { ...prev, ...newSettings };
                FileSystem.writeAsStringAsync(SETTINGS_FILE, JSON.stringify(updated));

                // Log changes
                Object.keys(newSettings).forEach((key) => {
                    const val = (newSettings as any)[key];
                    addLogDb("INFO", "Change Setting", `Setting updated: ${key}`, val);
                });

                return updated;
            });
        } catch (e) {
            console.error("Failed to save settings", e);
            addLogDb("ERROR", "Change Setting", "Failed to save settings", e);
        }
    }, []);

    useEffect(() => {
        loadSettings();
    }, [loadSettings]);

    const contextValue = React.useMemo(
        () => ({
            settings,
            updateSettings,
            loading,
            refreshSettings: loadSettings,
        }),
        [settings, updateSettings, loading, loadSettings],
    );

    return <SettingsContext.Provider value={contextValue}>{children}</SettingsContext.Provider>;
};

export const useSettingsContext = () => {
    const context = useContext(SettingsContext);
    if (context === undefined) {
        throw new Error("useSettingsContext must be used within a SettingsProvider");
    }
    return context;
};
