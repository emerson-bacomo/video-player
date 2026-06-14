import * as Brightness from "expo-brightness";
import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import React, { useState, useRef, useEffect } from "react";
import { Text, TouchableOpacity, View } from "react-native";
import Animated, { useAnimatedStyle, withTiming } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { OnLoadData } from "react-native-video";

import { ClipExportModal } from "@/components/ClipExportModal";
import { CorePlayer } from "@/components/CorePlayer";
import { PlayerCentralIndicator } from "@/components/PlayerCentralIndicator";
import { PlayerControls } from "@/components/PlayerControls";
import { PlayerCorner } from "@/components/PlayerCorner";
import { PlayerGestureDetector } from "@/components/PlayerGestureDetector";
import { PlayerHeader } from "@/components/PlayerHeader";
import { SuccessBadge } from "@/components/SuccessBadge";
import { useTheme } from "@/context/ThemeContext";
import { useOrientationLock } from "@/hooks/useOrientationLock";
import { useSettings } from "@/hooks/useSettings";

import { PlayerProvider, usePlayerContext } from "@/context/PlayerContext";
import { usePlayerScreen } from "@/hooks/usePlayerScreen";

function PlayerContent() {
    const { settings } = useSettings();
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const { colors } = useTheme();

    useOrientationLock();

    const {
        activeVideo,
        showControls,
        setCurrentDisplayTime,
        setIsReadyForDisplay,
        setDuration,
        clipState,
        playerRef,
        paused,
        playbackRate,
        isSeekingLock,
    } = usePlayerContext();

    const {
        hasBrightnessPermission,
        setHasBrightnessPermission,
        permissionChecked,
        handleCorePlayerProgress,
        handleCorePlayerEnd,
    } = usePlayerScreen();

    const [showSuccessBadge, setShowSuccessBadge] = useState(false);

    const animatedControlsStyle = useAnimatedStyle(() => ({
        opacity: withTiming(showControls ? 1 : 0, { duration: 150 }),
    }));

    const showControlsRef = useRef(showControls);
    useEffect(() => {
        showControlsRef.current = showControls;
    }, [showControls]);

    return (
        <View style={{ flex: 1, backgroundColor: colors.playerBackground }}>
            <StatusBar style="light" hidden={!showControls} translucent />

            <PlayerGestureDetector>
                <View className="flex-1 w-full h-full" style={{ backgroundColor: colors.playerBackground }}>
                    {activeVideo ? (
                        <>
                            <CorePlayer
                                ref={playerRef}
                                video={activeVideo}
                                paused={paused}
                                rate={playbackRate}
                                resizeMode="contain"
                                onLoad={(data: OnLoadData) => {
                                    setDuration(data.duration);
                                }}
                                onReadyForDisplay={() => setIsReadyForDisplay(true)}
                                onProgress={handleCorePlayerProgress}
                                onEnd={handleCorePlayerEnd}
                                initialTime={activeVideo.lastPlayedSec}
                                isLockedRef={isSeekingLock}
                                onSeek={(time) => {
                                    setCurrentDisplayTime(Math.floor(time));
                                }}
                                style={{ flex: 1, width: "100%", height: "100%" }}
                            />
                        </>
                    ) : (
                        <View className="flex-1 justify-center items-center">
                            <Text className="text-white/40">Loading not found yet?...</Text>
                        </View>
                    )}

                    {["top-left", "top-right", "bottom-left", "bottom-right"].map((position) => (
                        <PlayerCorner
                            key={position}
                            position={position as any}
                            hasPermission={hasBrightnessPermission}
                            sensitivity={settings.panSeekSensitivity}
                        />
                    ))}
                </View>
            </PlayerGestureDetector>

            <Animated.View
                pointerEvents={showControls ? "box-none" : "none"}
                style={[
                    {
                        position: "absolute",
                        inset: 0,
                    },
                    animatedControlsStyle,
                ]}
            >
                <PlayerHeader onSuccessAction={() => setShowSuccessBadge(true)} />

                <PlayerControls />
            </Animated.View>

            <PlayerCentralIndicator />

            {showSuccessBadge && !showControls && (
                <SuccessBadge onVisible={setShowSuccessBadge} duration={1000} style={{ top: insets.top + 15, zIndex: 10000 }} />
            )}

            {!hasBrightnessPermission && permissionChecked && (
                <View className="absolute z-[100] inset-0 flex-1 bg-black justify-center items-center p-6">
                    <Text className="text-white text-xl font-bold mb-4 text-center">System Requirements</Text>
                    <Text className="text-zinc-400 text-center mb-8 px-4 leading-6">
                        This player utilizes system hardware controls to dynamically adjust brightness on-the-fly. We require
                        permission to modify Android system settings.
                    </Text>
                    <TouchableOpacity
                        className="bg-blue-600 px-8 py-3.5 rounded-full mb-4 w-full max-w-[280px]"
                        onPress={async () => {
                            const { status } = await Brightness.requestPermissionsAsync();
                            if (status === "granted") setHasBrightnessPermission(true);
                        }}
                    >
                        <Text className="text-white font-bold text-center text-base tracking-wide">Grant Permission</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        className="px-8 py-3 rounded-full border border-zinc-700 w-full max-w-[280px]"
                        onPress={() => router.back()}
                    >
                        <Text className="text-zinc-300 font-semibold text-center text-base">Go Back</Text>
                    </TouchableOpacity>
                </View>
            )}
            {activeVideo && (
                <ClipExportModal
                    visible={clipState.showClipExportModal}
                    onClose={clipState.closeClipExportModal}
                    video={activeVideo}
                    segments={clipState.exportSegments}
                    defaultName={clipState.defaultExportName}
                    onExport={async (opts) => {
                        await clipState.executeExport(opts);
                        if (!showControlsRef.current) setShowSuccessBadge(true);
                    }}
                />
            )}
        </View>
    );
}

export default function PlayerScreen() {
    return (
        <PlayerProvider>
            <PlayerContent />
        </PlayerProvider>
    );
}
