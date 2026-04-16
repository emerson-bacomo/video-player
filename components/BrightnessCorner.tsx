import * as Brightness from "expo-brightness";
import React, { useEffect, useRef } from "react";
import { Dimensions } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated from "react-native-reanimated";

interface BrightnessCornerProps {
    position: "top-left" | "top-right" | "bottom-left" | "bottom-right";
    hasPermission: boolean;
    isActive: boolean;
    sensitivity?: number;
    onDoubleTap: () => void;
    onSingleTap: () => void;
    onBrightnessChange: (val: number) => void;
}

export const BrightnessCorner: React.FC<BrightnessCornerProps> = ({
    position,
    hasPermission,
    isActive,
    sensitivity = 0.3,
    onDoubleTap,
    onSingleTap,
    onBrightnessChange,
}) => {
    const isTop = position.startsWith("top");
    const isLeft = position.endsWith("left");

    const dragBaseline = useRef<number>(0);
    const syncTranslation = useRef<number>(0);
    const activeTranslation = useRef<number>(0);

    useEffect(() => {
        if (hasPermission) {
            Brightness.getSystemBrightnessAsync()
                .then((b) => {
                    dragBaseline.current = b;
                })
                .catch((e) => console.log("[Brightness] init fetch failed", e));
        }
    }, [hasPermission]);

    const panGesture = Gesture.Pan()
        .activeOffsetY([-10, 10])
        .runOnJS(true)
        .onStart(() => {
            activeTranslation.current = 0;
            syncTranslation.current = 0;

            Brightness.getSystemBrightnessAsync()
                .then((realBrightness) => {
                    console.log("[Brightness] realBrightness", realBrightness);
                    dragBaseline.current = realBrightness;
                    syncTranslation.current = activeTranslation.current;
                })
                .catch((e) => {});
        })
        .onUpdate((event) => {
            if (!hasPermission) return;
            activeTranslation.current = event.translationY;

            const screenHeight = Dimensions.get("window").height;
            const deltaBright = (event.translationY - syncTranslation.current) / (screenHeight * sensitivity);

            let newBrightness = dragBaseline.current - deltaBright;
            newBrightness = Math.max(0, Math.min(1, newBrightness));

            onBrightnessChange(newBrightness);

            Brightness.setSystemBrightnessAsync(newBrightness).catch((e) => {
                console.log("[Brightness] setSystemBrightnessAsync failed", e);
            });
        });

    const doubleTapGesture = Gesture.Tap()
        .numberOfTaps(2)
        .runOnJS(true)
        .onStart(() => {
            onDoubleTap();
        });

    const singleTapGesture = Gesture.Tap()
        .numberOfTaps(1)
        .runOnJS(true)
        .onEnd(() => {
            onSingleTap();
        });

    const composed = Gesture.Simultaneous(panGesture, Gesture.Exclusive(doubleTapGesture, singleTapGesture));

    return (
        <GestureDetector gesture={composed}>
            <Animated.View
                style={[
                    {
                        position: "absolute",
                        width: "20%",
                        height: "20%",
                        top: isTop ? 0 : undefined,
                        bottom: !isTop ? 0 : undefined,
                        left: isLeft ? 0 : undefined,
                        right: !isLeft ? 0 : undefined,
                        zIndex: 40,
                    },
                    isActive && {
                        backgroundColor: "rgba(255, 255, 255, 0.1)",
                        borderWidth: 2,
                        borderColor: "rgba(255, 255, 255, 0.6)",
                        borderStyle: "dashed",
                        borderRadius: 1,
                    },
                ]}
            />
        </GestureDetector>
    );
};
