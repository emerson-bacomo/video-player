import React, { Dispatch, RefObject, SetStateAction, useMemo, useRef } from "react";
import { Dimensions } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { VideoRef } from "react-native-video";
import { useSettings } from "../hooks/useSettings";
import { PlayerCentralIndicatorProps } from "./PlayerCentralIndicator";

export interface PlayerGestureDetectorProps {
    children: React.ReactNode;

    // ── Playback state ──────────────────────────────────────────────────────
    showControls: boolean;
    setShowControls: Dispatch<SetStateAction<boolean>>;
    currentTime: number;
    setCurrentTime: Dispatch<SetStateAction<number>>;
    duration: number;
    paused: boolean;
    setPaused: Dispatch<SetStateAction<boolean>>;
    setPlaybackRate: Dispatch<SetStateAction<number>>;
    setCentralIndicator: Dispatch<SetStateAction<PlayerCentralIndicatorProps["indicator"]>>;
    setPanSeekTime: Dispatch<SetStateAction<number | null>>;
    // ── Callbacks ───────────────────────────────────────────────────────────
    resetControlsTimer: () => void;

    // ── Refs ────────────────────────────────────────────────────────────────
    videoRef: RefObject<VideoRef | null>;
    controlsTimeout: RefObject<any>;
    skipTimeout: RefObject<any>;
    panStartTime: RefObject<number>;
}

/**
 * Wraps its children in a `GestureDetector` that handles all player
 * interactions: single-tap (toggle controls), double-tap (±10 s / play-pause),
 * long-press (2× speed / frame rewind), and horizontal pan (scrub).
 */
export function PlayerGestureDetector({
    children,
    showControls,
    setShowControls,
    currentTime,
    setCurrentTime,
    duration,
    paused,
    setPaused,
    setPlaybackRate,
    setCentralIndicator,
    setPanSeekTime,
    resetControlsTimer,
    videoRef,
    controlsTimeout,
    skipTimeout,
    panStartTime,
}: PlayerGestureDetectorProps) {
    const { settings } = useSettings();
    const doubleTapSeekAmount = settings.doubleTapSeekAmount;
    const holdSeekTimer = useRef<any>(null);
    const wasPlayingBeforePan = useRef(false);

    // ── Single tap: toggle controls (corner taps ignored) ───────────────────
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

    // ── Double tap: seek ±10 s or play/pause ────────────────────────────────
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
                        const newTime = Math.max(0, currentTime - doubleTapSeekAmount);
                        videoRef.current.seek(newTime);
                        setCurrentTime(newTime);
                        setCentralIndicator((prev) => {
                            const base = prev?.icon === "skip-back" ? parseInt(prev.label || "0") : 0;
                            return { icon: "skip-back", label: `${base + doubleTapSeekAmount}s` };
                        });
                    } else if (event.x > (screenWidth * 2) / 3) {
                        const newTime = Math.min(duration, currentTime + doubleTapSeekAmount);
                        videoRef.current.seek(newTime);
                        setCurrentTime(newTime);
                        setCentralIndicator((prev) => {
                            const base = prev?.icon === "skip-fwd" ? parseInt(prev.label || "0") : 0;
                            return { icon: "skip-fwd", label: `${base + doubleTapSeekAmount}s` };
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
        [duration, currentTime, paused, doubleTapSeekAmount],
    );

    // ── Long press: 2× forward speed or frame-by-frame rewind ───────────────
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
                            // 2× rewind: step 0.064 s every 32 ms
                            setCurrentTime((prev) => {
                                const next = Math.max(0, prev - 0.064);
                                videoRef.current?.seek(next);
                                return next;
                            });
                        }, 32);
                    }
                })
                .onEnd(() => {
                    setPlaybackRate(1.0);
                    if (wasPlayingBeforePan.current) setPaused(false);
                    if (holdSeekTimer.current) clearInterval(holdSeekTimer.current);
                    setCentralIndicator(null);
                }),
        [paused],
    );

    // ── Pan: scrub timeline ─────────────────────────────────────────────────
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
                    const newTimeSec = Math.max(0, Math.min(duration, panStartTime.current + deltaSec));

                    if (Math.abs(newTimeSec - currentTime) > 0.1) {
                        videoRef.current.seek(newTimeSec);
                        setCurrentTime(newTimeSec);
                    }
                    setPanSeekTime(newTimeSec);
                })
                .onEnd(() => {
                    if (wasPlayingBeforePan.current) setPaused(false);
                    setPanSeekTime(null);
                    setCentralIndicator(null);
                }),
        [duration, currentTime, paused],
    );

    // ── Compose ─────────────────────────────────────────────────────────────
    const composedGesture = useMemo(() => {
        const holdOrSlide = Gesture.Race(longPressGesture, panGesture);
        const taps = Gesture.Exclusive(doubleTapGesture, singleTapGesture);
        return Gesture.Simultaneous(taps, holdOrSlide);
    }, [doubleTapGesture, singleTapGesture, longPressGesture, panGesture]);

    return <GestureDetector gesture={composedGesture}>{children}</GestureDetector>;
}
