import { cn } from "@/lib/utils";
import Slider from "@react-native-community/slider";
import { LinearGradient } from "expo-linear-gradient";
import * as ScreenOrientation from "expo-screen-orientation";
import {
    ChevronLeft,
    ChevronRight,
    Eye,
    Pause,
    Play,
    Plus,
    RotateCcw,
    Save,
    Scissors,
    SeparatorVertical,
    SkipBack,
    SkipForward,
    Trash2,
} from "lucide-react-native";
import React, { useEffect, useState } from "react";
import { LayoutChangeEvent, Text, TouchableOpacity, View, useWindowDimensions } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MarkerPair } from "../hooks/useClipping";
import { useSettings } from "../hooks/useSettings";
import { ClippingOverlay } from "./ClippingOverlay";

interface PlayerControlsProps {
    isPlaying: boolean;
    onTogglePlay: () => void;
    onSeek: (value: number) => void;
    onSkipNext: () => void;
    onSkipPrevious: () => void;
    currentTime: number;
    duration: number;
    orientation?: ScreenOrientation.OrientationLock;
    // Clipping Props
    isClipMode: boolean;
    onToggleClipMode: () => void;
    markerPairs: MarkerPair[];
    previewActive: boolean;
    onTogglePreview: () => void;
    onAddMarker: () => void;
    onRemoveMarker: (id: string) => void;
    onSaveClip: () => Promise<{ success: boolean; message?: string; pairs?: any[] }>;
    onSelectMarker: (id: string) => void;
    onUpdateMarkerTime: (id: string, time: number) => void;
    activeMarkerId: string | null;
    onDragStart?: () => void;
    onDragEnd?: () => void;
    onDoublePressMarker?: (markerTime: number) => void;
    isInitialLoadDone?: boolean;
    isEnded: boolean;
    onRestart: () => void;
    hasNext: boolean;
    hasPrevious: boolean;
}

export const PlayerControls: React.FC<PlayerControlsProps> = ({
    isPlaying,
    onTogglePlay,
    onSeek,
    onSkipNext,
    onSkipPrevious,
    currentTime,
    duration,
    isClipMode,
    onToggleClipMode,
    markerPairs,
    previewActive,
    onTogglePreview,
    onAddMarker,
    onRemoveMarker,
    onSaveClip,
    onSelectMarker,
    onUpdateMarkerTime,
    activeMarkerId,
    onDragStart,
    onDragEnd,
    onDoublePressMarker,
    isInitialLoadDone,
    isEnded,
    onRestart,
    hasNext,
    hasPrevious,
}) => {
    const { width: screenWidth, height: screenHeight } = useWindowDimensions();
    const isLandscape = screenWidth > screenHeight;

    const { settings, updateSettings } = useSettings();
    const [sliderWidth, setSliderWidth] = useState(screenWidth - 32); // Better initial estimate
    const [localIsPlaying, setLocalIsPlaying] = useState(isPlaying);
    const [sliderReady, setSliderReady] = useState(false);

    const expansion = useSharedValue(isClipMode ? 1 : 0);

    useEffect(() => {
        expansion.value = withTiming(isClipMode ? 1 : 0, { duration: 300 });
    }, [isClipMode]);

    // Wait one rAF after duration arrives so Android's native SeekBar
    // thumb animation (0 → value) completes invisibly before we show the slider.
    useEffect(() => {
        if (duration > 0 && isInitialLoadDone && !sliderReady) {
            const id = requestAnimationFrame(() => setSliderReady(true));
            return () => cancelAnimationFrame(id);
        }
    }, [duration, sliderReady, isInitialLoadDone]);

    const animatedBarStyle = useAnimatedStyle(() => {
        return {
            opacity: withTiming(1, { duration: 300 }),
        };
    });

    const animatedTuckStyle = useAnimatedStyle(() => {
        return {
            opacity: expansion.value,
            maxWidth: expansion.value * 300,
            transform: [{ translateX: (1 - expansion.value) * -10 }],
        };
    });

    // Sync with prop when it changes (e.g. video finishes or external toggle)
    React.useEffect(() => {
        setLocalIsPlaying(isPlaying);
    }, [isPlaying]);

    const formatTime = (sec: number) => {
        const totalSeconds = Math.floor(sec);
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;
        return `${minutes}:${seconds.toString().padStart(2, "0")}`;
    };

    const onSliderLayout = (e: LayoutChangeEvent) => {
        setSliderWidth(e.nativeEvent.layout.width);
    };

    const insets = useSafeAreaInsets();

    return (
        <View className="absolute bottom-0 left-0 right-0 z-50">
            <LinearGradient
                colors={["transparent", "rgba(0,0,0,0.8)"]}
                className={cn("pt-4", isLandscape ? "pb-10" : "pb-14")}
                style={{ paddingLeft: Math.max(insets.left, 16), paddingRight: Math.max(insets.right, 16) }}
            >
                <View className={cn("flex-row justify-between items-center", isLandscape ? "mb-1" : "mb-4")}>
                    {/* Action Bar Container */}
                    <Animated.View
                        style={[{ overflow: "hidden", minWidth: 64 }, animatedBarStyle]}
                        className="flex-row items-center bg-black/40 rounded-full h-11"
                    >
                        {/* Tucked Buttons Group */}
                        <Animated.View
                            style={[{ flexDirection: "row", alignItems: "center", overflow: "hidden" }, animatedTuckStyle]}
                        >
                            <View className="flex-row items-center pl-1 gap-1">
                                {/* Add Marker */}
                                <TouchableOpacity onPress={onAddMarker} className="p-2.5 active:bg-white/20 rounded-full">
                                    <Plus size={20} color="white" />
                                </TouchableOpacity>

                                {/* Delete Selected Marker */}
                                <TouchableOpacity
                                    onPress={() => activeMarkerId && onRemoveMarker(activeMarkerId)}
                                    disabled={!activeMarkerId}
                                    className={cn("p-2.5 rounded-full", !activeMarkerId ? "opacity-30" : "active:bg-red-500/10")}
                                >
                                    <Trash2 size={20} color={activeMarkerId ? "#f56565" : "white"} />
                                </TouchableOpacity>

                                {/* Adjust Current Marker */}
                                <TouchableOpacity
                                    onPress={() => activeMarkerId && onUpdateMarkerTime(activeMarkerId, currentTime)}
                                    disabled={!activeMarkerId}
                                    className={cn("p-2.5 rounded-full", !activeMarkerId ? "opacity-30" : "active:bg-blue-500/10")}
                                >
                                    <SeparatorVertical size={20} color="white" />
                                </TouchableOpacity>

                                {/* Toggle Preview */}
                                <TouchableOpacity
                                    onPress={onTogglePreview}
                                    disabled={!markerPairs.some((p) => p.id !== "pair-realtime")}
                                    className={cn(
                                        "p-2.5 rounded-full",
                                        !markerPairs.some((p) => p.id !== "pair-realtime")
                                            ? "opacity-30"
                                            : previewActive
                                              ? "bg-white/20"
                                              : "active:bg-white/10",
                                    )}
                                >
                                    <Eye
                                        size={20}
                                        color={
                                            markerPairs.some((p) => p.id !== "pair-realtime")
                                                ? previewActive
                                                    ? "#3b82f6"
                                                    : "white"
                                                : "white"
                                        }
                                    />
                                </TouchableOpacity>

                                {/* Save */}
                                <TouchableOpacity
                                    onPress={() => onSaveClip}
                                    disabled={!markerPairs.some((p) => p.id !== "pair-realtime")}
                                    className={cn(
                                        "p-2.5 rounded-full",
                                        !markerPairs.some((p) => p.id !== "pair-realtime")
                                            ? "opacity-30"
                                            : "active:bg-emerald-500/10",
                                    )}
                                >
                                    <Save
                                        size={20}
                                        color={markerPairs.some((p) => p.id !== "pair-realtime") ? "#5cdab0ff" : "white"}
                                    />
                                </TouchableOpacity>
                            </View>
                        </Animated.View>

                        {/* Clip Mode Toggle (Expand/Collapse) */}
                        <TouchableOpacity
                            onPress={onToggleClipMode}
                            style={{
                                width: 64,
                                height: 44,
                                flexDirection: "row",
                                alignItems: "center",
                                justifyContent: "center",
                                gap: 2,
                            }}
                        >
                            <Scissors size={18} color={isClipMode ? "#6da0f3ff" : "white"} />
                            {isClipMode ? (
                                <ChevronLeft size={16} color="white" opacity={0.6} />
                            ) : (
                                <ChevronRight size={16} color="white" opacity={0.6} />
                            )}
                        </TouchableOpacity>
                    </Animated.View>
                </View>

                {/* Scrubber Container */}
                <View className={cn("relative", isLandscape ? "mb-1" : "mb-4")} onLayout={onSliderLayout}>
                    {isClipMode && (
                        <ClippingOverlay
                            markerPairs={markerPairs}
                            duration={duration}
                            width={sliderWidth}
                            activeMarkerId={activeMarkerId}
                            onUpdateMarkerTime={onUpdateMarkerTime}
                            onSelectMarker={onSelectMarker}
                            onDoublePressMarker={onDoublePressMarker}
                            onDragStart={onDragStart}
                            onDragEnd={onDragEnd}
                            previewActive={previewActive}
                        />
                    )}
                    <View style={{ opacity: sliderReady ? 1 : 0 }}>
                        <Slider
                            style={{ width: "100%", height: isLandscape ? 30 : 40, zIndex: 20 }}
                            minimumValue={0}
                            maximumValue={duration}
                            value={currentTime}
                            onValueChange={onSeek}
                            onSlidingComplete={onSeek}
                            minimumTrackTintColor={isClipMode ? "rgba(255,255,255,0.15)" : "white"}
                            maximumTrackTintColor="#52525b"
                            thumbTintColor="white"
                        />
                    </View>
                    <View className="flex-row justify-between px-1">
                        <Text className="text-white/70 font-medium min-w-[32px]">{formatTime(currentTime)}</Text>
                        <TouchableOpacity
                            onPress={() =>
                                updateSettings({
                                    timeDisplayMode: settings.timeDisplayMode === "elapsed" ? "remaining" : "elapsed",
                                })
                            }
                        >
                            <Text className="text-white/70 font-medium min-w-[32px] text-right">
                                {settings.timeDisplayMode === "elapsed"
                                    ? formatTime(duration)
                                    : `-${formatTime(duration - currentTime)}`}
                            </Text>
                        </TouchableOpacity>
                    </View>
                </View>

                {/* Playback Controls (Play/Pause, Skip) */}
                <View className={cn("flex-row items-center justify-center", isLandscape ? "gap-12" : "gap-14")}>
                    <TouchableOpacity
                        onPress={onSkipPrevious}
                        activeOpacity={0.6}
                        disabled={!hasPrevious}
                        className={cn(!hasPrevious && "opacity-20")}
                    >
                        <SkipBack size={isLandscape ? 24 : 28} color="white" fill="white" />
                    </TouchableOpacity>

                    {/* Play/Pause */}
                    <TouchableOpacity
                        onPress={() => {
                            if (isEnded) {
                                onRestart();
                            } else {
                                setLocalIsPlaying(!localIsPlaying);
                                onTogglePlay();
                            }
                        }}
                        className={cn("bg-white/10 rounded-full border border-white/10", isLandscape ? "p-3" : "p-6")}
                    >
                        {isEnded ? (
                            <RotateCcw size={isLandscape ? 32 : 42} color="white" />
                        ) : localIsPlaying ? (
                            <Pause size={isLandscape ? 32 : 42} color="white" fill="white" />
                        ) : (
                            <Play size={isLandscape ? 32 : 42} color="white" fill="white" />
                        )}
                    </TouchableOpacity>

                    <TouchableOpacity
                        onPress={onSkipNext}
                        activeOpacity={0.6}
                        disabled={!hasNext}
                        className={cn(!hasNext && "opacity-20")}
                    >
                        <SkipForward size={isLandscape ? 24 : 28} color="white" fill="white" />
                    </TouchableOpacity>
                </View>
            </LinearGradient>
        </View>
    );
};
