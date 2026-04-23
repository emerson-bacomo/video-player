import defaultTheme from "@/constants/theme.json";
import { getThemePresetsDb, saveThemePresetDb, setActiveThemePresetDb, updateThemePresetDb } from "@/utils/db";
import { vars } from "nativewind";
import { createContext, useContext, useEffect, useMemo, useState } from "react";

export interface ThemeColors {
    background: string;
    text: string;
    primary: string;
    secondary: string;
    border: string;
    card: string;
    menu: string;
    accent: string;
    error: string;
    success: string;
    tabActive: string;
    tabInactive: string;
    playerBackground: string;
}

interface ThemeContextType {
    colors: ThemeColors;
    theme: ThemeColors;
    updateTheme: (newColors: ThemeColors) => Promise<void>;
    previewTheme: (newColors: ThemeColors) => void;
    switchPreset: (id: number) => void;
    activePresetId: number | null;
    themeVars: any;
    refreshPresets: () => void;
    presets: any[];
}

export const ThemeContext = createContext<ThemeContextType | null>(null);

const hexToRgb = (hex: string) => {
    // Handle both 6-digit (#RRGGBB) and 8-digit (#RRGGBBAA) hex
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})?$/i.exec(hex);
    if (!result) return "0 0 0";
    return `${parseInt(result[1], 16)} ${parseInt(result[2], 16)} ${parseInt(result[3], 16)}`;
};

const normalizeTheme = (colors: Partial<ThemeColors>): ThemeColors => ({
    ...defaultTheme.colors,
    ...colors,
    menu: colors.menu || colors.card || defaultTheme.colors.menu || defaultTheme.colors.card,
    playerBackground: colors.playerBackground || "#000000",
});

export const ThemeProvider = ({ children }: { children: React.ReactNode }) => {
    const [colors, setColorsState] = useState<ThemeColors>(normalizeTheme(defaultTheme.colors));
    const [activePresetId, setActivePresetId] = useState<number | null>(null);
    const [presets, setPresets] = useState<any[]>([]);

    const refreshPresets = () => {
        let allPresets = getThemePresetsDb();

        // Sync theme.json with database if it's a system theme
        const systemTheme = allPresets.find((p: any) => p.is_system === 1 && p.name === defaultTheme.name);
        if (systemTheme) {
            const currentConfig = JSON.stringify(defaultTheme.colors);
            if (systemTheme.config !== currentConfig) {
                updateThemePresetDb(systemTheme.id, currentConfig);
                allPresets = getThemePresetsDb(); // refresh after update
            }
        }

        setPresets(allPresets);
        const active = allPresets.find((p: any) => p.is_active === 1);
        if (active) {
            setColorsState(normalizeTheme(JSON.parse(active.config)));
            setActivePresetId(active.id);
        } else if (allPresets.length === 0) {
            const id = saveThemePresetDb(defaultTheme.name, JSON.stringify(defaultTheme.colors), 1, 1);
            setActivePresetId(Number(id));
            setPresets(getThemePresetsDb());
        }
    };

    useEffect(() => {
        refreshPresets();
    }, []);

    const themeVars = useMemo(() => {
        return vars(
            Object.entries(colors).reduce((acc, [key, value]) => {
                const baseKey = key.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
                const cssKey = `--color-${baseKey}`;
                const rgbKey = `--color-${baseKey}-rgb`;

                acc[cssKey as any] = value;
                acc[rgbKey as any] = hexToRgb(value);
                return acc;
            }, {} as any),
        );
    }, [colors]);

    const theme = useMemo(() => {
        return Object.keys(colors).reduce((acc, key) => {
            const cssKey = `--color-${key.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase()}`;
            acc[key as keyof ThemeColors] = `var(${cssKey})` as any;
            return acc;
        }, {} as ThemeColors);
    }, [colors]);

    const updateTheme = async (newColors: ThemeColors) => {
        const normalized = normalizeTheme(newColors);
        setColorsState(normalized);
        if (activePresetId !== null) {
            updateThemePresetDb(activePresetId, JSON.stringify(normalized));
        }
    };

    const previewTheme = (newColors: ThemeColors) => {
        setColorsState(normalizeTheme(newColors));
    };

    const switchPreset = (id: number) => {
        const allPresets = getThemePresetsDb();
        const preset = allPresets.find((p: any) => p.id === id);
        if (preset) {
            setColorsState(normalizeTheme(JSON.parse(preset.config)));
            setActivePresetId(id);
            setActiveThemePresetDb(id);
            setPresets(allPresets.map((p) => ({ ...p, is_active: p.id === id ? 1 : 0 })));
        }
    };

    return (
        <ThemeContext.Provider
            value={{ colors, theme, updateTheme, previewTheme, switchPreset, activePresetId, themeVars, refreshPresets, presets }}
        >
            {children}
        </ThemeContext.Provider>
    );
};

export const useTheme = () => {
    const context = useContext(ThemeContext);
    if (!context) {
        throw new Error("useTheme must be used within a ThemeProvider");
    }
    return context;
};
