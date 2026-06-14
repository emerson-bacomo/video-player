import * as ScreenOrientation from "expo-screen-orientation";
import { Cpu, Monitor, Smartphone } from "lucide-react-native";
import React from "react";
import { TouchableOpacity } from "react-native";
import { usePlayerContext } from "../context/PlayerContext";

export type OrientationMode = "portrait" | "landscape" | "default";

export const PlayerOrientationButton: React.FC = () => {
    const { orientation, setSessionOrientation } = usePlayerContext();

    const toggleOrientation = async () => {
        let nextLock;
        if (orientation === ScreenOrientation.OrientationLock.DEFAULT) {
            nextLock = ScreenOrientation.OrientationLock.LANDSCAPE;
        } else if (orientation === ScreenOrientation.OrientationLock.LANDSCAPE) {
            nextLock = ScreenOrientation.OrientationLock.PORTRAIT;
        } else {
            nextLock = ScreenOrientation.OrientationLock.DEFAULT;
        }
        setSessionOrientation(nextLock);
    };

    const getOrientationIcon = () => {
        if (orientation === ScreenOrientation.OrientationLock.LANDSCAPE) return <Monitor size={22} color="white" />;
        if (orientation === ScreenOrientation.OrientationLock.PORTRAIT) return <Smartphone size={22} color="white" />;
        return <Cpu size={20} color="white" />;
    };

    return (
        <TouchableOpacity onPress={toggleOrientation} className="p-2">
            {getOrientationIcon()}
        </TouchableOpacity>
    );
};
