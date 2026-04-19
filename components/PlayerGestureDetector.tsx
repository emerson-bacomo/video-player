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
    currentTimeRef: RefObject<number>;
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
    currentTimeRef,
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
    const lastTapHandledAt = useRef<number>(0);
    const accumulatedSeek = useRef<number>(0);
    const currentSeekDir = useRef<"back" | "fwd" | null>(null);
    const seekTargetRef = useRef<number>(0);

    const wasPlayingBeforePan = useRef(false);
    const wasControlsShownBeforePan = useRef(false);
    const isActualPan = useRef(false);
    const isSpeedHolding = useRef(false);
    const isPanValidated = useRef(false);

    const handleSnowballTap = React.useCallback(
        (side: "back" | "fwd") => {
            const now = Date.now();
            const isWithinSnowball = now - lastTapHandledAt.current < 1000;
            const amount = doubleTapSeekAmount;

            if (isWithinSnowball && currentSeekDir.current === side) {
                accumulatedSeek.current += amount;
            } else {
                accumulatedSeek.current = amount;
                currentSeekDir.current = side;
                seekTargetRef.current = currentTimeRef.current || 0;
            }

            const nextTime =
                side === "back"
                    ? Math.max(0, seekTargetRef.current - amount)
                    : Math.min(duration, seekTargetRef.current + amount);

            seekTargetRef.current = nextTime;
            videoRef.current?.seek(nextTime);
            setCurrentTime(nextTime);
            lastTapHandledAt.current = now;

            setCentralIndicator({
                icon: side === "back" ? "skip-back" : "skip-fwd",
                label: `${accumulatedSeek.current}s`,
            });

            if (skipTimeout.current) clearTimeout(skipTimeout.current);
            skipTimeout.current = setTimeout(() => {
                setCentralIndicator(null);
                accumulatedSeek.current = 0;
                currentSeekDir.current = null;
            }, 1000);
        },
        [doubleTapSeekAmount, duration, setCurrentTime, setCentralIndicator, videoRef, currentTimeRef],
    );

    // ── Single tap: toggle controls or accumulate seek ──────────────────────
    const singleTapGesture = useMemo(
        () =>
            Gesture.Tap()
                .numberOfTaps(1)
                .maxDistance(15)
                .runOnJS(true)
                .onEnd((event) => {
                    const screenWidth = Dimensions.get("window").width;

                    // 1. Check if we are in "Snowball Seek" mode (within 1s of last tap)
                    const isWithinSnowball = Date.now() - lastTapHandledAt.current < 1000;
                    const side = event.x < screenWidth / 3 ? "back" : event.x > (screenWidth * 2) / 3 ? "fwd" : null;

                    if (isWithinSnowball && side && currentSeekDir.current === side) {
                        handleSnowballTap(side);
                        return;
                    }

                    // 2. Otherwise: Normal control toggle
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
        [showControls, resetControlsTimer, handleSnowballTap],
    );

    // ── Double tap: start snowball seek or play/pause ───────────────────────
    const doubleTapGesture = useMemo(
        () =>
            Gesture.Tap()
                .numberOfTaps(2)
                .runOnJS(true)
                .onEnd((event) => {
                    if (!videoRef?.current) return;
                    const screenWidth = Dimensions.get("window").width;
                    const screenHeight = Dimensions.get("window").height;
                    const isCornerX = event.x < screenWidth * 0.2 || event.x > screenWidth * 0.8;
                    const isCornerY = event.y < screenHeight * 0.2 || event.y > screenHeight * 0.8;
                    if (isCornerX && isCornerY) return;

                    if (event.x < screenWidth / 3) {
                        handleSnowballTap("back");
                    } else if (event.x > (screenWidth * 2) / 3) {
                        handleSnowballTap("fwd");
                    } else {
                        // Reset snowball on middle tap
                        accumulatedSeek.current = 0;
                        currentSeekDir.current = null;

                        if (!paused) {
                            setPaused(true);
                            setCentralIndicator({ icon: "pause" });
                        } else {
                            setPaused(false);
                            setCentralIndicator({ icon: "play" });
                            if (showControls) {
                                if (controlsTimeout.current) clearTimeout(controlsTimeout.current);
                                setShowControls(false);
                            }
                        }
                    }
                }),
        [paused, showControls, setShowControls, handleSnowballTap],
    );

    // Long press: 2× forward speed
    const longPressGesture = useMemo(
        () =>
            Gesture.LongPress()
                .minDuration(500)
                .maxDistance(100000) // Virtually ignore distance once held
                .runOnJS(true)
                .onStart(() => {
                    if (!videoRef?.current || isActualPan.current) return;
                    isSpeedHolding.current = true;
                    wasPlayingBeforePan.current = !paused;
                    wasControlsShownBeforePan.current = showControls;
                    setPlaybackRate(2.0);
                    setPaused(false);
                    setCentralIndicator({ icon: "speed", label: "2X", direction: 1 });
                })
                .onEnd(() => {
                    isSpeedHolding.current = false;
                    setPlaybackRate(1.0);
                    if (!wasPlayingBeforePan.current) {
                        setPaused(true);
                    }
                    if (wasControlsShownBeforePan.current) {
                        resetControlsTimer();
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
                .onStart((event) => {
                    if (!videoRef?.current || isSpeedHolding.current) return;
                    if (Math.abs(event.translationY) > Math.abs(event.translationX)) {
                        isActualPan.current = false;
                        return;
                    }
                    isActualPan.current = true;
                    isPanValidated.current = false;
                    // Reset panStartTime marker to indicate we haven't "started" the UI yet
                    panStartTime.current = -1;
                })
                .onUpdate((event) => {
                    if (!videoRef?.current || !isActualPan.current) return;

                    // 1. Ratio Check & Validation
                    if (!isPanValidated.current) {
                        if (Math.abs(event.translationY) > Math.abs(event.translationX)) {
                            // If we already started the UI, reset it
                            if (panStartTime.current !== -1) {
                                setPanSeekTime(null);
                                setCentralIndicator(null);
                                if (wasPlayingBeforePan.current) setPaused(false);
                            }
                            isActualPan.current = false;
                            return;
                        }

                        // Once we move enough horizontally (20px), we validate the pan
                        if (Math.abs(event.translationX) > 20) {
                            isPanValidated.current = true;
                        }
                    }

                    // 2. UI Activation (Happens once we've confirmed it's horizontal or moved enough)
                    // We wait for 15px total to show the indicator to avoid the +0s flicker on vertical swipes
                    if (panStartTime.current === -1 && Math.abs(event.translationX) > 15) {
                        panStartTime.current = currentTime;
                        wasPlayingBeforePan.current = !paused;
                        setPaused(true);
                        setCentralIndicator({ icon: "seek" });
                    }

                    // 3. Seeking Logic (only if UI is active)
                    if (panStartTime.current !== -1) {
                        // 160 dp = 1 inch, 1 inch = 2.54 cm. So 1 cm = 160 / 2.54 ≈ 62.99 dp.
                        const dpPerCm = 160 / 2.54;
                        const deltaSec = (event.translationX / dpPerCm) * settings.panSeekSensitivity;
                        const newTimeSec = Math.max(0, Math.min(duration, panStartTime.current + deltaSec));

                        if (Math.abs(newTimeSec - currentTime) > 0.1) {
                            videoRef.current.seek(newTimeSec);
                            setCurrentTime(newTimeSec);
                        }
                        setPanSeekTime(newTimeSec);
                    }
                })
                .onEnd(() => {
                    if (!isActualPan.current || panStartTime.current === -1) return;
                    if (wasPlayingBeforePan.current) setPaused(false);
                    setPanSeekTime(null);
                    setCentralIndicator(null);
                    isActualPan.current = false;
                    isPanValidated.current = false;
                }),
        [duration, currentTime, paused],
    );

    // ── Compose ─────────────────────────────────────────────────────────────
    const composedGesture = useMemo(() => {
        // Taps are exclusive to prevent double-firings
        const taps = Gesture.Exclusive(doubleTapGesture, singleTapGesture);

        // Everything else is simultaneous for maximum responsiveness
        // Pan and LongPress are manually guarded via isSpeedHolding.current
        return Gesture.Simultaneous(taps, panGesture, longPressGesture);
    }, [doubleTapGesture, singleTapGesture, longPressGesture, panGesture]);

    return <GestureDetector gesture={composedGesture}>{children}</GestureDetector>;
}
