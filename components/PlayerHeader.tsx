import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import * as ScreenOrientation from "expo-screen-orientation";
import { ChevronLeft, MoreVertical, Settings as SettingsIcon } from "lucide-react-native";
import React from "react";
import { Text, TouchableOpacity, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { VideoMedia } from "../types/useMedia";
import { LoadingStatus } from "./LoadingStatus";
import { Menu } from "./Menu";
import { PlayerOrientationButton } from "./PlayerOrientationButton";
import { VideoBadges } from "./VideoBadges";
import { VideoItemDetailsModal } from "./VideoItemDetailsModal";

interface BasePlayerHeaderProps {
    children?: React.ReactNode;
    rightSection?: React.ReactNode;
    onLayout?: (event: any) => void;
}

export const BasePlayerHeader: React.FC<BasePlayerHeaderProps> = ({ children, rightSection, onLayout }) => {
    const { width, height } = useWindowDimensions();
    const insets = useSafeAreaInsets();
    const isPortrait = height > width;
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
                    /* Side Gradient for L-shape in Portrait */
                    <View className="-mt-12" style={{ marginRight: -Math.max(insets.right, 16) }}>
                        {/* Background Gradient with Rounding */}
                        <View className="absolute inset-0 rounded-bl-[40px] overflow-hidden">
                            <LinearGradient
                                colors={["rgba(0, 0, 0, 0.8)", "transparent"]}
                                locations={[0, 1]}
                                start={{ x: 1, y: 0 }}
                                end={{ x: 0, y: 0.8 }}
                                className="absolute inset-0"
                            />
                        </View>

                        {/* Interactive Content (No overflow-hidden so popups can expand) */}
                        <View className="pt-12 pl-1 pr-4 pb-6 items-center flex-col-reverse gap-2">{rightSection}</View>
                    </View>
                ) : (
                    <View className="flex-row items-center space-x-1">{rightSection}</View>
                )}
            </View>
        </View>
    );
};

interface PlayerHeaderProps {
    video?: VideoMedia;
    onLayout?: (event: any) => void;
    setPaused?: (paused: boolean) => void;
}

export const PlayerHeader: React.FC<PlayerHeaderProps> = ({ video, onLayout, setPaused }) => {
    const [isInfoModalVisible, setIsInfoModalVisible] = React.useState(false);
    const { width, height } = useWindowDimensions();
    const isPortrait = height > width;
    const displayTitle = video?.title || "Video Player";

    const handleSettings = () => {
        ScreenOrientation.unlockAsync();
        router.push("/player-settings");
    };

    const rightSection = (
        <>
            <PlayerOrientationButton />

            <TouchableOpacity onPress={handleSettings} className="p-2">
                <SettingsIcon size={22} color="white" />
            </TouchableOpacity>

            {/* Portrait: indicator sits on the right strip → popup opens to the left.
                Landscape: indicator is inline in the header → default bottom popup. */}
            <LoadingStatus
                popupSide={isPortrait ? "left" : "bottom"}
                onBeforeSet={(task) => {
                    // Only auto-show popup for clipping-related tasks
                    if (!task.id?.startsWith("clip-")) {
                        return false;
                    }
                }}
            />

            <Menu>
                <Menu.Trigger className="p-2">
                    <MoreVertical size={24} color="white" />
                </Menu.Trigger>
                <Menu.Content className="w-56">
                    <Menu.Item className="p-4">
                        <Text className="text-zinc-500 italic">No actions available</Text>
                    </Menu.Item>
                </Menu.Content>
            </Menu>
        </>
    );

    return (
        <>
            <BasePlayerHeader rightSection={rightSection} onLayout={onLayout}>
                <TouchableOpacity
                    className="flex-row items-center gap-2"
                    onPress={() => {
                        if (video) {
                            setPaused?.(true);
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
        </>
    );
};
