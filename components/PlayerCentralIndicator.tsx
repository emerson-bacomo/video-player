import { ChevronsLeft, ChevronsRight, Pause, Play, Sun, Zap } from "lucide-react-native";
import React from "react";
import { Text, View } from "react-native";
import Animated, { FadeIn, FadeOut, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

// Design Tokens
const FONT_SIZE_PLAY_PAUSE = 36;
const FONT_SIZE_DEFAULT = 16;
const BG_COLOR = "rgba(0, 0, 0, 0.4)";
const BORDER_COLOR = "rgba(255, 255, 255, 0.35)";

export interface PlayerCentralIndicatorProps {
    indicator: {
        icon: "play" | "pause" | "skip-fwd" | "skip-back" | "seek" | "speed" | "brightness" | null;
        label?: string;
        value?: number;
        direction?: -1 | 1;
    } | null;
    panSeekTime?: number | null;
    panStartTime?: number;
    showControls?: boolean;
    headerLayout?: { y: number; height: number } | null;
}

export const PlayerCentralIndicator: React.FC<PlayerCentralIndicatorProps> = ({
    indicator,
    panSeekTime,
    panStartTime = 0,
    showControls = false,
    headerLayout,
}) => {
    const pillHeight = useSharedValue(0);
    const insets = useSafeAreaInsets();

    const animatedPositionStyle = useAnimatedStyle(() => {
        // Default fallbacks if headerLayout isn't measured yet
        let baseTop = insets.top + 15;

        if (headerLayout && showControls) {
            // Position it relative to the bottom of the header content
            // When controls are shown, we give it a bit more breathing room
            baseTop = headerLayout.y + headerLayout.height;
        }

        return {
            top: withTiming(baseTop, { duration: 250 }),
        };
    });

    if (!indicator) return null;

    const renderContent = (textColor: string = "white", iconColor: string = "white") => {
        switch (indicator.icon) {
            case "play":
                return (
                    <View style={{ width: FONT_SIZE_PLAY_PAUSE, height: FONT_SIZE_PLAY_PAUSE }}>
                        <Play width="100%" height="100%" color="white" fill="white" />
                    </View>
                );
            case "pause":
                return (
                    <View style={{ width: FONT_SIZE_PLAY_PAUSE, height: FONT_SIZE_PLAY_PAUSE }}>
                        <Pause width="100%" height="100%" color="white" fill="white" />
                    </View>
                );
            case "skip-back":
                return (
                    <View className="flex-row items-center gap-2 pr-1">
                        <ChevronsLeft size={20} color="white" />
                        <Text style={{ fontSize: FONT_SIZE_DEFAULT }} className="text-white font-bold">
                            {indicator.label}
                        </Text>
                    </View>
                );
            case "skip-fwd":
                return (
                    <View className="flex-row items-center gap-2 pl-1">
                        <Text style={{ fontSize: FONT_SIZE_DEFAULT }} className="text-white font-bold">
                            {indicator.label}
                        </Text>
                        <ChevronsRight size={20} color="white" />
                    </View>
                );
            case "speed": {
                return (
                    <View className="flex-row items-center gap-1.5 px-0.5">
                        <Zap width={FONT_SIZE_DEFAULT} height={FONT_SIZE_DEFAULT} color={iconColor} fill={iconColor} />
                        <Text style={{ fontSize: 18, color: textColor }} className="font-black tracking-tight">
                            {indicator.label}
                        </Text>
                    </View>
                );
            }
            case "brightness":
                return (
                    <View className="flex-row items-center gap-2.5">
                        <Sun width={FONT_SIZE_DEFAULT} height={FONT_SIZE_DEFAULT} color={iconColor} fill={iconColor} />
                        <Text style={{ fontSize: FONT_SIZE_DEFAULT, color: textColor }} className="font-bold">
                            {indicator.label}
                        </Text>
                    </View>
                );
            case "seek":
                if (panSeekTime == null) return null;
                const isForward = panSeekTime >= panStartTime;
                const diff = Math.abs(Math.round(panSeekTime - panStartTime));
                return (
                    <View className="flex-row items-center gap-1.5">
                        {isForward ? <ChevronsRight color="white" size={20} /> : <ChevronsLeft color="white" size={20} />}
                        <Text style={{ fontSize: FONT_SIZE_DEFAULT }} className="text-white font-bold">
                            {isForward ? "+" : "-"}
                            {diff}s
                        </Text>
                    </View>
                );
            default:
                return null;
        }
    };

    const isActionIcon = indicator.icon === "play" || indicator.icon === "pause";

    return (
        <View className={`absolute inset-0 items-center pointer-events-none z-50 ${isActionIcon ? "justify-center" : ""}`}>
            <Animated.View
                onLayout={(e) => {
                    pillHeight.value = e.nativeEvent.layout.height;
                }}
                entering={FadeIn.duration(200)}
                exiting={FadeOut.duration(200)}
                style={[
                    {
                        backgroundColor: BG_COLOR,
                        paddingHorizontal: 16,
                        paddingVertical: isActionIcon ? 16 : 8,
                        borderRadius: 9999,
                        borderWidth: 1,
                        borderColor: BORDER_COLOR,
                        minWidth: 40,
                        alignItems: "center",
                        justifyContent: "center",
                        overflow: "hidden",
                    },
                    !isActionIcon && animatedPositionStyle,
                ]}
            >
                {indicator.icon === "brightness" ? renderContent("white", "white") : renderContent()}

                {indicator.icon === "brightness" && indicator.value != null && (
                    <View className="absolute inset-0">
                        <View
                            className="absolute bottom-0 left-0 right-0 bg-white overflow-hidden"
                            style={{ height: `${indicator.value * 100}%` }}
                        >
                            {pillHeight.value > 0 && (
                                <View
                                    className="absolute bottom-0 left-0 right-0 items-center justify-center"
                                    style={{ height: pillHeight.value }}
                                >
                                    {renderContent("black", "black")}
                                </View>
                            )}
                        </View>
                    </View>
                )}
            </Animated.View>
        </View>
    );
};
