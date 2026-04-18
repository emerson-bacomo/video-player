import React, { forwardRef, useCallback, useEffect, useRef } from "react";
import { StyleProp, ViewStyle } from "react-native";
import Video, { OnLoadData, OnProgressData, VideoRef } from "react-native-video";
import { useFloatingPlayer } from "../context/FloatingPlayerContext";
import { useMedia, VideoMedia } from "../hooks/useMedia";
import { savePlaybackData } from "../utils/db";

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
}

export const CorePlayer = forwardRef<VideoRef, CorePlayerProps>((props, ref) => {
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
    } = props;

    const uri = video.uri;
    const id = video.id;

    const videoRef = useRef<VideoRef>(null);
    const { saveLastPlayed } = useFloatingPlayer();
    const { updateVideoProgress } = useMedia();

    // ── Single Source of Truth for Resume ──────────────────────────────────
    // Use the passed video object's position as initial state
    const dbResumeSec = video?.lastPlayedSec && video.lastPlayedSec > 0 ? video.lastPlayedSec : 0;

    const currentTimeRef = useRef(dbResumeSec);
    const durationRef = useRef(0);
    const lastSaveSecRef = useRef(dbResumeSec);
    const isInitialSeekDone = useRef(false);

    // Clean up or save on unmount/video change
    useEffect(() => {
        return () => {
            if (uri) {
                // Save to Mini Player state
                if (id) {
                    saveLastPlayed({ id });
                }

                // Final save to DB and global state
                if (id && currentTimeRef.current > 0) {
                    savePlaybackData(id, currentTimeRef.current);
                    updateVideoProgress(id, currentTimeRef.current);
                }
            }
        };
    }, [uri, id]); // Video source change

    const handleLoad = useCallback(
        (data: OnLoadData) => {
            durationRef.current = data.duration;
            if (!isInitialSeekDone.current && dbResumeSec > 0) {
                videoRef.current?.seek(dbResumeSec);
                isInitialSeekDone.current = true;
            }
            onLoad?.(data);
        },
        [dbResumeSec, onLoad],
    );

    const handleProgress = useCallback(
        (data: OnProgressData) => {
            const pos = data.currentTime;
            currentTimeRef.current = pos;

            // Periodic Sync to DB and global state
            if (id && !paused && Math.abs(pos - lastSaveSecRef.current) >= saveInterval / 1000) {
                savePlaybackData(id, pos);
                updateVideoProgress(id, pos);
                lastSaveSecRef.current = pos;
            }

            onProgress?.(data);
        },
        [id, paused, saveInterval, onProgress, updateVideoProgress],
    );

    return (
        <Video
            ref={(node) => {
                videoRef.current = node;
                if (typeof ref === "function") ref(node);
                else if (ref) (ref as any).current = node;
            }}
            source={{ uri }}
            style={style}
            paused={paused}
            rate={rate}
            resizeMode={resizeMode}
            onLoad={handleLoad}
            onProgress={handleProgress}
            onEnd={onEnd}
            onReadyForDisplay={onReadyForDisplay}
            playInBackground={false}
            playWhenInactive={false}
        />
    );
});
