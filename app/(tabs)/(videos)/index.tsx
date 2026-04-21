import { AlbumItem } from "@/components/AlbumItem";
import { AlbumItemDetailsModal } from "@/components/AlbumItemDetailsModal";
import { EmptyAlbumState } from "@/components/EmptyAlbumState";
import { Header } from "@/components/Header";
import { LoadingStatus } from "@/components/LoadingStatus";
import { RenameModal } from "@/components/RenameModal";
import { SortMenu } from "@/components/SortMenu";
import { ThemedSafeAreaView } from "@/components/Themed";
import { useTheme } from "@/context/ThemeContext";
import { useMedia } from "@/hooks/useMedia";
import { router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Calendar, Clock, SortAsc } from "lucide-react-native";
import React from "react";
import { BackHandler, FlatList, RefreshControl, View } from "react-native";

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
    } = useMedia();
    const { colors } = useTheme();
    const deferredAlbumSort = React.useDeferredValue(albumSort);
    const [selectedAlbumId, setSelectedAlbumId] = React.useState<string | null>(null);
    const selectedAlbum = React.useMemo(() => albums.find((a) => a.id === selectedAlbumId), [albums, selectedAlbumId]);
    const [renamingAlbum, setRenamingAlbum] = React.useState<any | null>(null);

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

    const renderAlbum = ({ item }: { item: any }) => {
        return (
            <AlbumItem
                item={item}
                onPress={(v: any) => {
                    if (isSelectionMode) {
                        toggleSelection(v.id);
                    } else {
                        router.push({
                            pathname: "/(tabs)/(videos)/[id]",
                            params: { id: v.id, title: v.displayName || v.title },
                        });
                    }
                }}
                onLongPress={(v: any) => toggleSelection(v.id)}
                onInfoPress={(v: any) => setSelectedAlbumId(v.id)}
                onRenamePress={(v: any) => setRenamingAlbum(v)}
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
            </Header>

            <FlatList
                data={dataToDisplay}
                keyExtractor={(item) => item.id}
                numColumns={2}
                ListHeaderComponent={
                    <View className="flex-row justify-end items-center mb-4 pr-2">
                        <SortMenu currentSort={albumSort} onSortChange={setAlbumSort} options={albumSortOptions} />
                    </View>
                }
                renderItem={renderAlbum}
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
                initialValue={renamingAlbum?.displayName || renamingAlbum?.title || ""}
                title="Rename Folder"
            />
        </ThemedSafeAreaView>
    );
};

export default AlbumListScreen;
