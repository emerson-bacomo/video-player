import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useRef } from "react";
import { StyleProp, ViewStyle } from "react-native";
import Video, { OnLoadData, OnProgressData, VideoRef } from "react-native-video";
import { useFloatingPlayer } from "../context/FloatingPlayerContext";
import { useMedia } from "../hooks/useMedia";
import { VideoMedia } from "../types/useMedia";
import { savePlaybackDataDb } from "../utils/db";

export interface CorePlayerProps {
    video: VideoMedia;
    paused?: boolean;
    rate?: number;
    resizeMode?: "contain" | "cover" | "stretch";
    style?: StyleProp<ViewStyle>;
    onLoad?: (data: OnLoadData) => void;
    onProgress?: (data: OnProgressData) => void;
    onEnd?: () => void;
    onReadyForDisplay?: () => void;
    saveInterval?: number; // ms, default 5000
    isFloating?: boolean;
    initialTime?: number;
    onSeek?: (time: number) => void;
    isLockedRef?: React.RefObject<boolean>;
}

export interface CorePlayerRef {
    seek: (time: number, tolerance?: number) => void;
    currentTime: number;
}

export const CorePlayer = forwardRef<CorePlayerRef, CorePlayerProps>((props, ref) => {
    const {
        video,
        paused = true,
        rate = 1.0,
        resizeMode = "contain",
        style,
        onLoad,
        onProgress,
        onEnd,
        onReadyForDisplay,
        saveInterval = 5000,
        isFloating = false,
        initialTime,
        onSeek,
        isLockedRef,
    } = props;

    const uri = video.uri;
    const id = video.id;

    const videoRef = useRef<VideoRef>(null);
    const { saveLastPlayed } = useFloatingPlayer();
    const { updateVideoProgress, updateVideoLastOpenedTime } = useMedia();

    const durationRef = useRef(0);
    const lastSaveSecRef = useRef(0);
    const isInitialSeekDone = useRef(false);
    const currentVideoIdRef = useRef<string | null>(null);
    const loadTimestampRef = useRef(Date.now());
    const lastSeekTimestampRef = useRef<number>(0);
    const currentTimeRef = useRef<number>(initialTime || 0);

    useImperativeHandle(
        ref,
        () => ({
            seek: (time: number, tolerance?: number) => {
                lastSeekTimestampRef.current = Date.now();
                currentTimeRef.current = time;
                videoRef.current?.seek(time, tolerance);

                // Immediate save for discrete seeks (buttons, markers, etc)
                // Scrubbing/Panning sets isLockedRef to true, so we skip DB writes there.
                if (id && !isLockedRef?.current) {
                    savePlaybackDataDb(id, time);
                    updateVideoProgress(id, time);
                    lastSaveSecRef.current = time;
                }

                onSeek?.(time);
            },
            get currentTime() {
                return currentTimeRef.current;
            },
        }),
        [onSeek],
    );

    useEffect(() => {
        isInitialSeekDone.current = false;
        const startPos = initialTime !== undefined ? Math.max(0, initialTime) : Math.max(0, video?.lastPlayedSec || 0);
        lastSaveSecRef.current = startPos;
        currentTimeRef.current = startPos;
        loadTimestampRef.current = Date.now();

        // Report initial position immediately if provided (ignore -1 flag)
        if (initialTime !== undefined && initialTime !== -1) {
            onProgress?.({
                currentTime: initialTime,
                playableDuration: 0,
                seekableDuration: 0,
            });
        } else if (initialTime === -1) {
            onProgress?.({
                currentTime: 0,
                playableDuration: 0,
                seekableDuration: 0,
            });
        }
    }, [video?.id, initialTime]); // Removed onProgress from dependencies to avoid loop

    // Clean up or save on unmount/video change
    useEffect(() => {
        return () => {
            if (uri) {
                // Final save to DB and global state
                if (id) {
                    const finalPos = currentTimeRef.current;
                    if (finalPos > 0) {
                        savePlaybackDataDb(id, finalPos);
                        updateVideoProgress(id, finalPos);
                    }
                }
            }
        };
    }, [uri, id]); // Video source change

    const handleLoad = useCallback(
        (data: OnLoadData) => {
            durationRef.current = data.duration;
            const startPos = initialTime !== undefined ? initialTime : video?.lastPlayedSec || 0;
            if (!isInitialSeekDone.current && startPos > 0) {
                lastSeekTimestampRef.current = Date.now(); // suppress stale t=0 progress events
                currentTimeRef.current = startPos;
                videoRef.current?.seek(startPos);
                isInitialSeekDone.current = true;
                lastSaveSecRef.current = startPos;
            }
            if (video.id) {
                updateVideoLastOpenedTime(video.id);
                if (!isFloating) {
                    saveLastPlayed({ id: video.id, albumId: video.albumId });
                }
            }
            loadTimestampRef.current = Date.now();
            currentVideoIdRef.current = video.id || null;
            onLoad?.(data); // → setDuration(data.duration)
            // Force currentDisplayTime to the correct position in the same render batch as
            // setDuration. Without this, stale progress events from the previous video can
            // set currentDisplayTime to the old time after the reset but before onLoad fires,
            // making the slider flash the wrong position the moment it becomes visible.
            onProgress?.({ currentTime: currentTimeRef.current, playableDuration: 0, seekableDuration: 0 });
        },
        [video?.id, onLoad, onProgress],
    );

    const handleProgress = useCallback(
        (data: OnProgressData) => {
            // Ignore progress from previous video during transition
            if (currentVideoIdRef.current !== video.id) return;

            // Suppress stale progress events fired by the engine right after a seek
            if (Date.now() - lastSeekTimestampRef.current < 300) return;

            const pos = data.currentTime;
            currentTimeRef.current = pos;

            // Periodic Sync to DB and global state
            if (id && !isLockedRef?.current) {
                if (Math.abs(pos - lastSaveSecRef.current) >= saveInterval / 1000) {
                    savePlaybackDataDb(id, pos);
                    updateVideoProgress(id, pos);
                    lastSaveSecRef.current = pos;
                }
            }
            onProgress?.(data);
        },
        [id, saveInterval, onProgress, updateVideoProgress],
    );

    return (
        <Video
            ref={videoRef}
            source={{ uri }}
            style={style}
            paused={paused}
            rate={rate}
            resizeMode={resizeMode}
            onLoad={handleLoad}
            onProgress={handleProgress}
            onEnd={onEnd}
            onReadyForDisplay={onReadyForDisplay}
            progressUpdateInterval={60}
            playInBackground={false}
            playWhenInactive={false}
        />
    );
});
