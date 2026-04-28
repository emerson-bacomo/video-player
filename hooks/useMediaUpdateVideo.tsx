import { VideoMedia } from "@/types/useMedia";
import { savePlaybackDataDb, updateVideoLastOpenedTimeDb, updateVideoMarkersDb } from "@/utils/db";


import React, { useCallback } from "react";

export const useMediaUpdateVideo = (
    setAllAlbumsVideos: React.Dispatch<React.SetStateAction<Record<string, VideoMedia[]>>>,
) => {
    const updateVideoLastOpenedTime = useCallback((videoId: string) => {
        updateVideoLastOpenedTimeDb(videoId);
        setAllAlbumsVideos((prev) => {
            const now = Date.now();
            const next = { ...prev };
            Object.keys(next).forEach((albumId) => {
                const index = next[albumId].findIndex((v) => v.id === videoId);
                if (index !== -1) {
                    const newVids = [...next[albumId]];
                    newVids[index] = { ...newVids[index], lastOpenedTime: now };
                    next[albumId] = newVids;
                }
            });
            return next;
        });
    }, [setAllAlbumsVideos]);

    const updateMultipleVideoProgress = useCallback(
        (videoIds: string[], sec: number) => {
            setAllAlbumsVideos((prev) => {
                const next = { ...prev };
                let changed = false;

                videoIds.forEach((videoId) => {
                    for (const albumId in next) {
                        const videos = next[albumId];
                        const index = videos.findIndex((v) => v.id === videoId);
                        if (index !== -1) {
                            const video = videos[index];
                            const finalSec = Math.min(sec, video.duration);
                            let lastOpenedTime = video.lastOpenedTime;
                            
                            if (finalSec === -1) {
                                lastOpenedTime = 0;
                            } else if (finalSec === video.duration) {
                                lastOpenedTime = Date.now();
                            }

                            savePlaybackDataDb(videoId, finalSec);
                            if (lastOpenedTime !== video.lastOpenedTime) {
                                updateVideoLastOpenedTimeDb(videoId, lastOpenedTime);
                            }

                            const newVideos = [...videos];
                            newVideos[index] = { ...newVideos[index], lastPlayedSec: finalSec, lastOpenedTime };
                            next[albumId] = newVideos;
                            changed = true;
                            break;
                        }
                    }
                });

                return changed ? next : prev;
            });
        },
        [setAllAlbumsVideos],
    );

    const updateVideoProgress = useCallback(
        (videoId: string, sec: number) => {
            setAllAlbumsVideos((prev) => {
                const next = { ...prev };
                let changed = false;
                for (const albumId in next) {
                    const videos = next[albumId];
                    const index = videos.findIndex((v) => v.id === videoId);
                    if (index !== -1) {
                        const video = videos[index];
                        const finalSec = Math.min(sec, video.duration);
                        let lastOpenedTime = video.lastOpenedTime;

                        if (finalSec === -1) {
                            lastOpenedTime = 0;
                        } else if (finalSec === video.duration) {
                            lastOpenedTime = Date.now();
                        }

                        savePlaybackDataDb(videoId, finalSec);
                        if (lastOpenedTime !== video.lastOpenedTime) {
                            updateVideoLastOpenedTimeDb(videoId, lastOpenedTime);
                        }

                        const newVideos = [...videos];
                        newVideos[index] = { ...newVideos[index], lastPlayedSec: finalSec, lastOpenedTime };
                        next[albumId] = newVideos;
                        changed = true;
                        break;
                    }
                }
                return changed ? next : prev;
            });
        },
        [setAllAlbumsVideos],
    );





    const updateVideoMarkers = useCallback((videoId: string, markers: { time: number; markerId: string }[] | null) => {
        updateVideoMarkersDb(videoId, markers);
        setAllAlbumsVideos((prev) => {
            const next = { ...prev };
            let changed = false;
            for (const albumId in next) {
                const videos = next[albumId];
                const index = videos.findIndex((v) => v.id === videoId);
                if (index !== -1) {
                    const newVideos = [...videos];
                    newVideos[index] = { ...newVideos[index], markers: markers || undefined };
                    next[albumId] = newVideos;
                    changed = true;
                }
            }
            return changed ? next : prev;
        });
    }, [setAllAlbumsVideos]);

    return {
        updateVideoLastOpenedTime,
        updateMultipleVideoProgress,
        updateVideoProgress,
        updateVideoMarkers,
    };
};
