import React, { useState } from "react";
import { ActivityIndicator, Text, TouchableOpacity, TouchableOpacityProps, View } from "react-native";

import { cn } from "../lib/utils";

interface ButtonProps extends Omit<TouchableOpacityProps, "onPress"> {
    title: string;
    onPress: (setLoading: React.Dispatch<React.SetStateAction<boolean>>) => void;
    textClassName?: string;
}

/**
 * A premium button component that handles its own internal loading state.
 * When loading, it displays a darkening overlay and a centered activity indicator.
 */
export const Button = ({ title, onPress, className, textClassName, ...props }: ButtonProps) => {
    const [isLoading, setIsLoading] = useState(false);

    const handlePress = async () => {
        onPress(setIsLoading);
    };

    return (
        <TouchableOpacity
            activeOpacity={0.8}
            onPress={handlePress}
            disabled={isLoading}
            className={cn("relative overflow-hidden items-center justify-center", className)}
            {...props}
        >
            <Text className={cn("text-white font-bold text-base", textClassName)}>{title}</Text>

            {isLoading && (
                <View className="absolute inset-0 bg-black/30 justify-center items-center z-10">
                    <ActivityIndicator size="small" color="white" />
                </View>
            )}
        </TouchableOpacity>
    );
};
