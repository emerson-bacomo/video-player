import { AlbumItemDetailsModal } from "@/components/AlbumItemDetailsModal";
import { AlbumItemMenu, AlbumItemAction } from "@/components/AlbumItemMenu";
import { Header } from "@/components/Header";
import { Icon } from "@/components/Icon";
import { LoadingStatus } from "@/components/LoadingStatus";
import { PrefixFilterMenu } from "@/components/PrefixFilterMenu";
import { RenameModal } from "@/components/RenameModal";
import { SortMenu, SortMode } from "@/components/SortMenu";
import { ThemedView } from "@/components/Themed";
import { VideoItem, VideoItemSkeleton } from "@/components/VideoItem";
import { VideoItemDetailsModal } from "@/components/VideoItemDetailsModal";
import { useTheme } from "@/context/ThemeContext";
import { useMedia, VideoSortConfig } from "@/hooks/useMedia";
import { useMediaStore } from "@/hooks/MediaStoreBridge/MediaStoreProvider";
import { useSelection } from "@/context/SelectionContext";
import { useLoadingTask } from "@/context/LoadingTaskContext";
import { useDeleteHandler } from "@/hooks/useDeleteHandler";
import { useSafeNavigation } from "@/hooks/useSafeNavigation";
import type { Album } from "@/hooks/domain/Album";
import type { Video } from "@/hooks/domain/Video";
import { getAlbumPrefixOptionsDb } from "@/utils/db";
import { StatusBar } from "expo-status-bar";
import { useFocusEffect } from "expo-router";
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
import React, { useCallback, useDeferredValue, useEffect, useState, useMemo } from "react";
import { BackHandler, FlatList, RefreshControl, Text, TouchableOpacity, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export const AlbumVideos = ({
    album,
    videos,
    onRefresh,
    isSyncing = false,
    isLoading = false,
    activeVideoSort,
    videoSortMode,
}: {
    album: Album;
    videos: Video[] | null;
    onRefresh?: () => void;
    isSyncing?: boolean;
    isLoading?: boolean;
    activeVideoSort: VideoSortConfig | null;
    videoSortMode: SortMode | null;
}) => {
    const id = album.id;
    const store = useMediaStore();
    const {
        updateVideoSort,
        selectedVideoPrefixFilters,
        permissionResponse,
        setVideoSortSettingScope,
        updatePrefixFilter,
        clearPrefixFilters,
        setThumbnailPriorityAlbum,
    } = useMedia();
    const {
        isSelectionMode,
        toggleSelection,
        clearSelection,
        resumeSelectionIfNeeded,
        togglePrefixSelection,
        selectPrefixesOfSelected,
        selectedIds,
    } = useSelection();
    const { loadingTask, setLoadingTask } = useLoadingTask();

    const albumInfo = useMemo(() => album || { title: "Album", assetCount: 0 }, [album]);
    const { colors } = useTheme();
    const insets = useSafeAreaInsets();
    const { safeBack, safePush } = useSafeNavigation();

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

    // When returning focus (e.g. after cancelling from delete-preview), prune any
    // selected video IDs that no longer exist. This handles the case where deletion
    // succeeded and the user somehow navigates back, or partial deletion occurred.
    useFocusEffect(
        useCallback(() => {
            // Restore the selection bar when returning (e.g. user cancelled delete-preview)
            resumeSelectionIfNeeded();

            // Prune any selected video IDs that no longer exist (e.g. after deletion).
            if (!videos || selectedIds.size === 0) return;
            const existingIds = new Set(videos.map((v) => v.id));
            const allStillExist = Array.from(selectedIds).every((id) => existingIds.has(id));
            if (!allStillExist) {
                clearSelection();
            }
        }, [videos, selectedIds, clearSelection, resumeSelectionIfNeeded]),
    );

    // Filtering State (Persisted)
    const selectedPrefixes = selectedVideoPrefixFilters[id] || [];

    const [selectedVideoId, setSelectedVideoId] = useState<string | null>(null);
    const [showAlbumInfo, setShowAlbumInfo] = useState(false);
    const [renamingVideo, setRenamingVideo] = useState<Video | null>(null);
    const [menuVideo, setMenuVideo] = useState<Video | null>(null);

    // Single-item delete from context menu — skips the preview page and deletes immediately.
    const { handleDelete: handleSingleVideoDelete } = useDeleteHandler({
        type: "video",
        idList: menuVideo ? [menuVideo.id] : [],
        itemCount: 1,
        onSuccess: () => {
            // Stay on the album page — the video will disappear reactively from the list
        },
    });

    // Selection mode delete — if only 1 item is selected, skip the preview page.
    const { handleDelete: handleSelectionVideoDelete } = useDeleteHandler({
        type: "video",
        idList: Array.from(selectedIds),
        itemCount: selectedIds.size,
        onSuccess: () => {
            // Stay on the album page — clearSelection is called inside useDeleteHandler
        },
    });
    const { width: windowWidth } = useWindowDimensions();
    const [listWidth, setListWidth] = useState(windowWidth);
    const numColumns = Math.max(2, Math.floor(listWidth / 180));
    const itemWidth = (listWidth - 16) / numColumns;

    const [prefixOptions, setPrefixOptions] = useState<{ value: string; label: string; count: number }[]>([]);

    const isThumbnailGenerating = loadingTask?.id === "thumbnail-gen";

    useEffect(() => {
        const loadPrefixOptions = async () => {
            const dbOptionsStr = getAlbumPrefixOptionsDb(id);
            if (dbOptionsStr) {
                try {
                    const parsed = JSON.parse(dbOptionsStr);
                    if (parsed && parsed.length > 0) {
                        setPrefixOptions(parsed);
                        return;
                    }
                } catch {}
            }

            // Fallback for virtual albums or missing data: compute on the fly
            if (videos && videos.length > 0) {
                const prefixCounts: Record<string, number> = {};
                videos.forEach((v) => {
                    if (v.prefix) {
                        prefixCounts[v.prefix] = (prefixCounts[v.prefix] || 0) + 1;
                    }
                });

                const options = Object.entries(prefixCounts)
                    .filter(([_, count]) => count > 1)
                    .map(([prefix, count]) => ({
                        value: prefix,
                        label: prefix,
                        count,
                    }))
                    .sort((a, b) => a.label.localeCompare(b.label));

                setPrefixOptions(options);
            }
        };

        loadPrefixOptions();
    }, [id, videos]);

    const skeletonData = useMemo(() => Array.from({ length: 10 }).map((_, i) => ({ id: `skel-${i}`, isPlaceholder: true })), []);

    const currentAlbumData = useMemo(() => {
        return {
            id,
            title: albumInfo?.title || "",
            assetCount: albumInfo?.assetCount || videos?.length || 0,
            thumbnail: albumInfo?.thumbnail,
            lastModified: albumInfo?.lastModified || 0,
            uri: albumInfo?.uri || "",
        };
    }, [id, albumInfo, videos?.length]);

    const deferredProcessedVideos = useDeferredValue(videos || []);

    const isDisplayingSkeletons = useMemo(() => {
        // Show skeletons if explicitly loading
        if (isLoading) return !videos || videos.length === 0;
        // Also show if we just got videos but the deferred value (used by FlatList) hasn't updated yet
        // this prevents the "blank screen" between skeleton disappearing and items appearing
        if (videos && videos.length > 0 && deferredProcessedVideos.length === 0) return true;
        return false;
    }, [isLoading, videos, deferredProcessedVideos]);

    const videoSortOptions: { label: string; value: "name" | "date" | "duration" | "episode"; icon: LucideIcon }[] = [
        { label: "Episode", value: "episode", icon: Hash },
        { label: "Date", value: "date", icon: Calendar },
        { label: "Name", value: "name", icon: SortAsc },
        { label: "Duration", value: "duration", icon: Clock },
    ];

    const handleRefresh = () => {
        if (onRefresh) {
            onRefresh();
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
            renamingVideo.rename(newName);
            setRenamingVideo(null);
        }
    };

    useEffect(() => {
        if (isThumbnailGenerating) return;
        if (isDisplayingSkeletons || (videos && videos !== deferredProcessedVideos)) {
            setLoadingTask({
                id: "album-render",
                label: "Loading Videos...",
                detail: "Processing layout...",
            });
        } else {
            setLoadingTask(null, "album-render");
        }
    }, [isDisplayingSkeletons, videos, deferredProcessedVideos, setLoadingTask, isThumbnailGenerating]);

    const selectedVideo = useMemo(() => (videos || []).find((v) => v.id === selectedVideoId) || null, [videos, selectedVideoId]);

    const { isSelectionWatched, hasSelectionPrefixes } = useMemo(() => {
        if (!selectedIds.size || !videos) return { isSelectionWatched: false, hasSelectionPrefixes: false };

        const firstSelectedId = Array.from(selectedIds)[0];
        const first = videos.find((v) => v.id === firstSelectedId);
        const watched = first ? first.lastPlayedSec >= 0 : false;
        const hasPrefixes = Array.from(selectedIds).some((sid) => {
            const v = videos.find((vid) => vid.id === sid);
            return !!v?.prefix;
        });

        return { isSelectionWatched: watched, hasSelectionPrefixes: hasPrefixes };
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
                onMenuPress={(v) => setMenuVideo(v)}
            />
        );
    };

    const selectionActions = useMemo(
        () => [
            {
                label: isSelectionWatched ? "Mark as Unwatched" : "Mark as Watched",
                icon: isSelectionWatched ? Circle : CheckCircle,
                onPress: (ids: Set<string>) => {
                    const idsArray = Array.from(ids);
                    const newProgress = isSelectionWatched ? -1 : Infinity;
                    const videos = idsArray.map((id) => store.getVideo(id)).filter((v): v is NonNullable<typeof v> => v != null);
                    for (const v of videos) {
                        v.updateProgress(newProgress);
                    }
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
                onPress: (ids: Set<string>) => {
                    console.log("Move multiple videos", Array.from(ids));
                },
            },
            {
                label: "Hide Selected",
                icon: EyeOff,
                onPress: (ids: Set<string>) => {
                    const videos = Array.from(ids)
                        .map((id) => store.getVideo(id))
                        .filter((v): v is NonNullable<typeof v> => v != null);
                    for (const v of videos) {
                        v.hide();
                    }
                    clearSelection();
                },
            },
            {
                label: "Delete",
                icon: Trash2,
                destructive: true,
                onPress: () => {
                    if (selectedIds.size === 1) {
                        handleSelectionVideoDelete();
                    } else {
                        safePush({
                            pathname: "/delete-preview",
                            params: { type: "video" },
                        });
                    }
                },
            },
            {
                label: "Regenerate Thumbnails",
                icon: Film,
                onPress: (ids: Set<string>) => {
                    const selectedVideos = (videos?.filter((v) => ids.has(v.id)) || [])
                    for (const v of selectedVideos) {
                        v.regenerateThumbnail();
                    }
                    clearSelection();
                },
            },
            {
                label: "Add to Prefix Filter",
                icon: Hash,
                onPress: (ids: Set<string>) => {
                    const selectedPrefixes = new Set<string>();
                    videos?.forEach((v) => {
                        if (ids.has(v.id) && v.prefix) {
                            selectedPrefixes.add(v.prefix);
                        }
                    });
                    selectedPrefixes.forEach((p) => updatePrefixFilter(id, p, true));
                    clearSelection();
                },
            },
        ],
        [
            isSelectionWatched,
            hasSelectionPrefixes,
            clearSelection,
            store,
            selectPrefixesOfSelected,
            id,
            selectedIds.size,
            handleSelectionVideoDelete,
            safePush,
            videos,
            updatePrefixFilter,
        ],
    );

    const menuActions = useMemo<AlbumItemAction[]>(
        () => [
            {
                label: "Info",
                icon: Info,
                onPress: (close) => {
                    close();
                    setSelectedVideoId(menuVideo!.id);
                },
            },
            {
                label: "Rename",
                icon: Edit2,
                onPress: (close) => {
                    close();
                    setRenamingVideo(menuVideo);
                },
            },
            {
                label: "Move",
                icon: FolderInput,
                onPress: (close) => {
                    close();
                    console.log("Move file", menuVideo!.id);
                },
            },
            {
                label: menuVideo && menuVideo.lastPlayedSec >= 0 ? "Mark as Unwatched" : "Mark as Watched",
                icon: menuVideo && menuVideo.lastPlayedSec >= 0 ? Circle : CheckCircle,
                onPress: (close) => {
                    close();
                    const isWatched = menuVideo!.lastPlayedSec >= 0;
                    menuVideo!.updateProgress(isWatched ? -1 : Infinity);
                },
            },
            ...(menuVideo?.rawPrefix
                ? [
                      {
                          label: "Select same prefix",
                          icon: Film,
                          onPress: (close: () => void) => {
                              close();
                              togglePrefixSelection(menuVideo!.rawPrefix!, id);
                          },
                      } as AlbumItemAction,
                  ]
                : []),
            {
                label: "Hide",
                icon: EyeOff,
                onPress: (close) => {
                    close();
                    menuVideo!.hide();
                },
            },
            {
                label: "Regenerate thumbnail",
                icon: Film,
                onPress: (close) => {
                    close();
                    menuVideo!.regenerateThumbnail();
                },
            },
            ...(menuVideo?.prefix && prefixOptions.some((o) => o.value === menuVideo.prefix)
                ? [
                      {
                          label: "Add to prefix filter",
                          icon: Hash,
                          onPress: (close: () => void) => {
                              const prefix = menuVideo!.prefix!;
                              close();
                              updatePrefixFilter(id, prefix, true);
                          },
                      } as AlbumItemAction,
                  ]
                : []),
            {
                label: "Delete",
                icon: Trash2,
                destructive: true,
                onPress: (close) => {
                    close();
                    // Single item — no need for the confirmation page, delete immediately.
                    handleSingleVideoDelete();
                },
            },
        ],
        [
            menuVideo,
            setSelectedVideoId,
            setRenamingVideo,
            togglePrefixSelection,
            id,
            prefixOptions,
            updatePrefixFilter,
            handleSingleVideoDelete,
        ],
    );

    const processedData = deferredProcessedVideos.filter((v: any) => !v.isPlaceholder);

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

                <Header.SelectionActions data={processedData} actions={selectionActions} />
            </Header>

            <FlatList
                onLayout={(e) => setListWidth(e.nativeEvent.layout.width)}
                key={numColumns}
                data={
                    isDisplayingSkeletons
                        ? skeletonData
                        : isThumbnailGenerating && (!videos || videos.length === 0)
                          ? skeletonData
                          : deferredProcessedVideos
                }
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
                        {videoSortMode && activeVideoSort && (
                            <SortMenu
                                currentSort={activeVideoSort}
                                onSortChange={(s) => updateVideoSort(id, s, videoSortMode)}
                                options={videoSortOptions}
                                mode={videoSortMode}
                                onModeChange={(m) => setVideoSortSettingScope(id, m)}
                                showTabs={true}
                                isLoading={isDisplayingSkeletons}
                            />
                        )}
                    </View>
                }
                refreshControl={
                    <RefreshControl
                        refreshing={isSyncing}
                        onRefresh={handleRefresh}
                        tintColor={colors.text}
                        colors={[colors.primary]}
                        enabled={permissionResponse?.status === "granted"}
                    />
                }
                ListEmptyComponent={
                    isDisplayingSkeletons || loadingTask ? null : (
                        <View className="flex-1 justify-center items-center py-20">
                            <Icon icon={Film} size={64} className="text-border/50" />
                            <Text className="text-secondary mt-4 text-center">No videos in this album</Text>
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
                hideOpenAlbumAction={true}
            />

            <RenameModal
                visible={!!renamingVideo}
                onClose={() => setRenamingVideo(null)}
                onRename={handleRenameVideo}
                initialValue={renamingVideo?.title || ""}
                title="Rename Video"
            />

            <AlbumItemMenu
                visible={!!menuVideo}
                title={menuVideo?.title || ""}
                imageUri={menuVideo?.thumbnail}
                onClose={() => setMenuVideo(null)}
                actions={menuActions}
            />
        </ThemedView>
    );
};
