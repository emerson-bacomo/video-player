import { AlbumItem } from "@/components/AlbumItem";
import { AlbumItemDetailsModal } from "@/components/AlbumItemDetailsModal";
import { Header } from "@/components/Header";
import { Icon } from "@/components/Icon";
import { Menu } from "@/components/Menu";
import { ThemedSafeAreaView } from "@/components/Themed";
import { VideoItem } from "@/components/VideoItem";
import { VideoItemDetailsModal } from "@/components/VideoItemDetailsModal";
import { useMedia } from "@/hooks/useMedia";
import { useSafeNavigation } from "@/hooks/useSafeNavigation";
import { Album, VideoMedia } from "@/types/useMedia";
import { StatusBar } from "expo-status-bar";
import { Eye, Info } from "lucide-react-native";
import React, { useEffect, useMemo, useState } from "react";
import { FlatList, Text, View } from "react-native";

export default function HiddenMediaScreen() {
    const {
        fetchHiddenMedia,
        unhideVideo,
        unhideAlbum,
        isSelectionMode,
        clearSelection,
        toggleSelection,
        unhideMultipleAlbums,
        unhideMultipleVideos,
    } = useMedia();
    const { safePush, safeBack } = useSafeNavigation();

    const [data, setData] = useState<{ albums: Album[]; videos: VideoMedia[] }>({ albums: [], videos: [] });
    const [isLoading, setIsLoading] = useState(true);
    const [selectedVideoId, setSelectedVideoId] = useState<string | null>(null);
    const [selectedAlbumId, setSelectedAlbumId] = useState<string | null>(null);

    const loadData = async () => {
        setIsLoading(true);
        const res = await fetchHiddenMedia();
        setData(res);
        setIsLoading(false);
    };

    useEffect(() => {
        loadData();
    }, []);

    const combinedData = useMemo(() => {
        const result: any[] = [...data.albums];

        // If albums count is odd, add a spacer to force videos to a new row
        if (data.albums.length > 0 && data.albums.length % 2 === 1) {
            result.push({ id: "spacer-album", isSpacer: true, type: "album" });
        }

        const final = [...result, ...data.videos.map((v) => ({ ...v, type: "video" }))];
        if (final.length > 0 && final.length % 2 === 1) {
            final.push({ id: "spacer-final", isSpacer: true, type: "video" });
        }
        return final;
    }, [data]);

    const selectedVideo = useMemo(
        () => data.videos.find((v) => v.id === selectedVideoId) || null,
        [data.videos, selectedVideoId],
    );

    const selectedAlbum = useMemo(
        () => data.albums.find((a) => a.id === selectedAlbumId) || null,
        [data.albums, selectedAlbumId],
    );

    const handleUnhide = async (item: any) => {
        if (item.type === "video" || item.uri) {
            await unhideVideo(item.id);
        } else {
            await unhideAlbum(item.id);
        }
        loadData();
    };

    const renderItem = ({ item }: { item: any }) => {
        if (item.isSpacer) {
            return <View className="flex-1 mx-2 mb-6" />;
        }

        const isVideo = item.type === "video" || !!item.uri;

        if (isVideo) {
            return (
                <VideoItem
                    item={item}
                    onLongPress={(v: any) => toggleSelection(v.id)}
                    onInfoPress={(v: any) => setSelectedVideoId(v.id)}
                    onPress={() => {
                        if (isSelectionMode) {
                            toggleSelection(item.id);
                        } else {
                            safePush({
                                pathname: "/player",
                                params: {
                                    videoId: item.id,
                                    albumId: item.albumId,
                                    initialTime: (item.lastPlayedSec || 0).toString(),
                                },
                            });
                        }
                    }}
                />
            );
        }

        return (
            <AlbumItem
                item={item}
                onPress={(v: any) => {
                    if (isSelectionMode) {
                        toggleSelection(v.id);
                    } else {
                        safePush({
                            pathname: "/(tabs)/(videos)/[id]",
                            params: { id: item.id },
                        });
                    }
                }}
                onLongPress={(v: any) => toggleSelection(v.id)}
                onInfoPress={(v: any) => setSelectedAlbumId(v.id)}
            />
        );
    };

    return (
        <Menu variant="POPUP">
            <ThemedSafeAreaView className="flex-1">
                <StatusBar style="light" />
                <Header>
                    <Header.Back onPress={safeBack} />
                    <Header.Title title="Hidden Media" subtitle="Manage your excluded content" />
                    <Header.SelectionActions
                        data={combinedData.filter((item) => !item.isSpacer)}
                        actions={[
                            {
                                label: "Unhide",
                                icon: Eye,
                                onPress: (ids) => {
                                    const selectedItems = combinedData.filter((item) => ids.has(item.id));
                                    const albumIds = selectedItems.filter((item) => item.type === "album").map((a) => a.id);
                                    const videoIds = selectedItems.filter((item) => item.type === "video").map((v) => v.id);

                                    if (albumIds.length > 0) unhideMultipleAlbums(albumIds);
                                    if (videoIds.length > 0) unhideMultipleVideos(videoIds);

                                    loadData();
                                    clearSelection();
                                },
                            },
                        ]}
                    />
                </Header>

                <FlatList
                    data={combinedData}
                    keyExtractor={(item) => item.id}
                    numColumns={2}
                    contentContainerStyle={{ paddingHorizontal: 8, paddingTop: 16, paddingBottom: 100 }}
                    renderItem={renderItem}
                    ListEmptyComponent={
                        !isLoading ? (
                            <View className="flex-1 items-center justify-center py-20">
                                <Icon icon={Eye} size={48} className="text-zinc-800 mb-4" />
                                <Text className="text-secondary text-lg">No hidden media</Text>
                            </View>
                        ) : null
                    }
                />

                <VideoItemDetailsModal
                    visible={!!selectedVideoId}
                    video={selectedVideo}
                    onClose={() => setSelectedVideoId(null)}
                />

                <AlbumItemDetailsModal
                    visible={!!selectedAlbumId}
                    album={selectedAlbum}
                    onClose={() => setSelectedAlbumId(null)}
                />

                <Menu.Content className="w-56">
                    {(item: any) => (
                        <>
                            <Menu.Item
                                className="flex-row items-center px-4 py-3 gap-3 border-b border-white/5"
                                onPress={() => {
                                    if (item.type === "video" || item.uri) {
                                        setSelectedVideoId(item.id);
                                    } else {
                                        setSelectedAlbumId(item.id);
                                    }
                                }}
                            >
                                <Icon icon={Info} size={18} className="text-secondary" />
                                <Text className="text-white text-sm font-medium">Info</Text>
                            </Menu.Item>
                            <Menu.Item className="flex-row items-center px-4 py-3 gap-3" onPress={() => handleUnhide(item)}>
                                <Icon icon={Eye} size={18} className="text-primary" />
                                <Text className="text-white text-sm font-medium">Unhide</Text>
                            </Menu.Item>
                        </>
                    )}
                </Menu.Content>
            </ThemedSafeAreaView>
        </Menu>
    );
}
