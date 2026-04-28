import { Directory } from "expo-file-system";
import * as FileSystem from "expo-file-system/legacy";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { ExportOptions } from "@/components/ClipExportModal";
import { CorePlayerRef } from "@/components/CorePlayer";
import ExpoFFmpeg from "@/modules/expo-ffmpeg/src/index";
import { VideoMedia } from "@/types/useMedia";
import { normalizeClipDestination } from "@/utils/clipDestination";
import { secondsToFileStamp } from "@/utils/secondsToHhmmss";

export interface Marker {
    time: number;
    markerId: string;
}

export interface MarkerPair {
    id: string;
    start: Marker;
    end: Marker;
}

interface UsePlayerClipProps {
    activeVideo: VideoMedia | null;
    videoId: string | undefined;
    duration: number;
    playerRef: React.RefObject<CorePlayerRef>;
    setPaused: (paused: boolean) => void;
    settings: any;
    updateSettings: (settings: any) => Promise<void>;
    fetchAlbums: () => Promise<void>;
    setLoadingTask: (task: any) => void;
    showControls: boolean;
    updateVideoMarkers: (id: string, markers: Marker[]) => void;
}

export const usePlayerClip = ({
    activeVideo,
    videoId,
    duration,
    playerRef,
    setPaused,
    settings,
    updateSettings,
    fetchAlbums,
    setLoadingTask,
    updateVideoMarkers,
}: UsePlayerClipProps) => {
    const isSavingRef = useRef(false);
    const [isClipMode, setIsClipMode] = useState((activeVideo?.markers?.length ?? 0) > 0);
    const [showClipExportModal, setShowClipExportModal] = useState(false);
    const [exportSegments, setExportSegments] = useState<{ start: number; end: number }[]>([]);

    // State from useClipping
    const [markers, setMarkers] = useState<Marker[]>(activeVideo?.markers || []);
    const [activeMarkerId, setActiveMarkerId] = useState<string | null>(null);
    const [previewActive, setPreviewActive] = useState(false);

    // Sync markers when initialMarkers (from video data) changes
    useEffect(() => {
        setMarkers(activeVideo?.markers || []);
    }, [activeVideo?.markers]);

    const generateId = useCallback(() => {
        return Math.random().toString(36).substring(2, 15);
    }, []);

    const markerPairs = useMemo(() => {
        const allMarkers = [...markers];
        if (allMarkers.length % 2 !== 0) {
            allMarkers.push({ time: playerRef.current.currentTime, markerId: "realtime" });
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
    }, [markers]);

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

    const clearMarkers = useCallback(() => {
        setMarkers([]);
        onMarkersChange([]);
        setActiveMarkerId(null);
        setPreviewActive(false);
    }, [onMarkersChange]);

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
            segments.push({
                id: generateId(),
                start: sorted[i],
                end: sorted[i + 1],
            });
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
                    return -1; // In segment
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

    const defaultExportName = useMemo(() => {
        if (!activeVideo || exportSegments.length === 0) return "";
        const baseName = activeVideo.filename.split(".").slice(0, -1).join(".") || activeVideo.filename;
        const cleanName = baseName.replace(/[\\/:*?"<>|]/g, "_");

        const timeSegments = exportSegments
            .map((s) => `${secondsToFileStamp(s.start)}_${s.end ? secondsToFileStamp(s.end) : "end"}`)
            .join("__");

        return `${cleanName}_${timeSegments}`;
    }, [activeVideo, exportSegments]);

    const handleSaveClip = useCallback(async () => {
        if (isSavingRef.current || !activeVideo) return;
        isSavingRef.current = true;

        try {
            const result = generateSegmentsForSaving();
            if (!result.success || !result.pairs || result.pairs.length === 0) {
                if (result.message) {
                    setLoadingTask({
                        label: "Clip Error",
                        detail: result.message,
                        importance: "SHOW_POPUP",
                        dismissAfter: 4000,
                    });
                }
                isSavingRef.current = false;
                return;
            }

            const segments = result.pairs.map((p: MarkerPair) => ({
                start: p.start.time,
                end: p.end ? p.end.time : duration,
            }));
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

            setLoadingTask({
                id: "clip-export",
                label: "Exporting Clip",
                detail: `Saving to ${options.name} (CRF ${options.crf})...`,
                importance: "SHOW_POPUP_AND_EXPAND",
                progress: 0,
            });

            try {
                const maxEndTime = Math.max(...exportSegments.map((s) => s.end));
                playerRef.current.seek(maxEndTime);

                let destination = normalizeClipDestination(settings.clipDestination || "");
                if (!destination) {
                    try {
                        const directory = await Directory.pickDirectoryAsync();
                        if (!directory?.uri) {
                            setLoadingTask({
                                label: "Config Error",
                                detail: "Clip destination is not valid, change in settings.",
                                importance: "SHOW_POPUP",
                                dismissAfter: 4000,
                            });
                            return;
                        }
                        destination = normalizeClipDestination(directory.uri);
                        if (!destination) {
                            setLoadingTask({
                                label: "Config Error",
                                detail: "Clip destination is not valid, change in settings.",
                                importance: "SHOW_POPUP",
                                dismissAfter: 4000,
                            });
                            return;
                        }
                        await updateSettings({ clipDestination: destination });
                    } catch (pickerError) {
                        console.warn("[usePlayerClip] Failed to pick clip destination", pickerError);
                        setLoadingTask({
                            label: "Config Error",
                            detail: "Clip destination is not valid, change in settings.",
                            importance: "SHOW_POPUP",
                            dismissAfter: 4000,
                        });
                        return;
                    }
                }

                const destDir = destination.replace(/\/+$/, "");
                const ext = options.format;
                const outPathStr = `${destDir}/${options.name}.${ext}`;

                const destInfo = await FileSystem.getInfoAsync(`file://${destDir}`);
                if (!destInfo.exists || !destInfo.isDirectory) {
                    setLoadingTask({
                        label: "File Error",
                        detail: "Clip destination is not valid, change in settings.",
                        importance: "SHOW_POPUP",
                        dismissAfter: 4000,
                    });
                    return;
                }

                const { EventEmitter, requireNativeModule } = require("expo-modules-core");
                const eventEmitter = new EventEmitter(requireNativeModule("ExpoFFmpeg"));

                const progressSub = eventEmitter.addListener("onClipProgress", ({ progress }: { progress: number }) => {
                    setLoadingTask((prev: any) => {
                        if (prev?.id === "clip-export") {
                            const currentProgress = prev.progress || 0;
                            if (Math.abs(currentProgress - progress) < 0.01 && progress < 1.0) {
                                return prev;
                            }
                            return { ...prev, progress };
                        }
                        return prev;
                    });
                });

                let success = false;
                try {
                    const finalOptions = {
                        ...options,
                        crf: options.crf ?? 0, // Ensure no undefined values for Kotlin
                    };
                    success = await ExpoFFmpeg.clipVideo(activeVideo.uri, outPathStr, exportSegments, finalOptions);
                } finally {
                    progressSub.remove();
                }

                if (success) {
                    setLoadingTask({
                        id: "clip-export-finalizing",
                        label: "Saving & Indexing",
                        detail: "Registering file with Media Store...",
                        importance: "SHOW_POPUP",
                    });
                    try {
                        await ExpoFFmpeg.scanFile(outPathStr);
                        await fetchAlbums();
                    } catch (idxError) {
                        console.warn("[usePlayerClip] Failed to scan asset:", idxError);
                        await fetchAlbums();
                    }

                    setLoadingTask({
                        label: "Export Success",
                        detail: `Saved to ${outPathStr}`,
                        importance: "SHOW_POPUP",
                        dismissAfter: 5000,
                    });

                    if (options.removeMarkers) {
                        clearMarkers();
                    }
                } else {
                    const nativeError = await ExpoFFmpeg.getLastClipError();
                    setLoadingTask({
                        label: "Export Failed",
                        detail: nativeError ? `FFmpeg error: ${nativeError}` : "Clipping failed.",
                        importance: "SHOW_POPUP",
                        dismissAfter: 6000,
                    });
                }
            } catch (e: any) {
                console.error("[usePlayerClip] Export error:", e);
                setLoadingTask({
                    label: "Critical Error",
                    detail: "An unexpected error occurred during export.",
                    importance: "SHOW_POPUP",
                    dismissAfter: 5000,
                });
            } finally {
                isSavingRef.current = false;
            }
        },
        [
            activeVideo,
            exportSegments,
            setLoadingTask,
            playerRef,
            settings.clipDestination,
            updateSettings,
            fetchAlbums,
            clearMarkers,
        ],
    );

    const closeClipExportModal = useCallback(() => {
        setShowClipExportModal(false);
        isSavingRef.current = false;
    }, []);

    // Initial jump for preview
    useEffect(() => {
        if (previewActive && duration > 0) {
            const firstSegment = markerPairs
                .filter((p) => p.id !== "pair-realtime")
                .sort((a, b) => a.start.time - b.start.time)[0];
            if (firstSegment) {
                playerRef.current.seek(firstSegment.start.time);
            }
        }
    }, [previewActive, duration, markerPairs]);

    return {
        isClipMode,
        setIsClipMode,
        showClipExportModal,
        setShowClipExportModal,
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
        clearMarkers,
        updateMarkerTime,
        getNextClipStart,
        getPrevMarkerTime,
        getNextMarkerTime,
        isInSegment,
        maxSegmentEndTime,
    };
};
