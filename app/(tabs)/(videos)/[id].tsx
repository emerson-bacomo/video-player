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
import { useMedia } from "@/hooks/useMedia";
import { useSafeNavigation } from "@/hooks/useSafeNavigation";
import { VideoMedia } from "@/types/useMedia";
import { getAlbumPrefixOptionsDb } from "@/utils/db";
import { useLocalSearchParams } from "expo-router";
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
import React, { useDeferredValue, useEffect, useMemo } from "react";
import { BackHandler, FlatList, Image, RefreshControl, Text, TouchableOpacity, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const AlbumVideosScreen = () => {
    const { id } = useLocalSearchParams<{ id: string }>();
    const {
        allAlbumsVideos,
        loadingTask,
        getActiveVideoSort,
        updateVideoSort,
        allAlbum,
        selectedVideoPrefixFilters,
        permissionResponse,
        isSelectionMode,
        toggleSelection,
        clearSelection,
        renameVideo,
        setVideoSortSettingScope,
        syncCurrentAlbum,
        updateVideoProgress,
        updateMultipleVideoProgress,
        togglePrefixSelection,
        selectPrefixesOfSelected,
        hideVideo,
        hideMultipleVideos,
        selectedIds,
        updatePrefixFilter,
        clearPrefixFilters,
        setLoadingTask,
        setThumbnailPriorityAlbum,
    } = useMedia();

    const albumInfo = allAlbum[id] || { title: "Album", assetCount: 0 };
    const activeVideoSort = getActiveVideoSort(albumInfo);
    const videoSortMode = albumInfo?.videoSortSettingScope || "global";
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

    // Priority thumbnail generation for the current album
    useEffect(() => {
        setThumbnailPriorityAlbum(id);
        return () => setThumbnailPriorityAlbum(null);
    }, [id, setThumbnailPriorityAlbum]);

    // Filtering State (Persisted)
    const selectedPrefixes = selectedVideoPrefixFilters[id] || [];

    const [selectedVideoId, setSelectedVideoId] = React.useState<string | null>(null);
    const [showAlbumInfo, setShowAlbumInfo] = React.useState(false);
    const [renamingVideo, setRenamingVideo] = React.useState<VideoMedia | null>(null);
    const [isLoading, setIsLoading] = React.useState(true);
    const [menuVideo, setMenuVideo] = React.useState<VideoMedia | null>(null);
    const { width: windowWidth } = useWindowDimensions();
    const [listWidth, setListWidth] = React.useState(windowWidth);
    const numColumns = Math.max(2, Math.floor(listWidth / 180));
    const itemWidth = (listWidth - 16) / numColumns;

    const [prefixOptions, setPrefixOptions] = React.useState<{ value: string; label: string; count: number }[]>([]);

    // All videos for this album from in-memory state, with prefix filter and sorting applied
    const videos = allAlbumsVideos[id] || [];
    const isThumbnailGenerating = loadingTask?.id === "thumbnail-gen";

    React.useEffect(() => {
        const loadPrefixOptions = async () => {
            const dbOptionsStr = getAlbumPrefixOptionsDb(id);
            if (dbOptionsStr) {
                try {
                    const parsed = JSON.parse(dbOptionsStr);
                    if (parsed && parsed.length > 0) {
                        setPrefixOptions(parsed);
                    }
                } catch (e) {}
            }
        };

        setTimeout(loadPrefixOptions, 0);
    }, [id]);

    const skeletonData = React.useMemo(
        () => Array.from({ length: 10 }).map((_, i) => ({ id: `skel-${i}`, isPlaceholder: true })),
        [],
    );

    const currentAlbumData = useMemo(() => {
        return {
            id,
            title: albumInfo?.title || "",
            assetCount: albumInfo?.assetCount || videos.length,
            thumbnail: albumInfo?.thumbnail,
            lastModified: albumInfo?.lastModified || 0,
        };
    }, [id, albumInfo, videos.length]);

    const deferredProcessedVideos = useDeferredValue(videos);

    const isDisplayingSkeletons = useMemo(() => {
        return isLoading && videos.length === 0;
    }, [isLoading, videos.length]);

    const videoSortOptions: { label: string; value: "name" | "date" | "duration" | "episode"; icon: LucideIcon }[] = [
        { label: "Episode", value: "episode", icon: Hash },
        { label: "Date", value: "date", icon: Calendar },
        { label: "Name", value: "name", icon: SortAsc },
        { label: "Duration", value: "duration", icon: Clock },
    ];

    const onRefresh = () => {
        if (id) {
            const controller = new AbortController();
            setIsLoading(true);
            syncCurrentAlbum(id, controller.signal).finally(() => {
                if (!controller.signal.aborted) setIsLoading(false);
            });
        }
    };

    const handleToggleFilter = (prefix: string) => {
        const isSelected = !selectedPrefixes.includes(prefix);
        updatePrefixFilter(id, prefix, isSelected);
    };

    const handleClearFilters = () => {
        clearPrefixFilters(id);
    };

    const handleRenameVideo = (newName: string) => {
        if (renamingVideo) {
            renameVideo(renamingVideo.id, newName);
            setRenamingVideo(null);
        }
    };

    useEffect(() => {
        if (isThumbnailGenerating) return;
        if (isDisplayingSkeletons || videos !== deferredProcessedVideos) {
            setLoadingTask({
                id: "album-render",
                label: "Loading Videos...",
                detail: "Processing layout...",
                isImportant: false,
            });
        } else {
            setLoadingTask(null);
        }
    }, [isDisplayingSkeletons, videos, deferredProcessedVideos, setLoadingTask]);

    useEffect(() => {
        const controller = new AbortController();
        setIsLoading(true);

        syncCurrentAlbum(id, controller.signal).finally(() => {
            if (!controller.signal.aborted) setIsLoading(false);
        });
        return () => controller.abort();
    }, [id]);

    const selectedVideo = useMemo(() => videos.find((v) => v.id === selectedVideoId) || null, [videos, selectedVideoId]);

    const { isSelectionWatched, firstSelectedItem, hasSelectionPrefixes } = useMemo(() => {
        if (!selectedIds.size) return { isSelectionWatched: false, firstSelectedItem: null, hasSelectionPrefixes: false };

        const firstSelectedId = Array.from(selectedIds)[0];
        const first = videos.find((v) => v.id === firstSelectedId);
        const watched = first ? first.lastPlayedSec >= first.duration * 0.95 : false;
        const hasPrefixes = Array.from(selectedIds).some((sid) => {
            const v = videos.find((vid) => vid.id === sid);
            return !!v?.prefix;
        });

        return { isSelectionWatched: watched, firstSelectedItem: first, hasSelectionPrefixes: hasPrefixes };
    }, [selectedIds, videos]);

    const renderVideoItem = ({ item }: { item: any }) => {
        if (item.isPlaceholder) {
            return <VideoItemSkeleton width={itemWidth} />;
        }
        return (
            <VideoItem
                width={itemWidth}
                item={item}
                onLongPress={(v) => toggleSelection(v.id)}
                onInfoPress={(v) => setSelectedVideoId(v.id)}
                onMenuPress={setMenuVideo}
            />
        );
    };

    return (
        <ThemedView className="flex-1" style={{ paddingTop: insets.top }}>
            <StatusBar style="light" />

            <Header>
                <View className="flex-row items-center flex-1 gap-3">
                    <Header.Back onPress={safeBack} />
                    <Header.Title title={currentAlbumData.title} subtitle={`${currentAlbumData.assetCount} Videos`} />
                </View>

                <Header.Actions>
                    <LoadingStatus />
                    <Header.SearchAction />
                    <TouchableOpacity
                        onPress={() => setShowAlbumInfo(true)}
                        className="w-10 h-10 items-center justify-center rounded-full bg-zinc-800/50"
                    >
                        <Icon icon={Info} size={20} className="text-text" />
                    </TouchableOpacity>
                </Header.Actions>

                <Header.SelectionActions
                    data={deferredProcessedVideos.filter((v: any) => !v.isPlaceholder)}
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
                                          selectPrefixesOfSelected(id);
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
                onLayout={(e) => setListWidth(e.nativeEvent.layout.width)}
                key={numColumns}
                data={isDisplayingSkeletons ? skeletonData : isThumbnailGenerating ? videos : deferredProcessedVideos}
                keyExtractor={(item) => item.id}
                numColumns={numColumns}
                initialNumToRender={10}
                windowSize={5}
                removeClippedSubviews={true}
                renderItem={renderVideoItem}
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
                            onSortChange={(s) => updateVideoSort(id, s, videoSortMode)}
                            options={videoSortOptions}
                            mode={videoSortMode}
                            onModeChange={(m) => setVideoSortSettingScope(id, m)}
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
                    isDisplayingSkeletons || loadingTask ? null : (
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
                initialValue={renamingVideo?.title || ""}
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
                                    {menuVideo.title}
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

                        {menuVideo.rawPrefix && (
                            <TouchableOpacity
                                className="flex-row items-center px-4 py-4 gap-4"
                                onPress={() => {
                                    setMenuVideo(null);
                                    togglePrefixSelection(menuVideo.rawPrefix!, id);
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
