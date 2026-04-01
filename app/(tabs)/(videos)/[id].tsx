import { VideoItemInfoModal } from "@/components/VideoItemInfoModal";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Calendar, ChevronLeft, Clock, Film, Hash, SortAsc } from "lucide-react-native";
import React, { useCallback, useDeferredValue, useEffect, useMemo, useState } from "react";
import { FlatList, RefreshControl, Text, TouchableOpacity, View } from "react-native";
import { LoadingStatus } from "@/components/LoadingStatus";
import { PrefixFilterMenu } from "@/components/PrefixFilterMenu";
import { SortMenu } from "@/components/SortMenu";
import { VideoItem } from "@/components/VideoItem";
import { useMedia } from "@/hooks/useMedia";
import { extractEpisode, extractPrefix } from "@/utils/videoUtils";

const AlbumVideosScreen = () => {
    const { id, title, assetCount } = useLocalSearchParams<{ id: string; title: string; assetCount?: string }>();
    const { videos, loadingTask, fetchVideosInAlbum, videoSort, setVideoSort, refreshPlaybackProgress } = useMedia() as any;
    const REFRESH_TASK_ID = "albumVideosRefresh";
    const [selectedVideoId, setSelectedVideoId] = React.useState<string | null>(null);
    const selectedVideo = React.useMemo(() => videos.find((v: any) => v.id === selectedVideoId), [videos, selectedVideoId]);

    // 1. Pre-calculate metadata (prefix, episode) to avoid expensive regex during sorting/filtering
    const videosWithMetadata = useMemo(() => {
        return videos.map((v: any) => ({
            ...v,
            prefix: extractPrefix(v.filename),
            episode: extractEpisode(v.filename),
        }));
    }, [videos]);

    // Filtering State
    const [selectedPrefixes, setSelectedPrefixes] = useState<string[]>([]);
    const deferredPrefixes = useDeferredValue(selectedPrefixes);

    // 2. Prefix Calculation
    const prefixOptions = useMemo(() => {
        const counts: Record<string, number> = {};
        videosWithMetadata.forEach((v: any) => {
            counts[v.prefix] = (counts[v.prefix] || 0) + 1;
        });

        return Object.entries(counts)
            .filter(([_, count]) => count > 1) // Only show groupings
            .map(([label, count]) => ({ label, count }))
            .sort((a, b) => a.label.localeCompare(b.label));
    }, [videosWithMetadata]);

    // Sorting State
    const deferredVideoSort = useDeferredValue(videoSort);

    // 3. Processed Videos (Filtered & Sorted)
    const processedVideos = useMemo(() => {
        let result = [...videosWithMetadata];

        // 1. Filter - Use deferred value to prevent blocking the UI thread during menu taps
        if (deferredPrefixes.length > 0) {
            result = result.filter((v: any) => deferredPrefixes.includes(v.prefix));
        }

        // 2. Sort
        const { by, order } = deferredVideoSort;
        result.sort((a: any, b: any) => {
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

    const videoSortOptions: { label: string; value: "name" | "date" | "duration" | "episode"; icon: any }[] = [
        { label: "Episode", value: "episode", icon: Hash },
        { label: "Date", value: "date", icon: Calendar },
        { label: "Name", value: "name", icon: SortAsc },
        { label: "Duration", value: "duration", icon: Clock },
    ];

    const onRefresh = () => {
        if (id) {
            fetchVideosInAlbum({ id, title: title || "", assetCount: parseInt(assetCount || "0") }, true, REFRESH_TASK_ID);
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
            fetchVideosInAlbum({ id, title: title || "", assetCount: parseInt(assetCount || "12") }, false);
        }
    }, [id, videoSort]);


    return (
        <View className="flex-1 bg-black">
            <StatusBar style="light" />

            <View className="px-4 pt-14 pb-4 flex-row items-center justify-between border-b border-zinc-900 gap-4">
                <View className="flex-row items-center flex-1 gap-3">
                    <TouchableOpacity
                        onPress={() => (router.canGoBack() ? router.back() : router.push("/(tabs)/(videos)"))}
                        hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }}
                    >
                        <ChevronLeft size={20} color="white" />
                    </TouchableOpacity>
                    <Text className="text-white text-2xl font-bold flex-1" numberOfLines={1}>
                        {title}
                    </Text>
                </View>

                <View className="flex-row items-center gap-2">
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
                </View>
            </View>

            <FlatList
                data={loadingTask?.id === REFRESH_TASK_ID ? skeletonData : processedVideos}
                keyExtractor={(item) => item.id}
                numColumns={2}
                renderItem={({ item }: { item: any }) => (
                    <VideoItem item={item} setSelectedVideoId={setSelectedVideoId} />
                )}
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
        </View>
    );
};

export default AlbumVideosScreen;
