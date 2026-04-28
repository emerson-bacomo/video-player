import { VideoMedia } from "@/types/useMedia";
import { breakPath } from "@/utils/textUtils";
import { router } from "expo-router";
import { Calendar, Clock, FileVideo, HardDrive, Info } from "lucide-react-native";
import React from "react";
import { Image, Text, View } from "react-native";
import { Icon } from "./Icon";
import { ThemedButton } from "./Themed";
import { ThemedBottomSheet, ThemedBottomSheetScrollView } from "./ThemedBottomSheet";

interface VideoInfoModalProps {
    visible: boolean;
    video: VideoMedia | null;
    onClose: () => void;
    hidePlayAction?: boolean;
}

export const VideoItemDetailsModal: React.FC<VideoInfoModalProps> = ({ visible, video, onClose, hidePlayAction }) => {
    if (!video) return null;

    const formatSize = (size?: number) => {
        if (!size || size === 0) return "---";
        if (size >= 1024 * 1024 * 1024) return `${(size / (1024 * 1024 * 1024)).toFixed(2)} GB`;
        return `${(size / (1024 * 1024)).toFixed(1)} MB`;
    };

    const cleanPath = video.uri
        ? video.uri.includes("/0/")
            ? (video.uri.split("/0/").pop() ?? video.uri)
            : video.uri
        : "---";

    const hasProgress = video.lastPlayedSec && video.lastPlayedSec > 0;
    const progressTime = hasProgress
        ? `${Math.floor(video.lastPlayedSec / 60)}:${Math.floor(video.lastPlayedSec % 60)
              .toString()
              .padStart(2, "0")}`
        : null;

    return (
        <ThemedBottomSheet isVisible={visible} onClose={onClose}>
            <ThemedBottomSheetScrollView contentContainerStyle={{ paddingBottom: 24 }}>
                <View className="p-6 pb-2">
                    <View className="flex-row items-center gap-5 mb-6">
                        {video.thumbnail ? (
                            <Image source={{ uri: video.thumbnail }} className="w-32 aspect-video rounded-xl bg-card" />
                        ) : (
                            <View className="w-32 aspect-video rounded-xl justify-center items-center bg-card border border-border">
                                <Icon icon={Info} size={24} className="text-primary" />
                            </View>
                        )}
                        <View className="flex-1">
                            <Text className="text-zinc-500 text-xs font-bold uppercase tracking-widest mb-1">Video Metadata</Text>
                            <Text className="text-text text-xl font-bold">{video.title}</Text>
                        </View>
                    </View>

                    <View className="border-b border-border" />
                </View>

                <View className="px-6 gap-6">
                    <View className="flex-row items-center gap-4">
                        <View className="w-8 h-8 rounded-full items-center justify-center bg-zinc-800">
                            <Icon icon={Clock} size={16} className="text-primary" />
                        </View>
                        <View>
                            <Text className="text-secondary text-xs uppercase font-bold tracking-wider">Duration</Text>
                            <Text className="text-text text-sm">
                                {Math.floor(video.duration / 60)}:
                                {Math.floor(video.duration % 60)
                                    .toString()
                                    .padStart(2, "0")}
                            </Text>
                        </View>
                    </View>

                    <View className="flex-row items-center gap-4">
                        <View className="w-8 h-8 rounded-full items-center justify-center bg-zinc-800">
                            <Icon icon={HardDrive} size={16} className="text-primary" />
                        </View>
                        <View className="flex-1 flex-row justify-between pr-4">
                            <View>
                                <Text className="text-secondary text-xs uppercase font-bold tracking-wider">File Size</Text>
                                <Text className="text-text text-sm">{formatSize(video.size)}</Text>
                            </View>
                        </View>
                    </View>

                    <View className="flex-row items-center gap-4">
                        <View className="w-8 h-8 rounded-full items-center justify-center bg-zinc-800">
                            <Icon icon={Calendar} size={16} className="text-primary" />
                        </View>
                        <View className="flex-1 flex-row justify-between pr-4">
                            <View>
                                <Text className="text-secondary text-xs uppercase font-bold tracking-wider">Created</Text>
                                <Text className="text-text text-sm">
                                    {video.modificationTime
                                        ? new Date(video.modificationTime).toLocaleString(undefined, {
                                              year: "numeric",
                                              month: "short",
                                              day: "numeric",
                                          })
                                        : "---"}
                                </Text>
                            </View>
                            <View>
                                <Text className="text-secondary text-xs uppercase font-bold tracking-wider">Resolution</Text>
                                <Text className="text-text text-sm">
                                    {video.width} × {video.height}
                                </Text>
                            </View>
                        </View>
                    </View>

                    <View className="flex-row items-center gap-4">
                        <View className="w-8 h-8 rounded-full items-center justify-center bg-zinc-800">
                            <Icon icon={FileVideo} size={16} className="text-primary" />
                        </View>
                        <View className="flex-1">
                            <Text className="text-secondary text-xs uppercase font-bold tracking-wider">File Path</Text>
                            <Text className="text-text text-xs mt-1 leading-5" numberOfLines={2}>
                                {breakPath(cleanPath)}
                            </Text>
                        </View>
                    </View>

                    {!hidePlayAction && (
                        <View className="mt-2">
                            <View className="border-b border-border mb-6" />
                            <View className="pb-4">
                                <ThemedButton
                                    title={hasProgress ? `Resume at ${progressTime}` : "Play Video"}
                                    onPress={() => {
                                        onClose();
                                        router.push({
                                            pathname: "/player",
                                            params: {
                                                videoId: video.id,
                                                albumId: video.albumId,
                                                initialTime: (video.lastPlayedSec || 0).toString(),
                                            },
                                        });
                                    }}
                                />
                            </View>
                        </View>
                    )}
                </View>
            </ThemedBottomSheetScrollView>
        </ThemedBottomSheet>
    );
};
