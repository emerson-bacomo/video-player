import { Image as ImageIcon, MoreVertical } from "lucide-react-native";
import React, { memo, useState } from "react";
import { Image, Pressable, Text, TouchableOpacity, View } from "react-native";
import { Icon } from "./Icon";
import { Skeleton } from "./Skeleton";

interface ScreenshotItemProps {
    item: { id: string; uri: string; filename: string };
    width?: number;
    onPress?: (item: { id: string; uri: string; filename: string }) => void;
    onMenuPress?: (item: { id: string; uri: string; filename: string }) => void;
}

export const ScreenshotItemSkeleton = memo(({ width }: { width?: number }) => (
    <View className="px-2 mb-6" style={width ? { width } : { flex: 1 }}>
        <View className="w-full aspect-square bg-card rounded-xl overflow-hidden border border-border/50 shadow-md mb-2">
            <Skeleton className="w-full h-full" />
        </View>
        <View className="px-1 gap-1.5">
            <Skeleton className="h-3.5 w-full rounded border border-border/50" />
        </View>
    </View>
));

ScreenshotItemSkeleton.displayName = "ScreenshotItemSkeleton";

export const ScreenshotItem = memo(
    ({ item, width, onPress, onMenuPress }: ScreenshotItemProps) => {
        const [imageError, setImageError] = useState(false);

        return (
            <View className="px-2 mb-6" style={width ? { width } : { flex: 1 }}>
                <TouchableOpacity
                    activeOpacity={0.8}
                    className="w-full aspect-square bg-card rounded-xl overflow-hidden border border-border shadow-md mb-2"
                    onPress={() => onPress?.(item)}
                >
                    {!imageError ? (
                        <Image
                            source={{ uri: item.uri }}
                            className="w-full h-full object-cover"
                            onError={() => setImageError(true)}
                        />
                    ) : (
                        <View className="w-full h-full justify-center items-center">
                            <ImageIcon size={24} color="#52525b" />
                        </View>
                    )}
                </TouchableOpacity>

                <View className="flex-row items-start justify-between px-1">
                    <Pressable
                        onPress={() => onPress?.(item)}
                        className="flex-1 mr-2 py-0.5 active:opacity-50"
                    >
                        <Text className="text-text text-xs font-medium" numberOfLines={1}>
                            {item.filename}
                        </Text>
                    </Pressable>

                    <TouchableOpacity
                        activeOpacity={0.7}
                        onPress={() => onMenuPress?.(item)}
                        className="w-8 h-8 -mr-1 items-center justify-center rounded-full active:bg-white/10"
                    >
                        <Icon icon={MoreVertical} size={16} className="text-secondary" />
                    </TouchableOpacity>
                </View>
            </View>
        );
    },
);

ScreenshotItem.displayName = "ScreenshotItem";
