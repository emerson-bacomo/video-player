import { createContext, useContext, useEffect, useState } from 'react';
import { vars } from 'nativewind';
import * as db from '@/utils/db';
import defaultTheme from '@/constants/theme.json';

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
}

interface ThemeContextType {
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

const normalizeTheme = (colors: Partial<ThemeColors>): ThemeColors => ({
  ...defaultTheme.colors,
  ...colors,
  menu: colors.menu || colors.card || defaultTheme.colors.menu || defaultTheme.colors.card,
});

export const ThemeProvider = ({ children }: { children: React.ReactNode }) => {
  const [theme, setThemeState] = useState<ThemeColors>(normalizeTheme(defaultTheme.colors));
  const [activePresetId, setActivePresetId] = useState<number | null>(null);
  const [presets, setPresets] = useState<any[]>([]);

  const refreshPresets = () => {
    const allPresets = db.getThemePresets();
    setPresets(allPresets);
    const active = allPresets.find((p: any) => p.is_active === 1);
    if (active) {
      setThemeState(normalizeTheme(JSON.parse(active.config)));
      setActivePresetId(active.id);
    } else if (allPresets.length === 0) {
      // First run: save default theme as system default and active
      const id = db.saveThemePreset(defaultTheme.name, JSON.stringify(defaultTheme.colors), 1, 1);
      setActivePresetId(Number(id));
      setPresets(db.getThemePresets());
    }
  };

  useEffect(() => {
    refreshPresets();
  }, []);

  const themeVars = vars({
    '--color-background': theme.background,
    '--color-text': theme.text,
    '--color-primary': theme.primary,
    '--color-secondary': theme.secondary,
    '--color-border': theme.border,
    '--color-card': theme.card,
    '--color-menu': theme.menu,
    '--color-accent': theme.accent,
    '--color-error': theme.error,
    '--color-success': theme.success,
    '--color-tab-active': theme.tabActive,
    '--color-tab-inactive': theme.tabInactive,
  });

  const updateTheme = async (newColors: ThemeColors) => {
    const normalized = normalizeTheme(newColors);
    setThemeState(normalized);
    if (activePresetId !== null) {
      db.updateThemePreset(activePresetId, JSON.stringify(normalized));
    }
  };

  const previewTheme = (newColors: ThemeColors) => {
    setThemeState(normalizeTheme(newColors));
  };

  const switchPreset = (id: number) => {
    const allPresets = db.getThemePresets();
    const preset = allPresets.find((p: any) => p.id === id);
    if (preset) {
      setThemeState(normalizeTheme(JSON.parse(preset.config)));
      setActivePresetId(id);
      db.setActiveThemePreset(id);
      setPresets(allPresets.map(p => ({ ...p, is_active: p.id === id ? 1 : 0 })));
    }
  };

  return (
    <ThemeContext.Provider value={{ theme, updateTheme, previewTheme, switchPreset, activePresetId, themeVars, refreshPresets, presets }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};
