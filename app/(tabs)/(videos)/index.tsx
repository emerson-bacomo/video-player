import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Calendar, Clock, Database, Folder, Info, SortAsc, X } from "lucide-react-native";
import React from "react";
import {
    FlatList,
    Image,
    Modal,
    RefreshControl,
    ScrollView,
    Text,
    TouchableOpacity,
    TouchableWithoutFeedback,
    View,
} from "react-native";
import { Button } from "../../../components/Button";
import { LoadingStatus } from "../../../components/LoadingStatus";
import { Skeleton } from "../../../components/Skeleton";
import { SortMenu } from "../../../components/SortMenu";
import { useMedia } from "../../../hooks/useMedia";

const AlbumListScreen = () => {
    const { albums, loadingTask, albumSort, setAlbumSort, fetchAlbums, requestPermissionAndFetch } = useMedia();
    const router = useRouter();
    const REFRESH_TASK_ID = "albumListRefresh";
    const [selectedAlbumId, setSelectedAlbumId] = React.useState<string | null>(null);
    const selectedAlbum = React.useMemo(() => albums.find((a) => a.id === selectedAlbumId), [albums, selectedAlbumId]);

    const skeletonData = React.useMemo(
        () => Array.from({ length: 12 }).map((_, i) => ({ id: `skel-${i}`, isPlaceholder: true })),
        [],
    );



    const albumSortOptions: { label: string; value: "name" | "date" | "duration"; icon: any }[] = [
        { label: "Date", value: "date", icon: Calendar },
        { label: "Name", value: "name", icon: SortAsc },
        { label: "Asset Count", value: "duration", icon: Clock },
    ];

    const onRefresh = React.useCallback(async () => {
        // Trigger fetch asynchronously. The LoadingStatus component will
        // intercept the loadingTask and show the interactive popup.
        fetchAlbums(true, false, REFRESH_TASK_ID);
    }, [fetchAlbums]);

    const renderAlbum = React.useCallback(
        ({ item }: { item: any }) => {
            return (
                <AlbumItem
                    item={item}
                    onPress={() => router.push({ pathname: "/(tabs)/(videos)/[id]", params: { id: item.id, title: item.title } })}
                    onLongPress={() => setSelectedAlbumId(item.id)}
                />
            );
        },
        [router],
    );

    return (
        <View className="flex-1 bg-black">
            <StatusBar style="light" />

            <View className="px-4 pt-14 pb-4 border-b border-zinc-900 flex-row items-center justify-between">
                <View>
                    <Text className="text-white text-2xl font-bold">Folders</Text>
                    <Text className="text-zinc-500 text-sm">Browse your video collection</Text>
                </View>

                <View className="flex-row items-center gap-2">
                    <LoadingStatus />
                    <SortMenu currentSort={albumSort} onSortChange={setAlbumSort} options={albumSortOptions} />
                </View>
            </View>

            <FlatList
                data={loadingTask?.id === REFRESH_TASK_ID ? skeletonData : albums}
                keyExtractor={(item) => item.id}
                numColumns={2}
                columnWrapperStyle={{ justifyContent: "space-between", paddingHorizontal: 16 }}
                renderItem={renderAlbum}
                refreshControl={
                    albums.length > 0 ? (
                        <RefreshControl refreshing={false} onRefresh={onRefresh} tintColor="#ffffff" colors={["#3b82f6"]} />
                    ) : undefined
                }
                ListEmptyComponent={
                    loadingTask ? null : (
                        <View className="flex-1 justify-center items-center py-20 px-10">
                            <View className="w-20 h-20 bg-zinc-900 rounded-full items-center justify-center mb-6 border border-zinc-800">
                                <Database size={32} color="#3b82f6" />
                            </View>
                            <Text className="text-white text-lg font-bold mb-2 text-center">No Media Found</Text>
                            <Text className="text-zinc-500 text-center mb-8 leading-5">
                                We couldn't find any videos on your device. Ensure you've granted gallery access.
                            </Text>
                            <Button
                                title="Scan Device"
                                className="bg-blue-600 px-8 py-3.5 rounded-2xl shadow-lg shadow-blue-500/20"
                                onPress={(setLoading) => {
                                    setLoading(true);
                                    requestPermissionAndFetch();
                                }}
                            />
                        </View>
                    )
                }
                contentContainerStyle={{ paddingTop: 22, paddingBottom: 22 }}
            />

            <Modal visible={!!selectedAlbumId} transparent animationType="fade" onRequestClose={() => setSelectedAlbumId(null)}>
                <TouchableWithoutFeedback onPress={() => setSelectedAlbumId(null)}>
                    <View className="flex-1 bg-black/80 justify-center items-center p-6">
                        <TouchableWithoutFeedback onPress={(e) => e.stopPropagation()}>
                            <View className="w-full bg-zinc-900 rounded-2xl border border-zinc-800 overflow-hidden shadow-2xl">
                                {selectedAlbum && (
                                    <>
                                        {selectedAlbum.thumbnail ? (
                                            <Image
                                                source={{ uri: selectedAlbum.thumbnail }}
                                                className="w-full aspect-[16/9] opacity-80"
                                            />
                                        ) : (
                                            <View className="w-full aspect-[16/9] bg-zinc-800 justify-center items-center">
                                                <Folder size={48} color="#3b82f6" />
                                            </View>
                                        )}

                                        <TouchableOpacity
                                            className="absolute top-3 right-3 bg-black/50 p-1.5 rounded-full"
                                            onPress={() => setSelectedAlbumId(null)}
                                        >
                                            <X size={16} color="white" />
                                        </TouchableOpacity>

                                        <View className="flex flex-col gap-6 max-h-[70vh] p-5">
                                            <Text className="text-white text-lg font-bold">{selectedAlbum.title}</Text>

                                            <View className="h-[1px] bg-zinc-800" />

                                            <ScrollView
                                                className="min-h-[200px]"
                                                contentContainerStyle={{ gap: 24, paddingBottom: 12 }}
                                            >
                                                <View className="flex-row items-center gap-3">
                                                    <Folder size={16} color="#71717a" />
                                                    <View>
                                                        <Text className="text-zinc-500 text-[10px] uppercase font-bold tracking-wider">
                                                            Folder Contents
                                                        </Text>
                                                        <Text className="text-zinc-300 text-sm">
                                                            {selectedAlbum.assetCount || 0} Videos
                                                        </Text>
                                                    </View>
                                                </View>

                                                <View className="flex-row items-center gap-3">
                                                    <Calendar size={16} color="#71717a" />
                                                    <View>
                                                        <Text className="text-zinc-500 text-[10px] uppercase font-bold tracking-wider">
                                                            Last Added / Modified
                                                        </Text>
                                                        <Text className="text-zinc-300 text-sm">
                                                            {new Date(selectedAlbum.lastModified || 0).toLocaleDateString(
                                                                undefined,
                                                                {
                                                                    year: "numeric",
                                                                    month: "short",
                                                                    day: "numeric",
                                                                    hour: "2-digit",
                                                                    minute: "2-digit",
                                                                },
                                                            )}
                                                        </Text>
                                                    </View>
                                                </View>

                                                <View className="flex-row items-center gap-3">
                                                    <Info size={16} color="#71717a" />
                                                    <View>
                                                        <Text className="text-zinc-500 text-[10px] uppercase font-bold tracking-wider">
                                                            Directory Info
                                                        </Text>
                                                        <Text className="text-zinc-300 text-xs mt-1 leading-5">
                                                            Approx. Video-Only Storage:{" "}
                                                            {selectedAlbum.assetCount * 45 >= 1000
                                                                ? `${((selectedAlbum.assetCount * 45) / 1024).toFixed(2)} GB`
                                                                : `${(selectedAlbum.assetCount * 45).toFixed(0)} MB`}
                                                        </Text>
                                                    </View>
                                                </View>
                                            </ScrollView>

                                            <View className="h-[1px] bg-zinc-800" />

                                            <View className="pb-2">
                                                <TouchableOpacity
                                                    className="w-full bg-blue-600 rounded-xl py-3.5 items-center flex-row justify-center gap-2"
                                                    onPress={() => {
                                                        const item = selectedAlbum;
                                                        setSelectedAlbumId(null);
                                                        router.push({
                                                            pathname: "/(tabs)/(videos)/[id]",
                                                            params: { id: item.id, title: item.title },
                                                        });
                                                    }}
                                                >
                                                    <Folder size={16} color="white" fill="white" />
                                                    <Text className="text-white font-bold tracking-wide">Open Folder</Text>
                                                </TouchableOpacity>
                                            </View>
                                        </View>
                                    </>
                                )}
                            </View>
                        </TouchableWithoutFeedback>
                    </View>
                </TouchableWithoutFeedback>
            </Modal>
        </View>
    );
};

const AlbumItem = React.memo(({ item, onPress, onLongPress }: { item: any; onPress: () => void; onLongPress: () => void }) => {
    if (item.isPlaceholder) {
        return (
            <View className="w-[48%] mb-6">
                <Skeleton className="aspect-square rounded-2xl mb-2 border border-zinc-800" />
                <View className="px-1 mt-1 gap-1.5">
                    <Skeleton className="h-3.5 w-3/4 rounded border border-zinc-800/50" />
                    <Skeleton className="h-2.5 w-1/3 rounded border border-zinc-800/50" />
                </View>
            </View>
        );
    }
    return (
        <View className="w-[48%] mb-6">
            <TouchableOpacity activeOpacity={0.8} onPress={onPress} onLongPress={onLongPress}>
                <View className="aspect-square bg-zinc-900 rounded-2xl overflow-hidden border border-zinc-800 shadow-md mb-2">
                    {item.thumbnail ? (
                        <Image source={{ uri: item.thumbnail }} className="w-full h-full" resizeMode="cover" />
                    ) : (
                        <View className="w-full h-full justify-center items-center bg-zinc-800">
                            <Folder size={48} color="#3b82f6" fill="#3b82f633" />
                        </View>
                    )}
                    {item.hasNew && (
                        <View
                            pointerEvents="none"
                            className="absolute top-2 right-2 bg-red-600/80 h-[20px] px-2 rounded-full justify-center items-center backdrop-blur-md"
                        >
                            <Text className="text-red-100 text-[9px] font-bold tracking-wider">NEW</Text>
                        </View>
                    )}
                </View>
            </TouchableOpacity>

            <TouchableOpacity activeOpacity={0.7} onPress={onLongPress} className="px-1">
                <Text className="text-white font-semibold text-sm" numberOfLines={1}>
                    {item.title}
                </Text>
                <Text className="text-zinc-500 text-[11px] mt-0.5">{item.assetCount} videos</Text>
            </TouchableOpacity>
        </View>
    );
});

export default AlbumListScreen;
