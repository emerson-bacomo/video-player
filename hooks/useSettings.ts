import { useEffect, useRef } from "react";
import { useSettingsContext } from "../context/SettingsContext";

export const useSettings = () => {
    const { settings, updateSettings, loading, refreshSettings } = useSettingsContext();

    const settingsRef = useRef(settings);
    useEffect(() => {
        settingsRef.current = settings;
    }, [settings]);

    return { settings, updateSettings, loading, refreshSettings, settingsRef };
};
