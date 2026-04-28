import * as Brightness from "expo-brightness";
import * as NavigationBar from "expo-navigation-bar";
import { useLocalSearchParams, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Text, TouchableOpacity, View } from "react-native";
import Animated, { useAnimatedStyle, withTiming } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { OnLoadData, OnProgressData } from "react-native-video";

import { ClipExportModal } from "@/components/ClipExportModal";
import { CorePlayer, CorePlayerRef } from "@/components/CorePlayer";
import { PlayerCentralIndicator, PlayerCentralIndicatorProps } from "@/components/PlayerCentralIndicator";
import { PlayerControls } from "@/components/PlayerControls";
import { PlayerCorner } from "@/components/PlayerCorner";
import { PlayerGestureDetector } from "@/components/PlayerGestureDetector";
import { PlayerHeader } from "@/components/PlayerHeader";
import { SuccessBadge } from "@/components/SuccessBadge";
import { DEFAULT_PLAYED_SEC } from "@/constants/defaults";
import { useTheme } from "@/context/ThemeContext";
import { useMedia } from "@/hooks/useMedia";
import { usePlayerClip } from "@/hooks/usePlayerClip";
import { useSafeNavigation } from "@/hooks/useSafeNavigation";
import { useSettings } from "@/hooks/useSettings";
import { toast } from "sonner-native";

export default function PlayerScreen() {
    const { videoId, albumId, initialTime } = useLocalSearchParams<{
        videoId?: string;
        albumId?: string;
        initialTime?: string;
    }>();
    const router = useRouter();
    const { safeBack } = useSafeNavigation();
    const { settings, updateSettings } = useSettings();
    const { getUnfilteredVideosForAlbum, setLoadingTask, fetchAlbums, updateVideoMarkers, allAlbumsVideos } = useMedia();

    const activeVideo = useMemo(() => {
        if (!videoId || !albumId) return null;
        const albumVids = allAlbumsVideos[albumId] || [];
        return albumVids.find((v) => v.id === videoId) || null;
    }, [videoId, albumId, allAlbumsVideos]);

    const playlist = useMemo(() => {
        if (!albumId) return [];
        return allAlbumsVideos[albumId] || [];
    }, [albumId, allAlbumsVideos]);

    const [showControls, setShowControls] = useState(true);
    const [currentDisplayTime, setCurrentDisplayTime] = useState<number>(
        Math.floor(initialTime ? parseFloat(initialTime) : DEFAULT_PLAYED_SEC),
    );
    const [centralIndicator, setCentralIndicator] = useState<PlayerCentralIndicatorProps["indicator"]>(null);
    const [panSeekTime, setPanSeekTime] = useState<number | null>(null);
    const controlsTimeout = useRef<any>(null);
    const skipTimeout = useRef<any>(null);
    const panStartTime = useRef<number>(0);
    const isSeekingLock = useRef(false);

    const setSeekingLock = useCallback((locked: boolean) => {
        isSeekingLock.current = locked;
    }, []);
    const insets = useSafeAreaInsets();

    const [paused, setPaused] = useState(true);
    const [isEnded, setIsEnded] = useState(false);
    const [playbackRate, setPlaybackRate] = useState(1.0);
    const [duration, setDuration] = useState(0);
    const playerRef = useRef<CorePlayerRef>({ currentTime: 0, seek: () => {} });

    const [showPieMenu, setShowPieMenu] = useState(false);
    const [isReadyForDisplay, setIsReadyForDisplay] = useState(false);
    const isCornerModalOpen = useRef(false);
    const wasPlayingBeforePie = useRef(false);
    const [showSuccessBadge, setShowSuccessBadge] = useState(false);

    const {
        isClipMode,
        setIsClipMode,
        showClipExportModal,
        closeClipExportModal,
        exportSegments,
        defaultExportName,
        handleSaveClip,
        executeExport,
        markerPairs,
        activeMarkerId,
        setActiveMarkerId,
        previewActive,
        setPreviewActive,
        addMarker,
        removeMarker,
        updateMarkerTime,
        getNextClipStart,
        getPrevMarkerTime,
        getNextMarkerTime,
        isInSegment,
        maxSegmentEndTime,
    } = usePlayerClip({
        activeVideo,
        videoId,
        duration,
        playerRef,
        setPaused,
        settings,
        updateSettings,
        fetchAlbums,
        setLoadingTask,
        showControls,
        updateVideoMarkers,
    });

    const currentIndex = playlist.findIndex((v) => v.id === videoId);
    const hasNext = currentIndex !== -1 && currentIndex < playlist.length - 1;
    const hasPrevious = currentIndex > 0;

    const hasPrevMarker = !!getPrevMarkerTime(playerRef.current.currentTime);
    const hasNextMarker = !!getNextMarkerTime(playerRef.current.currentTime);

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

    const handleCorePlayerProgress = useCallback(
        (data: OnProgressData) => {
            const posSec = data.currentTime;
            setCurrentDisplayTime(Math.floor(posSec));

            // Clipping Preview Logic
            if (previewActive && isReadyForDisplay) {
                if (maxSegmentEndTime > 0 && posSec >= maxSegmentEndTime) {
                    setPreviewActive(false);
                    setPaused(true);
                } else if (!isInSegment(posSec)) {
                    const nextStart = getNextClipStart(posSec);
                    if (nextStart !== -1) {
                        playerRef.current.seek(nextStart);
                    }
                }
            }
        },
        [isReadyForDisplay, previewActive, isInSegment, getNextClipStart, setPreviewActive, maxSegmentEndTime],
    );

    const handleCorePlayerEnd = useCallback(() => {
        if (settings.autoPlayOnEnd && hasNext) {
            const nextVideo = playlist[currentIndex + 1];
            let shouldAutoPlay = true;

            if (settings.autoPlaySimilarPrefixOnly) {
                if (!activeVideo?.prefix || activeVideo.prefix === "Unknown" || activeVideo.prefix !== nextVideo.prefix) {
                    shouldAutoPlay = false;
                }
            }

            if (shouldAutoPlay) {
                router.setParams({
                    videoId: nextVideo.id,
                    albumId,
                    initialTime: (nextVideo.lastPlayedSec || 0).toString(),
                });
                return;
            }
        }

        setPaused(true);
        setCurrentDisplayTime(Math.floor(duration));
        setIsEnded(true);
    }, [
        settings.autoPlayOnEnd,
        settings.autoPlaySimilarPrefixOnly,
        hasNext,
        playlist,
        currentIndex,
        activeVideo,
        albumId,
        duration,
        router,
    ]);

    const handleRestart = useCallback(() => {
        playerRef.current.seek(0);
        setCurrentDisplayTime(0);
        setIsEnded(false);
        setPaused(false);
    }, []);

    const handleTogglePlay = useCallback(() => {
        setPaused((p) => !p);
        resetControlsTimer();
    }, [resetControlsTimer]);

    const handleSeek = useCallback(
        (value: number) => {
            playerRef.current.seek(value);
            setIsEnded(false);
            resetControlsTimer();
        },
        [resetControlsTimer],
    );

    const handleSkipNext = useCallback(() => {
        if (hasNext) {
            const nextVideo = playlist[currentIndex + 1];
            router.setParams({
                videoId: nextVideo.id,
                albumId,
                initialTime: (nextVideo.lastPlayedSec || 0).toString(),
            });
        }
    }, [hasNext, playlist, currentIndex, router, albumId]);

    const handleSkipPrevious = useCallback(() => {
        if (hasPrevious) {
            const prevVideo = playlist[currentIndex - 1];
            router.setParams({
                videoId: prevVideo.id,
                albumId,
                initialTime: (prevVideo.lastPlayedSec || 0).toString(),
            });
        }
    }, [hasPrevious, playlist, currentIndex, router, albumId]);

    const handleSeekToPrevMarker = useCallback(() => {
        const currentPos = playerRef.current.currentTime;
        const target = getPrevMarkerTime(currentPos);
        if (target) {
            playerRef.current.seek(target.time);
            setActiveMarkerId(target.markerId);
        }
    }, [getPrevMarkerTime, setActiveMarkerId]);

    const handleSeekToNextMarker = useCallback(() => {
        const currentPos = playerRef.current.currentTime;
        const target = getNextMarkerTime(currentPos);
        if (target) {
            playerRef.current.seek(target.time);
            setActiveMarkerId(target.markerId);
        }
    }, [getNextMarkerTime, setActiveMarkerId]);

    useEffect(() => {
        if (videoId && albumId) {
            const albumVids = getUnfilteredVideosForAlbum(albumId);
            const activeVid = albumVids.find((v) => v.id === videoId);

            if (!activeVid && !isReadyForDisplay) {
                toast.error("Video not found.");
                safeBack();
            }
        }
    }, [videoId, albumId, allAlbumsVideos, safeBack, isReadyForDisplay, getUnfilteredVideosForAlbum]);

    // On mount: clear any background task that isn't clip-related (e.g. thumbnail generation).
    // The player has its own LoadingStatus in PlayerHeader that only shows clip tasks anyway.
    useEffect(() => {
        setLoadingTask((prev) => (prev && !prev.id?.startsWith("clip-") ? null : prev));
    }, []);

    const handleCornerModalChange = useCallback((isOpen: boolean) => {
        isCornerModalOpen.current = isOpen;
        if (isOpen) {
            if (controlsTimeout.current) clearTimeout(controlsTimeout.current);
            setShowControls(false);
        }
    }, []);

    const handleCornerDoubleTap = useCallback(() => {
        setShowPieMenu((prev) => {
            const next = !prev;
            if (next) {
                wasPlayingBeforePie.current = !paused;
                setPaused(true);
            } else {
                if (wasPlayingBeforePie.current) {
                    setPaused(false);
                }
            }
            return next;
        });
    }, [paused]);

    const handleExecuteOperation = useCallback(
        async (op: any) => {
            if (op.type === "seek") {
                const currentPos = playerRef.current.currentTime;
                const deltaSec = op.value || 0;
                const newTime = Math.max(0, Math.min(duration, currentPos + deltaSec));
                playerRef.current.seek(newTime);

                const iconName = op.value >= 0 ? "skip-fwd" : "skip-back";
                setCentralIndicator({
                    icon: iconName as any,
                    label: op.label || `${op.value > 0 ? "+" : ""}${op.value}s`,
                });

                if (skipTimeout.current) clearTimeout(skipTimeout.current);
                skipTimeout.current = setTimeout(() => setCentralIndicator(null), 800);
            }
        },
        [duration],
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
        setDuration(0);
        setIsReadyForDisplay(false);
        setIsEnded(false);
        setCurrentDisplayTime(Math.floor(initialTime ? parseFloat(initialTime) : DEFAULT_PLAYED_SEC));
    }, [videoId, initialTime]);

    // Always keep a ref to the latest resetControlsTimer so the videoId effect
    // can call it without adding it (and its paused/isClipMode deps) to its own dep array.
    const resetControlsTimerRef = useRef(resetControlsTimer);
    useEffect(() => {
        resetControlsTimerRef.current = resetControlsTimer;
    });
    useEffect(() => {
        resetControlsTimerRef.current();
    }, [videoId]);

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
                duration={duration}
                paused={paused}
                setPaused={setPaused}
                setPlaybackRate={setPlaybackRate}
                setCentralIndicator={setCentralIndicator}
                setPanSeekTime={setPanSeekTime}
                resetControlsTimer={resetControlsTimer}
                playerRef={playerRef}
                controlsTimeout={controlsTimeout}
                skipTimeout={skipTimeout}
                panStartTime={panStartTime}
                setSeekingLock={setSeekingLock}
            >
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
                                initialTime={initialTime ? parseFloat(initialTime) : undefined}
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
                <PlayerHeader
                    video={activeVideo || undefined}
                    setPaused={setPaused}
                    onLayout={(e) => setHeaderLayout(e.nativeEvent.layout)}
                />

                <PlayerControls
                    isPlaying={!paused}
                    onTogglePlay={handleTogglePlay}
                    onSeek={handleSeek}
                    onSkipNext={handleSkipNext}
                    onSkipPrevious={handleSkipPrevious}
                    hasNext={hasNext}
                    hasPrevious={hasPrevious}
                    currentDisplayTime={currentDisplayTime}
                    duration={duration}
                    isEnded={isEnded}
                    onRestart={handleRestart}
                    setSeekingLock={setSeekingLock}
                    // Clipping Props
                    isClipMode={isClipMode}
                    onToggleClipMode={() => {
                        setIsClipMode(!isClipMode);
                        if (!isClipMode) {
                            setPaused(true);
                            resetControlsTimer();
                        }
                    }}
                    markerPairs={markerPairs}
                    previewActive={previewActive}
                    onTogglePreview={() => setPreviewActive(!previewActive)}
                    onAddMarker={() => {
                        addMarker(playerRef.current.currentTime);
                    }}
                    onSaveClip={handleSaveClip}
                    onRemoveMarker={removeMarker}
                    onAdjustCurrentMarker={() => {
                        const pos = playerRef.current.currentTime;
                        if (pos !== undefined && activeMarkerId) {
                            updateMarkerTime(activeMarkerId, pos);
                            playerRef.current.seek(pos);
                        }
                    }}
                    onSeekToPrevMarker={handleSeekToPrevMarker}
                    onSeekToNextMarker={handleSeekToNextMarker}
                    hasPrevMarker={hasPrevMarker}
                    hasNextMarker={hasNextMarker}
                    onSelectMarker={setActiveMarkerId}
                    onUpdateMarkerTime={(id, time) => {
                        updateMarkerTime(id, time);
                        playerRef.current.seek(time);
                    }}
                    isReadyForDisplay={isReadyForDisplay}
                    activeMarkerId={activeMarkerId}
                    onDragStart={() => {
                        isDraggingMarker.current = true;
                        setPaused(true);
                    }}
                    onDragEnd={() => {
                        isDraggingMarker.current = false;
                        resetControlsTimer();
                    }}
                    onDoublePressMarker={(markerTime) => {
                        playerRef.current.seek(markerTime);
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
                    visible={showClipExportModal}
                    onClose={closeClipExportModal}
                    video={activeVideo}
                    segments={exportSegments}
                    defaultName={defaultExportName}
                    onExport={(opts) => {
                        executeExport(opts);
                        if (!showControls) {
                            setShowSuccessBadge(true);
                        }
                    }}
                    settings={settings}
                    updateSettings={updateSettings}
                />
            )}
        </View>
    );
}
