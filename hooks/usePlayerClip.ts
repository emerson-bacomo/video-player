import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RefObject } from "react";

import { useMedia } from "@/hooks/useMedia";
import { CorePlayerRef } from "@/components/CorePlayer";
import { ExportOptions, VideoMedia, Marker, MarkerPair } from "@/types/useMedia";
import { buildClipDefaultName } from "@/utils/fileNaming";

interface UsePlayerClipProps {
    activeVideo: VideoMedia | null;
    videoId: string | undefined;
    duration: number;
    playerRef: RefObject<CorePlayerRef>;
    setPaused: (paused: boolean) => void;
    currentDisplayTime: number;
}

export interface PlayerControlState {
    isPlaying: boolean;
    isClipMode: boolean;
    showClipExportModal: boolean;
    closeClipExportModal: () => void;
    exportSegments: { start: number; end: number }[];
    defaultExportName: string;
    executeExport: (options: ExportOptions) => Promise<void>;
    onTogglePlay: () => void;
    onSeek: (value: number) => void;
    onSkipNext: () => void;
    onSkipPrevious: () => void;
    onRestart: () => void;
    onToggleClipMode: () => void;
    markers: Marker[];
    markerPairs: MarkerPair[];
    previewActive: boolean;
    setPreviewActive: (next: boolean) => void;
    isInSegment: (currentPositionSec: number) => boolean;
    getNextClipStart: (currentPositionSec: number) => number;
    maxSegmentEndTime: number;
    onTogglePreview: () => void;
    onAddMarker: () => void;
    onSaveClip: () => Promise<void>;
    onRemoveMarker: (markerId: string) => void;
    onAdjustCurrentMarker: () => void;
    onSeekToPrevMarker: () => void;
    onSeekToNextMarker: () => void;
    hasPrevMarker: boolean;
    hasNextMarker: boolean;
    onSelectMarker: (markerId: string | null) => void;
    onUpdateMarkerTime: (markerId: string, time: number) => void;
    activeMarkerId: string | null;
    onDragStart: () => void;
    onDragEnd: () => void;
    onDoublePressMarker: (markerTime: number) => void;
    onScreenshot: () => Promise<void>;
    screenshotOverlayVisible: boolean;
    screenshotUri: string | null;
    screenshotFilepath: string | null;
    dismissScreenshot: () => void;
}

export const usePlayerClip = ({
    activeVideo,
    videoId,
    duration,
    playerRef,
    setPaused,
    currentDisplayTime,
}: UsePlayerClipProps) => {
    const { updateVideoMarkers, performExport, setLoadingTask } = useMedia();

    const isSavingRef = useRef(false);
    const [isClipMode, setIsClipMode] = useState((activeVideo?.markers?.length ?? 0) > 0);
    const [showClipExportModal, setShowClipExportModal] = useState(false);
    const [exportSegments, setExportSegments] = useState<{ start: number; end: number }[]>([]);

    const [markers, setMarkers] = useState<Marker[]>(activeVideo?.markers || []);
    const [activeMarkerId, setActiveMarkerId] = useState<string | null>(null);
    const [previewActive, setPreviewActive] = useState(false);

    useEffect(() => {
        setMarkers(activeVideo?.markers || []);
    }, [activeVideo?.markers]);

    const generateId = useCallback(() => Math.random().toString(36).substring(2, 15), []);

    const markerPairs = useMemo(() => {
        const allMarkers = [...markers];
        if (allMarkers.length % 2 !== 0) {
            allMarkers.push({ time: currentDisplayTime, markerId: "realtime" });
        }
        const sorted = allMarkers.sort((a, b) => a.time - b.time);
        const pairs: MarkerPair[] = [];
        for (let i = 0; i < sorted.length; i += 2) {
            const start = sorted[i];
            const end = sorted[i + 1];
            if (start && end) {
                pairs.push({
                    id: start.markerId === "realtime" || end.markerId === "realtime" ? "pair-realtime" : `pair-${start.markerId}`,
                    start,
                    end,
                });
            }
        }
        return pairs;
    }, [markers, currentDisplayTime]);

    const onMarkersChange = useCallback(
        (m: Marker[]) => videoId && updateVideoMarkers(videoId, m),
        [videoId, updateVideoMarkers],
    );

    const addMarker = useCallback(
        (time: number) => {
            const newId = generateId();
            const nextMarkers = [...markers, { time, markerId: newId }];
            setMarkers(nextMarkers);
            onMarkersChange(nextMarkers);
            setActiveMarkerId(newId);
        },
        [generateId, markers, onMarkersChange],
    );

    const removeMarker = useCallback(
        (markerId: string) => {
            const nextMarkers = markers.filter((m) => m.markerId !== markerId);
            setMarkers(nextMarkers);
            onMarkersChange(nextMarkers);
            if (activeMarkerId === markerId) setActiveMarkerId(null);
        },
        [activeMarkerId, markers, onMarkersChange],
    );

    const updateMarkerTime = useCallback(
        (markerId: string, newTime: number) => {
            const nextMarkers = markers.map((m) => (m.markerId === markerId ? { ...m, time: newTime } : m));
            setMarkers(nextMarkers);
            onMarkersChange(nextMarkers);
        },
        [markers, onMarkersChange],
    );

    const generateSegmentsForSaving = useCallback(() => {
        const sorted = [...markers].sort((a, b) => a.time - b.time);
        const segments: MarkerPair[] = [];
        for (let i = 0; i < sorted.length - 1; i += 2) {
            segments.push({ id: generateId(), start: sorted[i], end: sorted[i + 1] });
        }
        if (segments.length === 0) return { success: false, message: "No complete segments to save." };
        return { success: true, pairs: segments };
    }, [markers, generateId]);

    const getNextClipStart = useCallback(
        (currentPositionSec: number) => {
            const allPairs = markerPairs.filter((p) => p.id !== "pair-realtime").sort((a, b) => a.start.time - b.start.time);
            if (allPairs.length === 0) return -1;
            for (const pair of allPairs) {
                if (currentPositionSec < pair.end.time) {
                    if (currentPositionSec < pair.start.time) return pair.start.time;
                    return -1;
                }
            }
            return allPairs[0].start.time;
        },
        [markerPairs],
    );

    const getPrevMarkerTime = useCallback(
        (currentPositionSec: number) => {
            if (markers.length === 0) return null;
            const sorted = [...markers].sort((a, b) => a.time - b.time);
            const target = sorted.filter((m) => m.time < currentPositionSec - 0.2).pop();
            return target ? target : null;
        },
        [markers],
    );

    const getNextMarkerTime = useCallback(
        (currentPositionSec: number) => {
            if (markers.length === 0) return null;
            const sorted = [...markers].sort((a, b) => a.time - b.time);
            const target = sorted.find((m) => m.time > currentPositionSec + 0.2);
            return target ? target : null;
        },
        [markers],
    );

    const isInSegment = useCallback(
        (currentPositionSec: number) => {
            return markerPairs.some(
                (p) => p.id !== "pair-realtime" && currentPositionSec >= p.start.time - 0.5 && currentPositionSec < p.end.time,
            );
        },
        [markerPairs],
    );

    const maxSegmentEndTime = useMemo(() => {
        const pairs = markerPairs.filter((p) => p.id !== "pair-realtime" && p.end);
        if (pairs.length === 0) return -1;
        return Math.max(...pairs.map((p) => p.end!.time));
    }, [markerPairs]);

    const defaultExportName = useMemo(() => {
        if (!activeVideo || exportSegments.length === 0) return "";
        return buildClipDefaultName(activeVideo.title, exportSegments);
    }, [activeVideo, exportSegments]);

    const handleSaveClip = useCallback(async () => {
        if (isSavingRef.current || !activeVideo) return;
        isSavingRef.current = true;
        try {
            const result = generateSegmentsForSaving();
            if (!result.success || !result.pairs || !result.pairs.length) {
                if (result.message) {
                    setLoadingTask({ label: "Clip Error", detail: result.message, importance: "SHOW_POPUP", dismissAfter: 4000 });
                }
                isSavingRef.current = false;
                return;
            }
            const segments = result.pairs.map((p: MarkerPair) => ({ start: p.start.time, end: p.end ? p.end.time : duration }));
            setExportSegments(segments);
            setPaused(true);
            setShowClipExportModal(true);
        } catch (error) {
            console.error("[usePlayerClip] Failed to prepare clip:", error);
            isSavingRef.current = false;
        }
    }, [activeVideo, generateSegmentsForSaving, setLoadingTask, duration, setPaused]);

    const executeExport = useCallback(
        async (options: ExportOptions) => {
            if (!activeVideo || !exportSegments.length) return;
            setShowClipExportModal(false);
            const maxEndTime = Math.max(...exportSegments.map((s) => s.end));
            playerRef.current.seek(maxEndTime);
            await performExport(
                activeVideo.uri,
                exportSegments,
                options,
                { title: "Exporting Clip", successTitle: "Export Success", failTitle: "Export Failed" },
                () => {
                    if (options.removeMarkers) {
                        setMarkers([]);
                        onMarkersChange([]);
                        setActiveMarkerId(null);
                        setPreviewActive(false);
                    }
                },
            );
            isSavingRef.current = false;
        },
        [activeVideo, exportSegments, playerRef, performExport, onMarkersChange],
    );

    const closeClipExportModal = useCallback(() => {
        setShowClipExportModal(false);
        isSavingRef.current = false;
    }, []);

    return {
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
        markers,
    };
};
