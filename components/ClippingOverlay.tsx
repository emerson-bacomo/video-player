import { cn } from "@/lib/utils";
import React from "react";
import { View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { Marker, MarkerPair } from "../hooks/usePlayerClip";

interface MarkerThumbProps {
    marker: Marker;
    duration: number;
    activeWidth: number;
    isActiveMarker: boolean;
    onUpdateMarkerTime: (id: string, time: number) => void;
    onSelectMarker: (id: string) => void;
    onDoublePress?: (markerTime: number) => void;
    onDragStart?: () => void;
    onDragEnd?: () => void;
}

const MarkerThumb = React.memo(
    ({
        marker,
        duration,
        activeWidth,
        isActiveMarker,
        onUpdateMarkerTime,
        onSelectMarker,
        onDoublePress,
        onDragStart,
        onDragEnd,
    }: MarkerThumbProps) => {
        const dragStartTime = React.useRef<number | null>(null);
        const HORIZONTAL_PADDING = 15;
        const DRAG_DAMPING = 0.85;

        const left = HORIZONTAL_PADDING + (Math.floor(marker.time) / duration) * activeWidth;

        if (marker.markerId === "realtime") {
            return (
                <View
                    key={`marker-${marker.markerId}`}
                    className="absolute w-12 h-6 -ml-6 items-center z-10"
                    style={{ left }}
                    pointerEvents="none"
                >
                    <View className="w-1.5 h-6 bg-white/50 rounded-full" />
                </View>
            );
        }

        const pan = Gesture.Pan()
            .runOnJS(true)
            .onStart(() => {
                dragStartTime.current = marker.time;
                onSelectMarker(marker.markerId);
                if (onDragStart) onDragStart();
            })
            .onUpdate((event) => {
                if (dragStartTime.current === null) return;
                const deltaX = event.translationX * DRAG_DAMPING;
                const deltaT = (deltaX / activeWidth) * duration;
                const newTime = Math.max(0, Math.min(duration, dragStartTime.current + deltaT));
                onUpdateMarkerTime(marker.markerId, newTime);
            })
            .onEnd(() => {
                dragStartTime.current = null;
                if (onDragEnd) onDragEnd();
            });

        const doubleTap = Gesture.Tap()
            .numberOfTaps(2)
            .runOnJS(true)
            .onEnd(() => {
                if (onDoublePress) {
                    onDoublePress(marker.time);
                    onSelectMarker(marker.markerId);
                }
            });

        const singleTap = Gesture.Tap()
            .numberOfTaps(1)
            .runOnJS(true)
            .onEnd(() => {
                onSelectMarker(marker.markerId);
            });

        const taps = Gesture.Exclusive(doubleTap, singleTap);
        const composed = Gesture.Race(pan, taps);

        return (
            <GestureDetector gesture={composed}>
                <View
                    className="absolute items-center justify-center"
                    style={{
                        left: left - 15,
                        top: -10,
                        width: 30,
                        height: 24,
                        zIndex: isActiveMarker ? 50 : 30,
                    }}
                >
                    <View
                        style={{
                            width: 0,
                            height: 0,
                            backgroundColor: "transparent",
                            borderStyle: "solid",
                            borderLeftWidth: 6,
                            borderRightWidth: 6,
                            borderTopWidth: 10,
                            borderLeftColor: "transparent",
                            borderRightColor: "transparent",
                            borderTopColor: isActiveMarker ? "#fbbf24" : "white",
                            transform: [
                                { scale: isActiveMarker ? 1.3 : 1 },
                                { translateY: isActiveMarker ? -1.5 : 0 }, // Counter-offset to keep bottom aligned
                            ],
                        }}
                    />
                </View>
            </GestureDetector>
        );
    },
);

interface ClippingOverlayProps {
    markerPairs: MarkerPair[];
    duration: number;
    width: number;
    onUpdateMarkerTime: (id: string, time: number) => void;
    onSelectMarker: (id: string) => void;
    onDoublePressMarker?: (markerTime: number) => void;
    activeMarkerId: string | null;
    onDragStart?: () => void;
    onDragEnd?: () => void;
    previewActive?: boolean;
}

export const ClippingOverlay: React.FC<ClippingOverlayProps> = ({
    markerPairs,
    duration,
    width,
    onUpdateMarkerTime,
    onSelectMarker,
    onDoublePressMarker,
    activeMarkerId,
    onDragStart,
    onDragEnd,
    previewActive = false,
}) => {
    if (duration <= 0 || width <= 0) return null;

    const HORIZONTAL_PADDING = 15;
    const activeWidth = width - HORIZONTAL_PADDING * 2;

    return (
        <View className="absolute inset-0 h-10 z-10" style={{ width }}>
            {/* Clip Segments */}
            {markerPairs.map((pair) => {
                if (!pair.end) return null;

                const left = HORIZONTAL_PADDING + (Math.floor(pair.start.time) / duration) * activeWidth;
                const clipWidth = ((Math.floor(pair.end.time) - Math.floor(pair.start.time)) / duration) * activeWidth;

                return (
                    <View
                        key={`pair-${pair.id}`}
                        className="absolute h-4 top-[12px] justify-center"
                        style={{
                            left,
                            width: clipWidth,
                            zIndex: 20,
                        }}
                    >
                        <View
                            className={cn(
                                "h-2 rounded-full border-y border-white/20",
                                previewActive ? "bg-emerald-500/80" : "bg-amber-400/60",
                            )}
                        />
                    </View>
                );
            })}

            {/* Clip Markers */}
            {markerPairs
                .flatMap((pair) => (pair.end ? [pair.start, pair.end] : [pair.start]))
                .filter((m) => m.markerId !== "realtime")
                .map((marker) => (
                    <MarkerThumb
                        key={`marker-${marker.markerId}`}
                        marker={marker}
                        duration={duration}
                        activeWidth={activeWidth}
                        isActiveMarker={activeMarkerId === marker.markerId}
                        onUpdateMarkerTime={onUpdateMarkerTime}
                        onSelectMarker={onSelectMarker}
                        onDoublePress={onDoublePressMarker}
                        onDragStart={onDragStart}
                        onDragEnd={onDragEnd}
                    />
                ))}
        </View>
    );
};
