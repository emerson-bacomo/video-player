import React, { useState } from "react";
import { ActivityIndicator, Text, TouchableOpacity, TouchableOpacityProps, View } from "react-native";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/utils/cn";

const buttonVariants = cva(
    "relative overflow-hidden items-center justify-center rounded-xl",
    {
        variants: {
            variant: {
                primary: "bg-primary",
                secondary: "bg-zinc-800",
                outline: "border border-zinc-800 bg-transparent",
                ghost: "bg-transparent",
                danger: "bg-red-600",
                success: "bg-green-600",
                warning: "bg-yellow-600",
            },
            size: {
                default: "py-4 px-6",
                sm: "py-2 px-4",
                lg: "py-5 px-8",
                icon: "p-3",
            },
        },
        defaultVariants: {
            variant: "primary",
            size: "default",
        },
    }
);

const buttonTextVariants = cva(
    "font-bold text-base",
    {
        variants: {
            variant: {
                primary: "text-white",
                secondary: "text-zinc-300",
                outline: "text-zinc-300",
                ghost: "text-zinc-400",
                danger: "text-white",
                success: "text-white",
                warning: "text-white",
            },
            size: {
                default: "text-base",
                sm: "text-sm",
                lg: "text-lg",
                icon: "text-base",
            },
        },
        defaultVariants: {
            variant: "primary",
            size: "default",
        },
    }
);

export interface ButtonProps 
    extends Omit<TouchableOpacityProps, "onPress">,
    VariantProps<typeof buttonVariants> {
    title?: string;
    onPress: (setLoading: React.Dispatch<React.SetStateAction<boolean>>) => void;
    textClassName?: string;
    textStyle?: any;
    loading?: boolean;
    putStyleOnDisabled?: boolean;
    children?: React.ReactNode;
}

/**
 * A premium button component that handles its own internal loading state.
 * When loading, it displays a darkening overlay and a centered activity indicator.
 */
export const Button = ({
    title,
    onPress,
    className,
    textClassName,
    textStyle,
    loading,
    variant,
    size,
    putStyleOnDisabled = true,
    disabled,
    children,
    ...props
}: ButtonProps) => {
    const [isLoading, setIsLoading] = useState(false);
    const effectiveLoading = loading ?? isLoading;
    const isDisabled = !!disabled || effectiveLoading;

    const handlePress = async () => {
        if (effectiveLoading) return;
        onPress(setIsLoading);
    };

    return (
        <TouchableOpacity
            activeOpacity={0.8}
            onPress={handlePress}
            disabled={isDisabled}
            className={cn(
                buttonVariants({ variant, size, className }),
                putStyleOnDisabled && isDisabled ? "opacity-60" : "",
            )}
            {...props}
        >
            {children ? children : (
                <Text 
                    className={cn(buttonTextVariants({ variant, size }), textClassName)} 
                    style={textStyle}
                >
                    {title}
                </Text>
            )}

            {effectiveLoading && (
                <View className="absolute inset-0 bg-black/30 justify-center items-center z-10">
                    <ActivityIndicator size="small" color="white" />
                </View>
            )}
        </TouchableOpacity>
    );
};
