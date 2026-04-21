import * as Brightness from "expo-brightness";
import { Directory } from "expo-file-system";
import * as FileSystem from "expo-file-system/legacy";
import * as MediaLibrary from "expo-media-library";
import * as NavigationBar from "expo-navigation-bar";
import { useLocalSearchParams, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Text, TouchableOpacity, View } from "react-native";
import Animated, { useAnimatedStyle, withTiming } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { OnLoadData, OnProgressData, VideoRef } from "react-native-video";

import { useTheme } from "@/context/ThemeContext";
import { CorePlayer } from "../components/CorePlayer";
import { PlayerCentralIndicator, PlayerCentralIndicatorProps } from "../components/PlayerCentralIndicator";
import { PlayerControls } from "../components/PlayerControls";
import { PlayerCorner } from "../components/PlayerCorner";
import { PlayerGestureDetector } from "../components/PlayerGestureDetector";
import { PlayerHeader } from "../components/PlayerHeader";
import { SuccessBadge } from "../components/SuccessBadge";
import { useClipping } from "../hooks/useClipping";
import { useMedia, VideoMedia } from "../hooks/useMedia";
import { useSettings } from "../hooks/useSettings";
import ExpoFFmpeg from "../modules/expo-ffmpeg/src/index";
import { normalizeClipDestination } from "../utils/clipDestination";

export default function PlayerScreen() {
    const { videoId } = useLocalSearchParams<{ videoId?: string }>();
    const router = useRouter();
    const { settings, updateSettings } = useSettings();
    const { currentAlbumVideos, setLoadingTask, fetchAlbums, updateVideoProgress, getVideoById } = useMedia();
    const [activeVideo, setActiveVideo] = useState<VideoMedia | null>(null);

    useEffect(() => {
        if (videoId) {
            const cached = currentAlbumVideos.find((v) => v.id === videoId);
            if (cached) {
                setActiveVideo(cached);
            } else {
                const direct = getVideoById(videoId);
                setActiveVideo(direct);
            }
        }
    }, [videoId, currentAlbumVideos, getVideoById]);

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
    const [isEnded, setIsEnded] = useState(false);
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
    const [showSuccessBadge, setShowSuccessBadge] = useState(false);

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
            // Save on unmount or video change
            if (videoId) {
                updateVideoProgress(videoId, Math.floor(currentTimeRef.current));
            }
        };
    }, [videoId, updateVideoProgress]);

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

    useEffect(() => {
        setIsInitialLoadDone(false);
        setCurrentTime(0);
        currentTimeRef.current = 0;
        lastSaveSecRef.current = 0;
        setIsEnded(false);
    }, [videoId]);

    const currentIndex = currentAlbumVideos.findIndex((v) => v.id === videoId);
    const hasNext = currentIndex !== -1 && currentIndex < currentAlbumVideos.length - 1;
    const hasPrevious = currentIndex > 0;

    const isDraggingMarker = useRef(false);

    // Handle auto-hide controls
    const resetControlsTimer = useCallback(() => {
        if (controlsTimeout.current) clearTimeout(controlsTimeout.current);
        if (isCornerModalOpen.current) return; // Never show controls while a modal is open
        setShowControls(true);
        if (!paused && !isClipMode && !isDraggingMarker.current) {
            controlsTimeout.current = setTimeout(() => setShowControls(false), 2000);
        }
    }, [paused, isClipMode]);

    const {
        markerPairs,
        activeMarkerId,
        setActiveMarkerId,
        previewActive,
        setPreviewActive,
        addMarker,
        generateDraftSegments,
        removeMarker,
        clearMarkers,
        updateMarkerTime,
        getNextClipStart,
        isInSegment,
        maxSegmentEndTime,
    } = useClipping(currentTime);

    const handleCorePlayerProgress = useCallback(
        (data: OnProgressData) => {
            if (isInitialLoadDone) {
                const posSec = data.currentTime;
                setCurrentTime(posSec);
                currentTimeRef.current = posSec;

                // ── Periodic Save Logic ─────────────────────
                if (Math.abs(posSec - lastSaveSecRef.current) > 10) {
                    updateVideoProgress(videoId as string, Math.floor(posSec));
                    lastSaveSecRef.current = posSec;
                }

                // ── Clipping Preview Logic ────────────────────
                if (previewActive) {
                    // Stop preview once all segments have been played
                    if (maxSegmentEndTime > 0 && posSec >= maxSegmentEndTime) {
                        setPreviewActive(false);
                        setPaused(true);
                    } else if (!isInSegment(posSec)) {
                        const nextStart = getNextClipStart(posSec);
                        if (nextStart !== -1) {
                            videoRef.current?.seek(nextStart);
                        }
                    }
                }
            }
        },
        [isInitialLoadDone, previewActive, isInSegment, getNextClipStart, videoId, updateVideoProgress],
    );

    const handleCorePlayerEnd = useCallback(() => {
        if (settings.autoPlayOnEnd && hasNext) {
            const nextVideo = currentAlbumVideos[currentIndex + 1];
            let shouldAutoPlay = true;

            if (settings.autoPlaySimilarPrefixOnly) {
                if (!activeVideo?.prefix || activeVideo.prefix === "Unknown" || activeVideo.prefix !== nextVideo.prefix) {
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
        setIsEnded(true);
    }, [
        settings.autoPlayOnEnd,
        settings.autoPlaySimilarPrefixOnly,
        hasNext,
        currentAlbumVideos,
        currentIndex,
        activeVideo,
        duration,
    ]);

    const handleRestart = useCallback(() => {
        videoRef.current?.seek(0);
        setCurrentTime(0);
        setIsEnded(false);
        setPaused(false);
    }, []);

    const handleTogglePlay = useCallback(() => {
        setPaused((p) => !p);
        resetControlsTimer();
    }, [resetControlsTimer]);

    const handleSeek = useCallback(
        (value: number) => {
            videoRef.current?.seek(value);
            setCurrentTime(value);
            setIsEnded(false);
            resetControlsTimer();
        },
        [resetControlsTimer],
    );

    const handleSkipNext = useCallback(() => {
        if (hasNext) {
            const nextVideo = currentAlbumVideos[currentIndex + 1];
            router.setParams({ videoId: nextVideo.id });
        }
    }, [hasNext, currentAlbumVideos, currentIndex, router]);

    const handleSkipPrevious = useCallback(() => {
        if (hasPrevious) {
            const prevVideo = currentAlbumVideos[currentIndex - 1];
            router.setParams({ videoId: prevVideo.id });
        }
    }, [hasPrevious, currentAlbumVideos, currentIndex, router]);

    const handleSaveClip = useCallback(async () => {
        const result = generateDraftSegments();
        if (!result.success || !result.pairs || result.pairs.length === 0 || !activeVideo) {
            if (result.message) {
                setLoadingTask({
                    label: "Clip Error",
                    detail: result.message,
                    isImportant: true,
                    dismissAfter: 4000,
                });
            }
            return result;
        }

        // Show loading state while processing
        setLoadingTask({
            label: "Exporting Clip",
            detail: "Processing video segments with stream copy...",
            isImportant: true,
            minimizeAfter: 3000,
        });

        // convert segments to seconds for the native module
        const segments = result.pairs.map((p) => ({
            start: p.start.time,
            end: p.end ? p.end.time : duration,
        }));

        // Seek to the furthest end time of the clip immediately on save
        const maxEndTime = Math.max(...segments.map((s) => s.end));
        videoRef.current?.seek(maxEndTime);
        setCurrentTime(maxEndTime);

        try {
            let destination = normalizeClipDestination(settings.clipDestination || "");
            if (!destination) {
                try {
                    const directory = await Directory.pickDirectoryAsync();
                    if (!directory?.uri) {
                        setLoadingTask({
                            label: "Config Error",
                            detail: "Clip destination is not valid, change in settings.",
                            isImportant: true,
                            dismissAfter: 4000,
                        });
                        return result;
                    }
                    destination = normalizeClipDestination(directory.uri);
                    if (!destination) {
                        setLoadingTask({
                            label: "Config Error",
                            detail: "Clip destination is not valid, change in settings.",
                            isImportant: true,
                            dismissAfter: 4000,
                        });
                        return result;
                    }
                    await updateSettings({ clipDestination: destination });
                } catch (pickerError) {
                    console.warn("[Player] Failed to pick clip destination", pickerError);
                    setLoadingTask({
                        label: "Config Error",
                        detail: "Clip destination is not valid, change in settings.",
                        isImportant: true,
                        dismissAfter: 4000,
                    });
                    return result;
                }
            }

            // sanitize filename and construct output path using the user-configured clip destination
            const cleanName = activeVideo.displayName.replace(/[^a-zA-Z0-9_-]/g, "_");
            const timeSegments = segments.map((s) => `${Math.floor(s.start)}-${Math.floor(s.end)}`).join("_");
            const destDir = destination.replace(/\/+$/, ""); // strip trailing slash

            const destInfo = await FileSystem.getInfoAsync(`file://${destDir}`);
            if (!destInfo.exists || !destInfo.isDirectory) {
                console.error("[Player] Invalid clip destination directory", {
                    clipDestination: settings.clipDestination,
                    resolvedDestination: destination,
                });
                setLoadingTask({
                    label: "File Error",
                    detail: "Clip destination is not valid, change in settings.",
                    isImportant: true,
                    dismissAfter: 4000,
                });
                return result;
            }

            const outPathStr = `${destDir}/${cleanName}_${timeSegments}.mp4`;

            // execute native clipping process
            const success = await ExpoFFmpeg.clipVideo(activeVideo.uri, outPathStr, segments);

            if (success) {
                // 1. Force immediate indexing by creating a system asset
                try {
                    const asset = await MediaLibrary.createAssetAsync(`file://${outPathStr}`);
                    
                    // 2. Try to move it from DCIM back to the intended folder (Album)
                    const folderName = destDir.split("/").pop() || "Movies";
                    const album = await MediaLibrary.getAlbumAsync(folderName);
                    
                    if (album) {
                        await MediaLibrary.addAssetsToAlbumAsync([asset], album, false);
                    }
                    
                    // 3. Refresh our local view
                    fetchAlbums();
                } catch (idxError) {
                    console.warn("[Player] Failed to register and move asset:", idxError);
                    fetchAlbums(); // fallback
                }

                setLoadingTask({
                    label: "Export Success",
                    detail: `Saved to ${outPathStr}`,
                    isImportant: true,
                    dismissAfter: 5000,
                    onDismiss: () => {
                        console.log("[Player] Success task dismissed, showing badge...");
                        setShowSuccessBadge(true);
                    },
                });
                clearMarkers();
            } else {
                const nativeError = await ExpoFFmpeg.getLastClipError();
                console.error("[Player] clipVideo returned false", {
                    inputUri: activeVideo.uri,
                    outputPath: outPathStr,
                    segments,
                    nativeError,
                });
                setLoadingTask({
                    label: "Export Failed",
                    detail: nativeError ? `FFmpeg error: ${nativeError}` : "Clipping failed.",
                    isImportant: true,
                    dismissAfter: 6000,
                });
            }
        } catch (e: any) {
            console.error("Clipping error:", e);
            setLoadingTask({
                label: "Critical Error",
                detail: "An unexpected error occurred during export.",
                isImportant: true,
                dismissAfter: 5000,
            });
        }

        return result;
    }, [generateDraftSegments, activeVideo, duration, settings.clipDestination, updateSettings]);

    // Initial jump for preview
    useEffect(() => {
        if (previewActive && duration > 0) {
            const firstSegment = markerPairs
                .filter((p) => p.id !== "pair-realtime")
                .sort((a, b) => a.start.time - b.start.time)[0];
            if (firstSegment) {
                videoRef.current?.seek(firstSegment.start.time);
                if (paused) setPaused(false);
            }
        }
    }, [previewActive, duration]);

    // Auto-pause when entering clip mode and ensure controls stay visible
    useEffect(() => {
        if (isClipMode) {
            setPaused(true);
            setShowControls(true);
            if (controlsTimeout.current) {
                clearTimeout(controlsTimeout.current);
                controlsTimeout.current = null;
            }
        }
    }, [isClipMode]);

    useEffect(() => {
        if (!paused && showControls && !isClipMode && !previewActive && !isDraggingMarker.current) {
            if (controlsTimeout.current) clearTimeout(controlsTimeout.current);
            controlsTimeout.current = setTimeout(() => setShowControls(false), 2000);
        } else if (paused && showControls) {
            // Clear timer if paused to keep controls visible
            if (controlsTimeout.current) clearTimeout(controlsTimeout.current);
        }
    }, [paused, showControls, isClipMode, previewActive]);

    useEffect(() => {
        return () => {
            if (controlsTimeout.current) clearTimeout(controlsTimeout.current);
        };
    }, []);

    const { colors } = useTheme();
    const [headerLayout, setHeaderLayout] = useState<{ y: number; height: number } | null>(null);

    const animatedControlsStyle = useAnimatedStyle(() => ({
        opacity: withTiming(showControls ? 1 : 0, { duration: 150 }),
    }));

    return (
        <View style={{ flex: 1, backgroundColor: colors.playerBackground }}>
            <StatusBar style="light" hidden={!showControls} translucent />

            <PlayerGestureDetector
                showControls={showControls}
                setShowControls={setShowControls}
                currentTime={currentTime}
                currentTimeRef={currentTimeRef}
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
                            onProgress={handleCorePlayerProgress}
                            onEnd={handleCorePlayerEnd}
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
                                if (isCornerModalOpen.current) return;
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
                <PlayerHeader video={activeVideo || undefined} onLayout={(e) => setHeaderLayout(e.nativeEvent.layout)} />

                <PlayerControls
                    isPlaying={!paused}
                    onTogglePlay={handleTogglePlay}
                    onSeek={handleSeek}
                    onSkipNext={handleSkipNext}
                    onSkipPrevious={handleSkipPrevious}
                    hasNext={hasNext}
                    hasPrevious={hasPrevious}
                    currentTime={currentTime}
                    duration={duration}
                    isEnded={isEnded}
                    onRestart={handleRestart}
                    // Clipping Props
                    isClipMode={isClipMode}
                    onToggleClipMode={() => setIsClipMode(!isClipMode)}
                    markerPairs={markerPairs}
                    previewActive={previewActive}
                    onTogglePreview={() => setPreviewActive(!previewActive)}
                    onAddMarker={() => addMarker(currentTime)}
                    onSaveClip={handleSaveClip}
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
                    onDoublePressMarker={(markerTime) => {
                        videoRef.current?.seek(markerTime);
                        setCurrentTime(markerTime);
                    }}
                />
            </Animated.View>

            <PlayerCentralIndicator
                indicator={centralIndicator}
                panSeekTime={panSeekTime}
                panStartTime={panStartTime.current}
                showControls={showControls}
                headerLayout={headerLayout}
            />

            <SuccessBadge
                visible={showSuccessBadge && !showControls}
                onVisible={setShowSuccessBadge}
                duration={1000}
                style={{ top: insets.top + 15 }}
            />

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
        </View>
    );
}
