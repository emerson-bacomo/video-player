import { LinearGradient } from "expo-linear-gradient";
import * as ScreenOrientation from "expo-screen-orientation";
import { ChevronLeft, Cpu, Monitor, Settings, Smartphone } from "lucide-react-native";
import React from "react";
import { Text, TouchableOpacity, View } from "react-native";

interface PlayerHeaderProps {
    title: string;
    onBack: () => void;
    onSettings?: () => void;
    orientation?: ScreenOrientation.OrientationLock;
    onToggleOrientation?: () => void;
    onTitlePress?: () => void;
}

export const PlayerHeader: React.FC<PlayerHeaderProps> = ({ title, onBack, onSettings, orientation, onToggleOrientation, onTitlePress }) => {
    const getOrientationIcon = () => {
        if (orientation === ScreenOrientation.OrientationLock.LANDSCAPE) return <Monitor size={22} color="white" />;
        if (orientation === ScreenOrientation.OrientationLock.PORTRAIT) return <Smartphone size={22} color="white" />;
        return <Cpu size={20} color="white" />;
    };

    return (
        <View className="absolute top-0 left-0 right-0 z-50">
            <LinearGradient
                colors={["rgba(0,0,0,0.8)", "transparent"]}
                className="pt-12 px-4 pb-8 flex-row items-center space-x-1"
            >
                <TouchableOpacity onPress={onBack} className="p-2 pl-0">
                    <ChevronLeft size={28} color="white" />
                </TouchableOpacity>

                <TouchableOpacity className="flex-1 px-1" onPress={onTitlePress} disabled={!onTitlePress}>
                    <Text className="text-white text-base font-bold" numberOfLines={1}>
                        {title}
                    </Text>
                </TouchableOpacity>

                {onToggleOrientation && (
                    <TouchableOpacity onPress={onToggleOrientation} className="p-2 mr-1">
                        {getOrientationIcon()}
                    </TouchableOpacity>
                )}

                <TouchableOpacity onPress={onSettings} className="p-2">
                    <Settings size={22} color="white" />
                </TouchableOpacity>
            </LinearGradient>
        </View>
    );
};
