import React, { useEffect, useState } from "react";
import type { FC } from "react";
import { View, Text, Pressable, useWindowDimensions } from "react-native";
import { Portal } from "react-native-portalize";
import Animated, { useSharedValue, useAnimatedStyle, withTiming, withDelay, Easing } from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";

interface ScreenshotOverlayProps {
    visible: boolean;
    imageUri: string | null;
    filepath: string | null;
    onDismiss: () => void;
}

export const ScreenshotOverlay: FC<ScreenshotOverlayProps> = ({ visible, imageUri, filepath, onDismiss }) => {
    const { width, height } = useWindowDimensions();
    const [renderImage, setRenderImage] = useState(false);

    const opacity = useSharedValue(0);
    const scale = useSharedValue(1);
    const bgOpacity = useSharedValue(0);
    const textOpacity = useSharedValue(0);

    const startAnimation = () => {
        // Reset values
        opacity.value = 1;
        scale.value = 1;
        bgOpacity.value = 0;
        textOpacity.value = 0;

        // Sequence:
        // 1. Instant appearance of full screen image (opacity = 1, scale = 1)
        // 2. Darken background
        bgOpacity.value = withTiming(0.7, { duration: 300 });

        // 3. Descale after a short wait
        scale.value = withDelay(400, withTiming(0.85, { duration: 400, easing: Easing.bezier(0.25, 0.1, 0.25, 1) }));

        // 4. Fade in text after descaling
        textOpacity.value = withDelay(800, withTiming(1, { duration: 300 }));

        // 5. Fade out everything after a few seconds
        const hideDuration = 300;
        opacity.value = withDelay(
            3000,
            withTiming(0, { duration: hideDuration }, (finished) => {
                if (finished) {
                    scheduleOnRN(onDismiss);
                }
            }),
        );
    };

    const handleEarlyDismiss = () => {
        // Speed up fade out
        opacity.value = withTiming(0, { duration: 200 }, (finished) => {
            if (finished) {
                scheduleOnRN(onDismiss);
            }
        });
    };

    useEffect(() => {
        if (visible && imageUri) {
            setRenderImage(true);
            startAnimation();
        } else {
            // Ensure values are reset if toggled off externally
            opacity.value = 0;
            setTimeout(() => setRenderImage(false), 300);
        }
    }, [visible, imageUri]);

    const overlayStyle = useAnimatedStyle(() => ({
        opacity: opacity.value,
    }));

    const bgStyle = useAnimatedStyle(() => ({
        opacity: bgOpacity.value,
    }));

    const imageStyle = useAnimatedStyle(() => ({
        transform: [{ scale: scale.value }],
        width: width,
        height: height,
        resizeMode: "contain",
    }));

    const textStyle = useAnimatedStyle(() => ({
        opacity: textOpacity.value,
    }));

    if (!renderImage || !imageUri) return null;

    return (
        <Portal>
            <Animated.View style={overlayStyle} className="absolute inset-0 z-[9999] items-center justify-center">
                <Animated.View style={bgStyle} className="absolute inset-0 bg-black" />
                <Pressable className="absolute inset-0" onPress={handleEarlyDismiss}>
                    <View className="absolute inset-0" pointerEvents="none">
                        <Animated.Image source={{ uri: imageUri }} style={imageStyle as any} />
                    </View>
                    <Animated.View style={textStyle} className="absolute bottom-[50px] bg-black/60 px-4 py-2 rounded-lg self-center" pointerEvents="none">
                        <Text className="text-white text-xs font-medium">
                            {filepath ? `Saved to ${filepath}` : "Screenshot saved"}
                        </Text>
                    </Animated.View>
                </Pressable>
            </Animated.View>
        </Portal>
    );
};
