import { AlbumItem, AlbumItemSkeleton } from "@/components/AlbumItem";
import { AlbumItemDetailsModal } from "@/components/AlbumItemDetailsModal";
import { EmptyAlbumState } from "@/components/EmptyAlbumState";
import { Header } from "@/components/Header";
import { Icon } from "@/components/Icon";
import { LoadingStatus } from "@/components/LoadingStatus";
import { RenameModal } from "@/components/RenameModal";
import { SortMenu } from "@/components/SortMenu";
import { ThemedSafeAreaView } from "@/components/Themed";
import { ThemedBottomSheet } from "@/components/ThemedBottomSheet";
import { useTheme } from "@/context/ThemeContext";
import { useMedia } from "@/hooks/useMedia";
import { useSafeNavigation } from "@/hooks/useSafeNavigation";
import { Album } from "@/types/useMedia";
import { useFocusEffect } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Calendar, Clock, Edit2, EyeOff, Folder, FolderInput, Info, SortAsc, Trash2 } from "lucide-react-native";
import React from "react";
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
        toggleSelection,
        renameAlbum,
        clearSelection,
        compareByAlbumSort,
        hideAlbum,
        hideMultipleAlbums,
        resetToAlbums,
    } = useMedia();
    const { colors } = useTheme();
    const deferredAlbumSort = React.useDeferredValue(albumSort);
    const [selectedAlbumId, setSelectedAlbumId] = React.useState<string | null>(null);
    const selectedAlbum = React.useMemo(() => albums.find((a) => a.id === selectedAlbumId), [albums, selectedAlbumId]);
    const [renamingAlbum, setRenamingAlbum] = React.useState<Album | null>(null);
    const [menuAlbum, setMenuAlbum] = React.useState<Album | null>(null);

    const { width: windowWidth } = useWindowDimensions();
    const [listWidth, setListWidth] = React.useState(windowWidth);
    const numColumns = Math.max(2, Math.floor(listWidth / 180));
    const itemWidth = (listWidth - 16) / numColumns;

    useFocusEffect(
        React.useCallback(() => {
            resetToAlbums();
        }, [resetToAlbums]),
    );

    React.useEffect(() => {
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

    const onRefresh = React.useCallback(async () => {
        fetchAlbums();
    }, [fetchAlbums]);

    const { safePush } = useSafeNavigation();

    const renderAlbumItem = ({ item }: { item: any }) => {
        if (item.isPlaceholder) return <AlbumItemSkeleton width={itemWidth} />;
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

    const dataToDisplay = React.useMemo(() => {
        // Show skeleton if we're scanning and have no data yet
        if (loadingTask?.id === "media-sync" && albums.length === 0) return skeletonData;

        const sorted = [...albums].sort((a, b) => compareByAlbumSort(a, b, deferredAlbumSort));
        return sorted;
    }, [loadingTask, albums, skeletonData, deferredAlbumSort, compareByAlbumSort]);

    return (
        <ThemedSafeAreaView className="flex-1">
            <StatusBar style="light" />

            <Header>
                <Header.Title title="Folders" subtitle="Browse your video collection" />

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
                                console.log("Delete multiple albums", Array.from(ids));
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
                    <View className="flex-row justify-end items-center mb-4 pr-2">
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
                title="Rename Folder"
            />

            <ThemedBottomSheet isVisible={!!menuAlbum} onClose={() => setMenuAlbum(null)}>
                {menuAlbum && (
                    <View className="px-2 pb-6">
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
                                <Text className="text-secondary text-xs uppercase tracking-widest mt-0.5">Folder Options</Text>
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
                                console.log("Delete folder", menuAlbum.id);
                            }}
                        >
                            <Icon icon={Trash2} size={22} className="text-error" />
                            <Text className="text-error text-base font-medium">Delete</Text>
                        </TouchableOpacity>
                    </View>
                )}
            </ThemedBottomSheet>
        </ThemedSafeAreaView>
    );
};

export default AlbumListScreen;
