import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import * as ScreenOrientation from "expo-screen-orientation";
import { ChevronLeft, MoreVertical, Settings as SettingsIcon, ExternalLink, Scissors } from "lucide-react-native";
import React, { useEffect, useState } from "react";
import type { FC, ReactNode } from "react";
import { Text, TouchableOpacity, View } from "react-native";
import * as FileSystem from "expo-file-system/legacy";
import { SessionClip } from "../types/useMedia";
import { LoadingStatus } from "./LoadingStatus";
import { Menu } from "./Menu";
import { PlayerOrientationButton } from "./PlayerOrientationButton";
import { VideoBadges } from "./VideoBadges";
import { VideoItemDetailsModal } from "./VideoItemDetailsModal";
import { SessionClipsBottomSheet } from "./SessionClipsBottomSheet";
import { useMedia } from "@/hooks/useMedia";
import { useMediaStore } from "@/hooks/MediaStoreBridge/MediaStoreProvider";
import { ClipExportModal } from "./ClipExportModal";
import { useSafeNavigation } from "@/hooks/useSafeNavigation";
import { usePlayerContext } from "@/context/PlayerContext";
import { useOrientationLayout } from "@/hooks/useOrientationLayout";
import { useStableSafeAreaInsets } from "@/hooks/useStableSafeAreaInsets";

interface BasePlayerHeaderProps {
    children?: ReactNode;
    rightSection?: ReactNode;
    onLayout?: (event: any) => void;
}

export const BasePlayerHeader: FC<BasePlayerHeaderProps> = ({ children, rightSection, onLayout }) => {
    const { isLandscape } = useOrientationLayout();
    const insets = useStableSafeAreaInsets(isLandscape);
    const isPortrait = !isLandscape;
    const handleBack = () => {
        ScreenOrientation.unlockAsync();
        router.back();
    };

    return (
        <View className="absolute top-0 left-0 right-0 z-50">
            {/* Top Bar Gradient */}
            <LinearGradient
                colors={["rgba(0,0,0,0.9)", "rgba(0,0,0,0.5)", "transparent"]}
                className="absolute top-0 left-0 right-0 h-32"
                pointerEvents="none"
            />

            <View
                className="pt-12 pb-4 flex-row items-start justify-between"
                style={{ paddingLeft: Math.max(insets.left, 16), paddingRight: Math.max(insets.right, 16) }}
            >
                <View onLayout={onLayout} className="flex-row items-center flex-1">
                    <TouchableOpacity onPress={handleBack} className="p-2 pl-0">
                        <ChevronLeft size={28} color="white" />
                    </TouchableOpacity>

                    <View className="flex-1">{children}</View>
                </View>

                {isPortrait ? (
                    <View className="-mt-12" style={{ marginRight: -Math.max(insets.right, 16) }}>
                        <View className="absolute inset-0 rounded-bl-[40px] overflow-hidden">
                            <LinearGradient
                                colors={["rgba(0, 0, 0, 0.8)", "transparent"]}
                                locations={[0, 1]}
                                start={{ x: 1, y: 0 }}
                                end={{ x: 0, y: 0.8 }}
                                className="absolute inset-0"
                            />
                        </View>
                        <View className="pt-12 pl-1 pr-4 pb-6 items-center flex-col-reverse gap-2">{rightSection}</View>
                    </View>
                ) : (
                    <View className="flex-row items-center space-x-1">{rightSection}</View>
                )}
            </View>
        </View>
    );
};

export const PlayerHeader: FC<{ onSuccessAction?: () => void }> = ({ onSuccessAction }) => {
    const { activeVideo: video, setPaused, setHeaderLayout, isMenuOpen, resetControlsTimer, showControls } = usePlayerContext();
    const [isInfoModalVisible, setIsInfoModalVisible] = useState(false);
    const { isLandscape } = useOrientationLayout();
    const isPortrait = !isLandscape;
    const displayTitle = video?.title || "Video Player";

    const handleSettings = () => {
        ScreenOrientation.unlockAsync();
        router.push("/player-settings");
    };

    const store = useMediaStore();
    const { sessionClips, allAlbumsVideos, hasNewClips, markClipsAsViewed, executeReexport } =
        useMedia();
    const { safePush } = useSafeNavigation();
    const [isBottomSheetVisible, setIsBottomSheetVisible] = useState(false);
    const [bottomSheetView, setBottomSheetView] = useState<"clips" | "export">("clips");
    const [clipToReexport, setClipToReexport] = useState<SessionClip | null>(null);
    const [isSourceValid, setIsSourceValid] = useState(false);

    useEffect(() => {
        if (video?.clipSourceUri) {
            FileSystem.getInfoAsync(video.clipSourceUri).then((info) => {
                if (info.exists) {
                    setIsSourceValid(true);
                } else {
                    setIsSourceValid(false);
                    video?.clearClipSourceUri();
                }
            });
        } else {
            setIsSourceValid(false);
        }
    }, [video?.id, video?.clipSourceUri, store]);

    const handleClipPress = async (clip: SessionClip) => {
        setIsBottomSheetVisible(false);
        safePush({
            pathname: "/player",
            params: {
                videoId: clip.id,
                albumId: clip.albumId,
                initialTime: (clip.lastPlayedSec || 0).toString(),
            },
        });
    };

    const handlePlayOriginal = (uri: string) => {
        const allVids = Object.values(allAlbumsVideos).flat();
        const original = allVids.find((v) => v.uri === uri);
        if (original) {
            setIsBottomSheetVisible(false);
            safePush({
                pathname: "/player",
                params: {
                    videoId: original.id,
                    albumId: original.albumId,
                    initialTime: (original.lastPlayedSec || 0).toString(),
                },
            });
        }
    };

    const rightSection = (
        <>
            {Object.keys(sessionClips).length > 0 && (
                <TouchableOpacity
                    onPress={() => {
                        setBottomSheetView("clips");
                        setIsBottomSheetVisible(true);
                        markClipsAsViewed();
                    }}
                    className="p-2 relative"
                >
                    <Scissors size={22} color="white" />
                    {hasNewClips && (
                        <View className="absolute top-1 right-1 w-2.5 h-2.5 bg-blue-500 rounded-full border border-white/50" />
                    )}
                </TouchableOpacity>
            )}

            <LoadingStatus
                popupSide={isPortrait ? "left" : "bottom"}
                forceHidden={!showControls}
                onBeforeSet={(task) => {
                    // Only auto-show popup for clipping-related tasks
                    if (!task.id?.startsWith("clip-")) {
                        return false;
                    }
                }}
            />

            <PlayerOrientationButton />

            <TouchableOpacity onPress={handleSettings} className="p-2">
                <SettingsIcon size={22} color="white" />
            </TouchableOpacity>

            <Menu
                onOpen={() => {
                    isMenuOpen.current = true;
                }}
                onClose={() => {
                    isMenuOpen.current = false;
                    resetControlsTimer();
                }}
            >
                <Menu.Trigger className="p-2">
                    <MoreVertical size={24} color="white" />
                </Menu.Trigger>
                <Menu.Content className="w-56">
                    {isSourceValid && video?.clipSourceUri && (
                        <Menu.Item
                            onPress={() => handlePlayOriginal(video.clipSourceUri!)}
                            className="flex-row items-center gap-3 p-4"
                        >
                            <ExternalLink size={20} color="white" />
                            <Text className="text-white text-sm font-medium">Go to Source</Text>
                        </Menu.Item>
                    )}
                    <Menu.EmptyContent>
                        <View className="p-4">
                            <Text className="text-zinc-500 italic text-sm">No other actions available</Text>
                        </View>
                    </Menu.EmptyContent>
                </Menu.Content>
            </Menu>
        </>
    );

    return (
        <>
            <BasePlayerHeader rightSection={rightSection} onLayout={(e) => setHeaderLayout(e.nativeEvent.layout)}>
                <TouchableOpacity
                    className="flex-row items-center gap-2"
                    onPress={() => {
                        if (video) {
                            setPaused(true);
                            setIsInfoModalVisible(true);
                        }
                    }}
                    disabled={!video}
                >
                    <VideoBadges title={displayTitle} badgeClassName="h-auto py-0.5 px-2" textClassName="text-base" />
                    <Text className="text-white text-base font-bold flex-1" numberOfLines={1}>
                        {displayTitle}
                    </Text>
                </TouchableOpacity>
            </BasePlayerHeader>

            <VideoItemDetailsModal
                visible={isInfoModalVisible}
                onClose={() => setIsInfoModalVisible(false)}
                video={video || null}
                hidePlayAction={true}
            />

            <SessionClipsBottomSheet
                isVisible={isBottomSheetVisible && bottomSheetView === "clips"}
                onClose={() => setIsBottomSheetVisible(false)}
                sessionClips={sessionClips}
                onClipPress={handleClipPress}
                onReexportPress={(clip) => {
                    setClipToReexport(clip);
                    setBottomSheetView("export");
                }}
                onPlayOriginal={handlePlayOriginal}
                currentVideoId={video?.id}
            />

            {clipToReexport && bottomSheetView === "export" && (
                <ClipExportModal
                    visible={isBottomSheetVisible}
                    onClose={() => {
                        setBottomSheetView("clips");
                        setClipToReexport(null);
                    }}
                    video={clipToReexport}
                    segments={clipToReexport.segments}
                    defaultName={clipToReexport.exportOptions.name}
                    onExport={async (options) => {
                        setIsBottomSheetVisible(false);
                        await executeReexport(clipToReexport, options);
                        onSuccessAction?.();
                    }}
                    isReexport
                    initialOptions={clipToReexport.exportOptions}
                />
            )}
        </>
    );
};
