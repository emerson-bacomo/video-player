import { Header } from "@/components/Header";
import { Icon } from "@/components/Icon";
import { ThemedSafeAreaView } from "@/components/Themed";
import { useMedia } from "@/hooks/useMedia";
import { useSafeNavigation } from "@/hooks/useSafeNavigation";
import { Album, VideoMedia } from "@/types/useMedia";
import { cn } from "@/utils/cn";
import { router, useLocalSearchParams } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { AlertCircle, Film, Folder, Trash2 } from "lucide-react-native";
import React, { useMemo, useState } from "react";
import { FlatList, Image, Text, TouchableOpacity, View } from "react-native";
import { toast } from "sonner-native";

export default function DeletePreviewPage() {
    const { ids, type } = useLocalSearchParams<{ ids: string; type: "video" | "album" }>();
    const { allAlbumsVideos, albums, clearSelection, deleteMultipleVideos, deleteMultipleAlbums } = useMedia();
    const { safeBack } = useSafeNavigation();
    const [isDeleting, setIsDeleting] = useState(false);

    const idList = useMemo(() => (ids ? ids.split(",") : []), [ids]);

    const itemsToDelete = useMemo(() => {
        if (type === "video") {
            const allVideos = Object.values(allAlbumsVideos).flat();
            return idList.map((id) => allVideos.find((v) => v.id === id)).filter(Boolean) as VideoMedia[];
        } else {
            return idList.map((id) => albums.find((a) => a.id === id)).filter(Boolean) as Album[];
        }
    }, [idList, type, allAlbumsVideos, albums]);

    const handleDelete = async () => {
        setIsDeleting(true);
        try {
            let success = false;
            if (type === "video") {
                success = await deleteMultipleVideos(idList);
            } else {
                success = await deleteMultipleAlbums(idList);
            }

            if (success) {
                toast.success(`Successfully deleted ${itemsToDelete.length} item${itemsToDelete.length !== 1 ? "s" : ""}`);
                clearSelection();
                router.dismissAll();
                router.replace("/(tabs)/(videos)");
            } else {
                toast.error("Failed to delete some items. They may be read-only or in use.");
            }
        } catch (error) {
            console.error("Delete error", error);
            toast.error("An error occurred during deletion.");
        } finally {
            setIsDeleting(false);
        }
    };

    const renderItem = ({ item }: { item: any }) => {
        const isVideo = type === "video";
        return (
            <View className="flex-row items-center p-4 border-b border-border bg-card/30 mb-2 rounded-2xl mx-2">
                <View className="w-20 h-14 rounded-lg bg-zinc-900 overflow-hidden border border-border">
                    {item.thumbnail ? (
                        <Image source={{ uri: item.thumbnail }} className="w-full h-full" resizeMode="cover" />
                    ) : (
                        <View className="w-full h-full items-center justify-center">
                            <Icon icon={isVideo ? Film : Folder} size={24} className="text-zinc-700" />
                        </View>
                    )}
                </View>
                <View className="flex-1 ml-4">
                    <Text className="text-text font-bold text-sm" numberOfLines={2}>
                        {item.title || item.albumName || "Unnamed Item"}
                    </Text>
                    <Text className="text-secondary text-[10px] mt-1" numberOfLines={1}>
                        {item.uri || "No path found"}
                    </Text>
                    {!isVideo && (
                        <Text className="text-primary text-[10px] mt-0.5">{item.assetCount} videos will be deleted</Text>
                    )}
                </View>
            </View>
        );
    };

    return (
        <ThemedSafeAreaView className="flex-1">
            <StatusBar style="light" />
            <Header>
                <Header.Back onPress={safeBack} />
                <Header.Title
                    title="Confirm Deletion"
                    subtitle={`Review ${itemsToDelete.length} item${itemsToDelete.length !== 1 ? "s" : ""} to be permanently deleted`}
                />
            </Header>

            <View className="bg-red-500/10 p-4 mx-4 my-2 rounded-2xl flex-row items-center border border-red-500/20">
                <Icon icon={AlertCircle} size={24} className="text-red-500" />
                <View className="flex-1 ml-3">
                    <Text className="text-red-500 font-bold text-sm">Permanent Action</Text>
                    <Text className="text-red-500/80 text-xs">
                        This will permanently delete the files from your device storage. This action cannot be undone.
                    </Text>
                </View>
            </View>

            <FlatList
                data={itemsToDelete}
                keyExtractor={(item) => item.id}
                renderItem={renderItem}
                contentContainerStyle={{ paddingVertical: 10, paddingBottom: 100 }}
                ListEmptyComponent={
                    <View className="flex-1 items-center justify-center pt-20">
                        <Text className="text-secondary italic">No items selected for deletion</Text>
                    </View>
                }
            />

            <View className="absolute bottom-0 left-0 right-0 p-6 bg-background/95 border-t border-border">
                <TouchableOpacity
                    onPress={handleDelete}
                    disabled={isDeleting || itemsToDelete.length === 0}
                    className={cn(
                        "flex-row items-center justify-center p-4 rounded-2xl gap-2",
                        isDeleting || itemsToDelete.length === 0 ? "bg-zinc-800" : "bg-red-600",
                    )}
                >
                    <Icon icon={Trash2} size={20} color="white" />
                    <Text className="text-white font-bold text-lg">
                        {isDeleting
                            ? "Deleting..."
                            : `Delete ${itemsToDelete.length} Item${itemsToDelete.length !== 1 ? "s" : ""}`}
                    </Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={safeBack} disabled={isDeleting} className="mt-3 p-4 items-center">
                    <Text className="text-secondary font-medium">Cancel and Go Back</Text>
                </TouchableOpacity>
            </View>
        </ThemedSafeAreaView>
    );
}
