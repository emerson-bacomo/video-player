import React, { createContext, useContext, useRef, useState, useMemo, useCallback, useEffect } from "react";
import type { RefObject, Dispatch, SetStateAction, FC, ReactNode } from "react";
import { CorePlayerRef } from "@/components/CorePlayer";
import type { Video } from "@/hooks/domain/Video";
import { useAlbumVideos } from "@/hooks/MediaStoreBridge/useMediaStoreAlbums";
import { useLoadingTask } from "@/context/LoadingTaskContext";
import { useLocalSearchParams } from "expo-router";
import { DEFAULT_PLAYED_SEC } from "@/constants/defaults";
import { usePlayerClip } from "@/hooks/usePlayerClip";
import { usePlayerScreenshot } from "@/hooks/usePlayerScreenshot";
import { useSettings } from "@/hooks/useSettings";
import * as ScreenOrientation from "expo-screen-orientation";
import { PlayerCentralIndicatorProps } from "@/components/PlayerCentralIndicator";

export interface PlayerContextState {
    videoId?: string;
    albumId?: string;
    activeVideo: Video | null;
    playlist: Video[];
    currentIndex: number;
    hasNext: boolean;
    hasPrevious: boolean;

    playerRef: RefObject<CorePlayerRef>;

    paused: boolean;
    setPaused: Dispatch<SetStateAction<boolean>>;
    duration: number;
    setDuration: Dispatch<SetStateAction<number>>;
    currentDisplayTime: number;
    setCurrentDisplayTime: Dispatch<SetStateAction<number>>;
    isEnded: boolean;
    setIsEnded: Dispatch<SetStateAction<boolean>>;
    playbackRate: number;
    setPlaybackRate: Dispatch<SetStateAction<number>>;

    showControls: boolean;
    setShowControls: Dispatch<SetStateAction<boolean>>;
    isReadyForDisplay: boolean;
    setIsReadyForDisplay: Dispatch<SetStateAction<boolean>>;

    resetControlsTimer: (showImmediately?: boolean) => void;
    controlsTimeout: RefObject<any>;

    isSeekingLock: RefObject<boolean>;
    setSeekingLock: (locked: boolean) => void;

    clipState: ReturnType<typeof usePlayerClip>;
    screenshotState: ReturnType<typeof usePlayerScreenshot>;
    isDraggingMarker: RefObject<boolean>;
    isCornerModalOpen: RefObject<boolean>;
    isMenuOpen: RefObject<boolean>;

    centralIndicator: PlayerCentralIndicatorProps["indicator"] | null;
    setCentralIndicator: Dispatch<SetStateAction<PlayerCentralIndicatorProps["indicator"] | null>>;
    panSeekTime: number | null;
    setPanSeekTime: Dispatch<SetStateAction<number | null>>;
    panStartTime: RefObject<number>;
    showPieMenu: boolean;
    setShowPieMenu: Dispatch<SetStateAction<boolean>>;
    wasPlayingBeforePie: RefObject<boolean>;
    headerLayout: { y: number; height: number } | null;
    setHeaderLayout: Dispatch<SetStateAction<{ y: number; height: number } | null>>;

    sessionOrientation: ScreenOrientation.OrientationLock | null;
    setSessionOrientation: (lock: ScreenOrientation.OrientationLock | null) => void;
    orientation: ScreenOrientation.OrientationLock;
}

const PlayerContext = createContext<PlayerContextState | null>(null);

export const usePlayerContext = () => {
    const context = useContext(PlayerContext);
    if (!context) {
        throw new Error("usePlayerContext must be used within a PlayerProvider");
    }
    return context;
};

export const PlayerProvider: FC<{ children: ReactNode }> = ({ children }) => {
    const { videoId, albumId, initialTime } = useLocalSearchParams<{
        videoId?: string;
        albumId?: string;
        initialTime?: string;
    }>();

    const albumVideos = useAlbumVideos(albumId ?? "");
    const { setLoadingTask } = useLoadingTask();
    const { settings } = useSettings();

    const [sessionOrientation, setSessionOrientation] = useState<ScreenOrientation.OrientationLock | null>(null);
    const orientation = useMemo(
        () =>
            sessionOrientation ??
            (settings.defaultOrientation === "landscape"
                ? ScreenOrientation.OrientationLock.LANDSCAPE
                : settings.defaultOrientation === "portrait"
                  ? ScreenOrientation.OrientationLock.PORTRAIT
                  : ScreenOrientation.OrientationLock.DEFAULT),
        [sessionOrientation, settings.defaultOrientation],
    );

    const activeVideo = useMemo(() => {
        if (!videoId || !albumId) return null;
        return albumVideos.find((v) => v.id === videoId) || null;
    }, [videoId, albumId, albumVideos]);

    const playlist = useMemo(() => {
        if (!albumId) return [];
        return albumVideos;
    }, [albumId, albumVideos]);

    const currentIndex = playlist.findIndex((v) => v.id === videoId);
    const hasNext = currentIndex !== -1 && currentIndex < playlist.length - 1;
    const hasPrevious = currentIndex > 0;

    const playerRef = useRef<CorePlayerRef>({ currentTime: 0, seek: () => {} });

    const [paused, setPaused] = useState(true);
    const [duration, setDuration] = useState(activeVideo?.duration || 0);
    const [currentDisplayTime, setCurrentDisplayTime] = useState<number>(
        Math.floor(initialTime ? parseFloat(initialTime) : DEFAULT_PLAYED_SEC),
    );
    const [isEnded, setIsEnded] = useState(false);
    const [playbackRate, setPlaybackRate] = useState(1.0);

    const [showControls, setShowControls] = useState(true);
    const [isReadyForDisplay, setIsReadyForDisplay] = useState(false);

    const controlsTimeout = useRef<any>(null);
    const isSeekingLock = useRef(false);
    const isDraggingMarker = useRef(false);
    const isCornerModalOpen = useRef(false);
    const isMenuOpen = useRef(false);

    const [centralIndicator, setCentralIndicator] = useState<PlayerCentralIndicatorProps["indicator"] | null>(null);
    const [panSeekTime, setPanSeekTime] = useState<number | null>(null);
    const panStartTime = useRef<number>(0);
    const [showPieMenu, setShowPieMenu] = useState(false);
    const wasPlayingBeforePie = useRef(false);
    const [headerLayout, setHeaderLayout] = useState<{ y: number; height: number } | null>(null);

    const setSeekingLock = useCallback((locked: boolean) => {
        isSeekingLock.current = locked;
    }, []);

    // Sync duration from metadata if it's missing (e.g. after hot reload)
    useEffect(() => {
        if (activeVideo?.duration && duration === 0) {
            setDuration(activeVideo.duration);
        }
    }, [activeVideo?.duration, duration]);

    // Reset state on video change
    useEffect(() => {
        setDuration(0);
        setIsReadyForDisplay(false);
        setIsEnded(false);
        setCurrentDisplayTime(Math.floor(initialTime ? parseFloat(initialTime) : DEFAULT_PLAYED_SEC));
    }, [videoId, initialTime]);

    const clipState = usePlayerClip({
        activeVideo,
        videoId,
        duration,
        playerRef,
        setPaused,
        currentDisplayTime,
    });

    const screenshotState = usePlayerScreenshot({
        activeVideo,
        currentDisplayTime,
        setLoadingTask,
    });

    const [lastInteraction, setLastInteraction] = useState(Date.now());

    useEffect(() => {
        if (!paused && showControls && !isDraggingMarker.current) {
            const id = setTimeout(() => setShowControls(false), 2500);
            controlsTimeout.current = id;
            return () => clearTimeout(id);
        }
    }, [paused, showControls, lastInteraction]);

    const resetControlsTimer = useCallback((showImmediately = true) => {
        if (isCornerModalOpen.current || isMenuOpen.current) {
            return;
        }
        if (showImmediately) {
            setShowControls(true);
        }
        setLastInteraction(Date.now());
    }, []);

    useEffect(() => {
        return () => {
            if (controlsTimeout.current) clearTimeout(controlsTimeout.current);
        };
    }, []);

    const value = {
        videoId,
        albumId,
        activeVideo,
        playlist,
        currentIndex,
        hasNext,
        hasPrevious,
        playerRef,
        paused,
        setPaused,
        duration,
        setDuration,
        currentDisplayTime,
        setCurrentDisplayTime,
        isEnded,
        setIsEnded,
        playbackRate,
        setPlaybackRate,
        showControls,
        setShowControls,
        isReadyForDisplay,
        setIsReadyForDisplay,
        resetControlsTimer,
        controlsTimeout,
        isSeekingLock,
        setSeekingLock,
        clipState,
        screenshotState,
        isDraggingMarker,
        isCornerModalOpen,
        isMenuOpen,
        centralIndicator,
        setCentralIndicator,
        panSeekTime,
        setPanSeekTime,
        panStartTime,
        showPieMenu,
        setShowPieMenu,
        wasPlayingBeforePie,
        headerLayout,
        setHeaderLayout,
        sessionOrientation,
        setSessionOrientation,
        orientation,
    };

    return <PlayerContext.Provider value={value}>{children}</PlayerContext.Provider>;
};
