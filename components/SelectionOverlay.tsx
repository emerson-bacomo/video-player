import { useTheme } from "@/context/ThemeContext";
import { CheckCircle, Circle } from "lucide-react-native";
import React from "react";
import { View } from "react-native";
import { Icon } from "./Icon";

interface SelectionOverlayProps {
    isSelected: boolean;
    size?: number;
}

export const SelectionOverlay = ({ isSelected, size = 24 }: SelectionOverlayProps) => {
    const { colors } = useTheme();

    return (
        <>
            <View
                className="absolute top-2 left-2 z-10 rounded-full justify-center items-center"
                style={{
                    width: size + 1,
                    height: size + 1,
                    borderWidth: 0.5,
                    borderColor: isSelected ? "rgba(255, 255, 255, 0.25)" : "rgba(0,0,0,0.1)",
                    backgroundColor: isSelected ? "transparent" : "rgba(0,0,0,0.05)",
                    elevation: isSelected ? 12 : 0,
                    shadowColor: isSelected ? colors.primary : "#000",
                    shadowOffset: { width: 0, height: 0 },
                    shadowOpacity: isSelected ? 0.6 : 0,
                    shadowRadius: isSelected ? 6 : 0,
                }}
            >
                <Icon icon={isSelected ? CheckCircle : Circle} size={size} color={isSelected ? colors.primary : "#fff"} />
            </View>
            {isSelected && <View className="absolute inset-0 bg-primary/15" pointerEvents="none" />}
        </>
    );
};
