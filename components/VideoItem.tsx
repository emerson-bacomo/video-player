import { extractEpisode } from "@/utils/videoUtils";
import { router } from "expo-router";
import { Film } from "lucide-react-native";
import React from "react";
import { Image, Text, TouchableOpacity, View } from "react-native";
import { Skeleton } from "./Skeleton";

interface VideoItemProps {
    item: any;
    setSelectedVideoId: (id: string | null) => void;
}

export const VideoItem = React.memo(({ item, setSelectedVideoId }: VideoItemProps) => {
    const thumb = item.thumbnail;

    if (item.isPlaceholder) {
        return (
            <View className="w-[46%] mx-[2%] mb-6">
                <View className="w-full aspect-[16/10] bg-zinc-900 rounded-xl overflow-hidden border border-zinc-800 shadow-md mb-2">
                    <Skeleton className="w-full h-full" />
                </View>
                <View className="px-1 gap-1.5">
                    <Skeleton className="h-3.5 w-full rounded border border-zinc-800/50" />
                    <Skeleton className="h-2.5 w-1/3 rounded border border-zinc-800/50" />
                </View>
            </View>
        );
    }

    const episodeNum = extractEpisode(item.filename);

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
                    <View className="absolute bottom-0 left-0 right-0 h-[3px] bg-white/50 overflow-hidden backdrop-blur-sm">
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
