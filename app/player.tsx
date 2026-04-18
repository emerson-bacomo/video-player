import * as Brightness from "expo-brightness";
import * as NavigationBar from "expo-navigation-bar";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as ScreenOrientation from "expo-screen-orientation";
import { StatusBar } from "expo-status-bar";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Text, TouchableOpacity, View } from "react-native";
import Animated, { useAnimatedStyle, withTiming } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Video, { OnLoadData, OnProgressData, VideoRef } from "react-native-video";

import { useTheme } from "@/context/ThemeContext";
import { PlayerCentralIndicator, PlayerCentralIndicatorProps } from "../components/PlayerCentralIndicator";
import { PlayerControls } from "../components/PlayerControls";
import { PlayerCorner } from "../components/PlayerCorner";
import { PlayerGestureDetector } from "../components/PlayerGestureDetector";
import { PlayerHeader } from "../components/PlayerHeader";
import { VideoItemDetailsModal } from "../components/VideoItemDetailsModal";
import { useClipping } from "../hooks/useClipping";
import { useMedia } from "../hooks/useMedia";
import { useSettings } from "../hooks/useSettings";
import { CorePlayer } from "../components/CorePlayer";
import { savePlaybackData } from "../utils/db";

export default function PlayerScreen() {
    const { videoId } = useLocalSearchParams<{ videoId?: string }>();
    const router = useRouter();
    const { settings } = useSettings();
    const { currentAlbumVideos, refreshPlaybackProgress } = useMedia();
    const activeVideo = currentAlbumVideos.find((v) => v.id === videoId);
    const [infoModalVisible, setInfoModalVisible] = useState(false);

    const [showControls, setShowControls] = useState(true);
    const [currentTime, setCurrentTime] = useState(0);
    const [isClipMode, setIsClipMode] = useState(false);
    const [centralIndicator, setCentralIndicator] = useState<PlayerCentralIndicatorProps["indicator"]>(null);
    const [panSeekTime, setPanSeekTime] = useState<number | null>(null);
    const controlsTimeout = useRef<any>(null);
    const skipTimeout = useRef<any>(null);
    const panStartTime = useRef<number>(0);
    const isUnmounted = useRef(false);
    const insets = useSafeAreaInsets();

    const [paused, setPaused] = useState(true);
    const [playbackRate, setPlaybackRate] = useState(1.0);
    const [duration, setDuration] = useState(0);
    const videoRef = useRef<VideoRef>(null);
    /** Always-current refs so the unmount cleanup can read latest values */
    const currentTimeRef = useRef(0);
    const durationRef = useRef(0);

    const [showPieMenu, setShowPieMenu] = useState(false);
    const lastSaveSecRef = useRef<number>(0);
    const [isInitialLoadDone, setIsInitialLoadDone] = useState(false);
    const isCornerModalOpen = useRef(false);
    const wasPlayingBeforePie = useRef(false);

    const handleCornerModalChange = useCallback((isOpen: boolean) => {
        isCornerModalOpen.current = isOpen;
        if (isOpen) {
            // Immediately hide controls and cancel any pending timer
            if (controlsTimeout.current) clearTimeout(controlsTimeout.current);
            setShowControls(false);
        }
    }, []);

    const handleCornerDoubleTap = useCallback(() => {
        setShowPieMenu((prev) => {
            const next = !prev;
            if (next) {
                // Opening - Save state and pause
                wasPlayingBeforePie.current = !paused;
                setPaused(true);
            } else {
                // Closing - Restore state
                if (wasPlayingBeforePie.current) {
                    setPaused(false);
                }
            }
            return next;
        });
    }, [paused]);

    const handleExecuteOperation = useCallback(
        (op: any) => {
            if (!videoRef.current) return;

            if (op.type === "seek") {
                const deltaSec = op.value || 0;
                const newTime = Math.max(0, Math.min(duration, currentTime + deltaSec));
                videoRef.current.seek(newTime);
                setCurrentTime(newTime);

                // Show feedback
                const iconName = op.value >= 0 ? "skip-fwd" : "skip-back";
                setCentralIndicator({
                    icon: iconName as any,
                    label: op.label || `${op.value > 0 ? "+" : ""}${op.value}s`,
                });

                if (skipTimeout.current) clearTimeout(skipTimeout.current);
                skipTimeout.current = setTimeout(() => setCentralIndicator(null), 800);
            }
        },
        [duration, currentTime],
    );

    const brightnessTimeoutRef = useRef<any>(null);
    const handleBrightnessChange = useCallback((val: number) => {
        setCentralIndicator({ icon: "brightness", label: `${Math.round(val * 100)}%`, value: val });
        if (brightnessTimeoutRef.current) clearTimeout(brightnessTimeoutRef.current);
        brightnessTimeoutRef.current = setTimeout(() => setCentralIndicator(null), 800);
    }, []);

    const [orientation, setOrientation] = useState<ScreenOrientation.OrientationLock>(
        settings.defaultOrientation === "landscape"
            ? ScreenOrientation.OrientationLock.LANDSCAPE
            : settings.defaultOrientation === "portrait"
              ? ScreenOrientation.OrientationLock.PORTRAIT
              : ScreenOrientation.OrientationLock.DEFAULT,
    );

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
        isUnmounted.current = false;
        return () => {
            isUnmounted.current = true;
        };
    }, [videoId]);

    useEffect(() => {
        const lockOrientation = async () => {
            try {
                if (orientation === ScreenOrientation.OrientationLock.LANDSCAPE) {
                    await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
                } else if (orientation === ScreenOrientation.OrientationLock.PORTRAIT) {
                    await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT);
                } else {
                    await ScreenOrientation.unlockAsync();
                }
            } catch (e) {
                console.warn("[Player] Failed to lock orientation:", e);
            }
        };
        lockOrientation();
        return () => {
            ScreenOrientation.unlockAsync().catch(() => {});
        };
    }, [orientation]);

    const toggleOrientation = async () => {
        try {
            let nextLock;
            if (orientation === ScreenOrientation.OrientationLock.DEFAULT) {
                nextLock = ScreenOrientation.OrientationLock.LANDSCAPE;
            } else if (orientation === ScreenOrientation.OrientationLock.LANDSCAPE) {
                nextLock = ScreenOrientation.OrientationLock.PORTRAIT;
            } else {
                nextLock = ScreenOrientation.OrientationLock.DEFAULT;
            }
            setOrientation(nextLock);
        } catch (e) {
            console.warn("[Player] Failed to toggle orientation:", e);
        }
    };

    useEffect(() => {
        if (!showControls) {
            NavigationBar.setVisibilityAsync("hidden");
        } else {
            NavigationBar.setVisibilityAsync("visible");
        }
    }, [showControls]);

    useEffect(() => {
        if (permissionChecked && hasBrightnessPermission) {
            setPaused(false);
        }
    }, [permissionChecked, hasBrightnessPermission]);

    // Reset player state when switching videos via playlist buttons
    useEffect(() => {
        setIsInitialLoadDone(false);
        setCurrentTime(0);
        currentTimeRef.current = 0;
        lastSaveSecRef.current = 0;
    }, [videoId]);

    const {
        markerPairs,
        activeMarkerId,
        setActiveMarkerId,
        previewActive,
        setPreviewActive,
        addMarker,
        saveSession,
        removeMarker,
        updateMarkerTime,
        getNextClipStart,
        isInSegment,
    } = useClipping(duration);

    const isDraggingMarker = useRef(false);

    // Initial jump for preview
    useEffect(() => {
        if (previewActive && duration > 0) {
            const firstSegment = markerPairs.filter((p) => p.end).sort((a, b) => a.start.time - b.start.time)[0];
            if (firstSegment) {
                videoRef.current?.seek(firstSegment.start.time / 1000);
                if (paused) setPaused(false);
            }
        }
    }, [previewActive, duration]);

    // Handle auto-hide controls
    const resetControlsTimer = useCallback(() => {
        if (controlsTimeout.current) clearTimeout(controlsTimeout.current);
        if (isCornerModalOpen.current || infoModalVisible) return; // Never show controls while a modal is open
        setShowControls(true);
        if (!paused && !isClipMode && !isDraggingMarker.current) {
            controlsTimeout.current = setTimeout(() => setShowControls(false), 2000);
        }
    }, [paused, isClipMode, infoModalVisible]);

    useEffect(() => {
        if (infoModalVisible) {
            if (controlsTimeout.current) clearTimeout(controlsTimeout.current);
            setShowControls(false);
        }
    }, [infoModalVisible]);

    useEffect(() => {
        if (!paused && showControls && !isClipMode && !previewActive && !isDraggingMarker.current) {
            if (controlsTimeout.current) clearTimeout(controlsTimeout.current);
            controlsTimeout.current = setTimeout(() => setShowControls(false), 2000);
        }
    }, [paused, showControls, isClipMode, previewActive]);

    useEffect(() => {
        return () => {
            if (controlsTimeout.current) clearTimeout(controlsTimeout.current);
        };
    }, []);

    const { colors } = useTheme();

    const animatedControlsStyle = useAnimatedStyle(() => ({
        opacity: withTiming(showControls ? 1 : 0, { duration: 150 }),
    }));

    const currentIndex = currentAlbumVideos.findIndex((v) => v.id === videoId);
    const hasNext = currentIndex !== -1 && currentIndex < currentAlbumVideos.length - 1;
    const hasPrevious = currentIndex > 0;

    return (
        <View style={{ flex: 1, backgroundColor: colors.playerBackground }}>
            <StatusBar style="light" hidden={!showControls} translucent />

            <PlayerGestureDetector
                showControls={showControls}
                setShowControls={setShowControls}
                currentTime={currentTime}
                setCurrentTime={setCurrentTime}
                duration={duration}
                paused={paused}
                setPaused={setPaused}
                setPlaybackRate={setPlaybackRate}
                setCentralIndicator={setCentralIndicator}
                setPanSeekTime={setPanSeekTime}
                resetControlsTimer={resetControlsTimer}
                videoRef={videoRef}
                controlsTimeout={controlsTimeout}
                skipTimeout={skipTimeout}
                panStartTime={panStartTime}
            >
                <View className="flex-1 w-full h-full" style={{ backgroundColor: colors.playerBackground }}>
                    {activeVideo ? (
                        <CorePlayer
                            ref={videoRef}
                            video={activeVideo}
                            paused={paused}
                            rate={playbackRate}
                            resizeMode="contain"
                            onLoad={(data: OnLoadData) => {
                                setDuration(data.duration);
                                durationRef.current = data.duration;
                                // Small delay to ensure the native seek has 'taken' before showing the slider
                                setTimeout(() => setIsInitialLoadDone(true), 250);
                            }}
                            onProgress={(data: OnProgressData) => {
                                if (isInitialLoadDone) {
                                    const posSec = data.currentTime;
                                    setCurrentTime(posSec);
                                    currentTimeRef.current = posSec;

                                    // ── Clipping Preview Logic ────────────────────
                                    if (previewActive && !isInSegment(posSec)) {
                                        const nextStart = getNextClipStart(posSec);
                                        if (nextStart !== -1) {
                                            videoRef.current?.seek(nextStart);
                                        }
                                    }
                                }
                            }}
                            onEnd={() => {
                                if (settings.autoPlayOnEnd && hasNext) {
                                    const nextVideo = currentAlbumVideos[currentIndex + 1];
                                    let shouldAutoPlay = true;

                                    if (settings.autoPlaySimilarPrefixOnly) {
                                        if (
                                            !activeVideo?.prefix ||
                                            activeVideo.prefix === "Unknown" ||
                                            activeVideo.prefix !== nextVideo.prefix
                                        ) {
                                            shouldAutoPlay = false;
                                        }
                                    }

                                    if (shouldAutoPlay) {
                                        router.setParams({ videoId: nextVideo.id });
                                        return;
                                    }
                                }

                                setPaused(true);
                                setCurrentTime(duration);
                            }}
                            style={{ flex: 1, width: "100%", height: "100%" }}
                        />
                    ) : (
                        <View className="flex-1 justify-center items-center">
                            <Text className="text-white/40">Loading video...</Text>
                        </View>
                    )}

                    {/* Player Corners & Custom Operations */}
                    {["top-left", "top-right", "bottom-left", "bottom-right"].map((position) => (
                        <PlayerCorner
                            key={position}
                            position={position as any}
                            hasPermission={hasBrightnessPermission}
                            showPieMenu={showPieMenu && !showControls}
                            sensitivity={settings.brightnessSensitivity}
                            onDoubleTap={handleCornerDoubleTap}
                            onExecuteOperation={handleExecuteOperation}
                            onModalChange={handleCornerModalChange}
                            onSingleTap={() => {
                                if (isCornerModalOpen.current || infoModalVisible) return;
                                if (showControls) {
                                    if (controlsTimeout.current) clearTimeout(controlsTimeout.current);
                                    setShowControls(false);
                                } else {
                                    resetControlsTimer();
                                }
                            }}
                            onBrightnessChange={handleBrightnessChange}
                        />
                    ))}

                    <PlayerCentralIndicator
                        indicator={centralIndicator}
                        panSeekTime={panSeekTime}
                        panStartTime={panStartTime.current}
                    />
                </View>
            </PlayerGestureDetector>

            <Animated.View
                pointerEvents={showControls ? "box-none" : "none"}
                style={[
                    {
                        position: "absolute",
                        inset: 0,
                        paddingLeft: insets.left,
                        paddingRight: insets.right,
                    },
                    animatedControlsStyle,
                ]}
            >
                <PlayerHeader
                    title={activeVideo?.displayName || "Video Player"}
                    orientation={orientation}
                    onToggleOrientation={toggleOrientation}
                    onSettings={() => {
                        ScreenOrientation.unlockAsync();
                        router.push("/player-settings");
                    }}
                    onBack={() => {
                        ScreenOrientation.unlockAsync();
                        router.back();
                    }}
                    onTitlePress={() => {
                        if (activeVideo) setInfoModalVisible(true);
                    }}
                />

                <PlayerControls
                    isPlaying={!paused}
                    orientation={orientation}
                    onTogglePlay={() => {
                        setPaused(!paused);
                        resetControlsTimer();
                    }}
                    onSeek={(value) => {
                        videoRef.current?.seek(value); // value is in seconds
                        setCurrentTime(value);
                        resetControlsTimer();
                    }}
                    onSkipNext={() => {
                        if (hasNext) {
                            const nextVideo = currentAlbumVideos[currentIndex + 1];
                            router.setParams({ videoId: nextVideo.id });
                        }
                    }}
                    onSkipPrevious={() => {
                        if (hasPrevious) {
                            const prevVideo = currentAlbumVideos[currentIndex - 1];
                            router.setParams({ videoId: prevVideo.id });
                        }
                    }}
                    hasNext={hasNext}
                    hasPrevious={hasPrevious}
                    currentTime={currentTime}
                    duration={duration}
                    // Clipping Props
                    isClipMode={isClipMode}
                    onToggleClipMode={() => setIsClipMode(!isClipMode)}
                    markerPairs={markerPairs}
                    previewActive={previewActive}
                    onTogglePreview={() => setPreviewActive(!previewActive)}
                    onAddMarker={() => addMarker(currentTime)}
                    onSaveSession={saveSession}
                    onRemoveMarker={removeMarker}
                    onSelectMarker={setActiveMarkerId}
                    onUpdateMarkerTime={(id, time) => {
                        updateMarkerTime(id, time);
                        videoRef.current?.seek(time); // time already in seconds
                        setCurrentTime(time);
                    }}
                    activeMarkerId={activeMarkerId}
                    isInitialLoadDone={isInitialLoadDone}
                    onDragStart={() => {
                        isDraggingMarker.current = true;
                        setPaused(true);
                    }}
                    onDragEnd={() => {
                        isDraggingMarker.current = false;
                        resetControlsTimer();
                    }}
                />
            </Animated.View>

            {!hasBrightnessPermission && permissionChecked && (
                <View className="absolute z-[100] inset-0 flex-1 bg-black/95 justify-center items-center p-6">
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
                <VideoItemDetailsModal
                    visible={infoModalVisible}
                    video={activeVideo}
                    onClose={() => setInfoModalVisible(false)}
                    onPlay={() => setInfoModalVisible(false)}
                />
            )}
        </View>
    );
}
