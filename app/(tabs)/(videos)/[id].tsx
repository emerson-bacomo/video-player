import { AlbumItemDetailsModal } from "@/components/AlbumItemDetailsModal";
import { Header } from "@/components/Header";
import { LoadingStatus } from "@/components/LoadingStatus";
import { PrefixFilterMenu } from "@/components/PrefixFilterMenu";
import { SortMenu } from "@/components/SortMenu";
import { ThemedSafeAreaView } from "@/components/Themed";
import { VideoItem } from "@/components/VideoItem";
import { VideoItemInfoModal } from "@/components/VideoItemInfoModal";
import { useTheme } from "@/context/ThemeContext";
import { useMedia } from "@/hooks/useMedia";
import { extractEpisode, extractPrefix } from "@/utils/videoUtils";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Calendar, Clock, Film, Hash, Info, LucideIcon, SortAsc } from "lucide-react-native";
import React, { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { FlatList, RefreshControl, Text, TouchableOpacity, View } from "react-native";

const AlbumVideosScreen = () => {
    const { id, title } = useLocalSearchParams<{ id: string; title: string }>();
    const {
        videos,
        loadingTask,
        fetchVideosInAlbum,
        videoSort,
        setVideoSort,
        refreshPlaybackProgress,
        currentAlbum,
        setCurrentAlbum,
    } = useMedia();
    const REFRESH_TASK_ID = "albumVideosRefresh";
    const [selectedVideoId, setSelectedVideoId] = React.useState<string | null>(null);
    const selectedVideo = React.useMemo(() => videos.find((v) => v.id === selectedVideoId), [videos, selectedVideoId]);
    const [showAlbumInfo, setShowAlbumInfo] = React.useState(false);
    const { theme } = useTheme();

    // Clear focus natively when routing backward so FFMPEG falls back to global priorities
    useEffect(() => {
        return () => {
            setCurrentAlbum?.(null);
        };
    }, []);

    const currentAlbumData = useMemo(() => {
        return {
            id,
            title: title || currentAlbum?.title || "",
            assetCount: currentAlbum?.assetCount || videos.length,
            thumbnail: currentAlbum?.thumbnail,
            lastModified: currentAlbum?.lastModified || 0,
        };
    }, [id, title, currentAlbum, videos.length]);

    // 1. Pre-calculate metadata (prefix, episode) to avoid expensive regex during sorting/filtering
    // 1. Efficient metadata caching — Reactive to thumbnail updates but optimized via Ref Map
    const metadataCacheRef = useRef(new Map<string, { prefix: string; episode: number }>());
    const videosWithMetadata = useMemo(() => {
        return videos.map((v) => {
            const cached = metadataCacheRef.current.get(v.id);
            if (cached) {
                return { ...v, prefix: cached.prefix, episode: cached.episode };
            }
            const prefix = extractPrefix(v.filename);
            const episode = extractEpisode(v.filename);
            metadataCacheRef.current.set(v.id, { prefix, episode });
            return { ...v, prefix, episode };
        });
    }, [videos]);

    // Filtering State
    const [selectedPrefixes, setSelectedPrefixes] = useState<string[]>([]);
    const deferredPrefixes = useDeferredValue(selectedPrefixes);

    // 2. Prefix Calculation
    const prefixOptions = useMemo(() => {
        if (videosWithMetadata.length === 0) return [];
        const counts: Record<string, number> = {};
        videosWithMetadata.forEach((v) => {
            counts[v.prefix] = (counts[v.prefix] || 0) + 1;
        });

        return Object.entries(counts)
            .filter(([_, count]) => count > 1)
            .map(([label, count]) => ({ label, count }))
            .sort((a, b) => a.label.localeCompare(b.label));
    }, [videosWithMetadata]); // Keep reactive to list changes

    // Sorting State
    const deferredVideoSort = useDeferredValue(videoSort);

    // 3. Processed Videos (Filtered & Sorted)
    const processedVideos = useMemo(() => {
        let result = [...videosWithMetadata];

        // 1. Filter - Use deferred value to prevent blocking the UI thread during menu taps
        if (deferredPrefixes.length > 0) {
            result = result.filter((v) => deferredPrefixes.includes(v.prefix));
        }

        // 2. Sort
        const { by, order } = deferredVideoSort;
        result.sort((a, b) => {
            let comparison = 0;
            if (by === "episode") {
                // Group by prefix first
                const prefixComp = a.prefix.localeCompare(b.prefix);
                if (prefixComp !== 0) {
                    comparison = prefixComp;
                } else {
                    // Same prefix, sort by episode numeric (already extracted!)
                    comparison = a.episode - b.episode;
                }
            } else if (by === "name") {
                comparison = a.filename.localeCompare(b.filename);
            } else if (by === "date") {
                comparison = (a.modificationTime || a.creationTime || 0) - (b.modificationTime || b.creationTime || 0);
            } else if (by === "duration") {
                comparison = (a.duration || 0) - (b.duration || 0);
            }
            return order === "asc" ? comparison : -comparison;
        });

        return result;
    }, [videosWithMetadata, deferredPrefixes, deferredVideoSort]);

    const skeletonData = React.useMemo(
        () => Array.from({ length: 10 }).map((_, i) => ({ id: `skel-${i}`, isPlaceholder: true })),
        [],
    );

    const videoSortOptions: { label: string; value: "name" | "date" | "duration" | "episode"; icon: LucideIcon }[] = [
        { label: "Episode", value: "episode", icon: Hash },
        { label: "Date", value: "date", icon: Calendar },
        { label: "Name", value: "name", icon: SortAsc },
        { label: "Duration", value: "duration", icon: Clock },
    ];

    const onRefresh = () => {
        if (id) {
            fetchVideosInAlbum({ id, title: title || "" }, true, REFRESH_TASK_ID);
        }
    };

    const handleToggleFilter = (prefix: string) => {
        setSelectedPrefixes((prev) => (prev.includes(prefix) ? prev.filter((p) => p !== prefix) : [...prev, prefix]));
    };

    const handleClearFilters = () => {
        setSelectedPrefixes([]);
    };

    const onPlayVideo = (item: any) => {
        setSelectedVideoId(null);
        router.push({
            pathname: "/player",
            params: {
                uri: item.uri,
                title: item.filename,
                videoId: item.id,
                resumeMs: item.lastPlayedMs !== -1 ? item.lastPlayedMs : 0,
            },
        });
    };

    useFocusEffect(
        useCallback(() => {
            // Update UI with any database playback changes made in the player screen
            refreshPlaybackProgress?.();
        }, [refreshPlaybackProgress]),
    );

    useEffect(() => {
        if (id) {
            fetchVideosInAlbum({ id, title: title || "" }, false);
        }
    }, [id, videoSort]);

    return (
        <ThemedSafeAreaView className="flex-1">
            <StatusBar style="light" />

            <Header>
                <View className="flex-row items-center flex-1 gap-3">
                    <Header.Back onPress={() => (router.canGoBack() ? router.back() : router.push("/(tabs)/(videos)"))} />
                    <Header.Title title={currentAlbumData.title} subtitle={`${currentAlbumData.assetCount} Videos`} />
                </View>

                <Header.Actions>
                    <LoadingStatus
                        task={
                            selectedPrefixes !== deferredPrefixes || videoSort !== deferredVideoSort
                                ? { label: "Processing", detail: "Updating video list...", isImportant: false }
                                : null
                        }
                    />
                    <PrefixFilterMenu
                        options={prefixOptions}
                        selectedOptions={selectedPrefixes}
                        onOptionToggle={handleToggleFilter}
                        onClearAll={handleClearFilters}
                    />
                    <SortMenu currentSort={videoSort} onSortChange={setVideoSort} options={videoSortOptions} />
                    <TouchableOpacity
                        onPress={() => setShowAlbumInfo(true)}
                        className="w-10 h-10 items-center justify-center rounded-full bg-zinc-800/50"
                    >
                        <Info size={20} color={theme.text} />
                    </TouchableOpacity>
                </Header.Actions>
            </Header>

            <FlatList
                data={loadingTask?.id === REFRESH_TASK_ID ? skeletonData : processedVideos}
                keyExtractor={(item) => item.id}
                numColumns={2}
                renderItem={({ item }: { item: any }) => <VideoItem item={item} setSelectedVideoId={setSelectedVideoId} />}
                initialNumToRender={10}
                maxToRenderPerBatch={10}
                windowSize={5}
                removeClippedSubviews={true}
                refreshControl={
                    <RefreshControl refreshing={false} onRefresh={onRefresh} tintColor="#ffffff" colors={["#3b82f6"]} />
                }
                ListEmptyComponent={
                    loadingTask ? null : (
                        <View className="flex-1 justify-center items-center py-20">
                            <Film size={64} color="#27272a" />
                            <Text className="text-zinc-500 mt-4 text-center">No videos in this folder</Text>
                        </View>
                    )
                }
                contentContainerStyle={{ paddingHorizontal: 8, paddingTop: 20, paddingBottom: 20 }}
            />

            <VideoItemInfoModal
                visible={!!selectedVideoId}
                video={selectedVideo}
                onClose={() => setSelectedVideoId(null)}
                onPlay={onPlayVideo}
            />

            <AlbumItemDetailsModal
                visible={showAlbumInfo}
                album={currentAlbumData}
                onClose={() => setShowAlbumInfo(false)}
                hideOpenFolderAction={true}
            />
        </ThemedSafeAreaView>
    );
};

export default AlbumVideosScreen;
