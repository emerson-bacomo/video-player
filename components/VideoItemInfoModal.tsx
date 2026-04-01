import { Calendar, Clock, Film, Info, Play, X } from "lucide-react-native";
import React from "react";
import { Image, Modal, ScrollView, Text, TouchableOpacity, TouchableWithoutFeedback, View } from "react-native";

interface VideoInfoModalProps {
    visible: boolean;
    video: any;
    onClose: () => void;
    onPlay: (video: any) => void;
}

export const VideoItemInfoModal: React.FC<VideoInfoModalProps> = ({ visible, video, onClose, onPlay }) => {
    if (!video) return null;

    return (
        <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
            <TouchableWithoutFeedback onPress={onClose}>
                <View className="flex-1 bg-black/80 justify-center items-center p-6">
                    <TouchableWithoutFeedback onPress={(e) => e.stopPropagation()}>
                        <View className="w-full bg-zinc-900 rounded-2xl border border-zinc-800 overflow-hidden shadow-2xl">
                            {video.thumbnail ? (
                                <Image source={{ uri: video.thumbnail }} className="w-full aspect-[16/9] opacity-80" />
                            ) : (
                                <View className="w-full aspect-[16/9] bg-zinc-800 justify-center items-center">
                                    <Film size={48} color="#52525b" />
                                </View>
                            )}

                            <TouchableOpacity
                                className="absolute top-3 right-3 bg-black/50 p-1.5 rounded-full"
                                onPress={onClose}
                                hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
                            >
                                <X size={16} color="white" />
                            </TouchableOpacity>

                            <View className="flex flex-col gap-6 max-h-[70vh] p-5">
                                <Text className="text-white text-lg font-bold">{video.filename}</Text>

                                <View className="h-[1px] bg-zinc-800" />

                                <ScrollView className="min-h-[200px]" contentContainerStyle={{ gap: 24, paddingBottom: 12 }}>
                                    <View className="flex-row items-center gap-3">
                                        <Clock size={16} color="#71717a" />
                                        <View>
                                            <Text className="text-zinc-500 text-[10px] uppercase font-bold tracking-wider">
                                                Total Duration
                                            </Text>
                                            <Text className="text-zinc-300 text-sm">
                                                {Math.floor((video.duration || 0) / 60)}:
                                                {Math.floor((video.duration || 0) % 60)
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

                                    <View className="flex-row items-center gap-3">
                                        <Info size={16} color="#71717a" />
                                        <View>
                                            <Text className="text-zinc-500 text-[10px] uppercase font-bold tracking-wider">
                                                Properties
                                            </Text>
                                            <Text className="text-zinc-300 text-xs mt-1 leading-5">
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

                                <View className="h-[1px] bg-zinc-800" />

                                <View className="pb-2">
                                    <TouchableOpacity
                                        className="w-full bg-blue-600 rounded-xl py-3.5 items-center flex-row justify-center gap-2"
                                        onPress={() => onPlay(video)}
                                    >
                                        <Play size={16} color="white" fill="white" />
                                        <Text className="text-white font-bold tracking-wide">
                                            {video.lastPlayedMs && video.lastPlayedMs !== -1
                                                ? `Resume ${Math.floor(video.lastPlayedMs / 60000)}:${Math.floor(
                                                      (video.lastPlayedMs / 1000) % 60,
                                                  )
                                                      .toString()
                                                      .padStart(2, "0")}`
                                                : "Play Video"}
                                        </Text>
                                    </TouchableOpacity>
                                </View>
                            </View>
                        </View>
                    </TouchableWithoutFeedback>
                </View>
            </TouchableWithoutFeedback>
        </Modal>
    );
};
