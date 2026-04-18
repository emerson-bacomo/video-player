import * as FileSystem from "expo-file-system/legacy";
import React, { createContext, useContext, useEffect, useState } from "react";

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

export interface Settings {
    clipDestination: string;
    defaultOrientation: Orientation;
    brightnessSensitivity: number;
    nameReplacements: { find: string; replace: string; active: boolean }[];
    cornerConfigs: Record<CornerPosition, (PlayerOperation | null)[]>;
    timeDisplayMode: "elapsed" | "remaining";
    autoPlayOnEnd: boolean;
    autoPlaySimilarPrefixOnly: boolean;
    doubleTapSeekAmount: number;
}

const DEFAULT_SETTINGS: Settings = {
    clipDestination: "/storage/emulated/0/DCIM/Clips",
    defaultOrientation: "system",
    brightnessSensitivity: 1.0,
    nameReplacements: [],
    cornerConfigs: {
        "top-left": [null, null, null, null],
        "top-right": [null, null, null, null],
        "bottom-left": [null, null, null, null],
        "bottom-right": [null, null, null, null],
    },
    timeDisplayMode: "elapsed",
    autoPlayOnEnd: true,
    autoPlaySimilarPrefixOnly: true,
    doubleTapSeekAmount: 5,
};

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

    const loadSettings = async () => {
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
    };

    const updateSettings = async (newSettings: Partial<Settings>) => {
        try {
            const updated = { ...settings, ...newSettings };
            setSettings(updated);
            await FileSystem.writeAsStringAsync(SETTINGS_FILE, JSON.stringify(updated));
        } catch (e) {
            console.error("Failed to save settings", e);
        }
    };

    useEffect(() => {
        loadSettings();
    }, []);

    return (
        <SettingsContext.Provider value={{ settings, updateSettings, loading, refreshSettings: loadSettings }}>
            {children}
        </SettingsContext.Provider>
    );
};

export const useSettingsContext = () => {
    const context = useContext(SettingsContext);
    if (context === undefined) {
        throw new Error("useSettingsContext must be used within a SettingsProvider");
    }
    return context;
};
