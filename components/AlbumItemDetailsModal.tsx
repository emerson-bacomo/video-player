import { breakPath } from "@/utils/textUtils";
import { router } from "expo-router";
import { Calendar, Folder, HardDrive, MapPin } from "lucide-react-native";
import React from "react";
import { Image, Text, View } from "react-native";
import { Icon } from "./Icon";
import { ThemedButton } from "./Themed";
import { ThemedBottomSheet, ThemedBottomSheetScrollView } from "./ThemedBottomSheet";

interface AlbumItemDetailsModalProps {
    visible: boolean;
    album: any;
    onClose: () => void;
    hideOpenAlbumAction?: boolean;
}

export const AlbumItemDetailsModal = ({ visible, album, onClose, hideOpenAlbumAction }: AlbumItemDetailsModalProps) => {
    if (!album) return null;

    return (
        <ThemedBottomSheet isVisible={visible} onClose={onClose}>
            <ThemedBottomSheetScrollView contentContainerStyle={{ paddingBottom: 24 }}>
                <View className="p-6 pb-2">
                    <View className="flex-row items-center gap-5 mb-6">
                        {album.thumbnail ? (
                            <Image source={{ uri: album.thumbnail }} className="w-32 aspect-video rounded-xl bg-card" />
                        ) : (
                            <View className="w-32 aspect-video rounded-xl justify-center items-center bg-card border border-border">
                                <Icon icon={Folder} size={24} className="text-primary" />
                            </View>
                        )}
                        <View className="flex-1">
                            <Text className="text-zinc-500 text-sm font-bold uppercase tracking-widest mb-1">
                                Album Metadata
                            </Text>
                            <Text className="text-text text-xl font-bold">{album.title}</Text>
                        </View>
                    </View>

                    <View className="border-b border-border" />
                </View>

                <View className="px-6 gap-6">
                    <View className="flex-row items-center gap-4">
                        <View className="w-8 h-8 rounded-full items-center justify-center bg-zinc-800">
                            <Icon icon={Folder} size={16} className="text-primary" />
                        </View>
                        <View>
                            <Text className="text-secondary text-xs uppercase font-bold tracking-wider">Contents</Text>
                            <Text className="text-text text-sm">{album.assetCount || 0} Videos</Text>
                        </View>
                    </View>

                    <View className="flex-row items-center gap-4">
                        <View className="w-8 h-8 rounded-full items-center justify-center bg-zinc-800">
                            <Icon icon={Calendar} size={16} className="text-primary" />
                        </View>
                        <View>
                            <Text className="text-secondary text-xs uppercase font-bold tracking-wider">
                                Last Added / Modified
                            </Text>
                            <Text className="text-text text-sm">
                                {new Date(album.lastModified || 0).toLocaleDateString(undefined, {
                                    year: "numeric",
                                    month: "short",
                                    day: "numeric",
                                    hour: "2-digit",
                                    minute: "2-digit",
                                })}
                            </Text>
                        </View>
                    </View>

                    <View className="flex-row items-center gap-4">
                        <View className="w-8 h-8 rounded-full items-center justify-center bg-zinc-800">
                            <Icon icon={HardDrive} size={16} className="text-primary" />
                        </View>
                        <View className="flex-1">
                            <Text className="text-secondary text-xs uppercase font-bold tracking-wider">Size</Text>
                            <Text className="text-text text-sm mt-1 leading-5">
                                Approx. Video-Only Storage:{" "}
                                {album.assetCount * 45 >= 1000
                                    ? `${((album.assetCount * 45) / 1024).toFixed(2)} GB`
                                    : `${(album.assetCount * 45).toFixed(0)} MB`}
                            </Text>
                        </View>
                    </View>

                    <View className="flex-row items-center gap-4 mt-6">
                        <View className="w-8 h-8 rounded-full items-center justify-center bg-zinc-800">
                            <Icon icon={MapPin} size={16} className="text-primary" />
                        </View>
                        <View className="flex-1">
                            <Text className="text-secondary text-xs uppercase font-bold tracking-wider">Path</Text>
                            <Text className="text-text text-sm mt-1 leading-4" numberOfLines={2}>
                                {breakPath(album.uri.split("/0/").pop() || "---")}
                            </Text>
                        </View>
                    </View>
                    {!hideOpenAlbumAction && (
                        <View className="mt-2">
                            <View className="border-b border-border mb-6" />
                            <View className="pb-4">
                                <ThemedButton
                                    title="Open Album"
                                    onPress={() => {
                                        onClose();
                                        router.push({
                                            pathname: "/(tabs)/(videos)/[id]",
                                            params: { id: album.id, title: album.title },
                                        });
                                    }}
                                />
                            </View>
                        </View>
                    )}
                </View>
            </ThemedBottomSheetScrollView>
        </ThemedBottomSheet>
    );
};
