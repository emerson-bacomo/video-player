import { cn } from "@/lib/utils";
import React from "react";
import { TouchableOpacity, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { runOnJS } from "react-native-reanimated";
import { Marker, MarkerPair } from "../hooks/useClipping";

interface ClippingOverlayProps {
    markerPairs: MarkerPair[];
    duration: number;
    width: number;
    onUpdateMarkerTime: (id: string, time: number) => void;
    onSelectMarker: (id: string) => void;
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
    activeMarkerId,
    onDragStart,
    onDragEnd,
    previewActive = false,
}) => {
    if (duration <= 0 || width <= 0) return null;

    const dragStartTime = React.useRef<number | null>(null);
    const HORIZONTAL_PADDING = 15;
    const activeWidth = width - HORIZONTAL_PADDING * 2;

    const renderMarker = (marker: Marker) => {
        const left = HORIZONTAL_PADDING + (marker.time / duration) * activeWidth;
        const isActiveMarker = activeMarkerId === marker.markerId;
        const DRAG_DAMPING = 0.85;

        // New Gesture API implementation
        const pan = Gesture.Pan()
            .onStart(() => {
                dragStartTime.current = marker.time;
                runOnJS(onSelectMarker)(marker.markerId);
                if (onDragStart) runOnJS(onDragStart)();
            })
            .onUpdate((event) => {
                if (dragStartTime.current === null) return;
                const deltaX = event.translationX * DRAG_DAMPING;
                const deltaT = (deltaX / activeWidth) * duration;
                const newTime = Math.max(0, Math.min(duration, dragStartTime.current + deltaT));
                runOnJS(onUpdateMarkerTime)(marker.markerId, newTime);
            })
            .onEnd(() => {
                dragStartTime.current = null;
                if (onDragEnd) runOnJS(onDragEnd)();
            });

        return (
            <GestureDetector key={`marker-${marker.markerId}`} gesture={pan}>
                <TouchableOpacity
                    activeOpacity={1}
                    onPress={() => onSelectMarker(marker.markerId)}
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
                                { translateY: isActiveMarker ? -1.5 : 0 } // Counter-offset to keep bottom aligned
                            ],
                        }}
                    />
                </TouchableOpacity>
            </GestureDetector>
        );
    };

    return (
        <View className="absolute inset-0 h-10 z-10" style={{ width }}>
            {/* Clip Segments */}
            {markerPairs.map((pair) => {
                if (!pair.end) return null;

                const left = HORIZONTAL_PADDING + (pair.start.time / duration) * activeWidth;
                const clipWidth = ((pair.end.time - pair.start.time) / duration) * activeWidth;

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
                .map((marker) => renderMarker(marker))}
        </View>
    );
};
