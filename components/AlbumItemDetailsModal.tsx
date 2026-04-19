import { BottomSheetScrollView } from "@gorhom/bottom-sheet";
import { router } from "expo-router";
import { Calendar, Folder, Info } from "lucide-react-native";
import React from "react";
import { Image, Text, View } from "react-native";
import { Icon } from "./Icon";
import { ThemedButton } from "./Themed";
import { ThemedBottomSheet } from "./ThemedBottomSheet";

interface AlbumItemDetailsModalProps {
    visible: boolean;
    album: any;
    onClose: () => void;
    hideOpenFolderAction?: boolean;
}

export const AlbumItemDetailsModal = ({ visible, album, onClose, hideOpenFolderAction }: AlbumItemDetailsModalProps) => {
    if (!album) return null;

    return (
        <ThemedBottomSheet isVisible={visible} onClose={onClose}>
            <BottomSheetScrollView
                contentContainerStyle={{ paddingBottom: 24 }}
            >
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
                            <Text className="text-zinc-500 text-[10px] font-bold uppercase tracking-widest mb-1">
                                Folder Metadata
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
                            <Text className="text-secondary text-[10px] uppercase font-bold tracking-wider">Folder Contents</Text>
                            <Text className="text-text text-sm">{album.assetCount || 0} Videos</Text>
                        </View>
                    </View>

                    <View className="flex-row items-center gap-4">
                        <View className="w-8 h-8 rounded-full items-center justify-center bg-zinc-800">
                            <Icon icon={Calendar} size={16} className="text-primary" />
                        </View>
                        <View>
                            <Text className="text-secondary text-[10px] uppercase font-bold tracking-wider">
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
                            <Icon icon={Info} size={16} className="text-primary" />
                        </View>
                        <View>
                            <Text className="text-secondary text-[10px] uppercase font-bold tracking-wider">Directory Info</Text>
                            <Text className="text-text text-xs mt-1 leading-5">
                                Approx. Video-Only Storage:{" "}
                                {album.assetCount * 45 >= 1000
                                    ? `${((album.assetCount * 45) / 1024).toFixed(2)} GB`
                                    : `${(album.assetCount * 45).toFixed(0)} MB`}
                            </Text>
                        </View>
                    </View>
                    {!hideOpenFolderAction && (
                        <View className="mt-2">
                            <View className="border-b border-border mb-6" />
                            <View className="pb-4">
                                <ThemedButton
                                    title="Open Folder"
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
            </BottomSheetScrollView>
        </ThemedBottomSheet>
    );
};
