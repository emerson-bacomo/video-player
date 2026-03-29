import { useState, useEffect } from 'react';
import * as FileSystem from 'expo-file-system/legacy';

const SETTINGS_FILE = `${FileSystem.documentDirectory}settings.json`;

export type Orientation = 'landscape' | 'portrait' | 'auto';

export interface Settings {
  clipDestination: string;
  defaultOrientation: Orientation;
}

const DEFAULT_SETTINGS: Settings = {
  clipDestination: '/storage/emulated/0/DCIM/Clips',
  defaultOrientation: 'auto',
};

export const useSettings = () => {
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
      console.warn('Failed to load settings', e);
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
      console.error('Failed to save settings', e);
    }
  };

  useEffect(() => {
    loadSettings();
  }, []);

  return { settings, updateSettings, loading };
};
