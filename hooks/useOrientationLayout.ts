import * as ScreenOrientation from "expo-screen-orientation";
import { useWindowDimensions } from "react-native";
import { usePlayerContext } from "@/context/PlayerContext";

export const useOrientationLayout = () => {
    const { width, height } = useWindowDimensions();
    const { orientation } = usePlayerContext();

    if (orientation === ScreenOrientation.OrientationLock.LANDSCAPE) {
        return {
            isLandscape: true,
            width: Math.max(width, height),
            height: Math.min(width, height),
        };
    }
    if (orientation === ScreenOrientation.OrientationLock.PORTRAIT) {
        return {
            isLandscape: false,
            width: Math.min(width, height),
            height: Math.max(width, height),
        };
    }

    return { isLandscape: width > height, width, height };
};
