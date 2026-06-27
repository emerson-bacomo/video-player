import { cn } from "@/utils/cn";
import { Icon } from "@/components/Icon";
import { ThemedBottomSheet, ThemedBottomSheetScrollView } from "@/components/ThemedBottomSheet";
import { LucideIcon, Film } from "lucide-react-native";
import React from "react";
import { Image, Text, TouchableOpacity, View } from "react-native";

export interface AlbumItemAction {
    label: string;
    icon: LucideIcon;
    onPress: (close: () => void) => void;
    destructive?: boolean;
}

interface AlbumItemMenuProps {
    visible: boolean;
    title: string;
    imageUri?: string | null;
    onClose: () => void;
    actions: AlbumItemAction[];
}

export const AlbumItemMenu = ({ visible, title, imageUri, onClose, actions }: AlbumItemMenuProps) => {
    return (
        <ThemedBottomSheet isVisible={visible} onClose={onClose}>
            <ThemedBottomSheetScrollView contentContainerStyle={{ paddingBottom: 24, paddingHorizontal: 8 }}>
                <View className="px-4 py-4 mb-2 flex-row items-center gap-4">
                    <View className="w-16 h-10 rounded-lg bg-card overflow-hidden border border-border">
                        {imageUri ? (
                            <Image source={{ uri: imageUri }} className="w-full h-full object-cover" />
                        ) : (
                            <View className="w-full h-full justify-center items-center">
                                <Icon icon={Film} size={20} className="text-secondary" />
                            </View>
                        )}
                    </View>
                    <View className="flex-1">
                        <Text className="text-text font-bold text-lg" numberOfLines={1}>
                            {title}
                        </Text>
                    </View>
                </View>

                {actions.map((act, idx) => (
                    <TouchableOpacity
                        key={idx}
                        className="flex-row items-center px-4 py-4 gap-4"
                        onPress={() => {
                            act.onPress(onClose);
                        }}
                    >
                        <Icon icon={act.icon} size={22} className={act.destructive ? "text-error" : "text-secondary"} />
                        <Text className={cn("text-base font-medium", act.destructive ? "text-error" : "text-text")}>
                            {act.label}
                        </Text>
                    </TouchableOpacity>
                ))}
            </ThemedBottomSheetScrollView>
        </ThemedBottomSheet>
    );
};
