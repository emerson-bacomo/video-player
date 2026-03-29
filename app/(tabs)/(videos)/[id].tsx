import { useLocalSearchParams, useRouter, useFocusEffect } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Calendar, ChevronLeft, Clock, Film, Info, Play, SortAsc, X } from "lucide-react-native";
import React, { useEffect, useCallback } from "react";
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
import { LoadingStatus } from "../../../components/LoadingStatus";
import { Skeleton } from "../../../components/Skeleton";
import { SortMenu } from "../../../components/SortMenu";
import { useMedia } from "../../../hooks/useMedia";

const AlbumVideosScreen = () => {
    const { id, title, assetCount } = useLocalSearchParams<{ id: string; title: string; assetCount?: string }>();
    const { videos, loadingTask, fetchVideosInAlbum, videoSort, setVideoSort, refreshPlaybackProgress } = useMedia() as any;
    const router = useRouter();
    const REFRESH_TASK_ID = "albumVideosRefresh";
    const [selectedVideoId, setSelectedVideoId] = React.useState<string | null>(null);
    const selectedVideo = React.useMemo(() => videos.find((v: any) => v.id === selectedVideoId), [videos, selectedVideoId]);

    const skeletonData = React.useMemo(
        () => Array.from({ length: 10 }).map((_, i) => ({ id: `skel-${i}`, isPlaceholder: true })),
        [],
    );

    const videoSortOptions: { label: string; value: "name" | "date" | "duration"; icon: any }[] = [
        { label: "Date", value: "date", icon: Calendar },
        { label: "Name", value: "name", icon: SortAsc },
        { label: "Duration", value: "duration", icon: Clock },
    ];

    const onRefresh = React.useCallback(() => {
        if (id) {
            fetchVideosInAlbum({ id, title: title || "", assetCount: parseInt(assetCount || "0") }, true, REFRESH_TASK_ID);
        }
    }, [id, title, assetCount, fetchVideosInAlbum]);

    useFocusEffect(
        useCallback(() => {
            // Update UI with any database playback changes made in the player screen
            refreshPlaybackProgress?.();
        }, [refreshPlaybackProgress])
    );

    useEffect(() => {
        if (id) {
            fetchVideosInAlbum({ id, title: title || "", assetCount: parseInt(assetCount || "12") }, false);
        }
    }, [id, videoSort]);

    const renderItem = React.useCallback(
        ({ item }: { item: any }) => <VideoItem item={item} router={router} setSelectedVideoId={setSelectedVideoId} />,
        [router],
    );

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
                    <LoadingStatus />
                    <SortMenu currentSort={videoSort} onSortChange={setVideoSort} options={videoSortOptions} />
                </View>
            </View>

            <FlatList
                data={loadingTask?.id === REFRESH_TASK_ID ? skeletonData : videos}
                keyExtractor={(item) => item.id}
                numColumns={2}
                renderItem={renderItem}
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

            <Modal visible={!!selectedVideoId} transparent animationType="fade" onRequestClose={() => setSelectedVideoId(null)}>
                <TouchableWithoutFeedback onPress={() => setSelectedVideoId(null)}>
                    <View className="flex-1 bg-black/80 justify-center items-center p-6">
                        <TouchableWithoutFeedback onPress={(e) => e.stopPropagation()}>
                            <View className="w-full bg-zinc-900 rounded-2xl border border-zinc-800 overflow-hidden shadow-2xl">
                                {selectedVideo && (
                                    <>
                                        {selectedVideo.thumbnail ? (
                                            <Image
                                                source={{ uri: selectedVideo.thumbnail }}
                                                className="w-full aspect-[16/9] opacity-80"
                                            />
                                        ) : (
                                            <View className="w-full aspect-[16/9] bg-zinc-800 justify-center items-center">
                                                <Film size={48} color="#52525b" />
                                            </View>
                                        )}

                                        <TouchableOpacity
                                            className="absolute top-3 right-3 bg-black/50 p-1.5 rounded-full"
                                            onPress={() => setSelectedVideoId(null)}
                                            hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
                                        >
                                            <X size={16} color="white" />
                                        </TouchableOpacity>

                                        <View className="flex flex-col gap-6 max-h-[70vh] p-5">
                                            <Text className="text-white text-lg font-bold">{selectedVideo.filename}</Text>

                                            <View className="h-[1px] bg-zinc-800" />

                                            <ScrollView
                                                className="min-h-[200px]"
                                                contentContainerStyle={{ gap: 24, paddingBottom: 12 }}
                                            >
                                                <View className="flex-row items-center gap-3">
                                                    <Clock size={16} color="#71717a" />
                                                    <View>
                                                        <Text className="text-zinc-500 text-[10px] uppercase font-bold tracking-wider">
                                                            Total Duration
                                                        </Text>
                                                        <Text className="text-zinc-300 text-sm">
                                                            {Math.floor((selectedVideo.duration || 0) / 60)}:
                                                            {Math.floor((selectedVideo.duration || 0) % 60)
                                                                .toString()
                                                                .padStart(2, "0")}
                                                        </Text>
                                                    </View>
                                                </View>

                                                <View className="flex-row items-center gap-3">
                                                    <Calendar size={16} color="#71717a" />
                                                    <View>
                                                        <Text className="text-zinc-500 text-[10px] uppercase font-bold tracking-wider">
                                                            Date Added
                                                        </Text>
                                                        <Text className="text-zinc-300 text-sm">
                                                            {new Date(selectedVideo.creationTime || 0).toLocaleDateString(
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
                                                            Properties
                                                        </Text>
                                                        <Text className="text-zinc-300 text-xs mt-1 leading-5">
                                                            Resolution: {selectedVideo.width}x{selectedVideo.height}
                                                            {"\n"}
                                                            Estimated Size:{" "}
                                                            {selectedVideo.duration * 0.5 >= 1000
                                                                ? `${((selectedVideo.duration * 0.5) / 1024).toFixed(2)} GB`
                                                                : `${(selectedVideo.duration * 0.5).toFixed(0)} MB`}
                                                        </Text>
                                                    </View>
                                                </View>
                                            </ScrollView>

                                            <View className="h-[1px] bg-zinc-800" />

                                            <View className="pb-2">
                                                <TouchableOpacity
                                                    className="w-full bg-blue-600 rounded-xl py-3.5 items-center flex-row justify-center gap-2"
                                                    onPress={() => {
                                                        const item = selectedVideo;
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
                                                    }}
                                                >
                                                    <Play size={16} color="white" fill="white" />
                                                    <Text className="text-white font-bold tracking-wide">
                                                        {selectedVideo.lastPlayedMs && selectedVideo.lastPlayedMs !== -1
                                                            ? `Resume ${Math.floor(selectedVideo.lastPlayedMs / 60000)}:${Math.floor(
                                                                  (selectedVideo.lastPlayedMs / 1000) % 60,
                                                              )
                                                                  .toString()
                                                                  .padStart(2, "0")}`
                                                            : "Play Video"}
                                                    </Text>
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

const VideoItem = React.memo(({ item, router, setSelectedVideoId }: any) => {
    const thumb = item.thumbnail;

    if (item.isPlaceholder) {
        return (
            <View className="w-[46%] mx-[2%] mb-6">
                <View className="aspect-[16/10] bg-zinc-900 rounded-xl overflow-hidden border border-zinc-800 shadow-md mb-2">
                    <Skeleton className="w-full h-full" />
                </View>
                <View className="px-1 gap-1.5">
                    <Skeleton className="h-3.5 w-3/4 rounded border border-zinc-800/50" />
                    <Skeleton className="h-2.5 w-1/2 rounded border border-zinc-800/50" />
                </View>
            </View>
        );
    }

    const epMatch = item.filename.match(/(?:ep?|episode)\s*0*(\d+)|e0*(\d+)|_0*(\d{1,3})_|_0*(\d{1,3})v/i);
    const episodeNum = epMatch ? epMatch[1] || epMatch[2] || epMatch[3] || epMatch[4] : null;

    const totalTimeStr = `${Math.floor(item.duration / 60)}:${Math.floor(item.duration % 60)
        .toString()
        .padStart(2, "0")}`;
    let timeDisplay = totalTimeStr;
    const hasPlayed = item.lastPlayedMs && item.lastPlayedMs !== -1;
    let progressPercent = 0;

    if (hasPlayed) {
        const playedSecs = item.lastPlayedMs / 1000;
        progressPercent = Math.min(100, Math.max(0, (playedSecs / item.duration) * 100));
        const playedStr = `${Math.floor(playedSecs / 60)}:${Math.floor(playedSecs % 60)
            .toString()
            .padStart(2, "0")}`;
        timeDisplay = `${playedStr} / ${totalTimeStr}`;
    }

    return (
        <View className="w-[46%] mx-[2%] mb-6">
            <TouchableOpacity
                activeOpacity={0.8}
                className="w-full aspect-[16/10] bg-zinc-900 rounded-xl overflow-hidden relative border border-zinc-800 shadow-md mb-2"
                onPress={() =>
                    router.push({
                        pathname: "/player",
                        params: {
                            uri: item.uri,
                            title: item.filename,
                            videoId: item.id,
                            resumeMs: item.lastPlayedMs !== -1 ? item.lastPlayedMs : 0,
                        },
                    })
                }
                onLongPress={() => setSelectedVideoId(item.id)}
            >
                {thumb ? (
                    <Image source={{ uri: thumb }} className="w-full h-full" resizeMode="cover" />
                ) : (
                    <View className="w-full h-full justify-center items-center">
                        <Film size={24} color="#52525b" />
                    </View>
                )}

                <View className="absolute top-2 left-0 right-0 px-2 flex-row gap-1.5 items-center justify-between">
                    {episodeNum && (
                        <View
                            pointerEvents="none"
                            className="bg-black/60 h-[18px] px-2 rounded-full justify-center items-center backdrop-blur-md border border-white/20"
                        >
                            <Text className="text-white text-[9px] font-bold uppercase tracking-wider">EP {episodeNum}</Text>
                        </View>
                    )}
                    {item.lastPlayedMs === -1 && (
                        <View
                            pointerEvents="none"
                            className="bg-red-600/80 h-[18px] px-2 rounded-full justify-center items-center backdrop-blur-md border border-white/15"
                        >
                            <Text className="text-red-100 text-[9px] font-bold uppercase tracking-wider">NEW</Text>
                        </View>
                    )}
                </View>

                {hasPlayed && (
                    <View className="absolute bottom-0 left-0 right-0 h-[3px] bg-white/20 overflow-hidden backdrop-blur-sm">
                        <View className="bg-red-600 h-full" style={{ width: `${progressPercent}%` }} />
                    </View>
                )}
            </TouchableOpacity>

            <TouchableOpacity activeOpacity={0.7} onPress={() => setSelectedVideoId(item.id)} className="px-1">
                <Text className="text-zinc-100 text-sm font-semibold mb-0.5" numberOfLines={1}>
                    {item.filename}
                </Text>
                <View className="flex-row items-center justify-between">
                    <Text className="text-zinc-500 text-[10px] font-medium uppercase tracking-tight">{timeDisplay}</Text>
                </View>
            </TouchableOpacity>
        </View>
    );
});

export default AlbumVideosScreen;
