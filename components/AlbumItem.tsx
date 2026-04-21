import { Edit2, EyeOff, Folder, FolderInput, Info, MoreVertical, Trash2 } from "lucide-react-native";
import React from "react";
import { Image, Text, TouchableOpacity, View } from "react-native";
import { useMedia } from "../hooks/useMedia";
import { Icon } from "./Icon";
import { Menu } from "./Menu";
import { SelectionOverlay } from "./SelectionOverlay";
import { Skeleton } from "./Skeleton";

interface AlbumItemProps {
    item: any;
    onPress: (v: any) => void;
    onLongPress: (v: any) => void;
    onInfoPress?: (v: any) => void;
    onRenamePress?: (v: any) => void;
    renderMenu?: () => React.ReactNode;
}

export const AlbumItem = React.memo(({ item, onPress, onLongPress, onInfoPress, onRenamePress, renderMenu }: AlbumItemProps) => {
    const { isSelectionMode, selectedIds, hideAlbum, toggleSelection } = useMedia();
    const isSelected = selectedIds.has(item.id);

    if (item.isPlaceholder) {
        return (
            <View className="w-[46%] mx-[2%] mb-6">
                <Skeleton className="aspect-square rounded-2xl mb-2 border border-border" />
                <View className="px-1 mt-1 gap-1.5">
                    <Skeleton className="h-3.5 w-3/4 rounded border border-border" />
                    <Skeleton className="h-2.5 w-1/3 rounded border border-border" />
                </View>
            </View>
        );
    }

    return (
        <View className="w-[46%] mx-[2%] mb-6">
            <Menu variant="POPUP" anchorHorizontal="right">
                <Menu.Raise>
                    <View>
                        <TouchableOpacity
                            activeOpacity={0.8}
                            onPress={() => (isSelectionMode ? toggleSelection(item.id) : onPress(item))}
                            onLongPress={() => toggleSelection(item.id)}
                        >
                            <View
                                className={`w-full aspect-square rounded-2xl overflow-hidden border bg-card shadow-md mb-2 ${isSelected ? "border-primary border-2" : "border-border"}`}
                            >
                                {item.thumbnail ? (
                                    <Image source={{ uri: item.thumbnail }} className="w-full h-full" resizeMode="cover" />
                                ) : (
                                    <View className="w-full h-full justify-center items-center bg-card">
                                        <Icon icon={Folder} size={48} className="text-primary fill-primary/20" />
                                    </View>
                                )}
                                {!isSelectionMode && item.hasNew && (
                                    <View
                                        pointerEvents="none"
                                        className="absolute top-2 right-2 h-[20px] px-2 rounded-full justify-center items-center bg-error/80 backdrop-blur-md"
                                    >
                                        <Text className="text-white text-[9px] font-bold tracking-wider">NEW</Text>
                                    </View>
                                )}

                                {isSelectionMode && <SelectionOverlay isSelected={isSelected} size={22} />}
                            </View>
                        </TouchableOpacity>

                        <View className="flex-row items-start justify-between px-1">
                            <TouchableOpacity
                                activeOpacity={0.7}
                                onPress={() => {
                                    if (onInfoPress) onInfoPress(item);
                                    else onLongPress(item);
                                }}
                                className="flex-1 mr-2"
                            >
                                <View pointerEvents="none">
                                    <Text className="text-text font-semibold text-sm" numberOfLines={1}>
                                        {item.displayName || item.title}
                                    </Text>
                                    <Text className="text-secondary text-[11px] mt-0.5">{item.assetCount} videos</Text>
                                </View>
                            </TouchableOpacity>

                            {!isSelectionMode && (
                                <Menu.Trigger className="w-8 h-8 -mr-1 items-center justify-center rounded-full">
                                    <Icon icon={MoreVertical} size={16} className="text-secondary" />
                                </Menu.Trigger>
                            )}
                        </View>
                    </View>
                </Menu.Raise>

                {renderMenu ? (
                    renderMenu()
                ) : (
                    <Menu.Content className="w-48">
                        <Menu.Item
                            className="flex-row items-center px-4 py-3 gap-3 border-b border-white/5"
                            onPress={onLongPress}
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
                            onPress={() => console.log("Move album", item.id)}
                        >
                            <Icon icon={FolderInput} size={18} className="text-secondary" />
                            <Text className="text-white text-sm font-medium">Move</Text>
                        </Menu.Item>
                        <Menu.Item
                            className="flex-row items-center px-4 py-3 gap-3 border-b border-white/5"
                            onPress={() => hideAlbum(item.id)}
                        >
                            <Icon icon={EyeOff} size={18} className="text-secondary" />
                            <Text className="text-white text-sm font-medium">Hide</Text>
                        </Menu.Item>
                        <Menu.Item
                            className="flex-row items-center px-4 py-3 gap-3"
                            onPress={() => console.log("Delete folder", item.id)}
                        >
                            <Icon icon={Trash2} size={18} className="text-error" />
                            <Text className="text-error text-sm font-medium">Delete</Text>
                        </Menu.Item>
                    </Menu.Content>
                )}
            </Menu>
        </View>
    );
});

AlbumItem.displayName = "AlbumItem";
