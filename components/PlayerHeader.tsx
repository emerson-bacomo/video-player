import { LinearGradient } from "expo-linear-gradient";
import { ChevronLeft, ScreenShare, Settings, Unlock } from "lucide-react-native";
import React from "react";
import { Text, TouchableOpacity, View } from "react-native";

interface PlayerHeaderProps {
    title: string;
    onBack: () => void;
    onSettings?: () => void;
}

export const PlayerHeader: React.FC<PlayerHeaderProps> = ({ title, onBack, onSettings }) => {
    return (
        <View className="absolute top-0 left-0 right-0 z-50">
            <LinearGradient
                colors={["rgba(0,0,0,0.8)", "transparent"]}
                className="px-4 pt-12 pb-8 flex-row items-center space-x-4"
            >
                <TouchableOpacity onPress={onBack}>
                    <ChevronLeft size={28} color="white" />
                </TouchableOpacity>

                <View className="flex-1">
                    <Text className="text-white text-lg font-bold" numberOfLines={1}>
                        {title}
                    </Text>
                </View>

                <TouchableOpacity className="p-2">
                    <ScreenShare size={24} color="white" />
                </TouchableOpacity>

                <TouchableOpacity className="p-2">
                    <Unlock size={24} color="white" />
                </TouchableOpacity>

                <TouchableOpacity onPress={onSettings} className="p-2">
                    <Settings size={24} color="white" />
                </TouchableOpacity>
            </LinearGradient>
        </View>
    );
};
