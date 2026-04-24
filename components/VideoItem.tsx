import { useTheme } from "@/context/ThemeContext";
import { useSafeNavigation } from "@/hooks/useSafeNavigation";
import { VideoMedia } from "@/types/useMedia";
import { renderHighlight } from "@/utils/textUtils";
import { Film, MoreVertical } from "lucide-react-native";
import React from "react";
import { Image, Pressable, Text, TouchableOpacity, View } from "react-native";
import { useMedia } from "../hooks/useMedia";
import { Icon } from "./Icon";
import { SelectionOverlay } from "./SelectionOverlay";
import { Skeleton } from "./Skeleton";
import { VideoBadges } from "./VideoBadges";

interface VideoItemProps {
    item: VideoMedia;
    searchQuery?: string;
    noEllipsis?: boolean;
    onPress?: (item: VideoMedia) => void;
    onLongPress?: (item: VideoMedia) => void;
    onInfoPress?: (item: VideoMedia) => void;
    onMenuPress?: (item: VideoMedia) => void;
    width?: number;
}

export const VideoItemSkeleton = React.memo(({ width }: { width?: number }) => (
    <View className="px-2 mb-6" style={width ? { width } : { flex: 1 }}>
        <View className="w-full aspect-[16/10] bg-card rounded-xl overflow-hidden border border-border/50 shadow-md mb-2">
            <Skeleton className="w-full h-full" />
        </View>
        <View className="px-1 gap-1.5">
            <Skeleton className="h-3.5 w-full rounded border border-border/50" />
            <Skeleton className="h-2.5 w-1/3 rounded border border-border/50" />
        </View>
    </View>
));

VideoItemSkeleton.displayName = "VideoItemSkeleton";

export const VideoItem = React.memo(
    ({ item, searchQuery, noEllipsis, onPress, onLongPress, onInfoPress, onMenuPress, width }: VideoItemProps) => {
        const { colors } = useTheme();
        const { isSelectionMode, selectedIds, toggleSelection } = useMedia();
        const { safePush } = useSafeNavigation();

        const thumb = item.thumbnail;
        const isSelected = selectedIds.has(item.id);

        const totalTimeStr = `${Math.floor(item.duration / 60)}:${Math.floor(item.duration % 60)
            .toString()
            .padStart(2, "0")}`;
        let timeDisplay = totalTimeStr;
        const hasPlayed = item.lastPlayedSec !== undefined && item.lastPlayedSec > 0;
        let progressPercent = 0;

        if (hasPlayed) {
            const playedSecs = item.lastPlayedSec;
            progressPercent = Math.min(100, Math.max(0, (playedSecs / item.duration) * 100));
            const playedStr = `${Math.floor(playedSecs / 60)}:${Math.floor(playedSecs % 60)
                .toString()
                .padStart(2, "0")}`;
            timeDisplay = `${playedStr} / ${totalTimeStr}`;
        }

        const title = React.useMemo(
            () => renderHighlight(item.title, searchQuery, colors.primary, noEllipsis),
            [item.title, searchQuery, colors.primary, noEllipsis],
        );

        return (
            <View className="px-2 mb-6" style={width ? { width } : { flex: 1 }}>
                <TouchableOpacity
                    activeOpacity={0.8}
                    className={`w-full aspect-[16/10] bg-card rounded-xl overflow-hidden relative border shadow-md mb-2 ${isSelected ? "border-primary border-2 p-1" : "border-border"}`}
                    onPress={() => {
                        if (isSelectionMode) {
                            toggleSelection(item.id);
                        } else if (onPress) {
                            onPress(item);
                        } else {
                            safePush({
                                pathname: "/player",
                                params: { videoId: item.id, albumId: item.albumId },
                            });
                        }
                    }}
                    onLongPress={() => {
                        toggleSelection(item.id);
                    }}
                >
                    <View className={`w-full h-full overflow-hidden ${isSelected ? "rounded-lg" : ""}`}>
                        {thumb ? (
                            <Image source={{ uri: thumb }} className="w-full h-full object-cover" />
                        ) : (
                            <View className="w-full h-full justify-center items-center">
                                <Film size={24} color="#52525b" />
                            </View>
                        )}

                        {!isSelectionMode && (
                            <View className="absolute top-2 left-0 right-0 px-2 flex-row items-center">
                                <VideoBadges title={item.title} />
                                {item.lastPlayedSec === -1 && (
                                    <View
                                        pointerEvents="none"
                                        className="ml-auto bg-red-600/70 h-[18px] px-2 rounded-full justify-center items-center backdrop-blur-md border border-white/15"
                                    >
                                        <Text className="text-red-100 text-[9px] font-bold uppercase tracking-wider">NEW</Text>
                                    </View>
                                )}
                            </View>
                        )}

                        {hasPlayed && (
                            <View className="absolute bottom-0 left-0 right-0 h-[3px] bg-white/50 overflow-hidden backdrop-blur-sm">
                                <View className="bg-error h-full" style={{ width: `${progressPercent}%` }} />
                            </View>
                        )}
                    </View>

                    {isSelectionMode && <SelectionOverlay isSelected={isSelected} size={22} />}
                </TouchableOpacity>

                <View className="flex-row items-start justify-between px-1">
                    <Pressable
                        onPress={() => {
                            if (onInfoPress) onInfoPress(item);
                            else onLongPress?.(item);
                        }}
                        className="flex-1 mr-2 py-0.5 active:opacity-50"
                    >
                        <View pointerEvents="none">
                            {title}
                            <Text className="text-secondary text-[10px] font-medium uppercase tracking-tight mt-0.5">
                                {timeDisplay}
                            </Text>
                        </View>
                    </Pressable>

                    {!isSelectionMode && (
                        <TouchableOpacity
                            activeOpacity={0.7}
                            onPress={() => onMenuPress?.(item)}
                            className="w-8 h-8 -mr-1 items-center justify-center rounded-full active:bg-white/10"
                        >
                            <Icon icon={MoreVertical} size={16} className="text-secondary" />
                        </TouchableOpacity>
                    )}
                </View>
            </View>
        );
    },
);

VideoItem.displayName = "VideoItem";
