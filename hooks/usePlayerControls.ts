import { useRouter } from "expo-router";
import { usePlayerContext } from "@/context/PlayerContext";

export const usePlayerControls = () => {
    const {
        playlist,
        currentIndex,
        hasNext,
        hasPrevious,
        currentDisplayTime,
        setCurrentDisplayTime,
        paused,
        setPaused,
        isEnded,
        setIsEnded,
        playerRef,
        resetControlsTimer,
        clipState,
    } = usePlayerContext();

    const router = useRouter();

    const onTogglePlay = () => {
        setPaused((p) => !p);
        resetControlsTimer();
    };

    const onSeek = (value: number) => {
        playerRef.current?.seek(value);
        setIsEnded(false);
        resetControlsTimer();
    };

    const onSkipNext = () => {
        if (!hasNext) return;
        const nextVideo = playlist[currentIndex + 1];
        if (nextVideo) {
            router.setParams({
                videoId: nextVideo.id,
                albumId: nextVideo.albumId,
                initialTime: String(nextVideo.lastPlayedSec || 0),
            });
        }
    };

    const onSkipPrevious = () => {
        if (!hasPrevious) return;
        const prevVideo = playlist[currentIndex - 1];
        if (prevVideo) {
            router.setParams({
                videoId: prevVideo.id,
                albumId: prevVideo.albumId,
                initialTime: String(prevVideo.lastPlayedSec || 0),
            });
        }
    };

    const onRestart = () => {
        playerRef.current?.seek(0);
        setCurrentDisplayTime(0);
        setIsEnded(false);
        setPaused(false);
    };

    const onToggleClipMode = () => {
        clipState.setIsClipMode((next) => {
            if (!next) {
                setPaused(true);
                resetControlsTimer();
            }
            return !next;
        });
    };

    const onTogglePreview = () => {
        if (!clipState.previewActive) {
            const firstStart = clipState.markerPairs.find((p) => p.id !== "pair-realtime")?.start.time;
            if (firstStart !== undefined && !clipState.isInSegment(currentDisplayTime)) {
                playerRef.current?.seek(firstStart);
            }
            setPaused(false);
        }
        clipState.setPreviewActive(!clipState.previewActive);
    };

    const onAddMarker = () => {
        clipState.addMarker(currentDisplayTime);
    };

    const onAdjustCurrentMarker = () => {
        if (currentDisplayTime !== undefined && clipState.activeMarkerId) {
            clipState.updateMarkerTime(clipState.activeMarkerId, currentDisplayTime);
            playerRef.current?.seek(currentDisplayTime);
        }
    };

    const onSeekToPrevMarker = () => {
        const target = clipState.getPrevMarkerTime(currentDisplayTime);
        if (target) {
            playerRef.current?.seek(target.time);
            clipState.setActiveMarkerId(target.markerId);
        }
    };

    const onSeekToNextMarker = () => {
        const target = clipState.getNextMarkerTime(currentDisplayTime);
        if (target) {
            playerRef.current?.seek(target.time);
            clipState.setActiveMarkerId(target.markerId);
        }
    };

    const hasPrevMarker = !!clipState.getPrevMarkerTime(currentDisplayTime);
    const hasNextMarker = !!clipState.getNextMarkerTime(currentDisplayTime);

    const onDragStart = () => {
        setPaused(true);
    };

    const onDragEnd = () => {
        resetControlsTimer();
    };

    const onDoublePressMarker = (markerTime: number) => {
        playerRef.current?.seek(markerTime);
    };

    const onUpdateMarkerTime = (id: string, time: number) => {
        clipState.updateMarkerTime(id, time);
        playerRef.current?.seek(time);
    };

    return {
        isPlaying: !paused,
        isEnded,
        hasNext,
        hasPrevious,
        isClipMode: clipState.isClipMode,
        showClipExportModal: clipState.showClipExportModal,
        closeClipExportModal: clipState.closeClipExportModal,
        exportSegments: clipState.exportSegments,
        defaultExportName: clipState.defaultExportName,
        executeExport: clipState.executeExport,
        onTogglePlay,
        onSeek,
        onSkipNext,
        onSkipPrevious,
        onRestart,
        onToggleClipMode,
        markers: clipState.markers,
        markerPairs: clipState.markerPairs,
        previewActive: clipState.previewActive,
        setPreviewActive: clipState.setPreviewActive,
        isInSegment: clipState.isInSegment,
        getNextClipStart: clipState.getNextClipStart,
        maxSegmentEndTime: clipState.maxSegmentEndTime,
        onTogglePreview,
        onAddMarker,
        onSaveClip: clipState.handleSaveClip,
        onRemoveMarker: clipState.removeMarker,
        onAdjustCurrentMarker,
        onSeekToPrevMarker,
        onSeekToNextMarker,
        hasPrevMarker,
        hasNextMarker,
        onSelectMarker: clipState.setActiveMarkerId,
        onUpdateMarkerTime,
        activeMarkerId: clipState.activeMarkerId,
        onDragStart,
        onDragEnd,
        onDoublePressMarker,
    };
};
