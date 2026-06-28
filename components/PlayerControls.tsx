import { cn } from "@/lib/utils";
import Slider from "@react-native-community/slider";
import { LinearGradient } from "expo-linear-gradient";
import {
    Camera,
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
import type { FC } from "react";
import { LayoutChangeEvent, Text, TouchableOpacity, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { useSettings } from "@/hooks/useSettings";
import { useOrientationLayout } from "@/hooks/useOrientationLayout";
import { useStableSafeAreaInsets } from "@/hooks/useStableSafeAreaInsets";
import { ClippingOverlay } from "./ClippingOverlay";
import { ScreenshotOverlay } from "./ScreenshotOverlay";
import { MarkerPair } from "@/types/useMedia";
import { usePlayerControls } from "@/hooks/usePlayerControls";
import { usePlayerContext } from "@/context/PlayerContext";

export const PlayerControls: FC = () => {
    const { setSeekingLock, currentDisplayTime, duration, screenshotState } = usePlayerContext();
    const { onScreenshot, screenshotOverlayVisible, screenshotUri, screenshotFilepath, dismissScreenshot } = screenshotState;
    const {
        isPlaying,
        isClipMode,
        isEnded,
        hasNext,
        hasPrevious,
        onTogglePlay,
        onSeek,
        onSkipNext,
        onSkipPrevious,
        onRestart,
        onToggleClipMode,
        markers,
        markerPairs,
        previewActive,
        onTogglePreview,
        onAddMarker,
        onSaveClip,
        onRemoveMarker,
        onAdjustCurrentMarker,
        onSeekToPrevMarker,
        onSeekToNextMarker,
        hasPrevMarker,
        hasNextMarker,
        onSelectMarker,
        onUpdateMarkerTime,
        activeMarkerId,
        onDragStart,
        onDragEnd,
        onDoublePressMarker,
    } = usePlayerControls();

    const { isLandscape, width: screenWidth } = useOrientationLayout();
    const insets = useStableSafeAreaInsets(isLandscape);

    const { settings, updateSettings } = useSettings();
    const [sliderWidth, setSliderWidth] = useState(screenWidth - 32);
    const [localIsPlaying, setLocalIsPlaying] = useState(isPlaying);

    const expansion = useSharedValue(isClipMode ? 1 : 0);

    useEffect(() => {
        expansion.value = withTiming(isClipMode ? 1 : 0, { duration: 300 });
    }, [isClipMode, expansion]);

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

    useEffect(() => {
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

    return (
        <View className="absolute bottom-0 left-0 right-0 z-50">
            <LinearGradient
                colors={["transparent", "rgba(0,0,0,0.8)"]}
                className={cn("pt-4", isLandscape ? "pb-10" : "pb-14")}
                style={{ paddingLeft: Math.max(insets.left, 16), paddingRight: Math.max(insets.right, 16) }}
            >
                {/* Top action bar — clip toolbar on the left, screenshot button on the right */}
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
                                <TouchableOpacity onPress={onAddMarker} className="p-2.5 active:bg-white/20 rounded-full">
                                    <Plus size={20} color="white" />
                                </TouchableOpacity>

                                <TouchableOpacity
                                    onPress={() => activeMarkerId && onRemoveMarker(activeMarkerId)}
                                    disabled={!activeMarkerId}
                                    className={cn("p-2.5 rounded-full", !activeMarkerId ? "opacity-30" : "active:bg-red-500/10")}
                                >
                                    <Trash2 size={20} color={activeMarkerId ? "#f56565" : "white"} />
                                </TouchableOpacity>

                                <TouchableOpacity
                                    onPress={() => activeMarkerId && onAdjustCurrentMarker()}
                                    disabled={!activeMarkerId}
                                    className={cn("p-2.5 rounded-full", !activeMarkerId ? "opacity-30" : "active:bg-blue-500/10")}
                                >
                                    <SeparatorVertical size={20} color="white" />
                                </TouchableOpacity>

                                <TouchableOpacity
                                    onPress={onSeekToPrevMarker}
                                    disabled={!hasPrevMarker}
                                    className={cn("p-2.5 rounded-full", !hasPrevMarker ? "opacity-30" : "active:bg-white/10")}
                                >
                                    <ChevronLeft size={20} color="white" />
                                </TouchableOpacity>

                                <TouchableOpacity
                                    onPress={onSeekToNextMarker}
                                    disabled={!hasNextMarker}
                                    className={cn("p-2.5 rounded-full", !hasNextMarker ? "opacity-30" : "active:bg-white/10")}
                                >
                                    <ChevronRight size={20} color="white" />
                                </TouchableOpacity>

                                <TouchableOpacity
                                    onPress={onTogglePreview}
                                    disabled={!markerPairs.some((p: MarkerPair) => p.id !== "pair-realtime")}
                                    className={cn(
                                        "p-2.5 rounded-full",
                                        !markerPairs.some((p: MarkerPair) => p.id !== "pair-realtime")
                                            ? "opacity-30"
                                            : previewActive
                                              ? "bg-white/20"
                                              : "active:bg-white/10",
                                    )}
                                >
                                    <Eye
                                        size={20}
                                        color={
                                            markerPairs.some((p: MarkerPair) => p.id !== "pair-realtime")
                                                ? previewActive
                                                    ? "#3b82f6"
                                                    : "white"
                                                : "white"
                                        }
                                    />
                                </TouchableOpacity>

                                <TouchableOpacity
                                    onPress={onSaveClip}
                                    disabled={!markerPairs.some((p: MarkerPair) => p.id !== "pair-realtime")}
                                    className={cn(
                                        "p-2.5 rounded-full",
                                        !markerPairs.some((p: MarkerPair) => p.id !== "pair-realtime")
                                            ? "opacity-30"
                                            : "active:bg-emerald-500/10",
                                    )}
                                >
                                    <Save
                                        size={20}
                                        color={
                                            markerPairs.some((p: MarkerPair) => p.id !== "pair-realtime") ? "#5cdab0ff" : "white"
                                        }
                                    />
                                </TouchableOpacity>
                            </View>
                        </Animated.View>

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

                    {/* Screenshot button — lives on the right, flex-between separates it from the clip toolbar */}
                    <TouchableOpacity
                        onPress={onScreenshot}
                        className="w-11 h-11 items-center justify-center bg-black/40 rounded-full"
                    >
                        <Camera size={18} color="white" />
                    </TouchableOpacity>
                </View>

                <View className={cn("relative", isLandscape ? "mb-1" : "mb-4")} onLayout={onSliderLayout}>
                    {isClipMode && (
                        <ClippingOverlay
                            markers={markers}
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
                            isLandscape={isLandscape}
                        />
                    )}
                    <View style={{ opacity: duration > 0 ? 1 : 0, width: sliderWidth + 30, marginLeft: -15 }}>
                        <Slider
                            style={{ width: "100%", height: isLandscape ? 20 : 40, zIndex: 20 }}
                            maximumValue={duration}
                            value={currentDisplayTime < 0 ? 0 : currentDisplayTime}
                            onValueChange={onSeek}
                            onSlidingStart={() => setSeekingLock(true)}
                            onSlidingComplete={(val) => {
                                onSeek(val);
                                setSeekingLock(false);
                            }}
                            minimumTrackTintColor={isClipMode ? "rgba(255,255,255,0.15)" : "white"}
                            maximumTrackTintColor="#52525b"
                            thumbTintColor="white"
                        />
                    </View>
                    {duration > 0 && currentDisplayTime >= 0 && (
                        <View className={cn("flex-row justify-between", !isLandscape && "-mt-4")}>
                            <Text className="text-white/70 text-sm font-medium min-w-[32px]">
                                {formatTime(currentDisplayTime)}
                            </Text>
                            <TouchableOpacity
                                onPress={() =>
                                    updateSettings({
                                        timeDisplayMode: settings.timeDisplayMode === "duration" ? "remaining" : "duration",
                                    })
                                }
                            >
                                <Text className="text-white/70 text-sm font-medium min-w-[32px] text-right">
                                    {settings.timeDisplayMode === "duration"
                                        ? formatTime(duration)
                                        : `-${formatTime(duration - currentDisplayTime)}`}
                                </Text>
                            </TouchableOpacity>
                        </View>
                    )}
                </View>

                <View className={cn("flex-row items-center justify-center", isLandscape ? "gap-12" : "gap-14")}>
                    <TouchableOpacity
                        onPress={onSkipPrevious}
                        activeOpacity={0.6}
                        disabled={!hasPrevious}
                        className={cn(!hasPrevious && "opacity-20")}
                    >
                        <SkipBack size={isLandscape ? 24 : 28} color="white" fill="white" />
                    </TouchableOpacity>

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

            {/* Screenshot saved overlay */}
            <ScreenshotOverlay
                visible={screenshotOverlayVisible}
                imageUri={screenshotUri}
                filepath={screenshotFilepath}
                onDismiss={dismissScreenshot}
            />
        </View>
    );
};
