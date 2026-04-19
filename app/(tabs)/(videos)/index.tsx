import { AlbumItem } from "@/components/AlbumItem";
import { AlbumItemDetailsModal } from "@/components/AlbumItemDetailsModal";
import { EmptyAlbumState } from "@/components/EmptyAlbumState";
import { Header } from "@/components/Header";
import { LoadingStatus } from "@/components/LoadingStatus";
import { SortMenu } from "@/components/SortMenu";
import { ThemedSafeAreaView } from "@/components/Themed";
import { useTheme } from "@/context/ThemeContext";
import { useMedia } from "@/hooks/useMedia";
import { router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Calendar, Clock, SortAsc } from "lucide-react-native";
import React from "react";
import { FlatList, RefreshControl, View } from "react-native";

const AlbumListScreen = () => {
    const {
        albums,
        loadingTask,
        albumSort,
        setAlbumSort,
        fetchAlbums,
        requestPermissionAndFetch,
        permissionResponse,
        isInitialScanComplete,
    } = useMedia();
    const { colors } = useTheme();
    const [selectedAlbumId, setSelectedAlbumId] = React.useState<string | null>(null);
    const selectedAlbum = React.useMemo(() => albums.find((a) => a.id === selectedAlbumId), [albums, selectedAlbumId]);

    const skeletonData = Array.from({ length: 12 }).map((_, i) => ({ id: `skel-${i}`, isPlaceholder: true }));

    const albumSortOptions: { label: string; value: "name" | "date" | "duration"; icon: any }[] = [
        { label: "Date", value: "date", icon: Calendar },
        { label: "Name", value: "name", icon: SortAsc },
        { label: "Asset Count", value: "duration", icon: Clock },
    ];

    const onRefresh = React.useCallback(async () => {
        fetchAlbums();
    }, [fetchAlbums]);

    const renderAlbum = ({ item }: { item: any }) => {
        return (
            <AlbumItem
                item={item}
                onPress={() =>
                    router.push({
                        pathname: "/(tabs)/(videos)/[id]",
                        params: { id: item.id, title: item.displayName },
                    })
                }
                onLongPress={() => setSelectedAlbumId(item.id)}
            />
        );
    };

    const dataToDisplay = React.useMemo(() => {
        if (!isInitialScanComplete) return [];
        if (loadingTask && albums.length === 0) return skeletonData;
        return albums;
    }, [isInitialScanComplete, loadingTask, albums, skeletonData]);

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
                contentContainerStyle={{ paddingTop: 16, paddingHorizontal: 8, paddingRight: 14 }}
            />

            <AlbumItemDetailsModal visible={!!selectedAlbumId} album={selectedAlbum} onClose={() => setSelectedAlbumId(null)} />
        </ThemedSafeAreaView>
    );
};

export default AlbumListScreen;
