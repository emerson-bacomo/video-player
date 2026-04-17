import * as Brightness from "expo-brightness";
import * as NavigationBar from "expo-navigation-bar";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as ScreenOrientation from "expo-screen-orientation";
import { StatusBar } from "expo-status-bar";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Dimensions, Text, TouchableOpacity, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { useAnimatedStyle, withTiming } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Video, { OnLoadData, OnProgressData, VideoRef } from "react-native-video";

import { useTheme } from "@/context/ThemeContext";
import { PlayerCentralIndicator, PlayerCentralIndicatorProps } from "../components/PlayerCentralIndicator";
import { PlayerControls } from "../components/PlayerControls";
import { PlayerCorner } from "../components/PlayerCorner";
import { PlayerHeader } from "../components/PlayerHeader";
import { VideoItemDetailsModal } from "../components/VideoItemDetailsModal";
import { useClipping } from "../hooks/useClipping";
import { useMedia } from "../hooks/useMedia";
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
    const { videos } = useMedia();
    const activeVideo = videos.find((v) => v.id === videoId);
    const [infoModalVisible, setInfoModalVisible] = useState(false);

    const [showControls, setShowControls] = useState(true);
    const [currentTime, setCurrentTime] = useState(resumeMs ? Number(resumeMs) : 0);
    const [isClipMode, setIsClipMode] = useState(false);
    const [centralIndicator, setCentralIndicator] = useState<PlayerCentralIndicatorProps["indicator"]>(null);
    const [panSeekTime, setPanSeekTime] = useState<number | null>(null);
    const controlsTimeout = useRef<any>(null);
    const skipTimeout = useRef<any>(null);
    const panStartTime = useRef<number>(0);
    const holdSeekTimer = useRef<any>(null);
    const wasPlayingBeforePan = useRef(false);
    const isUnmounted = useRef(false);
    const insets = useSafeAreaInsets();

    const [paused, setPaused] = useState(true);
    const [playbackRate, setPlaybackRate] = useState(1.0);
    const [duration, setDuration] = useState(0);
    const videoRef = useRef<VideoRef>(null);

    const [showPieMenu, setShowPieMenu] = useState(false);
    const initialSeekDone = useRef(false);
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
                const deltaMs = (op.value || 0) * 1000;
                const newTime = Math.max(0, Math.min(duration, currentTime + deltaMs));
                videoRef.current.seek(newTime / 1000);
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
    }, []);

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

    // Sync Progress & Clipping Preview & Auto Save
    useEffect(() => {
        let lastSaveMs = 0;
        const interval = setInterval(() => {
            if (isUnmounted.current || !videoRef.current || isDraggingMarker.current || paused) return;

            const posMs = currentTime;

            // Save playback progress every 5 seconds
            if (videoId && !paused && Math.abs(posMs - lastSaveMs) > 5000) {
                savePlaybackData(videoId, posMs);
                lastSaveMs = posMs;
            }

            if (previewActive && !isInSegment(posMs)) {
                const nextStart = getNextClipStart(posMs);
                if (nextStart !== -1) {
                    videoRef.current?.seek(nextStart / 1000);
                }
            }
        }, 500);

        return () => {
            clearInterval(interval);
            // Final save on unmount
            if (videoId && !isUnmounted.current) {
                try {
                    if (currentTime > 0) {
                        savePlaybackData(videoId, currentTime);
                    }
                } catch (e) {
                    console.log("[Player] Error saving on unmount:", e);
                }
            }
        };
    }, [paused, previewActive, isInSegment, getNextClipStart, videoId, currentTime]);

    const { colors } = useTheme();

    const singleTapGesture = useMemo(
        () =>
            Gesture.Tap()
                .numberOfTaps(1)
                .runOnJS(true)
                .onEnd((event) => {
                    const w = Dimensions.get("window").width;
                    const h = Dimensions.get("window").height;
                    const isCornerX = event.x < w * 0.2 || event.x > w * 0.8;
                    const isCornerY = event.y < h * 0.2 || event.y > h * 0.8;
                    if (isCornerX && isCornerY) return;

                    if (showControls) {
                        if (controlsTimeout.current) clearTimeout(controlsTimeout.current);
                        setShowControls(false);
                    } else {
                        resetControlsTimer();
                    }
                }),
        [showControls, resetControlsTimer],
    );

    const doubleTapGesture = useMemo(
        () =>
            Gesture.Tap()
                .numberOfTaps(2)
                .runOnJS(true)
                .onEnd((event) => {
                    if (!videoRef.current) return;
                    const screenWidth = Dimensions.get("window").width;
                    const screenHeight = Dimensions.get("window").height;
                    const isCornerX = event.x < screenWidth * 0.2 || event.x > screenWidth * 0.8;
                    const isCornerY = event.y < screenHeight * 0.2 || event.y > screenHeight * 0.8;
                    if (isCornerX && isCornerY) return;

                    if (skipTimeout.current) clearTimeout(skipTimeout.current);

                    if (event.x < screenWidth / 3) {
                        const newTime = Math.max(0, currentTime - 10000);
                        videoRef.current.seek(newTime / 1000);
                        setCurrentTime(newTime);
                        setCentralIndicator((prev) => {
                            const base = prev?.icon === "skip-back" ? parseInt(prev.label || "0") : 0;
                            return { icon: "skip-back", label: `${base + 10}s` };
                        });
                    } else if (event.x > (screenWidth * 2) / 3) {
                        const newTime = Math.min(duration, currentTime + 10000);
                        videoRef.current.seek(newTime / 1000);
                        setCurrentTime(newTime);
                        setCentralIndicator((prev) => {
                            const base = prev?.icon === "skip-fwd" ? parseInt(prev.label || "0") : 0;
                            return { icon: "skip-fwd", label: `${base + 10}s` };
                        });
                    } else {
                        if (!paused) {
                            setPaused(true);
                            setCentralIndicator({ icon: "pause" });
                        } else {
                            setPaused(false);
                            setCentralIndicator({ icon: "play" });
                        }
                    }

                    skipTimeout.current = setTimeout(() => setCentralIndicator(null), 800);
                }),
        [duration, currentTime, paused],
    );

    const longPressGesture = useMemo(
        () =>
            Gesture.LongPress()
                .runOnJS(true)
                .onStart((event) => {
                    if (!videoRef.current) return;
                    wasPlayingBeforePan.current = !paused;
                    const screenWidth = Dimensions.get("window").width;
                    const direction = event.x > screenWidth / 2 ? 1 : -1;

                    if (direction === 1) {
                        setPlaybackRate(2.0);
                        setCentralIndicator({ icon: "speed", label: "2X", direction: 1 });
                    } else {
                        setPaused(true);
                        setCentralIndicator({ icon: "speed", label: "2X", direction: -1 });
                        if (holdSeekTimer.current) clearInterval(holdSeekTimer.current);
                        holdSeekTimer.current = setInterval(() => {
                            // Manual position control for backward
                            setCurrentTime((prev) => {
                                const next = Math.max(0, prev - 64);
                                videoRef.current?.seek(next / 1000);
                                return next;
                            });
                        }, 32);
                    }
                })
                .onEnd(() => {
                    setPlaybackRate(1.0);
                    if (wasPlayingBeforePan.current) {
                        setPaused(false);
                    }
                    if (holdSeekTimer.current) clearInterval(holdSeekTimer.current);
                    setCentralIndicator(null);
                }),
        [paused],
    );

    const panGesture = useMemo(
        () =>
            Gesture.Pan()
                .activeOffsetX([-10, 10])
                .runOnJS(true)
                .onStart(() => {
                    if (!videoRef.current) return;
                    wasPlayingBeforePan.current = !paused;
                    setPaused(true);
                    panStartTime.current = currentTime;
                    setCentralIndicator({ icon: "seek" });
                })
                .onUpdate((event) => {
                    if (!videoRef.current) return;
                    const deltaSec = event.translationX * 0.15;
                    const newTimeMs = Math.max(0, Math.min(duration, panStartTime.current + deltaSec * 1000));

                    if (Math.abs(newTimeMs - currentTime) > 100) {
                        videoRef.current.seek(newTimeMs / 1000);
                        setCurrentTime(newTimeMs);
                    }

                    setPanSeekTime(newTimeMs);
                })
                .onEnd(() => {
                    if (wasPlayingBeforePan.current) {
                        setPaused(false);
                    }
                    setPanSeekTime(null);
                    setCentralIndicator(null);
                }),
        [duration, currentTime, paused],
    );

    const composedGesture = useMemo(() => {
        const holdOrSlide = Gesture.Race(longPressGesture, panGesture);
        const taps = Gesture.Exclusive(doubleTapGesture, singleTapGesture);
        return Gesture.Simultaneous(taps, holdOrSlide);
    }, [doubleTapGesture, singleTapGesture, longPressGesture, panGesture]);

    const animatedControlsStyle = useAnimatedStyle(() => ({
        opacity: withTiming(showControls ? 1 : 0, { duration: 150 }),
    }));

    return (
        <View style={{ flex: 1, backgroundColor: colors.playerBackground }}>
            <StatusBar style="light" hidden={!showControls} translucent />

            <GestureDetector gesture={composedGesture}>
                <View className="flex-1 w-full h-full" style={{ backgroundColor: colors.playerBackground }}>
                    <Video
                        ref={videoRef}
                        source={{ uri: uri as string }}
                        style={{ flex: 1, width: "100%", height: "100%" }}
                        paused={paused}
                        rate={playbackRate}
                        resizeMode="contain"
                        onLoad={(data: OnLoadData) => {
                            setDuration(data.duration * 1000);
                            const resumeTime = resumeMs ? Number(resumeMs) : 0;
                            if (resumeMs && !initialSeekDone.current) {
                                videoRef.current?.seek(resumeTime / 1000);
                                setCurrentTime(resumeTime);
                                initialSeekDone.current = true;
                            }
                            // Small delay to ensure the native seek has 'taken' before showing the slider
                            setTimeout(() => setIsInitialLoadDone(true), 250);
                        }}
                        onProgress={(data: OnProgressData) => {
                            if (isInitialLoadDone) {
                                setCurrentTime(data.currentTime * 1000);
                            }
                        }}
                        onEnd={() => {
                            setPaused(true);
                            setCurrentTime(duration);
                        }}
                        playInBackground={false}
                        playWhenInactive={false}
                    />

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
            </GestureDetector>

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
                    title={title || "Video Player"}
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
                        videoRef.current?.seek(value / 1000);
                        setCurrentTime(value);
                        resetControlsTimer();
                    }}
                    onSkipNext={() => {
                        const next = Math.min(duration, currentTime + 10000);
                        videoRef.current?.seek(next / 1000);
                        setCurrentTime(next);
                    }}
                    onSkipPrevious={() => {
                        const prev = Math.max(0, currentTime - 10000);
                        videoRef.current?.seek(prev / 1000);
                        setCurrentTime(prev);
                    }}
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
                        videoRef.current?.seek(time / 1000);
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
