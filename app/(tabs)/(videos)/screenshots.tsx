import React, { useState, useEffect } from "react";
import {
    View,
    Text,
    FlatList,
    Image,
    TouchableOpacity,
    Modal,
    useWindowDimensions,
    Alert,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Trash2, X, Image as ImageIcon } from "lucide-react-native";
import * as FileSystem from "expo-file-system/legacy";
import { useMedia } from "@/hooks/useMedia";
import { useSafeNavigation } from "@/hooks/useSafeNavigation";
import { Header } from "@/components/Header";
import { Icon } from "@/components/Icon";
import { ThemedView } from "@/components/Themed";

const ScreenshotsScreen = () => {
    const { screenshots, screenshotsCount, fetchScreenshots } = useMedia();
    const insets = useSafeAreaInsets();
    const { safeBack } = useSafeNavigation();
    const { width: windowWidth } = useWindowDimensions();

    const [selectedPhoto, setSelectedPhoto] = useState<{ id: string; uri: string; filename: string } | null>(null);

    // Responsive columns
    const numColumns = Math.max(3, Math.floor(windowWidth / 120));
    const itemSize = (windowWidth - 24) / numColumns;

    useEffect(() => {
        fetchScreenshots();
    }, [fetchScreenshots]);

    const handleDelete = async (photo: { id: string; uri: string }) => {
        Alert.alert(
            "Delete Screenshot",
            "Are you sure you want to permanently delete this screenshot?",
            [
                { text: "Cancel", style: "cancel" },
                {
                    text: "Delete",
                    style: "destructive",
                    onPress: async () => {
                        try {
                            await FileSystem.deleteAsync(photo.uri, { idempotent: true });
                            setSelectedPhoto(null);
                            await fetchScreenshots();
                        } catch (err) {
                            console.error("[ScreenshotsScreen] Failed to delete screenshot", err);
                            Alert.alert("Error", "Could not delete screenshot file.");
                        }
                    },
                },
            ],
            { cancelable: true }
        );
    };

    return (
        <ThemedView className="flex-1" style={{ paddingTop: insets.top }}>
            <StatusBar style="light" />

            <Header>
                <View className="flex-row items-center flex-1 gap-3">
                    <Header.Back onPress={safeBack} />
                    <Header.Title title="Screenshots" subtitle={`${screenshotsCount} Images`} />
                </View>
            </Header>

            {screenshotsCount === 0 ? (
                <View className="flex-1 justify-center items-center py-20">
                    <Icon icon={ImageIcon} size={64} className="text-border/50" />
                    <Text className="text-secondary mt-4 text-center">No screenshots captured yet</Text>
                </View>
            ) : (
                <FlatList
                    data={screenshots}
                    keyExtractor={(item) => item.id}
                    numColumns={numColumns}
                    key={numColumns}
                    contentContainerStyle={{ paddingHorizontal: 8, paddingTop: 16, paddingBottom: 32 }}
                    renderItem={({ item }) => (
                        <TouchableOpacity
                            onPress={() => setSelectedPhoto(item)}
                            activeOpacity={0.8}
                            style={{ width: itemSize, height: itemSize, margin: 4 }}
                            className="rounded-lg overflow-hidden bg-card border border-border"
                        >
                            <Image
                                source={{ uri: item.uri }}
                                style={{ width: "100%", height: "100%" }}
                                resizeMode="cover"
                            />
                        </TouchableOpacity>
                    )}
                />
            )}

            {/* Fullscreen Photo Viewer Modal */}
            <Modal
                visible={!!selectedPhoto}
                transparent={true}
                animationType="fade"
                onRequestClose={() => setSelectedPhoto(null)}
            >
                <View className="flex-1 bg-black justify-between" style={{ paddingTop: insets.top, paddingBottom: insets.bottom || 16 }}>
                    <StatusBar style="light" />

                    {/* Top Bar */}
                    <View className="flex-row items-center justify-between px-4 py-3 z-10">
                        <TouchableOpacity
                            onPress={() => setSelectedPhoto(null)}
                            className="w-10 h-10 items-center justify-center rounded-full bg-zinc-900/80"
                        >
                            <Icon icon={X} size={22} className="text-text" />
                        </TouchableOpacity>

                        <Text className="text-text font-semibold text-sm flex-1 text-center px-4" numberOfLines={1}>
                            {selectedPhoto?.filename}
                        </Text>

                        <TouchableOpacity
                            onPress={() => selectedPhoto && handleDelete(selectedPhoto)}
                            className="w-10 h-10 items-center justify-center rounded-full bg-zinc-900/80"
                        >
                            <Icon icon={Trash2} size={20} className="text-error" />
                        </TouchableOpacity>
                    </View>

                    {/* Main Image */}
                    <View className="flex-1 justify-center items-center px-2">
                        {selectedPhoto && (
                            <Image
                                source={{ uri: selectedPhoto.uri }}
                                style={{ width: "100%", height: "80%" }}
                                resizeMode="contain"
                            />
                        )}
                    </View>
                </View>
            </Modal>
        </ThemedView>
    );
};

export default ScreenshotsScreen;
