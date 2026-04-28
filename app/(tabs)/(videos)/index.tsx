import { AlbumItem, AlbumItemSkeleton } from "@/components/AlbumItem";
import { AlbumItemDetailsModal } from "@/components/AlbumItemDetailsModal";
import { RecentlyPlayedAlbum } from "@/components/AlbumItemRecentlyPlayed";
import { EmptyAlbumState } from "@/components/EmptyAlbumState";
import { Header } from "@/components/Header";
import { Icon } from "@/components/Icon";
import { LoadingStatus } from "@/components/LoadingStatus";
import { RenameModal } from "@/components/RenameModal";
import { SortMenu } from "@/components/SortMenu";
import { ThemedSafeAreaView } from "@/components/Themed";
import { ThemedBottomSheet, ThemedBottomSheetScrollView } from "@/components/ThemedBottomSheet";
import { useTheme } from "@/context/ThemeContext";
import { useMedia } from "@/hooks/useMedia";
import { useSafeNavigation } from "@/hooks/useSafeNavigation";
import { Album } from "@/types/useMedia";
import { router, useFocusEffect } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Calendar, CheckCircle, Circle, Clock, Edit2, EyeOff, Folder, FolderInput, Info, SortAsc, Trash2 } from "lucide-react-native";
import React, { useCallback, useDeferredValue, useEffect, useMemo, useState } from "react";
import { BackHandler, FlatList, Image, RefreshControl, Text, TouchableOpacity, View, useWindowDimensions } from "react-native";

const AlbumListScreen = () => {
    const {
        albums,
        loadingTask,
        albumSort,
        setAlbumSort,
        fetchAlbums,
        requestPermissionAndFetch,
        permissionResponse,
        isSelectionMode,
        selectedIds,
        toggleSelection,
        renameAlbum,
        clearSelection,
        compareByAlbumSort,
        hideAlbum,
        hideMultipleAlbums,
        resetToAlbums,
        recentlyPlayedCount,
        recentlyPlayedVideos,
        allAlbumsVideos,
        updateMultipleVideoProgress,
    } = useMedia();
    const { colors } = useTheme();
    const deferredAlbumSort = useDeferredValue(albumSort);
    const [selectedAlbumId, setSelectedAlbumId] = useState<string | null>(null);
    const selectedAlbum = useMemo(() => albums.find((a) => a.id === selectedAlbumId), [albums, selectedAlbumId]);
    const [renamingAlbum, setRenamingAlbum] = useState<Album | null>(null);
    const [menuAlbum, setMenuAlbum] = useState<Album | null>(null);

    const { width: windowWidth } = useWindowDimensions();
    const [listWidth, setListWidth] = useState(windowWidth);
    const numColumns = Math.max(2, Math.floor(listWidth / 180));
    const itemWidth = (listWidth - 16) / numColumns;

    const isSelectionWatched = useMemo(() => {
        if (!selectedIds.size) return false;
        const firstAlbumId = Array.from(selectedIds)[0];
        const firstAlbumVideos = allAlbumsVideos[firstAlbumId] || [];
        if (firstAlbumVideos.length === 0) return false;
        return firstAlbumVideos[0].lastPlayedSec >= 0;
    }, [selectedIds, allAlbumsVideos]);

    useFocusEffect(
        useCallback(() => {
            resetToAlbums();
        }, [resetToAlbums]),
    );

    useEffect(() => {
        const backAction = () => {
            if (isSelectionMode) {
                clearSelection();
                return true;
            }
            return false;
        };

        const backHandler = BackHandler.addEventListener("hardwareBackPress", backAction);
        return () => backHandler.remove();
    }, [isSelectionMode, clearSelection]);

    const skeletonData = Array.from({ length: 12 }).map((_, i) => ({ id: `skel-${i}`, isPlaceholder: true }));

    const albumSortOptions: { label: string; value: "name" | "date" | "count"; icon: any }[] = [
        { label: "Date", value: "date", icon: Calendar },
        { label: "Name", value: "name", icon: SortAsc },
        { label: "Asset Count", value: "count", icon: Clock },
    ];

    const onRefresh = useCallback(async () => {
        fetchAlbums();
    }, [fetchAlbums]);

    const { safePush } = useSafeNavigation();

    const renderAlbumItem = ({ item }: { item: any }) => {
        if (item.isPlaceholder) return <AlbumItemSkeleton width={itemWidth} />;
        if (item.id === "recently-played") return <RecentlyPlayedAlbum item={item} width={itemWidth} />;
        return (
            <AlbumItem
                item={item}
                width={itemWidth}
                onPress={(v: any) => {
                    if (isSelectionMode) {
                        toggleSelection(v.id);
                    } else {
                        safePush({
                            pathname: "/(tabs)/(videos)/[id]",
                            params: { id: v.id },
                        });
                    }
                }}
                onLongPress={(v: any) => toggleSelection(v.id)}
                onInfoPress={(v: any) => setSelectedAlbumId(v.id)}
                onMenuPress={setMenuAlbum}
            />
        );
    };

    const handleRenameAlbum = (newName: string) => {
        if (renamingAlbum) {
            renameAlbum(renamingAlbum.id, newName);
            setRenamingAlbum(null);
        }
    };

    const dataToDisplay = useMemo(() => {
        // Show skeleton if we're scanning and have no data yet
        if (loadingTask?.id === "media-sync" && albums.length === 0) return skeletonData;

        const sorted = [...albums].sort((a, b) => compareByAlbumSort(a, b, deferredAlbumSort));
        if (recentlyPlayedCount > 0) {
            sorted.push({
                id: "recently-played",
                title: "Recently Played",
                albumName: "Recently Played",
                assetCount: recentlyPlayedCount,
                uri: "",
                thumbnail: recentlyPlayedVideos?.[0]?.thumbnail,
            });
        }
        return sorted;
    }, [loadingTask, albums, skeletonData, deferredAlbumSort, compareByAlbumSort]);

    return (
        <ThemedSafeAreaView className="flex-1">
            <StatusBar style="light" />

            <Header>
                <Header.Title title="Albums" subtitle="Browse your video collection" />

                <Header.Actions>
                    <LoadingStatus />
                    <Header.SearchAction />
                </Header.Actions>

                <Header.SelectionActions
                    actions={[
                        {
                            label: "Move",
                            icon: FolderInput,
                            onPress: (ids) => {
                                console.log("Move multiple albums", Array.from(ids));
                            },
                        },
                        {
                            label: isSelectionWatched ? "Mark as Unwatched" : "Mark as Watched",
                            icon: isSelectionWatched ? Circle : CheckCircle,
                            onPress: (ids) => {
                                const allSelectedVideoIds: string[] = [];
                                ids.forEach((albumId) => {
                                    const vids = allAlbumsVideos[albumId] || [];
                                    vids.forEach((v) => allSelectedVideoIds.push(v.id));
                                });
                                const newProgress = isSelectionWatched ? -1 : Infinity;
                                updateMultipleVideoProgress(allSelectedVideoIds, newProgress);
                                clearSelection();
                            },
                        },
                        {
                            label: "Hide",
                            icon: EyeOff,
                            onPress: (ids) => {
                                hideMultipleAlbums(Array.from(ids));
                                clearSelection();
                            },
                        },
                        {

                            label: "Delete",
                            icon: Trash2,
                            destructive: true,
                            onPress: (ids) => {
                                router.push({
                                    pathname: "/delete-preview",
                                    params: { ids: Array.from(ids).join(","), type: "album" },
                                });
                            },
                        },
                    ]}
                />
            </Header>

            <FlatList
                onLayout={(e) => setListWidth(e.nativeEvent.layout.width)}
                key={numColumns}
                data={dataToDisplay}
                keyExtractor={(item) => item.id}
                numColumns={numColumns}
                // Performance Optimizations (Low Settings)
                initialNumToRender={2}
                windowSize={3}
                maxToRenderPerBatch={2}
                removeClippedSubviews={true}
                ListHeaderComponent={
                    <View className="flex-row justify-end items-center pr-2 gap-4 mb-4">
                        <SortMenu currentSort={albumSort} onSortChange={setAlbumSort} options={albumSortOptions} />
                    </View>
                }
                renderItem={renderAlbumItem}
                refreshControl={
                    <RefreshControl
                        refreshing={false}
                        onRefresh={onRefresh}
                        tintColor={colors.primary}
                        colors={[colors.primary]}
                        enabled={permissionResponse?.status === "granted"}
                    />
                }
                ListEmptyComponent={<EmptyAlbumState loading={!!loadingTask} onScan={requestPermissionAndFetch} />}
                contentContainerStyle={{ paddingTop: 16, paddingHorizontal: 8 }}
            />

            <AlbumItemDetailsModal visible={!!selectedAlbumId} album={selectedAlbum} onClose={() => setSelectedAlbumId(null)} />

            <RenameModal
                visible={!!renamingAlbum}
                onClose={() => setRenamingAlbum(null)}
                onRename={handleRenameAlbum}
                initialValue={renamingAlbum?.title || ""}
                title="Rename Album"
            />

            <ThemedBottomSheet isVisible={!!menuAlbum} onClose={() => setMenuAlbum(null)}>
                {menuAlbum && (
                    <ThemedBottomSheetScrollView contentContainerStyle={{ paddingBottom: 24, paddingHorizontal: 8 }}>
                        <View className="px-4 py-4 mb-2 flex-row items-center gap-4">
                            <View className="w-14 h-14 rounded-xl bg-card overflow-hidden border border-border">
                                {menuAlbum.thumbnail ? (
                                    <Image source={{ uri: menuAlbum.thumbnail }} className="w-full h-full object-cover" />
                                ) : (
                                    <View className="w-full h-full justify-center items-center">
                                        <Icon icon={Folder} size={28} className="text-primary/60" />
                                    </View>
                                )}
                            </View>
                            <View className="flex-1">
                                <Text className="text-text font-bold text-lg" numberOfLines={1}>
                                    {menuAlbum.title}
                                </Text>
                                <Text className="text-secondary text-xs uppercase tracking-widest mt-0.5">Album Options</Text>
                            </View>
                        </View>

                        <TouchableOpacity
                            className="flex-row items-center px-4 py-4 gap-4"
                            onPress={() => {
                                setMenuAlbum(null);
                                setSelectedAlbumId(menuAlbum.id);
                            }}
                        >
                            <Icon icon={Info} size={22} className="text-secondary" />
                            <Text className="text-text text-base font-medium">Info</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            className="flex-row items-center px-4 py-4 gap-4"
                            onPress={() => {
                                setMenuAlbum(null);
                                setRenamingAlbum(menuAlbum);
                            }}
                        >
                            <Icon icon={Edit2} size={22} className="text-secondary" />
                            <Text className="text-text text-base font-medium">Rename</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            className="flex-row items-center px-4 py-4 gap-4"
                            onPress={() => {
                                setMenuAlbum(null);
                                console.log("Move album", menuAlbum.id);
                            }}
                        >
                            <Icon icon={FolderInput} size={22} className="text-secondary" />
                            <Text className="text-text text-base font-medium">Move</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            className="flex-row items-center px-4 py-4 gap-4"
                            onPress={() => {
                                setMenuAlbum(null);
                                hideAlbum(menuAlbum.id);
                            }}
                        >
                            <Icon icon={EyeOff} size={22} className="text-secondary" />
                            <Text className="text-text text-base font-medium">Hide</Text>
                        </TouchableOpacity>

                        <View className="h-[1px] bg-border/50 my-2 mx-4" />

                        <TouchableOpacity
                            className="flex-row items-center px-4 py-4 gap-4"
                            onPress={() => {
                                setMenuAlbum(null);
                                router.push({
                                    pathname: "/delete-preview",
                                    params: { ids: menuAlbum.id, type: "album" },
                                });
                            }}
                        >
                            <Icon icon={Trash2} size={22} className="text-error" />
                            <Text className="text-error text-base font-medium">Delete</Text>
                        </TouchableOpacity>
                    </ThemedBottomSheetScrollView>
                )}
            </ThemedBottomSheet>
        </ThemedSafeAreaView>
    );
};

export default AlbumListScreen;
