import { useCallback, useRef } from "react";
import { usePlayerContext } from "@/context/PlayerContext";
import { usePlayerControls } from "@/hooks/usePlayerControls";

export const usePlayerCorner = () => {
    const {
        paused,
        setPaused,
        setShowControls,
        showControls,
        controlsTimeout,
        isCornerModalOpen,
        resetControlsTimer,
        showPieMenu,
        setShowPieMenu,
        wasPlayingBeforePie,
        setCentralIndicator,
    } = usePlayerContext();

    const { onSkipNext, onSkipPrevious } = usePlayerControls();
    const brightnessTimeoutRef = useRef<any>(null);

    const handleCornerModalChange = useCallback(
        (isOpen: boolean) => {
            isCornerModalOpen.current = isOpen;
            if (isOpen) {
                if (controlsTimeout.current) clearTimeout(controlsTimeout.current);
                setShowControls(false);
            }
        },
        [isCornerModalOpen, controlsTimeout, setShowControls],
    );

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
    }, [paused, setPaused, setShowPieMenu, wasPlayingBeforePie]);

    const handleBrightnessChange = useCallback(
        (val: number) => {
            setCentralIndicator({ icon: "brightness", label: `${Math.round(val * 100)}%`, value: val });
            if (brightnessTimeoutRef.current) clearTimeout(brightnessTimeoutRef.current);
            brightnessTimeoutRef.current = setTimeout(() => setCentralIndicator(null), 800);
        },
        [setCentralIndicator],
    );

    const handleSingleTap = useCallback(() => {
        if (isCornerModalOpen.current) return;
        if (showControls) {
            // If controls are visible, tapping the corner (where header/footer buttons reside) should not hide them
            return;
        } else {
            resetControlsTimer();
        }
    }, [isCornerModalOpen, showControls, resetControlsTimer]);

    return {
        showPieMenu,
        handleCornerModalChange,
        handleCornerDoubleTap,
        handleBrightnessChange,
        handleSingleTap,
        handleSkipNext: onSkipNext,
        handleSkipPrevious: onSkipPrevious,
        setCentralIndicator,
    };
};
