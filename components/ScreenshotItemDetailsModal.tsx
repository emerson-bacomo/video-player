import { breakPath } from "@/utils/textUtils";
import * as FileSystem from "expo-file-system/legacy";
import { Calendar, HardDrive, Image, MapPin } from "lucide-react-native";
import React, { useEffect, useState } from "react";
import { Image as RNImage, Text, View } from "react-native";
import { Icon } from "./Icon";
import { ThemedBottomSheet, ThemedBottomSheetScrollView } from "./ThemedBottomSheet";

interface ScreenshotItemDetailsModalProps {
    visible: boolean;
    screenshot: { id: string; uri: string; filename: string } | null;
    onClose: () => void;
}

export const ScreenshotItemDetailsModal: React.FC<ScreenshotItemDetailsModalProps> = ({
    visible,
    screenshot,
    onClose,
}) => {
    const [fileSize, setFileSize] = useState<number | null>(null);
    const [modificationTime, setModificationTime] = useState<number | null>(null);
    const [dimensions, setDimensions] = useState<{ width: number; height: number } | null>(null);

    useEffect(() => {
        if (!visible || !screenshot) return;

        setFileSize(null);
        setModificationTime(null);
        setDimensions(null);

        FileSystem.getInfoAsync(screenshot.uri).then((info) => {
            if (info.exists) {
                setFileSize((info as any).size ?? null);
                setModificationTime((info as any).modificationTime ?? null);
            }
        });

        RNImage.getSize(
            screenshot.uri,
            (width, height) => setDimensions({ width, height }),
            () => {},
        );
    }, [visible, screenshot]);

    if (!screenshot) return null;

    const formatSize = (size?: number | null) => {
        if (!size || size === 0) return "---";
        if (size >= 1024 * 1024 * 1024) return `${(size / (1024 * 1024 * 1024)).toFixed(2)} GB`;
        if (size >= 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} MB`;
        return `${(size / 1024).toFixed(1)} KB`;
    };

    const cleanPath = screenshot.uri
        ? screenshot.uri.includes("/0/")
            ? (screenshot.uri.split("/0/").pop() ?? screenshot.uri)
            : screenshot.uri
        : "---";

    return (
        <ThemedBottomSheet isVisible={visible} onClose={onClose}>
            <ThemedBottomSheetScrollView contentContainerStyle={{ paddingBottom: 24 }}>
                <View className="p-6 pb-2">
                    <View className="flex-row items-center gap-5 mb-6">
                        <RNImage
                            source={{ uri: screenshot.uri }}
                            className="w-32 aspect-square rounded-xl bg-card"
                        />
                        <View className="flex-1">
                            <Text className="text-zinc-500 text-xs font-bold uppercase tracking-widest mb-1">
                                Screenshot Metadata
                            </Text>
                            <Text className="text-text text-xl font-bold">{screenshot.filename}</Text>
                        </View>
                    </View>

                    <View className="border-b border-border" />
                </View>

                <View className="px-6 gap-6">
                    <View className="flex-row items-center gap-4">
                        <View className="w-8 h-8 rounded-full items-center justify-center bg-zinc-800">
                            <Icon icon={Image} size={16} className="text-primary" />
                        </View>
                        <View>
                            <Text className="text-secondary text-xs uppercase font-bold tracking-wider">Dimensions</Text>
                            <Text className="text-text text-sm">
                                {dimensions ? `${dimensions.width} × ${dimensions.height}` : "Loading..."}
                            </Text>
                        </View>
                    </View>

                    <View className="flex-row items-center gap-4">
                        <View className="w-8 h-8 rounded-full items-center justify-center bg-zinc-800">
                            <Icon icon={HardDrive} size={16} className="text-primary" />
                        </View>
                        <View>
                            <Text className="text-secondary text-xs uppercase font-bold tracking-wider">File Size</Text>
                            <Text className="text-text text-sm">{formatSize(fileSize)}</Text>
                        </View>
                    </View>

                    <View className="flex-row items-center gap-4">
                        <View className="w-8 h-8 rounded-full items-center justify-center bg-zinc-800">
                            <Icon icon={Calendar} size={16} className="text-primary" />
                        </View>
                        <View>
                            <Text className="text-secondary text-xs uppercase font-bold tracking-wider">Modified</Text>
                            <Text className="text-text text-sm">
                                {modificationTime
                                    ? new Date(modificationTime).toLocaleString(undefined, {
                                          year: "numeric",
                                          month: "short",
                                          day: "numeric",
                                          hour: "2-digit",
                                          minute: "2-digit",
                                      })
                                    : "---"}
                            </Text>
                        </View>
                    </View>

                    <View className="flex-row items-center gap-4">
                        <View className="w-8 h-8 rounded-full items-center justify-center bg-zinc-800">
                            <Icon icon={MapPin} size={16} className="text-primary" />
                        </View>
                        <View className="flex-1">
                            <Text className="text-secondary text-xs uppercase font-bold tracking-wider">File Path</Text>
                            <Text className="text-text text-xs mt-1 leading-5" numberOfLines={2}>
                                {breakPath(cleanPath)}
                            </Text>
                        </View>
                    </View>
                </View>
            </ThemedBottomSheetScrollView>
        </ThemedBottomSheet>
    );
};
