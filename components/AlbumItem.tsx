import { Folder, MoreVertical } from "lucide-react-native";
import React from "react";
import { Image, Text, TouchableOpacity, View } from "react-native";
import { useMedia } from "../hooks/useMedia";
import { Album } from "../types/useMedia";
import { Icon } from "./Icon";
import { SelectionOverlay } from "./SelectionOverlay";
import { Skeleton } from "./Skeleton";

interface AlbumItemProps {
    item: Album;
    onPress: (v: Album) => void;
    onLongPress?: (v: Album) => void;
    onInfoPress?: (v: Album) => void;
    onMenuPress?: (v: Album) => void;
    width?: number;
}

export const AlbumItemSkeleton = React.memo(({ width }: { width?: number }) => (
    <View className="px-2 mb-6" style={width ? { width } : { flex: 1 }}>
        <Skeleton className="aspect-square rounded-2xl mb-2 border border-border" />
        <View className="px-1 mt-1 gap-1.5">
            <Skeleton className="h-3.5 w-3/4 rounded border border-border" />
            <Skeleton className="h-2.5 w-1/3 rounded border border-border" />
        </View>
    </View>
));

AlbumItemSkeleton.displayName = "AlbumItemSkeleton";

export const AlbumItem = React.memo(({ item, onPress, onLongPress, onInfoPress, onMenuPress, width }: AlbumItemProps) => {
    const { isSelectionMode, selectedIds, toggleSelection, allAlbumsVideos } = useMedia();
    const isSelected = selectedIds.has(item.id);

    const hasNew = React.useMemo(() => {
        const videos = allAlbumsVideos[item.id] || [];
        for (let i = 0; i < videos.length; i++) {
            if (videos[i].lastPlayedSec === -1) return true;
        }
        return false;
    }, [allAlbumsVideos, item.id]);

    return (
        <View className="px-2 mb-6" style={width ? { width } : { flex: 1 }}>
            <View>
                <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={() => (isSelectionMode ? toggleSelection(item.id) : onPress(item))}
                    onLongPress={() => toggleSelection(item.id)}
                >
                    <View
                        className={`w-full aspect-square rounded-2xl overflow-hidden border bg-card shadow-md mb-2 ${isSelected ? "border-primary border-2 p-1" : "border-border"}`}
                    >
                        <View className={`w-full h-full overflow-hidden ${isSelected ? "rounded-xl" : ""}`}>
                            {item.thumbnail ? (
                                <Image source={{ uri: item.thumbnail }} className="w-full h-full object-cover" />
                            ) : (
                                <View className="w-full h-full justify-center items-center bg-card">
                                    <Icon icon={Folder} size={48} className="text-primary fill-primary/20" />
                                </View>
                            )}

                            {!isSelectionMode && hasNew && (
                                <View
                                    pointerEvents="none"
                                    className="absolute top-2 right-2 h-[20px] px-2 rounded-full justify-center items-center bg-red-600/70 backdrop-blur-md"
                                >
                                    <Text className="text-white text-[9px] font-bold tracking-wider">NEW</Text>
                                </View>
                            )}

                        </View>

                        {isSelectionMode && <SelectionOverlay isSelected={isSelected} size={22} />}
                    </View>
                </TouchableOpacity>

                <View className="flex-row items-start justify-between px-1">
                    <TouchableOpacity
                        activeOpacity={0.7}
                        onPress={() => {
                            if (onInfoPress) onInfoPress(item);
                            else onLongPress?.(item);
                        }}
                        className="flex-1 mr-2"
                    >
                        <View pointerEvents="none">
                            <Text className="text-text font-semibold text-sm" numberOfLines={1}>
                                {item.title}
                            </Text>
                            <Text className="text-secondary text-xs mt-0.5">{item.assetCount} videos</Text>
                        </View>
                    </TouchableOpacity>

                    {!isSelectionMode && onMenuPress && (
                        <TouchableOpacity
                            activeOpacity={0.7}
                            onPress={() => onMenuPress(item)}
                            className="w-8 h-8 -mr-1 items-center justify-center rounded-full active:bg-white/10"
                        >
                            <Icon icon={MoreVertical} size={16} className="text-secondary" />
                        </TouchableOpacity>
                    )}
                </View>
            </View>
        </View>
    );
});

AlbumItem.displayName = "AlbumItem";
