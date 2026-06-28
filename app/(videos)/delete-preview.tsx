import { Header } from "@/components/Header";
import { Icon } from "@/components/Icon";
import { ThemedSafeAreaView } from "@/components/Themed";
import { useDeleteHandler } from "@/hooks/useDeleteHandler";
import { useMedia } from "@/hooks/useMedia";
import { useMediaStoreScreenshots } from "@/hooks/MediaStoreBridge/useMediaStoreScreenshots";
import { useRawAlbums } from "@/hooks/MediaStoreBridge/useMediaStoreRawAlbums";
import { useSelection } from "@/context/SelectionContext";
import { useSafeNavigation } from "@/hooks/useSafeNavigation";
import type { VideoSortConfig } from "@/types/useMedia";
import { cn } from "@/utils/cn";
import { useLocalSearchParams } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { AlertCircle, Film, Folder, Image as ImageIcon, Trash2 } from "lucide-react-native";
import React, { useMemo } from "react";
import { FlatList, Image, Text, TouchableOpacity, View } from "react-native";

export default function DeletePreviewPage() {
    // Only `type` comes from URL params — the actual IDs come directly from the
    // shared selectedIds state in SelectionContext.
    const { type } = useLocalSearchParams<{ type: "video" | "album" | "screenshot" }>();
    const currentType = Array.isArray(type) ? type[0] : type;

    const albums = useRawAlbums();
    const {
        allAlbumsVideos,
        compareByVideoSort,
        compareByAlbumSort,
    } = useMedia();
    const { selectedIds } = useSelection();
    const screenshots = useMediaStoreScreenshots();

    const { safeBack } = useSafeNavigation();

    // Build the list of items to delete from selectedIds, sorted the same way as
    // the originating page so the user sees a consistent order.
    const itemsToDelete = useMemo(() => {
        if (currentType === "video") {
            // Collect all videos across albums that are in selectedIds
            const matched: any[] = [];
            for (const albumId in allAlbumsVideos) {
                const albumVideos = allAlbumsVideos[albumId] || [];
                const albumMatches = albumVideos.filter((v) => v?.id && selectedIds.has(v.id));
                if (albumMatches.length > 0) {
                    const album = albums.find((a) => a.id === albumId) ?? null;
                    const activeSort: VideoSortConfig = album?.videoSortSettingScope === "local" && album.videoSortType
                        ? JSON.parse(album.videoSortType)
                        : { by: "episode", order: "asc" };
                    albumMatches.sort((a, b) => compareByVideoSort(a, b, activeSort));
                    matched.push(...albumMatches);
                }
            }
            return matched;
        } else if (currentType === "screenshot") {
            return screenshots.filter((s) => s?.id && selectedIds.has(s.id)) as {
                id: string;
                uri: string;
                filename: string;
            }[];
        } else {
            // Albums — sort using the same comparator as the album list page
            return [...albums.filter((a) => a?.id && selectedIds.has(a.id))].sort((a, b) =>
                compareByAlbumSort(a, b)
            );
        }
    }, [currentType, selectedIds, allAlbumsVideos, albums, screenshots, compareByVideoSort, compareByAlbumSort]);

    const idList = useMemo(() => itemsToDelete.map((i) => i.id), [itemsToDelete]);

    const { handleDelete, isDeleting } = useDeleteHandler({
        type: currentType,
        idList,
        itemCount: itemsToDelete.length,
    });

    const renderItem = ({ item }: { item: any }) => {
        if (!item) return null;
        const isScreenshot = currentType === "screenshot";
        const isVideo = currentType === "video";
        return (
            <View className="flex-row items-center p-4 border-b border-border mb-2 rounded-2xl mx-2">
                <View className="w-20 h-14 rounded-lg bg-zinc-900 overflow-hidden border border-border">
                    {item.thumbnail || item.uri ? (
                        <Image source={{ uri: item.thumbnail || item.uri }} className="w-full h-full" resizeMode="cover" />
                    ) : (
                        <View className="w-full h-full items-center justify-center">
                            <Icon icon={isScreenshot ? ImageIcon : isVideo ? Film : Folder} size={24} className="text-zinc-700" />
                        </View>
                    )}
                </View>
                <View className="flex-1 ml-4">
                    <Text className="text-text font-bold text-sm" numberOfLines={2}>
                        {item.title || item.filename || item.albumName || "Unnamed Item"}
                    </Text>
                    <Text className="text-secondary text-[10px] mt-1" numberOfLines={1}>
                        {item.uri || "No path found"}
                    </Text>
                    {currentType === "album" && (
                        <Text className="text-primary text-[10px] mt-0.5">{item.assetCount} videos will be deleted</Text>
                    )}
                </View>
            </View>
        );
    };

    return (
        <ThemedSafeAreaView className="flex-1">
            <StatusBar style="light" />
            <Header disableSelectionMode>
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
