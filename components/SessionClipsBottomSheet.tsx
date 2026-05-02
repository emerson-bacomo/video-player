import React, { useState } from "react";
import { View, Text, TouchableOpacity, Image } from "react-native";
import { Scissors, FileVideo, Play, ChevronDown, ChevronUp } from "lucide-react-native";
import { MediaContextType } from "@/hooks/useMedia";
import { SessionClip } from "@/types/useMedia";
import { ThemedBottomSheet, ThemedBottomSheetFlatList } from "./ThemedBottomSheet";
import { secondsToHhmmss } from "@/utils/secondsToHhmmss";
import { VideoBadges } from "./VideoBadges";
import { cn } from "@/utils/cn";

interface SessionClipsBottomSheetProps {
    isVisible: boolean;
    onClose: () => void;
    sessionClips: MediaContextType["sessionClips"];
    onClipPress: (clip: SessionClip) => void;
    onReexportPress: (clip: SessionClip) => void;
    onPlayOriginal?: (uri: string) => void;
    currentVideoId?: string;
}

const getRelativeTimeStr = (date: Date) => {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSecs = Math.floor(diffMs / 1000);
    const diffMins = Math.floor(diffSecs / 60);
    const diffHours = Math.floor(diffMins / 60);

    if (diffSecs < 60) {
        if (diffSecs < 2) return "Just now";
        return `${diffSecs} sec${diffSecs !== 1 ? "s" : ""} ago`;
    }
    if (diffMins < 60) return `${diffMins} min${diffMins !== 1 ? "s" : ""} ago`;
    if (diffHours < 24) return `${diffHours} hr${diffHours !== 1 ? "s" : ""} ago`;

    return date.toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    });
};

const RealtimeRelativeTime = ({ date }: { date: Date }) => {
    const [timeStr, setTimeStr] = useState(() => getRelativeTimeStr(date));

    React.useEffect(() => {
        const interval = setInterval(() => {
            setTimeStr(getRelativeTimeStr(date));
        }, 1000); // Check every second. React bails out of render if the string is exactly the same!
        return () => clearInterval(interval);
    }, [date]);

    return <Text className="text-zinc-400 text-xs">{timeStr}</Text>;
};

export const SessionClipsBottomSheet: React.FC<SessionClipsBottomSheetProps> = ({
    isVisible,
    onClose,
    sessionClips,
    onClipPress,
    onReexportPress,
    onPlayOriginal,
    currentVideoId,
}) => {
    const [expandedClipId, setExpandedClipId] = useState<string | null>(null);

    const sortedClips = Object.values(sessionClips).sort((a, b) => {
        const aTime = a.sessionCreatedAt || a.modificationTime || 0;
        const bTime = b.sessionCreatedAt || b.modificationTime || 0;
        return bTime - aTime;
    });

    const renderHeader = () => (
        <View className="flex-row items-center justify-between border-b border-white/5 pb-4 mb-3">
            <View className="flex-row items-center gap-3">
                <View className="w-9 h-9 rounded-full bg-blue-500/10 items-center justify-center">
                    <Scissors size={18} color="#3b82f6" />
                </View>
                <View>
                    <Text className="text-text text-lg font-bold">Recent Clips</Text>
                    <Text className="text-zinc-500 text-xs">Created in this session</Text>
                </View>
            </View>
        </View>
    );

    const renderItem = ({ item: clip }: { item: SessionClip }) => {
        const isExpanded = expandedClipId === clip.id;
        const createdDate = new Date(clip.sessionCreatedAt || clip.modificationTime || Date.now());

        return (
            <View
                className={cn(
                    "bg-zinc-800/40 p-3 rounded-2xl border",
                    clip.id === currentVideoId ? "border-blue-500/50" : "border-white/5",
                )}
            >
                <TouchableOpacity
                    activeOpacity={0.7}
                    onPress={() => setExpandedClipId(isExpanded ? null : clip.id)}
                    className="flex-row items-center gap-4"
                >
                    <View className="w-20 h-12 bg-zinc-800 rounded-lg overflow-hidden relative">
                        {clip.thumbnail ? (
                            <Image source={{ uri: clip.thumbnail }} className="w-full h-full" resizeMode="cover" />
                        ) : (
                            <View className="w-full h-full items-center justify-center">
                                <FileVideo size={20} color="#52525b" />
                            </View>
                        )}
                        <TouchableOpacity
                            onPress={(e) => {
                                e.stopPropagation();
                                if (clip.id === currentVideoId) {
                                    onClose();
                                } else {
                                    onClipPress(clip);
                                }
                            }}
                            className="absolute inset-0 items-center justify-center bg-black/20"
                        >
                            <View className="w-8 h-8 bg-black/40 rounded-full items-center justify-center border border-white/20">
                                <Play size={14} color="white" fill="white" className="ml-0.5" />
                            </View>
                        </TouchableOpacity>
                    </View>
                    <View className="flex-1">
                        <View className="flex-row items-center gap-2">
                            <VideoBadges title={clip.title} badgeClassName="h-[16px] px-1.5" textClassName="text-[8px]" />
                            <Text className="text-text font-semibold text-sm flex-1" numberOfLines={1}>
                                {clip.title}
                            </Text>
                        </View>
                        <RealtimeRelativeTime date={createdDate} />
                        <Text className="text-zinc-400 text-xs font-mono">{secondsToHhmmss(clip.duration, true)}</Text>
                    </View>

                    <View className="flex-row items-center">
                        <View className="ml-1 w-6 items-center justify-center">
                            {isExpanded ? <ChevronUp size={18} color="#a1a1aa" /> : <ChevronDown size={18} color="#a1a1aa" />}
                        </View>
                    </View>
                </TouchableOpacity>

                {isExpanded && (
                    <View className="mt-3 pt-3 border-t border-white/5 flex-row flex-wrap gap-x-6 gap-y-2">
                        <View>
                            <Text className="text-zinc-500 text-[10px] uppercase font-bold tracking-widest mb-0.5">
                                Resolution
                            </Text>
                            <Text className="text-zinc-300 text-xs font-mono">
                                {clip.width}x{clip.height}
                            </Text>
                        </View>
                        <View>
                            <Text className="text-zinc-500 text-[10px] uppercase font-bold tracking-widest mb-0.5">Size</Text>
                            <Text className="text-zinc-300 text-xs font-mono">
                                {clip.size ? (clip.size / (1024 * 1024)).toFixed(1) + " MB" : "Unknown"}
                            </Text>
                        </View>
                        <View>
                            <Text className="text-zinc-500 text-[10px] uppercase font-bold tracking-widest mb-0.5">Format</Text>
                            <Text className="text-zinc-300 text-xs font-mono">
                                {clip.filename.split(".").pop()?.toUpperCase() || "Unknown"}
                            </Text>
                        </View>
                        {clip.segments && clip.segments.length > 0 && (
                            <View className="w-full mt-1">
                                <Text className="text-zinc-500 text-[10px] uppercase font-bold tracking-widest mb-1.5">
                                    Source Segments ({clip.segments.length})
                                </Text>
                                <View className="flex-row flex-wrap gap-2">
                                    {clip.segments.map((s, i) => (
                                        <View key={i} className="bg-zinc-800 px-2 py-1 rounded border border-white/5">
                                            <Text className="text-zinc-300 text-[10px] font-mono">
                                                {secondsToHhmmss(s.start, true)} - {secondsToHhmmss(s.end, true)}
                                            </Text>
                                        </View>
                                    ))}
                                </View>
                            </View>
                        )}
                        <View className="w-full mt-4 pt-4 border-t border-white/5 flex-row justify-end gap-3">
                            {clip.clipSourceUri && onPlayOriginal && (
                                <TouchableOpacity
                                    onPress={() => onPlayOriginal(clip.clipSourceUri!)}
                                    className="px-4 py-2 bg-zinc-800 rounded-xl border border-white/10 flex-row items-center gap-2"
                                >
                                    <Play size={12} color="white" fill="white" />
                                    <Text className="text-white text-xs font-bold">Play Original</Text>
                                </TouchableOpacity>
                            )}
                            <TouchableOpacity
                                onPress={() => onReexportPress(clip)}
                                className="px-4 py-2 bg-zinc-800 rounded-xl border border-white/10 flex-row items-center gap-2"
                            >
                                <Text className="text-white text-xs font-bold">Re-export</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                )}
            </View>
        );
    };

    return (
        <ThemedBottomSheet isVisible={isVisible} onClose={onClose}>
            <ThemedBottomSheetFlatList
                className="px-6"
                contentContainerClassName="pb-10 pt-4 gap-3"
                data={sortedClips}
                keyExtractor={(item: any) => item.id}
                ListHeaderComponent={renderHeader}
                renderItem={renderItem}
            />
        </ThemedBottomSheet>
    );
};
