import { ChevronsLeft, ChevronsRight, Pause, Play, Sun, Zap } from "lucide-react-native";
import React, { useState } from "react";
import { Text, View } from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";

// Design Tokens
const ICON_SIZE_DEFAULT = 48;
const ICON_SIZE_SPEED = ICON_SIZE_DEFAULT * 0.8;
const FONT_SIZE_DEFAULT = 20;
const FONT_SIZE_SPEED = 32;
const FONT_SIZE_SEEK = 32;
const PADDING = 24;
const BG_COLOR = "rgba(0, 0, 0, 0.4)";

export interface PlayerCentralIndicatorProps {
    indicator: {
        icon: "play" | "pause" | "skip-fwd" | "skip-back" | "seek" | "speed" | "brightness" | null;
        label?: string;
        value?: number;
        direction?: -1 | 1;
    } | null;
    panSeekTime?: number | null;
    panStartTime?: number;
}

export const PlayerCentralIndicator: React.FC<PlayerCentralIndicatorProps> = ({ indicator, panSeekTime, panStartTime = 0 }) => {
    const [pillHeight, setPillHeight] = useState(0);

    if (!indicator) return null;

    const renderContent = (textColor: string = "white", iconColor: string = "white") => {
        switch (indicator.icon) {
            case "play":
                return (
                    <View style={{ width: ICON_SIZE_DEFAULT, height: ICON_SIZE_DEFAULT }}>
                        <Play width="100%" height="100%" color="white" fill="white" />
                    </View>
                );
            case "pause":
                return (
                    <View style={{ width: ICON_SIZE_DEFAULT, height: ICON_SIZE_DEFAULT }}>
                        <Pause width="100%" height="100%" color="white" fill="white" />
                    </View>
                );
            case "skip-back":
                return (
                    <View className="items-center">
                        <View style={{ width: ICON_SIZE_DEFAULT, height: ICON_SIZE_DEFAULT }}>
                            <ChevronsLeft width="100%" height="100%" color="white" />
                        </View>
                        <Text style={{ fontSize: FONT_SIZE_DEFAULT }} className="text-white font-bold mt-2">
                            {indicator.label}
                        </Text>
                    </View>
                );
            case "skip-fwd":
                return (
                    <View className="items-center">
                        <View style={{ width: ICON_SIZE_DEFAULT, height: ICON_SIZE_DEFAULT }}>
                            <ChevronsRight width="100%" height="100%" color="white" />
                        </View>
                        <Text style={{ fontSize: FONT_SIZE_DEFAULT }} className="text-white font-bold mt-2">
                            {indicator.label}
                        </Text>
                    </View>
                );
            case "speed": {
                const isReverse = indicator.direction === -1;
                const Chevron = isReverse ? ChevronsLeft : ChevronsRight;
                return (
                    <View className="items-center">
                        <Zap width={ICON_SIZE_SPEED} height={ICON_SIZE_SPEED} color={iconColor} />
                        <View className="flex-row items-center gap-2 mt-2">
                            {isReverse && <Chevron size={FONT_SIZE_SPEED - 4} color={iconColor} />}
                            <Text
                                style={{ fontSize: FONT_SIZE_SPEED, color: textColor }}
                                className="font-black tracking-widest uppercase"
                            >
                                {indicator.label}
                            </Text>
                            {!isReverse && <Chevron size={FONT_SIZE_SPEED - 4} color={iconColor} />}
                        </View>
                    </View>
                );
            }
            case "brightness":
                return (
                    <View className="items-center">
                        <View style={{ width: ICON_SIZE_DEFAULT, height: ICON_SIZE_DEFAULT }}>
                            <Sun width="100%" height="100%" color={iconColor} fill={iconColor} />
                        </View>
                        <Text style={{ fontSize: FONT_SIZE_DEFAULT, color: textColor }} className="font-bold mt-2">
                            {indicator.label}
                        </Text>
                    </View>
                );
            case "seek":
                if (panSeekTime == null) return null;
                const isForward = panSeekTime >= panStartTime;
                const diff = Math.abs(Math.round((panSeekTime - panStartTime) / 1000));
                return (
                    <View className="items-center">
                        <Text style={{ fontSize: FONT_SIZE_SEEK }} className="text-white font-bold mb-2">
                            {new Date(panSeekTime).toISOString().substr(11, 8)}
                        </Text>
                        <View className="flex-row items-center gap-2">
                            {isForward ? <ChevronsRight color="white" size={24} /> : <ChevronsLeft color="white" size={24} />}
                            <Text style={{ fontSize: FONT_SIZE_DEFAULT }} className="text-white/80 font-bold">
                                {isForward ? "+" : "-"}
                                {diff}s
                            </Text>
                        </View>
                    </View>
                );
            default:
                return null;
        }
    };

    return (
        <View className="absolute inset-0 justify-center items-center pointer-events-none z-50">
            <Animated.View
                onLayout={(e) => setPillHeight(e.nativeEvent.layout.height)}
                entering={FadeIn.duration(200)}
                exiting={FadeOut.duration(200)}
                style={{
                    backgroundColor: BG_COLOR,
                    padding: PADDING,
                    borderRadius: 9999,
                    borderWidth: 1,
                    borderColor: "rgba(255, 255, 255, 0.05)",
                    minWidth: 64,
                    minHeight: 64,
                    alignItems: "center",
                    justifyContent: "center",
                    overflow: "hidden",
                }}
            >
                {indicator.icon === "brightness" ? renderContent("white", "white") : renderContent()}

                {indicator.icon === "brightness" && indicator.value != null && (
                    <View className="absolute inset-0">
                        <View
                            className="absolute bottom-0 left-0 right-0 bg-white overflow-hidden"
                            style={{ height: `${indicator.value * 100}%` }}
                        >
                            {pillHeight > 0 && (
                                <View
                                    className="absolute bottom-0 left-0 right-0 items-center justify-center"
                                    style={{ height: pillHeight }}
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
