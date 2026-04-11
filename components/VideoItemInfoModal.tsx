import { useTheme } from "@/context/ThemeContext";
import { Calendar, Clock, Film, Info, Play } from "lucide-react-native";
import React from "react";
import { Image, ScrollView, Text, TouchableOpacity, View } from "react-native";
import { ThemedBottomSheet } from "./ThemedBottomSheet";

interface VideoInfoModalProps {
    visible: boolean;
    video: any;
    onClose: () => void;
    onPlay: (video: any) => void;
}

export const VideoItemInfoModal: React.FC<VideoInfoModalProps> = ({ visible, video, onClose, onPlay }) => {
    const { theme } = useTheme();

    if (!video) return null;

    return (
        <ThemedBottomSheet isVisible={visible} onClose={onClose}>
            <View className="p-6 pb-2">
                <View className="flex-row items-center gap-5 mb-6">
                    {video.thumbnail ? (
                        <Image
                            source={{ uri: video.thumbnail }}
                            className="w-32 aspect-video rounded-xl"
                            style={{ backgroundColor: theme.card }}
                        />
                    ) : (
                        <View
                            className="w-32 aspect-video rounded-xl justify-center items-center"
                            style={{ backgroundColor: theme.card, borderWidth: 1, borderColor: theme.border }}
                        >
                            <Film size={24} color={theme.primary} />
                        </View>
                    )}
                    <View className="flex-1">
                        <Text className="text-zinc-500 text-[10px] font-bold uppercase tracking-widest mb-1">Video Info</Text>
                        <Text style={{ color: theme.text }} className="text-xl font-bold">
                            {video.filename}
                        </Text>
                    </View>
                </View>

                <View style={{ borderBottomWidth: 1, borderColor: theme.border }} />
            </View>

            <View className="flex flex-col gap-6 p-6 pt-0">
                <ScrollView className="max-h-[250px]" contentContainerStyle={{ gap: 24, paddingBottom: 12 }}>
                    <View className="flex-row items-center gap-4">
                        <View className="w-8 h-8 rounded-full items-center justify-center bg-zinc-800">
                            <Clock size={16} color={theme.primary} />
                        </View>
                        <View>
                            <Text style={{ color: theme.secondary }} className="text-[10px] uppercase font-bold tracking-wider">
                                Total Duration
                            </Text>
                            <Text style={{ color: theme.text }} className="text-sm">
                                {Math.floor((video.duration || 0) / 60)}:
                                {Math.floor((video.duration || 0) % 60)
                                    .toString()
                                    .padStart(2, "0")}
                            </Text>
                        </View>
                    </View>

                    <View className="flex-row items-center gap-4">
                        <View className="w-8 h-8 rounded-full items-center justify-center bg-zinc-800">
                            <Calendar size={16} color={theme.primary} />
                        </View>
                        <View>
                            <Text style={{ color: theme.secondary }} className="text-[10px] uppercase font-bold tracking-wider">
                                Date Added
                            </Text>
                            <Text style={{ color: theme.text }} className="text-sm">
                                {new Date(video.creationTime || 0).toLocaleDateString(undefined, {
                                    year: "numeric",
                                    month: "short",
                                    day: "numeric",
                                    hour: "2-digit",
                                    minute: "2-digit",
                                })}
                            </Text>
                        </View>
                    </View>

                    <View className="flex-row items-center gap-4">
                        <View className="w-8 h-8 rounded-full items-center justify-center bg-zinc-800">
                            <Info size={16} color={theme.primary} />
                        </View>
                        <View>
                            <Text style={{ color: theme.secondary }} className="text-[10px] uppercase font-bold tracking-wider">
                                Properties
                            </Text>
                            <Text style={{ color: theme.text }} className="text-xs mt-1 leading-5">
                                Resolution: {video.width}x{video.height}
                                {"\n"}
                                Estimated Size:{" "}
                                {video.duration * 0.5 >= 1000
                                    ? `${((video.duration * 0.5) / 1024).toFixed(2)} GB`
                                    : `${(video.duration * 0.5).toFixed(0)} MB`}
                            </Text>
                        </View>
                    </View>
                </ScrollView>

                <View style={{ borderBottomWidth: 1, borderColor: theme.border }} />

                <View className="pb-8">
                    <TouchableOpacity
                        className="w-full bg-blue-600 rounded-xl py-3.5 items-center flex-row justify-center gap-2"
                        onPress={() => {
                            onClose();
                            onPlay(video);
                        }}
                    >
                        <Play size={16} color="white" fill="white" />
                        <Text className="text-white font-bold tracking-wide">
                            {video.lastPlayedMs && video.lastPlayedMs !== -1
                                ? `Resume ${Math.floor(video.lastPlayedMs / 60000)}:${Math.floor((video.lastPlayedMs / 1000) % 60)
                                      .toString()
                                      .padStart(2, "0")}`
                                : "Play Video"}
                        </Text>
                    </TouchableOpacity>
                </View>
            </View>
        </ThemedBottomSheet>
    );
};
