import { useSettings } from "@/hooks/useSettings";
import React, { createContext, useContext, useState } from "react";
import * as ScreenOrientation from "expo-screen-orientation";

interface PlaybackContextType {
    sessionOrientation: ScreenOrientation.OrientationLock | null;
    setSessionOrientation: (lock: ScreenOrientation.OrientationLock | null) => void;
}

const PlaybackContext = createContext<PlaybackContextType | undefined>(undefined);

export const PlaybackProvider = ({ children }: { children: React.ReactNode }) => {
    const [sessionOrientation, setSessionOrientation] = useState<ScreenOrientation.OrientationLock | null>(null);

    return (
        <PlaybackContext.Provider value={{ sessionOrientation, setSessionOrientation }}>
            {children}
        </PlaybackContext.Provider>
    );
};

export const usePlayback = () => {
    const context = useContext(PlaybackContext);
    const { settings } = useSettings();

    if (!context) {
        throw new Error("usePlayback must be used within a PlaybackProvider");
    }

    const orientation =
        context.sessionOrientation ??
        (settings.defaultOrientation === "landscape"
            ? ScreenOrientation.OrientationLock.LANDSCAPE
            : settings.defaultOrientation === "portrait"
              ? ScreenOrientation.OrientationLock.PORTRAIT
              : ScreenOrientation.OrientationLock.DEFAULT);

    return {
        ...context,
        orientation,
    };
};
