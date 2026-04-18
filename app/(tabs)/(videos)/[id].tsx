import { AlbumItemDetailsModal } from "@/components/AlbumItemDetailsModal";
import { Header } from "@/components/Header";
import { Icon } from "@/components/Icon";
import { LoadingStatus } from "@/components/LoadingStatus";
import { PrefixFilterMenu } from "@/components/PrefixFilterMenu";
import { SortMenu } from "@/components/SortMenu";
import { ThemedSafeAreaView } from "@/components/Themed";
import { VideoItem } from "@/components/VideoItem";
import { VideoItemDetailsModal } from "@/components/VideoItemDetailsModal";
import { useTheme } from "@/context/ThemeContext";
import { useMedia } from "@/hooks/useMedia";
import { extractEpisode, extractPrefix } from "@/utils/videoUtils";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Calendar, Clock, Film, Hash, Info, LucideIcon, SortAsc } from "lucide-react-native";
import React, { useCallback, useDeferredValue, useEffect, useMemo, useRef } from "react";
import { FlatList, RefreshControl, Text, TouchableOpacity, View } from "react-native";

const AlbumVideosScreen = () => {
    const { id, title } = useLocalSearchParams<{ id: string; title: string }>();
    const {
        currentAlbumVideos,
        loadingTask,
        fetchVideosInAlbum,
        videoSort,
        setVideoSort,
        refreshPlaybackProgress,
        currentAlbum,
        setCurrentAlbum,
        folderFilters,
        setFolderFilter,
    } = useMedia();
    const { colors } = useTheme();
    const REFRESH_TASK_ID = "albumVideosRefresh";

    // Filtering State (Persisted)
    const selectedPrefixes = folderFilters[id] || [];
    const setSelectedPrefixes = (arg: string[] | ((prev: string[]) => string[])) => {
        const next = typeof arg === "function" ? arg(selectedPrefixes) : arg;
        setFolderFilter(id, next);
    };
    const deferredPrefixes = useDeferredValue(selectedPrefixes);

    const [selectedVideoId, setSelectedVideoId] = React.useState<string | null>(null);
    const selectedVideo = React.useMemo(() => currentAlbumVideos.find((v) => v.id === selectedVideoId), [currentAlbumVideos, selectedVideoId]);
    const [showAlbumInfo, setShowAlbumInfo] = React.useState(false);

    // Clear focus natively when routing backward so FFMPEG falls back to global priorities
    useEffect(() => {
        return () => {
            setCurrentAlbum?.(null);
        };
    }, []);

    const currentAlbumData = useMemo(() => {
        return {
            id,
            title: title || currentAlbum?.displayName || currentAlbum?.title || "",
            assetCount: currentAlbum?.assetCount || currentAlbumVideos.length,
            thumbnail: currentAlbum?.thumbnail,
            lastModified: currentAlbum?.lastModified || 0,
        };
    }, [id, title, currentAlbum, currentAlbumVideos.length]);

    // 1. Pre-calculate metadata (prefix, rawPrefix, episode) to avoid expensive regex during sorting/filtering
    // 1. Efficient metadata caching — Reactive to thumbnail updates but optimized via Ref Map
    const metadataCacheRef = useRef(new Map<string, { prefix: string; rawPrefix: string; episode: number }>());
    const videosWithMetadata = useMemo(() => {
        return currentAlbumVideos.map((v) => {
            const cached = metadataCacheRef.current.get(v.id);
            if (cached) {
                return { ...v, prefix: cached.prefix, rawPrefix: cached.rawPrefix, episode: cached.episode };
            }
            const prefix = extractPrefix(v.displayName);
            const rawPrefix = extractPrefix(v.filename);
            const episode = extractEpisode(v.displayName);
            metadataCacheRef.current.set(v.id, { prefix, rawPrefix, episode });
            return { ...v, prefix, rawPrefix, episode };
        });
    }, [currentAlbumVideos]);

    // Prefix Calculation (Filtering Logic continues using global state)

    // 2. Prefix Calculation
    const prefixOptions = useMemo(() => {
        if (videosWithMetadata.length === 0) return [];
        // Map of rawPrefix -> { displayNamePrefix, count }
        const counts: Record<string, { label: string; count: number }> = {};
        videosWithMetadata.forEach((v) => {
            if (!counts[v.rawPrefix]) {
                counts[v.rawPrefix] = { label: v.prefix, count: 0 };
            }
            counts[v.rawPrefix].count++;
        });

        return Object.entries(counts)
            .filter(([_, data]) => data.count > 1)
            .map(([value, data]) => ({ value, label: data.label, count: data.count }))
            .sort((a, b) => a.label.localeCompare(b.label));
    }, [videosWithMetadata]); // Keep reactive to list changes

    // Sorting State
    const deferredVideoSort = useDeferredValue(videoSort);

    // 3. Processed Videos (Filtered & Sorted)
    const processedVideos = useMemo(() => {
        let result = [...videosWithMetadata];

        // Filter - Use deferred value to prevent blocking the UI thread during menu taps
        if (deferredPrefixes.length > 0) {
            result = result.filter((v) => deferredPrefixes.includes(v.rawPrefix));
        }
        return result;
    }, [videosWithMetadata, deferredPrefixes]);

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
            params: { videoId: item.id },
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
                    <Header.SearchAction />
                    <TouchableOpacity
                        onPress={() => setShowAlbumInfo(true)}
                        className="w-10 h-10 items-center justify-center rounded-full bg-zinc-800/50"
                    >
                        <Icon icon={Info} size={20} className="text-text" />
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
                    <RefreshControl refreshing={false} onRefresh={onRefresh} tintColor={colors.text} colors={[colors.primary]} />
                }
                ListEmptyComponent={
                    loadingTask ? null : (
                        <View className="flex-1 justify-center items-center py-20">
                            <Icon icon={Film} size={64} className="text-border/50" />
                            <Text className="text-secondary mt-4 text-center">No videos in this folder</Text>
                        </View>
                    )
                }
                contentContainerStyle={{ paddingHorizontal: 8, paddingTop: 20, paddingBottom: 20 }}
            />

            <VideoItemDetailsModal
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
