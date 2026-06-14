import * as ScreenOrientation from "expo-screen-orientation";
import { useEffect } from "react";
import { usePlayerContext } from "../context/PlayerContext";

export const useOrientationLock = () => {
    const { orientation } = usePlayerContext();

    useEffect(() => {
        const lock = async () => {
            try {
                if (orientation === ScreenOrientation.OrientationLock.LANDSCAPE) {
                    await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
                } else if (orientation === ScreenOrientation.OrientationLock.PORTRAIT) {
                    await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT);
                } else {
                    await ScreenOrientation.unlockAsync();
                }
            } catch (e) {
                console.warn("[useOrientationLock] Failed to lock orientation:", e);
            }
        };

        lock();

        return () => {
            ScreenOrientation.unlockAsync().catch(() => {});
        };
    }, [orientation]);
};
