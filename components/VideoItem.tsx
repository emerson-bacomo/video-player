import { useTheme } from "@/context/ThemeContext";
import { renderHighlight } from "@/utils/textUtils";
import { router } from "expo-router";
import { CheckCircle, Circle, Edit2, EyeOff, Film, FolderInput, Info, MoreVertical, Trash2 } from "lucide-react-native";
import React from "react";
import { Image, Pressable, Text, TouchableOpacity, View } from "react-native";
import { useMedia } from "../hooks/useMedia";
import { Icon } from "./Icon";
import { Menu } from "./Menu";
import { SelectionOverlay } from "./SelectionOverlay";
import { Skeleton } from "./Skeleton";
import { VideoBadges } from "./VideoBadges";

interface VideoItemProps {
    item: any;
    searchQuery?: string;
    noEllipsis?: boolean;
    onPress?: (item: any) => void;
    onLongPress?: (item: any) => void;
    onInfoPress?: (item: any) => void;
    onRenamePress?: (item: any) => void;
    renderMenu?: () => React.ReactNode;
}

export const VideoItem = React.memo(
    ({ item, searchQuery, noEllipsis, onPress, onLongPress, onInfoPress, onRenamePress, renderMenu }: VideoItemProps) => {
        const { colors } = useTheme();
        const { updateVideoProgress, isSelectionMode, selectedIds, togglePrefixSelection, hideVideo, toggleSelection } = useMedia();
        const thumb = item.thumbnail;
        const isSelected = selectedIds.has(item.id);

        const handleToggleWatched = () => {
            const isWatched = item.lastPlayedSec >= item.duration * 0.95;
            const newProgress = isWatched ? 0 : item.duration;
            updateVideoProgress(item.id, newProgress);
        };

        if (item.isPlaceholder) {
            return (
                <View className="w-[46%] mx-[2%] mb-6">
                    <View className="w-full aspect-[16/10] bg-card rounded-xl overflow-hidden border border-border/50 shadow-md mb-2">
                        <Skeleton className="w-full h-full" />
                    </View>
                    <View className="px-1 gap-1.5">
                        <Skeleton className="h-3.5 w-full rounded border border-border/50" />
                        <Skeleton className="h-2.5 w-1/3 rounded border border-border/50" />
                    </View>
                </View>
            );
        }

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

        return (
            <View className="w-[46%] mx-[2%] mb-6">
                <Menu variant="POPUP" anchorHorizontal="right">
                    <Menu.Raise>
                        <View>
                            <TouchableOpacity
                                activeOpacity={0.8}
                                className={`w-full aspect-[16/10] bg-card rounded-xl overflow-hidden relative border shadow-md mb-2 ${isSelected ? "border-primary border-2" : "border-border"}`}
                                onPress={() => {
                                    if (isSelectionMode) {
                                        toggleSelection(item.id);
                                    } else if (onPress) {
                                        onPress(item);
                                    } else {
                                        router.push({
                                            pathname: "/player",
                                            params: { videoId: item.id },
                                        });
                                    }
                                }}
                                onLongPress={() => {
                                    toggleSelection(item.id);
                                }}
                            >
                                {thumb ? (
                                    <Image source={{ uri: thumb }} className="w-full h-full" resizeMode="cover" />
                                ) : (
                                    <View className="w-full h-full justify-center items-center">
                                        <Film size={24} color="#52525b" />
                                    </View>
                                )}

                                {!isSelectionMode && (
                                    <View className="absolute top-2 left-0 right-0 px-2 flex-row items-center">
                                        <VideoBadges title={item.displayName} />
                                        {item.lastPlayedSec === -1 && !isSelected && (
                                            <View
                                                pointerEvents="none"
                                                className="ml-auto bg-error/80 h-[18px] px-2 rounded-full justify-center items-center backdrop-blur-md border border-white/15"
                                            >
                                                <Text className="text-red-100 text-[9px] font-bold uppercase tracking-wider">
                                                    NEW
                                                </Text>
                                            </View>
                                        )}
                                    </View>
                                )}

                                {isSelectionMode && <SelectionOverlay isSelected={isSelected} size={22} />}

                                {hasPlayed && (
                                    <View className="absolute bottom-0 left-0 right-0 h-[3px] bg-white/50 overflow-hidden backdrop-blur-sm">
                                        <View className="bg-error h-full" style={{ width: `${progressPercent}%` }} />
                                    </View>
                                )}
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
                                        {renderHighlight(item.displayName, searchQuery, colors.primary, noEllipsis)}
                                        <Text className="text-secondary text-[10px] font-medium uppercase tracking-tight mt-0.5">
                                            {timeDisplay}
                                        </Text>
                                    </View>
                                </Pressable>

                                {!isSelectionMode && (
                                    <Menu.Trigger className="w-8 h-8 -mr-2 items-center justify-center rounded-full active:bg-white/10">
                                        <Icon icon={MoreVertical} size={16} className="text-secondary" />
                                    </Menu.Trigger>
                                )}
                            </View>
                        </View>
                    </Menu.Raise>

                    {renderMenu ? (
                        renderMenu()
                    ) : (
                        <Menu.Content className="w-56">
                            <Menu.Item
                                className="flex-row items-center px-4 py-3 gap-3 border-b border-white/5"
                                onPress={() => {
                                    if (onInfoPress) onInfoPress(item);
                                    else onLongPress?.(item);
                                }}
                            >
                                <Icon icon={Info} size={18} className="text-secondary" />
                                <Text className="text-white text-sm font-medium">Info</Text>
                            </Menu.Item>
                            <Menu.Item
                                className="flex-row items-center px-4 py-3 gap-3 border-b border-white/5"
                                onPress={() => onRenamePress?.(item)}
                            >
                                <Icon icon={Edit2} size={18} className="text-secondary" />
                                <Text className="text-white text-sm font-medium">Rename</Text>
                            </Menu.Item>
                            <Menu.Item
                                className="flex-row items-center px-4 py-3 gap-3 border-b border-white/5"
                                onPress={() => console.log("Move file", item.id)}
                            >
                                <Icon icon={FolderInput} size={18} className="text-secondary" />
                                <Text className="text-white text-sm font-medium">Move</Text>
                            </Menu.Item>
                            <Menu.Item
                                className="flex-row items-center px-4 py-3 gap-3 border-b border-white/5"
                                onPress={handleToggleWatched}
                            >
                                <Icon
                                    icon={item.lastPlayedSec >= item.duration * 0.95 ? Circle : CheckCircle}
                                    size={18}
                                    className="text-secondary"
                                />
                                <Text className="text-white text-sm font-medium">
                                    {item.lastPlayedSec >= item.duration * 0.95 ? "Mark as Unwatched" : "Mark as Watched"}
                                </Text>
                            </Menu.Item>
                            {item.prefix && (
                                <Menu.Item
                                    className="flex-row items-center px-4 py-3 gap-3 border-b border-white/5"
                                    onPress={() => togglePrefixSelection(item.prefix)}
                                >
                                    <Icon icon={Film} size={18} className="text-secondary" />
                                    <Text className="text-white text-sm font-medium">Select same prefix</Text>
                                </Menu.Item>
                            )}
                            <Menu.Item
                                className="flex-row items-center px-4 py-3 gap-3 border-b border-white/5"
                                onPress={() => hideVideo(item.id)}
                            >
                                <Icon icon={EyeOff} size={18} className="text-secondary" />
                                <Text className="text-white text-sm font-medium">Hide</Text>
                            </Menu.Item>
                            <Menu.Item
                                className="flex-row items-center px-4 py-3 gap-3"
                                onPress={() => console.log("Delete file", item.id)}
                            >
                                <Icon icon={Trash2} size={18} className="text-error" />
                                <Text className="text-error text-sm font-medium">Delete</Text>
                            </Menu.Item>
                        </Menu.Content>
                    )}
                </Menu>
            </View>
        );
    },
);

VideoItem.displayName = "VideoItem";
