import * as Brightness from "expo-brightness";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as ScreenOrientation from "expo-screen-orientation";
import { StatusBar } from "expo-status-bar";
import { useVideoPlayer, VideoView } from "expo-video";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Dimensions, View, Text, TouchableOpacity } from "react-native";
import { Gesture, GestureDetector, GestureHandlerRootView } from "react-native-gesture-handler";

import { PlayerControls } from "../components/PlayerControls";
import { PlayerHeader } from "../components/PlayerHeader";
import { useClipping } from "../hooks/useClipping";
import { useSettings } from "../hooks/useSettings";
import { savePlaybackData } from "../utils/db";

export default function PlayerScreen() {
    const { uri, title, videoId, resumeMs } = useLocalSearchParams<{
        uri: string;
        title: string;
        videoId?: string;
        resumeMs?: string;
    }>();
    const router = useRouter();
    const { settings } = useSettings();
    const [showControls, setShowControls] = useState(true);
    const [currentTime, setCurrentTime] = useState(0);
    const [isClipMode, setIsClipMode] = useState(false);
    const controlsTimeout = useRef<any>(null);
    const isUnmounted = useRef(false);

    const [hasBrightnessPermission, setHasBrightnessPermission] = useState(false);
    const [permissionChecked, setPermissionChecked] = useState(false);

    useEffect(() => {
        (async () => {
            const { status } = await Brightness.getPermissionsAsync();
            if (status === "granted") {
                setHasBrightnessPermission(true);
            }
            setPermissionChecked(true);
        })();
    }, []);

    useEffect(() => {
        return () => {
            isUnmounted.current = true;
        };
    }, []);

    const player = useVideoPlayer(uri as string, (p) => {
        p.loop = false;
        if (resumeMs && Number(resumeMs) > 0) {
            p.currentTime = Number(resumeMs) / 1000;
        }
    });

    useEffect(() => {
        if (permissionChecked && hasBrightnessPermission) {
            player.play();
        }
    }, [permissionChecked, hasBrightnessPermission, player]);

    const {
        markersData,
        markerPairs,
        previewActive,
        setPreviewActive,
        addMarkerPair,
        removeMarker,
        updateMarkerTime,
        getNextClipStart,
        isInSegment,
        activeMarkerId,
    } = useClipping(player.duration * 1000);

    // Orientation Management
    useEffect(() => {
        async function applyOrientation() {
            if (settings.defaultOrientation === "landscape") {
                await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
            } else if (settings.defaultOrientation === "portrait") {
                await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
            } else {
                await ScreenOrientation.unlockAsync();
            }
        }
        applyOrientation();
        return () => {
            ScreenOrientation.unlockAsync();
        };
    }, [settings.defaultOrientation]);



    // Handle auto-hide controls
    const resetControlsTimer = useCallback(() => {
        if (controlsTimeout.current) clearTimeout(controlsTimeout.current);
        setShowControls(true);
        if (player.playing && !isClipMode) {
            controlsTimeout.current = setTimeout(() => setShowControls(false), 3000);
        }
    }, [player.playing, isClipMode]);

    useEffect(() => {
        resetControlsTimer();
        return () => {
            if (controlsTimeout.current) clearTimeout(controlsTimeout.current);
        };
    }, [player.playing, isClipMode, resetControlsTimer]);

    // Sync Timer & Clipping Preview & Auto Save
    useEffect(() => {
        let lastSaveMs = 0;
        const interval = setInterval(() => {
            if (isUnmounted.current || !player) return;

            const posMs = player.currentTime * 1000;
            setCurrentTime(posMs);

            // Save playback progress every 5 seconds
            if (videoId && player.playing && Math.abs(posMs - lastSaveMs) > 5000) {
                savePlaybackData(videoId, posMs);
                lastSaveMs = posMs;
            }

            if (previewActive && !isInSegment(posMs)) {
                const nextStart = getNextClipStart(posMs);
                if (nextStart !== -1) {
                    player.seekBy(nextStart / 1000 - player.currentTime);
                }
            }
        }, 500);
        return () => {
            clearInterval(interval);
            // Final save on unmount if player is still valid
            if (videoId && !isUnmounted.current && player) {
                try {
                    const finalPos = player.currentTime * 1000;
                    if (finalPos > 0 && Math.abs(finalPos - lastSaveMs) > 1000) {
                        savePlaybackData(videoId, finalPos);
                    }
                } catch (e) {
                    console.log("[Player] Error saving on unmount:", e);
                }
            }
        };
    }, [player.playing, previewActive, isInSegment, getNextClipStart, videoId]);

    // Gestures
    const singleTap = Gesture.Tap()
        .numberOfTaps(1)
        .runOnJS(true)
        .onEnd(() => {
            resetControlsTimer();
        });

    const doubleTap = Gesture.Tap()
        .numberOfTaps(2)
        .runOnJS(true)
        .onEnd((event) => {
            if (isUnmounted.current || !player) return;
            const { x } = event;
            const screenWidth = Dimensions.get("window").width;
            if (x < screenWidth / 3) {
                player.seekBy(-10);
            } else if (x > (screenWidth * 2) / 3) {
                player.seekBy(10);
            } else {
                // Center double tap = toggle play/pause
                if (player.playing) player.pause();
                else player.play();
            }
        });

    const longPress = Gesture.LongPress()
        .runOnJS(true)
        .onStart(() => {
            if (!isUnmounted.current && player) player.playbackRate = 2.0;
        })
        .onEnd(() => {
            if (!isUnmounted.current && player) player.playbackRate = 1.0;
        });

    const composedGesture = Gesture.Exclusive(doubleTap, singleTap, longPress);

    return (
        <GestureHandlerRootView className="flex-1 bg-black">
            <StatusBar style="light" hidden />

            <GestureDetector gesture={composedGesture}>
                <View className="flex-1 w-full h-full">
                    <VideoView
                        style={{ width: "100%", height: "100%" }}
                        player={player}
                        fullscreenOptions={{ enable: false }}
                        allowsPictureInPicture
                        nativeControls={false}
                        contentFit="contain"
                    />
                </View>
            </GestureDetector>

            {showControls && (
                <>
                    <PlayerHeader
                        title={title || "Video Player"}
                        onBack={() => {
                            ScreenOrientation.unlockAsync();
                            router.back();
                        }}
                    />

                    <PlayerControls
                        isPlaying={player.playing}
                        onTogglePlay={() => {
                            if (player.playing) player.pause();
                            else player.play();
                            resetControlsTimer();
                        }}
                        onSeek={(value) => {
                            player.seekBy(value / 1000 - player.currentTime);
                            setCurrentTime(value);
                            resetControlsTimer();
                        }}
                        onSkipNext={() => player.seekBy(10)}
                        onSkipPrevious={() => player.seekBy(-10)}
                        currentTime={currentTime}
                        duration={player.duration * 1000}
                        // Clipping Props
                        isClipMode={isClipMode}
                        onToggleClipMode={() => setIsClipMode(!isClipMode)}
                        markerPairs={markerPairs}
                        markersData={markersData}
                        previewActive={previewActive}
                        onTogglePreview={() => setPreviewActive(!previewActive)}
                        onAddClip={() => addMarkerPair(currentTime, Math.min(currentTime + 5000, player.duration * 1000))}
                        onRemoveClip={() => activeMarkerId && removeMarker(activeMarkerId)}
                        onSaveClips={() => console.log("Saving Clips...")}
                    />
                </>
            )}

            {!hasBrightnessPermission && permissionChecked && (
                <View className="absolute z-50 inset-0 flex-1 bg-black/95 justify-center items-center p-6">
                    <Text className="text-white text-xl font-bold mb-4 text-center">System Requirements</Text>
                    <Text className="text-zinc-400 text-center mb-8 px-4 leading-6">
                        This player utilizes system hardware controls to dynamically adjust brightness on-the-fly. We require permission to modify Android system settings.
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
        </GestureHandlerRootView>
    );
}
