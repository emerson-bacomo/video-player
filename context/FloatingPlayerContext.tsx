import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { getSettingDb, saveSettingDb } from "../utils/db";

export interface LastPlayedVideo {
    id: string;
}

interface FloatingPlayerContextType {
    lastPlayed: LastPlayedVideo | null;
    showFloater: boolean;
    saveLastPlayed: (v: LastPlayedVideo) => void;
    dismissFloater: () => void;
}

const FloatingPlayerContext = createContext<FloatingPlayerContextType>({
    lastPlayed: null,
    showFloater: false,
    saveLastPlayed: () => {},
    dismissFloater: () => {},
});

export const useFloatingPlayer = () => useContext(FloatingPlayerContext);

export const FloatingPlayerProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [lastPlayed, setLastPlayed] = useState<LastPlayedVideo | null>(null);
    const [showFloater, setShowFloater] = useState(false);

    // Rehydrate from DB on startup
    useEffect(() => {
        try {
            const raw = getSettingDb("floatingPlayerVideo");
            if (raw) {
                setLastPlayed(JSON.parse(raw));
                setShowFloater(true);
            }
        } catch {}
    }, []);
    const saveLastPlayed = useCallback((v: LastPlayedVideo) => {
        setLastPlayed(v);
        setShowFloater(true);
        saveSettingDb("floatingPlayerVideo", JSON.stringify(v));
    }, []);

    const dismissFloater = useCallback(() => {
        setShowFloater(false);
    }, []);

    return (
        <FloatingPlayerContext.Provider value={{ lastPlayed, showFloater, saveLastPlayed, dismissFloater }}>
            {children}
        </FloatingPlayerContext.Provider>
    );
};
