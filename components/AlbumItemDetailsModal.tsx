import { useTheme } from "@/context/ThemeContext";
import { router } from "expo-router";
import { Calendar, Folder, Info } from "lucide-react-native";
import React from "react";
import { Image, ScrollView, Text, View } from "react-native";
import { ThemedButton } from "./Themed";
import { ThemedBottomSheet } from "./ThemedBottomSheet";

interface AlbumItemDetailsModalProps {
    visible: boolean;
    album: any;
    onClose: () => void;
    hideOpenFolderAction?: boolean;
}

export const AlbumItemDetailsModal = ({ visible, album, onClose, hideOpenFolderAction }: AlbumItemDetailsModalProps) => {
    const { theme } = useTheme();

    if (!album) return null;

    return (
        <ThemedBottomSheet isVisible={visible} onClose={onClose}>
            <View className="p-6 pb-2">
                <View className="flex-row items-center gap-5 mb-6">
                    {album.thumbnail ? (
                        <Image
                            source={{ uri: album.thumbnail }}
                            className="w-32 aspect-video rounded-xl"
                            style={{ backgroundColor: theme.card }}
                        />
                    ) : (
                        <View
                            className="w-32 aspect-video rounded-xl justify-center items-center"
                            style={{ backgroundColor: theme.card, borderWidth: 1, borderColor: theme.border }}
                        >
                            <Folder size={24} color={theme.primary} />
                        </View>
                    )}
                    <View className="flex-1">
                        <Text className="text-zinc-500 text-[10px] font-bold uppercase tracking-widest mb-1">
                            Folder Metadata
                        </Text>
                        <Text style={{ color: theme.text }} className="text-xl font-bold">
                            {album.title}
                        </Text>
                    </View>
                </View>

                <View style={{ borderBottomWidth: 1, borderColor: theme.border }} />
            </View>

            <View className="flex flex-col gap-6 p-6 pt-0">
                <ScrollView className="max-h-[250px]" contentContainerStyle={{ gap: 24, paddingBottom: 12 }}>
                    <View className="flex-row items-center gap-4">
                        <View className="w-8 h-8 rounded-full items-center justify-center bg-zinc-800">
                            <Folder size={16} color={theme.primary} />
                        </View>
                        <View>
                            <Text style={{ color: theme.secondary }} className="text-[10px] uppercase font-bold tracking-wider">
                                Folder Contents
                            </Text>
                            <Text style={{ color: theme.text }} className="text-sm">
                                {album.assetCount || 0} Videos
                            </Text>
                        </View>
                    </View>

                    <View className="flex-row items-center gap-4">
                        <View className="w-8 h-8 rounded-full items-center justify-center bg-zinc-800">
                            <Calendar size={16} color={theme.primary} />
                        </View>
                        <View>
                            <Text style={{ color: theme.secondary }} className="text-[10px] uppercase font-bold tracking-wider">
                                Last Added / Modified
                            </Text>
                            <Text style={{ color: theme.text }} className="text-sm">
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
                            <Info size={16} color={theme.primary} />
                        </View>
                        <View>
                            <Text style={{ color: theme.secondary }} className="text-[10px] uppercase font-bold tracking-wider">
                                Directory Info
                            </Text>
                            <Text style={{ color: theme.text }} className="text-xs mt-1 leading-5">
                                Approx. Video-Only Storage:{" "}
                                {album.assetCount * 45 >= 1000
                                    ? `${((album.assetCount * 45) / 1024).toFixed(2)} GB`
                                    : `${(album.assetCount * 45).toFixed(0)} MB`}
                            </Text>
                        </View>
                    </View>
                </ScrollView>

                {(!hideOpenFolderAction) && (
                    <>
                        <View style={{ borderBottomWidth: 1, borderColor: theme.border }} />

                        <View className="pb-8">
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
                    </>
                )}
            </View>
        </ThemedBottomSheet>
    );
};
