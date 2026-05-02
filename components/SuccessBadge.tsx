import React, { useEffect } from "react";
import { StyleProp, StyleSheet, View, ViewStyle } from "react-native";
import Animated, {
    Easing,
    useAnimatedProps,
    useAnimatedStyle,
    useSharedValue,
    withDelay,
    withSequence,
    withTiming,
} from "react-native-reanimated";
import Svg, { Path } from "react-native-svg";
import { scheduleOnRN } from "react-native-worklets";

const AnimatedPath = Animated.createAnimatedComponent(Path);

export interface SuccessBadgeProps {
    onVisible?: (visible: boolean) => void;
    duration?: number;
    style?: StyleProp<ViewStyle>;
}

export const SuccessBadge: React.FC<SuccessBadgeProps> = ({ onVisible, duration = 1000, style }) => {
    const progress = useSharedValue(0);
    const translateX = useSharedValue(100);
    const scaleX = useSharedValue(1);
    const scaleY = useSharedValue(1);

    const notifyHidden = () => {
        if (onVisible) onVisible(false);
    };

    useEffect(() => {
        const exitStart = 900 + duration;

        // 1. X Movement: Slide in -> Wait -> Dash out
        translateX.value = withSequence(
            withTiming(0, { duration: 250, easing: Easing.linear }), // Slam into wall
            withTiming(-8, { duration: 150 }), // Shift left as we squash
            withTiming(0, { duration: 150 }), // Shift back as we unsquash
            withDelay(
                exitStart - 550,
                withSequence(
                    withTiming(-15, { duration: 200, easing: Easing.out(Easing.quad) }),
                    withTiming(120, { duration: 300, easing: Easing.in(Easing.quad) }, (finished) => {
                        if (finished) scheduleOnRN(notifyHidden);
                    }),
                ),
            ),
        );

        // 2. X Scale: Squash/Stretch in -> Wait -> Charge/Unleash out
        scaleX.value = withSequence(
            withDelay(300, withTiming(0.7, { duration: 150 })), // Squash X (thinner)
            withTiming(1.2, { duration: 150 }), // Stretch X (wider)
            withTiming(1, { duration: 100 }), // Normal
            withDelay(
                exitStart - 700,
                withSequence(
                    withTiming(1.2, { duration: 200, easing: Easing.out(Easing.quad) }),
                    withTiming(0.9, { duration: 300, easing: Easing.in(Easing.quad) }),
                ),
            ),
        );

        // 3. Y Scale: Squash/Stretch in -> Wait -> Charge/Unleash out
        scaleY.value = withSequence(
            withDelay(300, withTiming(1.3, { duration: 150 })), // Stretch Y (taller)
            withTiming(0.8, { duration: 150 }), // Squash Y (shorter)
            withTiming(1, { duration: 100 }), // Normal
            withDelay(
                exitStart - 700,
                withSequence(
                    withTiming(0.7, { duration: 200, easing: Easing.out(Easing.quad) }),
                    withTiming(1.1, { duration: 300, easing: Easing.in(Easing.quad) }),
                ),
            ),
        );

        // 4. Vector Checkmark: Draw in -> Wait -> Undraw out
        progress.value = withSequence(
            withDelay(400, withTiming(1, { duration: 500 })),
            withDelay(exitStart - 900, withTiming(0, { duration: 400 })),
        );

        return () => {
            notifyHidden();
        };
    }, [duration, onVisible]);

    const animatedProps = useAnimatedProps(() => ({
        strokeDashoffset: 100 - progress.value * 100,
    }));

    const animatedStyle = useAnimatedStyle(() => ({
        transform: [{ translateX: translateX.value }, { scaleX: scaleX.value }, { scaleY: scaleY.value }],
    }));

    return (
        <Animated.View style={[styles.container, animatedStyle, style]}>
            <View className="bg-emerald-500/95 p-2.5 rounded-full flex-row items-center shadow-xl border border-emerald-400/50">
                <Svg width="18" height="18" viewBox="0 0 24 24">
                    <AnimatedPath
                        d="M4 12L9 17L20 6"
                        fill="none"
                        stroke="white"
                        strokeWidth="4.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeDasharray="100"
                        animatedProps={animatedProps}
                    />
                </Svg>
            </View>
        </Animated.View>
    );
};

const styles = StyleSheet.create({
    container: {
        position: "absolute",
        top: 100,
        right: 25,
        zIndex: 9999,
    },
});
