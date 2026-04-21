import { AlbumItem } from "@/components/AlbumItem";
import { Header } from "@/components/Header";
import { Icon } from "@/components/Icon";
import { Menu } from "@/components/Menu";
import { ThemedSafeAreaView, ThemedView } from "@/components/Themed";
import { VideoItem } from "@/components/VideoItem";
import { useMedia } from "@/hooks/useMedia";
import { router } from "expo-router";
import { Eye, MoreVertical } from "lucide-react-native";
import { AlbumItemDetailsModal } from "@/components/AlbumItemDetailsModal";
import { VideoItemDetailsModal } from "@/components/VideoItemDetailsModal";
import { StatusBar } from "expo-status-bar";
import React, { useEffect, useMemo, useState } from "react";
import { FlatList, Text, View } from "react-native";

export default function HiddenMediaScreen() {
    const { 
        fetchHiddenMedia, 
        unhideVideo, 
        unhideAlbum,
        isSelectionMode,
        clearSelection,
        toggleSelection
    } = useMedia();

    const [data, setData] = useState<{ albums: any[]; videos: any[] }>({ albums: [], videos: [] });
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

    // Re-load when coming back to screen or after unhiding (though local filter might be better, 
    // fetchHiddenMedia is fast enough for managed hidden list)
    
    const combinedData = useMemo(() => {
        const result: any[] = [...data.albums];
        
        // If albums count is odd, add a spacer to force videos to a new row
        if (data.albums.length % 2 === 1) {
            result.push({ id: 'spacer-album', isSpacer: true, type: 'album' });
        }
        
        return [...result, ...data.videos.map(v => ({...v, type: 'video'}))];
    }, [data]);

    const selectedVideo = useMemo(
        () => data.videos.find(v => v.id === selectedVideoId) || null,
        [data.videos, selectedVideoId]
    );

    const selectedAlbum = useMemo(
        () => data.albums.find(a => a.id === selectedAlbumId) || null,
        [data.albums, selectedAlbumId]
    );

    const handleUnhide = async (item: any) => {
        if (item.type === 'video' || item.uri) {
            await unhideVideo(item.id);
        } else {
            await unhideAlbum(item.id);
        }
        loadData();
    };

    const renderItem = ({ item }: { item: any }) => {
        if (item.isSpacer) {
            return <View className="w-[46%] mx-[2%] mb-6" />;
        }

        const isVideo = item.type === 'video' || !!item.uri;

        if (isVideo) {
            return (
                <VideoItem 
                    item={item} 
                    onLongPress={(v: any) => toggleSelection(v.id)}
                    onInfoPress={(v: any) => setSelectedVideoId(v.id)}
                    onPress={() => {
                        if (isSelectionMode) toggleSelection(item.id);
                        else router.push({ pathname: "/player", params: { videoId: item.id } });
                    }}
                    renderMenu={() => (
                        <Menu.Content className="w-48">
                            <Menu.Item 
                                className="flex-row items-center px-4 py-3 gap-3"
                                onPress={() => handleUnhide(item)}
                            >
                                <Icon icon={Eye} size={18} className="text-primary" />
                                <Text className="text-white text-sm font-medium">Unhide</Text>
                            </Menu.Item>
                        </Menu.Content>
                    )}
                />
            );
        }

        return (
            <AlbumItem 
                item={item} 
                onPress={(v: any) => {
                    if (isSelectionMode) toggleSelection(v.id);
                    else router.push({ pathname: "/(tabs)/(videos)/[id]", params: { id: item.id, title: item.displayName || item.title } });
                }}
                onLongPress={(v: any) => toggleSelection(v.id)}
                onInfoPress={(v: any) => setSelectedAlbumId(v.id)}
                renderMenu={() => (
                    <Menu.Content className="w-48">
                        <Menu.Item 
                            className="flex-row items-center px-4 py-3 gap-3"
                            onPress={() => handleUnhide(item)}
                        >
                            <Icon icon={Eye} size={18} className="text-primary" />
                            <Text className="text-white text-sm font-medium">Unhide</Text>
                        </Menu.Item>
                    </Menu.Content>
                )}
            />
        );
    };

    return (
        <ThemedSafeAreaView className="flex-1">
            <StatusBar style="light" />
            <Header>
                <Header.Back onPress={() => router.back()} />
                <Header.Title title="Hidden Media" subtitle="Manage your excluded content" />
                <Header.SelectionOverrideActions
                    actions={[
                        {
                            label: "Unhide Selected",
                            icon: Eye,
                            onPress: async (selectedIds: Set<string>) => {
                                const ids = Array.from(selectedIds);
                                // Unhide all selected videos and albums
                                await Promise.all([
                                    ...ids.map(id => {
                                        const isVid = data.videos.some(v => v.id === id);
                                        return isVid ? unhideVideo(id) : unhideAlbum(id);
                                    })
                                ]);
                                loadData();
                                clearSelection();
                            }
                        }
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
        </ThemedSafeAreaView>
    );
}
