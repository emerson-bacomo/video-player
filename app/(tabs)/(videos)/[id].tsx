import { AlbumItemDetailsModal } from "@/components/AlbumItemDetailsModal";
import { Header } from "@/components/Header";
import { Icon } from "@/components/Icon";
import { LoadingStatus } from "@/components/LoadingStatus";
import { PrefixFilterMenu } from "@/components/PrefixFilterMenu";
import { RenameModal } from "@/components/RenameModal";
import { SortMenu } from "@/components/SortMenu";
import { ThemedView } from "@/components/Themed";
import { ThemedBottomSheet } from "@/components/ThemedBottomSheet";
import { VideoItem, VideoItemSkeleton } from "@/components/VideoItem";
import { VideoItemDetailsModal } from "@/components/VideoItemDetailsModal";
import { useTheme } from "@/context/ThemeContext";
import { useMedia, VideoMedia } from "@/hooks/useMedia";
import { useSafeNavigation } from "@/hooks/useSafeNavigation";
import { useFocusEffect, useLocalSearchParams } from "expo-router";
import { StatusBar } from "expo-status-bar";
import {
    Calendar,
    CheckCircle,
    Circle,
    Clock,
    Edit2,
    EyeOff,
    Film,
    FolderInput,
    Hash,
    Info,
    LucideIcon,
    SortAsc,
    Trash2,
} from "lucide-react-native";
import React, { useCallback, useDeferredValue, useEffect, useMemo } from "react";
import { BackHandler, FlatList, Image, RefreshControl, Text, TouchableOpacity, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const AlbumVideosScreen = () => {
    const { id, title } = useLocalSearchParams<{ id: string; title: string }>();
    const {
        currentAlbumVideos,
        loadingTask,
        fetchVideosInAlbum,
        activeVideoSort,
        updateVideoSort,
        refreshPlaybackProgress,
        currentAlbum,
        folderFilters,
        setFolderFilter,
        permissionResponse,
        albums,
        isSelectionMode,
        toggleSelection,
        clearSelection,
        renameVideo,
        videoSortMode,
        setVideoSortSettingScope,
        compareByVideoSort,
        syncCurrentAlbum,
        updateVideoProgress,
        updateMultipleVideoProgress,
        togglePrefixSelection,
        selectPrefixesOfSelected,
        hideVideo,
        hideMultipleVideos,
        selectedIds,
    } = useMedia();
    const { colors } = useTheme();
    const insets = useSafeAreaInsets();
    const { safeBack } = useSafeNavigation();

    useEffect(() => {
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

    // Filtering State (Persisted)
    const selectedPrefixes = folderFilters[id] || [];
    const setSelectedPrefixes = (arg: string[] | ((prev: string[]) => string[])) => {
        const next = typeof arg === "function" ? arg(selectedPrefixes) : arg;
        setFolderFilter(id, next);
    };
    const [selectedVideoId, setSelectedVideoId] = React.useState<string | null>(null);
    const [showAlbumInfo, setShowAlbumInfo] = React.useState(false);
    const [renamingVideo, setRenamingVideo] = React.useState<VideoMedia | null>(null);
    const [isLoading, setIsLoading] = React.useState(true);
    const [menuVideo, setMenuVideo] = React.useState<VideoMedia | null>(null);
    const { width } = useWindowDimensions();
    const numColumns = Math.max(2, Math.floor(width / 180));

    const selectedVideo = React.useMemo(
        () => currentAlbumVideos.find((v) => v.id === selectedVideoId) || null,
        [currentAlbumVideos, selectedVideoId],
    );
    // Only show skeletons on a true cold load: no cached videos exist yet for this album.
    // If we have ANY data already in currentAlbumVideos, show it immediately (stale-while-revalidate).
    const isInitialLoading = currentAlbum?.id !== id;
    const showSkeletons = isInitialLoading || (isLoading && currentAlbumVideos.length === 0);

    // Prefix Calculation (Filtering Logic continues using global state)

    // 1. Prefix Calculation
    const prefixOptions = useMemo(() => {
        if (isLoading || currentAlbumVideos.length === 0) return [];
        // Map of rawPrefix -> { displayNamePrefix, count }
        const counts: Record<string, { label: string; count: number }> = {};
        currentAlbumVideos.forEach((v) => {
            const raw = v.rawPrefix || "";
            if (!counts[raw]) {
                counts[raw] = { label: v.prefix || "Unknown", count: 0 };
            }
            counts[raw].count++;
        });

        return Object.entries(counts)
            .filter(([_, data]) => data.count > 1)
            .map(([value, data]) => ({ value, label: data.label, count: data.count }))
            .sort((a, b) => a.label.localeCompare(b.label));
    }, [currentAlbumVideos, isLoading]);

    const skeletonData = React.useMemo(
        () => Array.from({ length: 10 }).map((_, i) => ({ id: `skel-${i}`, isPlaceholder: true })),
        [],
    );

    const deferredPrefixes = useDeferredValue(selectedPrefixes);

    // 3. Processed Videos (Filtered)
    const processedVideos = useMemo(() => {
        if (showSkeletons) return skeletonData;

        let result = [...currentAlbumVideos];

        if (deferredPrefixes.length > 0) {
            result = result.filter((v) => deferredPrefixes.includes(v.rawPrefix || ""));
        }

        // Apply sorting instantly in the memo
        result.sort((a, b) => compareByVideoSort(a, b, activeVideoSort));

        return result;
    }, [currentAlbumVideos, deferredPrefixes, showSkeletons, skeletonData, activeVideoSort, compareByVideoSort]);
    const deferredProcessedVideos = useDeferredValue(processedVideos);

    const isDisplayingSkeletons = useMemo(() => {
        return showSkeletons || deferredProcessedVideos.some((v) => v.isPlaceholder);
    }, [showSkeletons, deferredProcessedVideos]);

    // Performance Tracking
    const skeletonStartTimeRef = React.useRef<number | null>(null);
    useEffect(() => {
        if (isDisplayingSkeletons) {
            if (!skeletonStartTimeRef.current) {
                skeletonStartTimeRef.current = Date.now();
                console.log("[Perf] Skeletons shown (True)...");
            }
        } else if (skeletonStartTimeRef.current) {
            const duration = Date.now() - skeletonStartTimeRef.current;
            console.log(`[Perf] Skeletons hidden after ${duration}ms (True)`);
            skeletonStartTimeRef.current = null;
        }
    }, [isDisplayingSkeletons]);

    const currentAlbumData = useMemo(() => {
        // Use the already-loaded albums state as the source of truth for count,
        // so the subtitle is correct immediately on enter, before async fetch completes.
        const albumFromList = albums.find((a) => a.id === id);

        // Derive thumbnail dynamically from the current view (first sorted/filtered video)
        const firstVid = processedVideos.find((v) => !v.isPlaceholder) as VideoMedia | undefined;
        const dynamicThumbnail = firstVid?.thumbnail || firstVid?.baseThumbnailUri;

        return {
            id,
            title:
                title ||
                currentAlbum?.displayName ||
                currentAlbum?.title ||
                albumFromList?.displayName ||
                albumFromList?.title ||
                "",
            assetCount: albumFromList?.assetCount || currentAlbum?.assetCount || currentAlbumVideos.length,
            thumbnail: dynamicThumbnail || currentAlbum?.thumbnail || albumFromList?.thumbnail,
            lastModified: currentAlbum?.lastModified || albumFromList?.lastModified || 0,
        };
    }, [id, title, currentAlbum, processedVideos, albums]);

    const videoSortOptions: { label: string; value: "name" | "date" | "duration" | "episode"; icon: LucideIcon }[] = [
        { label: "Episode", value: "episode", icon: Hash },
        { label: "Date", value: "date", icon: Calendar },
        { label: "Name", value: "name", icon: SortAsc },
        { label: "Duration", value: "duration", icon: Clock },
    ];

    const onRefresh = () => {
        if (id) {
            fetchVideosInAlbum({ id, title: title || "" });
        }
    };

    const handleToggleFilter = (prefix: string) => {
        setSelectedPrefixes((prev) => (prev.includes(prefix) ? prev.filter((p) => p !== prefix) : [...prev, prefix]));
    };

    const handleClearFilters = () => {
        setSelectedPrefixes([]);
    };

    const handleRenameVideo = (newName: string) => {
        if (renamingVideo) {
            renameVideo(renamingVideo.id, newName);
            setRenamingVideo(null);
        }
    };

    useFocusEffect(
        useCallback(() => {
            // Update UI with any database playback changes made in the player screen
            refreshPlaybackProgress?.();
        }, [refreshPlaybackProgress]),
    );

    // Load album data instantly (cache/DB only, no network sync)
    useEffect(() => {
        if (!id) return;
        const controller = new AbortController();
        setIsLoading(true);
        fetchVideosInAlbum({ id, title: title || "" }, controller.signal);
        return () => controller.abort();
    }, [id, title]);

    // Run the heavy sync only AFTER the videos are visible on screen
    useEffect(() => {
        if (isInitialLoading) return; // wait until content is shown
        const controller = new AbortController();
        syncCurrentAlbum(id, controller.signal).finally(() => {
            if (!controller.signal.aborted) setIsLoading(false);
        });
        return () => controller.abort();
    }, [isInitialLoading, id]);

    const { isSelectionWatched, firstSelectedItem, hasSelectionPrefixes } = useMemo(() => {
        if (!selectedIds.size) return { isSelectionWatched: false, firstSelectedItem: null, hasSelectionPrefixes: false };

        const firstSelectedId = Array.from(selectedIds)[0];
        const first = currentAlbumVideos.find((v) => v.id === firstSelectedId);
        const watched = first ? first.lastPlayedSec >= first.duration * 0.95 : false;

        const hasPrefixes = Array.from(selectedIds).some((id) => {
            const v = currentAlbumVideos.find((vid) => vid.id === id);
            return !!v?.prefix;
        });

        return { isSelectionWatched: watched, firstSelectedItem: first, hasSelectionPrefixes: hasPrefixes };
    }, [selectedIds, currentAlbumVideos]);

    return (
        <ThemedView className="flex-1" style={{ paddingTop: insets.top }}>
            <StatusBar style="light" />

            <Header>
                <View className="flex-row items-center flex-1 gap-3">
                    <Header.Back onPress={safeBack} />
                    <Header.Title title={currentAlbumData.title} subtitle={`${currentAlbumData.assetCount} Videos`} />
                </View>

                <Header.Actions>
                    <LoadingStatus
                        task={
                            selectedPrefixes !== deferredPrefixes
                                ? { label: "Processing", detail: "Updating video list...", isImportant: false }
                                : null
                        }
                    />
                    <Header.SearchAction />
                    <TouchableOpacity
                        onPress={() => setShowAlbumInfo(true)}
                        className="w-10 h-10 items-center justify-center rounded-full bg-zinc-800/50"
                    >
                        <Icon icon={Info} size={20} className="text-text" />
                    </TouchableOpacity>
                </Header.Actions>

                <Header.SelectionActions
                    actions={[
                        {
                            label: isSelectionWatched ? "Mark as Unwatched" : "Mark as Watched",
                            icon: isSelectionWatched ? Circle : CheckCircle,
                            onPress: (ids) => {
                                const idsArray = Array.from(ids);
                                const newProgress = isSelectionWatched ? -1 : firstSelectedItem?.duration || 0;
                                updateMultipleVideoProgress(idsArray, newProgress);
                                clearSelection();
                            },
                        },
                        ...(hasSelectionPrefixes
                            ? [
                                  {
                                      label: "Select same prefix",
                                      icon: Film,
                                      onPress: () => {
                                          selectPrefixesOfSelected();
                                      },
                                  },
                              ]
                            : []),
                        {
                            label: "Move",
                            icon: FolderInput,
                            onPress: (ids) => {
                                console.log("Move multiple videos", Array.from(ids));
                            },
                        },
                        {
                            label: "Hide Selected",
                            icon: EyeOff,
                            onPress: (ids) => {
                                hideMultipleVideos(Array.from(ids));
                                clearSelection();
                            },
                        },
                        {
                            label: "Delete",
                            icon: Trash2,
                            destructive: true,
                            onPress: (ids) => {
                                console.log("Delete multiple videos", Array.from(ids));
                            },
                        },
                    ]}
                />
            </Header>

            <FlatList
                key={numColumns}
                data={showSkeletons ? skeletonData : deferredProcessedVideos}
                keyExtractor={(item) => item.id}
                numColumns={numColumns}
                // Performance Optimizations (Low Settings)
                initialNumToRender={2}
                windowSize={3}
                maxToRenderPerBatch={2}
                removeClippedSubviews={true} // Improve scroll performance by not rendering views outside the viewport
                renderItem={({ item }: { item: any }) => {
                    if (item.isPlaceholder) return <VideoItemSkeleton />;
                    return (
                        <VideoItem
                            item={item}
                            onLongPress={(v: any) => toggleSelection(v.id)}
                            onInfoPress={(v: any) => setSelectedVideoId(v.id)}
                            onMenuPress={setMenuVideo}
                        />
                    );
                }}
                ListHeaderComponent={
                    <View className="flex-row justify-end items-center gap-2 mb-4 pr-2">
                        <PrefixFilterMenu
                            options={prefixOptions}
                            selectedOptions={selectedPrefixes}
                            onOptionToggle={handleToggleFilter}
                            onClearAll={handleClearFilters}
                            isLoading={isDisplayingSkeletons}
                        />
                        <SortMenu
                            currentSort={activeVideoSort}
                            onSortChange={updateVideoSort}
                            options={videoSortOptions}
                            mode={videoSortMode}
                            onModeChange={setVideoSortSettingScope}
                            showTabs={true}
                            isLoading={isDisplayingSkeletons}
                        />
                    </View>
                }
                refreshControl={
                    <RefreshControl
                        refreshing={false}
                        onRefresh={onRefresh}
                        tintColor={colors.text}
                        colors={[colors.primary]}
                        enabled={permissionResponse?.status === "granted"}
                    />
                }
                ListEmptyComponent={
                    loadingTask ? null : (
                        <View className="flex-1 justify-center items-center py-20">
                            <Icon icon={Film} size={64} className="text-border/50" />
                            <Text className="text-secondary mt-4 text-center">No videos in this folder</Text>
                        </View>
                    )
                }
                contentContainerStyle={{ paddingHorizontal: 8, paddingTop: 16 }}
            />

            <VideoItemDetailsModal visible={!!selectedVideoId} video={selectedVideo} onClose={() => setSelectedVideoId(null)} />

            <AlbumItemDetailsModal
                visible={showAlbumInfo}
                album={currentAlbumData}
                onClose={() => setShowAlbumInfo(false)}
                hideOpenFolderAction={true}
            />

            <RenameModal
                visible={!!renamingVideo}
                onClose={() => setRenamingVideo(null)}
                onRename={handleRenameVideo}
                initialValue={renamingVideo?.displayName || ""}
                title="Rename Video"
            />

            <ThemedBottomSheet isVisible={!!menuVideo} onClose={() => setMenuVideo(null)}>
                {menuVideo && (
                    <View className="px-2 pb-6">
                        <View className="px-4 py-4 mb-2 flex-row items-center gap-4">
                            <View className="w-16 h-10 rounded-lg bg-card overflow-hidden border border-border">
                                {menuVideo.thumbnail ? (
                                    <Image source={{ uri: menuVideo.thumbnail }} className="w-full h-full object-cover" />
                                ) : (
                                    <View className="w-full h-full justify-center items-center">
                                        <Icon icon={Film} size={20} className="text-secondary" />
                                    </View>
                                )}
                            </View>
                            <View className="flex-1">
                                <Text className="text-text font-bold text-lg" numberOfLines={1}>
                                    {menuVideo.displayName}
                                </Text>
                                <Text className="text-secondary text-xs uppercase tracking-widest mt-0.5">Video Options</Text>
                            </View>
                        </View>

                        <TouchableOpacity
                            className="flex-row items-center px-4 py-4 gap-4"
                            onPress={() => {
                                setMenuVideo(null);
                                setSelectedVideoId(menuVideo.id);
                            }}
                        >
                            <Icon icon={Info} size={22} className="text-secondary" />
                            <Text className="text-text text-base font-medium">Info</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            className="flex-row items-center px-4 py-4 gap-4"
                            onPress={() => {
                                setMenuVideo(null);
                                setRenamingVideo(menuVideo);
                            }}
                        >
                            <Icon icon={Edit2} size={22} className="text-secondary" />
                            <Text className="text-text text-base font-medium">Rename</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            className="flex-row items-center px-4 py-4 gap-4"
                            onPress={() => {
                                setMenuVideo(null);
                                console.log("Move file", menuVideo.id);
                            }}
                        >
                            <Icon icon={FolderInput} size={22} className="text-secondary" />
                            <Text className="text-text text-base font-medium">Move</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            className="flex-row items-center px-4 py-4 gap-4"
                            onPress={() => {
                                setMenuVideo(null);
                                const isWatched = menuVideo.lastPlayedSec >= menuVideo.duration * 0.95;
                                updateVideoProgress(menuVideo.id, isWatched ? -1 : menuVideo.duration);
                            }}
                        >
                            <Icon
                                icon={menuVideo.lastPlayedSec >= menuVideo.duration * 0.95 ? Circle : CheckCircle}
                                size={22}
                                className="text-secondary"
                            />
                            <Text className="text-text text-base font-medium">
                                {menuVideo.lastPlayedSec >= menuVideo.duration * 0.95 ? "Mark as Unwatched" : "Mark as Watched"}
                            </Text>
                        </TouchableOpacity>

                        {menuVideo.prefix && (
                            <TouchableOpacity
                                className="flex-row items-center px-4 py-4 gap-4"
                                onPress={() => {
                                    setMenuVideo(null);
                                    togglePrefixSelection(menuVideo.prefix!);
                                }}
                            >
                                <Icon icon={Film} size={22} className="text-secondary" />
                                <Text className="text-text text-base font-medium">Select same prefix</Text>
                            </TouchableOpacity>
                        )}

                        <TouchableOpacity
                            className="flex-row items-center px-4 py-4 gap-4"
                            onPress={() => {
                                setMenuVideo(null);
                                hideVideo(menuVideo.id);
                            }}
                        >
                            <Icon icon={EyeOff} size={22} className="text-secondary" />
                            <Text className="text-text text-base font-medium">Hide</Text>
                        </TouchableOpacity>

                        <View className="h-[1px] bg-border/50 my-2 mx-4" />

                        <TouchableOpacity
                            className="flex-row items-center px-4 py-4 gap-4"
                            onPress={() => {
                                setMenuVideo(null);
                                console.log("Delete file", menuVideo.id);
                            }}
                        >
                            <Icon icon={Trash2} size={22} className="text-error" />
                            <Text className="text-error text-base font-medium">Delete</Text>
                        </TouchableOpacity>
                    </View>
                )}
            </ThemedBottomSheet>
        </ThemedView>
    );
};

export default AlbumVideosScreen;
