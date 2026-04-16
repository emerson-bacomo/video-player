import { useSettingsContext } from '../context/SettingsContext';
export type { Orientation, Settings } from '../context/SettingsContext';

export const useSettings = () => {
  const { settings, updateSettings, loading, refreshSettings } = useSettingsContext();
  return { settings, updateSettings, loading, refreshSettings };
};
