import { useCallback, useMemo, useState } from "react";

export interface Marker {
    time: number;
    markerId: string;
}

export interface MarkerPair {
    id: string;
    start: Marker;
    end: Marker;
}

export const useClipping = (currentTime: number) => {
    const [markers, setMarkers] = useState<Marker[]>([]);
    const [activeMarkerId, setActiveMarkerId] = useState<string | null>(null);
    const [previewActive, setPreviewActive] = useState(false);

    const generateId = useCallback(() => {
        return Math.random().toString(36).substring(2, 15);
    }, []);

    const markerPairs = useMemo(() => {
        const allMarkers = [...markers];
        if (allMarkers.length % 2 !== 0) {
            allMarkers.push({ time: currentTime, markerId: "realtime" });
        }

        const sorted = allMarkers.sort((a, b) => a.time - b.time);
        const pairs: MarkerPair[] = [];
        for (let i = 0; i < sorted.length; i += 2) {
            const start = sorted[i];
            const end = sorted[i + 1];

            if (start && end) {
                pairs.push({
                    id: start.markerId === "realtime" || end.markerId === "realtime" ? "pair-realtime" : `pair-${i}`,
                    start,
                    end,
                });
            }
        }
        return pairs;
    }, [markers, currentTime]);

    const addMarker = useCallback(
        (time: number) => {
            const newId = generateId();
            setMarkers((prev) => [...prev, { time, markerId: newId }]);
            setActiveMarkerId(newId);
        },
        [generateId],
    );

    const removeMarker = useCallback(
        (markerId: string) => {
            setMarkers((prev) => prev.filter((m) => m.markerId !== markerId));
            if (activeMarkerId === markerId) setActiveMarkerId(null);
        },
        [activeMarkerId],
    );

    const generateSegmentsForSaving = useCallback(() => {
        const sorted = [...markers].sort((a, b) => a.time - b.time);
        const segments: MarkerPair[] = [];

        for (let i = 0; i < sorted.length - 1; i += 2) {
            segments.push({
                id: generateId(),
                start: sorted[i],
                end: sorted[i + 1],
            });
        }

        if (segments.length === 0) return { success: false, message: "No complete segments to save." };

        // Note: markers are NOT cleared here — call clearMarkers() after confirmed success
        return { success: true, pairs: segments };
    }, [markers, generateId]);

    const clearMarkers = useCallback(() => {
        setMarkers([]);
        setActiveMarkerId(null);
        setPreviewActive(false);
    }, []);

    const updateMarkerTime = useCallback((markerId: string, newTime: number) => {
        setMarkers((prev) => prev.map((m) => (m.markerId === markerId ? { ...m, time: newTime } : m)));
    }, []);

    const getNextClipStart = useCallback(
        (currentPositionSec: number) => {
            const allPairs = markerPairs.filter((p) => p.id !== "pair-realtime").sort((a, b) => a.start.time - b.start.time);
            if (allPairs.length === 0) return -1;

            for (const pair of allPairs) {
                if (currentPositionSec < pair.end.time) {
                    if (currentPositionSec < pair.start.time) return pair.start.time;
                    return -1; // In segment
                }
            }
            return allPairs[0].start.time;
        },
        [markerPairs],
    );

    const isInSegment = useCallback(
        (currentPositionSec: number) => {
            return markerPairs.some(
                (p) => p.id !== "pair-realtime" && currentPositionSec >= p.start.time && currentPositionSec < p.end.time,
            );
        },
        [markerPairs],
    );

    const maxSegmentEndTime = useMemo(() => {
        const pairs = markerPairs.filter((p) => p.id !== "pair-realtime" && p.end);
        if (pairs.length === 0) return -1;
        return Math.max(...pairs.map((p) => p.end!.time));
    }, [markerPairs]);

    return {
        markerPairs,
        markers,
        activeMarkerId,
        setActiveMarkerId,
        previewActive,
        setPreviewActive,
        addMarker,
        removeMarker,
        clearMarkers,
        generateDraftSegments: generateSegmentsForSaving,
        updateMarkerTime,
        getNextClipStart,
        isInSegment,
        maxSegmentEndTime,
    };
};
