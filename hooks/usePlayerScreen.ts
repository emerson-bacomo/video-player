import { useEffect, useState, useCallback, useRef } from "react";
import * as Brightness from "expo-brightness";
import * as NavigationBar from "expo-navigation-bar";
import { useRouter } from "expo-router";
import { useSafeNavigation } from "@/hooks/useSafeNavigation";
import { useMediaStoreUnfilteredVideos } from "@/hooks/MediaStoreBridge/useMediaStoreUnfilteredVideos";
import { useLoadingTask } from "@/context/LoadingTaskContext";
import { useSettings } from "@/hooks/useSettings";
import { toast } from "sonner-native";
import { usePlayerContext } from "@/context/PlayerContext";
import { OnProgressData } from "react-native-video";

export const usePlayerScreen = () => {
    const { safeBack } = useSafeNavigation();
    const { settings } = useSettings();
    const router = useRouter();
    const { getUnfilteredVideosForAlbum } = useMediaStoreUnfilteredVideos();
    const { setLoadingTask } = useLoadingTask();

    const {
        videoId,
        albumId,
        activeVideo,
        playlist,
        currentIndex,
        hasNext,
        duration,
        showControls,
        setPaused,
        setCurrentDisplayTime,
        setIsEnded,
        isReadyForDisplay,
        playerRef,
        clipState,
    } = usePlayerContext();

    const { previewActive, setPreviewActive, isInSegment, getNextClipStart, maxSegmentEndTime } = clipState;

    const [hasBrightnessPermission, setHasBrightnessPermission] = useState(false);
    const [permissionChecked, setPermissionChecked] = useState(false);
    const lastPreviewSeekTarget = useRef<number>(-1);

    // Initial check for brightness permission
    useEffect(() => {
        (async () => {
            const { status } = await Brightness.getPermissionsAsync();
            if (status === "granted") {
                setHasBrightnessPermission(true);
            }
            setPermissionChecked(true);
        })();
    }, []);

    // Unpause when permission is checked and granted
    useEffect(() => {
        if (permissionChecked && hasBrightnessPermission) {
            setPaused(false);
        }
    }, [permissionChecked, hasBrightnessPermission, setPaused]);

    // Handle NavigationBar visibility
    useEffect(() => {
        if (!showControls) {
            NavigationBar.setVisibilityAsync("hidden");
        } else {
            NavigationBar.setVisibilityAsync("visible");
        }
    }, [showControls]);

    // Check if video is missing
    useEffect(() => {
        if (videoId && albumId) {
            getUnfilteredVideosForAlbum(albumId).then((albumVids) => {
                const activeVid = albumVids.find((v) => v.id === videoId);
                if (!activeVid && !isReadyForDisplay) {
                    toast.error("Video not found.");
                    safeBack();
                }
            });
        }
    }, [videoId, albumId, safeBack, isReadyForDisplay, getUnfilteredVideosForAlbum]);

    // Clear background tasks on mount
    useEffect(() => {
        setLoadingTask(null, (id) => !id?.startsWith("clip-"));
    }, [setLoadingTask]);

    const handleCorePlayerProgress = useCallback(
        (data: OnProgressData) => {
            const posSec = data.currentTime;
            setCurrentDisplayTime(Math.floor(posSec));

            // Clipping Preview Logic
            if (previewActive && isReadyForDisplay) {
                if (maxSegmentEndTime > 0 && posSec >= maxSegmentEndTime) {
                    setPreviewActive(false);
                    setPaused(true);
                    lastPreviewSeekTarget.current = -1;
                } else if (!isInSegment(posSec)) {
                    const nextStart = getNextClipStart(posSec);
                    if (nextStart !== -1 && nextStart !== lastPreviewSeekTarget.current && nextStart > posSec) {
                        lastPreviewSeekTarget.current = nextStart;
                        playerRef.current?.seek(nextStart);
                    }
                } else {
                    lastPreviewSeekTarget.current = -1;
                }
            } else {
                lastPreviewSeekTarget.current = -1;
            }
        },
        [
            isReadyForDisplay,
            previewActive,
            isInSegment,
            getNextClipStart,
            setPreviewActive,
            setPaused,
            maxSegmentEndTime,
            setCurrentDisplayTime,
            playerRef,
        ],
    );

    const handleCorePlayerEnd = useCallback(() => {
        if (settings.autoPlayOnEnd && hasNext) {
            const nextVideo = playlist[currentIndex + 1];
            let shouldAutoPlay = true;

            if (settings.autoPlaySimilarPrefixOnly) {
                if (!activeVideo?.prefix || activeVideo.prefix === "Unknown" || activeVideo.prefix !== nextVideo?.prefix) {
                    shouldAutoPlay = false;
                }
            }

            if (shouldAutoPlay && nextVideo) {
                router.setParams({
                    videoId: nextVideo.id,
                    albumId,
                    initialTime: (nextVideo.lastPlayedSec || 0).toString(),
                });
                return;
            }
        }

        setPaused(true);
        setCurrentDisplayTime(Math.floor(duration));
        setIsEnded(true);
    }, [
        settings.autoPlayOnEnd,
        settings.autoPlaySimilarPrefixOnly,
        hasNext,
        playlist,
        currentIndex,
        activeVideo,
        albumId,
        duration,
        router,
        setPaused,
        setCurrentDisplayTime,
        setIsEnded,
    ]);

    return {
        hasBrightnessPermission,
        setHasBrightnessPermission,
        permissionChecked,
        handleCorePlayerProgress,
        handleCorePlayerEnd,
    };
};
