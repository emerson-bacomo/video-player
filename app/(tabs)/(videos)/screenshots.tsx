import { Header } from "@/components/Header";
import { Icon } from "@/components/Icon";
import { RenameModal } from "@/components/RenameModal";
import { ScreenshotItem, ScreenshotItemSkeleton } from "@/components/ScreenshotItem";
import { ScreenshotItemDetailsModal } from "@/components/ScreenshotItemDetailsModal";
import { ThemedView } from "@/components/Themed";
import { ThemedBottomSheet, ThemedBottomSheetScrollView } from "@/components/ThemedBottomSheet";
import { useMedia } from "@/hooks/useMedia";
import { useSafeNavigation } from "@/hooks/useSafeNavigation";
import { StatusBar } from "expo-status-bar";
import { Edit2, FolderInput, Image as ImageIcon, Info, Trash2 } from "lucide-react-native";
import React, { useEffect, useMemo, useState } from "react";
import { Alert, FlatList, RefreshControl, Text, TouchableOpacity, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const ScreenshotsScreen = () => {
    const { screenshots, screenshotsCount, fetchScreenshots, deleteMultipleImages } = useMedia();
    const insets = useSafeAreaInsets();
    const { safeBack } = useSafeNavigation();
    const { width: windowWidth } = useWindowDimensions();
    const [listWidth, setListWidth] = useState(windowWidth);
    const numColumns = Math.max(2, Math.floor(listWidth / 180));
    const itemWidth = (listWidth - 16) / numColumns;

    const [selectedScreenshot, setSelectedScreenshot] = useState<{ id: string; uri: string; filename: string } | null>(null);
    const [menuScreenshot, setMenuScreenshot] = useState<{ id: string; uri: string; filename: string } | null>(null);
    const [renamingScreenshot, setRenamingScreenshot] = useState<{ id: string; uri: string; filename: string } | null>(null);

    useEffect(() => {
        fetchScreenshots();
    }, [fetchScreenshots]);

    const handleDelete = (screenshot: { id: string; uri: string }) => {
        setMenuScreenshot(null);
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
                            const success = await deleteMultipleImages([screenshot.uri]);
                            if (!success) {
                                Alert.alert("Error", "Could not delete screenshot file.");
                            }
                            setSelectedScreenshot(null);
                            await fetchScreenshots();
                        } catch (err) {
                            console.error("[ScreenshotsScreen] Failed to delete screenshot", err);
                            Alert.alert("Error", "Could not delete screenshot file.");
                        }
                    },
                },
            ],
            { cancelable: true },
        );
    };

    const handleRename = async (newName: string) => {
        if (!renamingScreenshot) return;
        const oldUri = renamingScreenshot.uri;
        const basePath = oldUri.substring(0, oldUri.lastIndexOf("/"));
        const ext = renamingScreenshot.filename.includes(".") ? renamingScreenshot.filename.split(".").pop() : "";
        const newUri = `${basePath}/${newName}${ext ? `.${ext}` : ""}`;

        try {
            await FileSystem.moveAsync({ from: oldUri, to: newUri });
            setRenamingScreenshot(null);
            await fetchScreenshots();
        } catch (err) {
            console.error("[ScreenshotsScreen] Failed to rename screenshot", err);
            Alert.alert("Error", "Could not rename screenshot file.");
        }
    };

    const skeletonData = useMemo(() => Array.from({ length: 10 }).map((_, i) => ({ id: `skel-${i}`, isPlaceholder: true })), []);

    const isEmpty = screenshotsCount === 0;

    const renderItem = ({ item }: { item: any }) => {
        if (item.isPlaceholder) {
            return <ScreenshotItemSkeleton width={itemWidth} />;
        }
        return <ScreenshotItem width={itemWidth} item={item} onPress={setSelectedScreenshot} onMenuPress={setMenuScreenshot} />;
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

            <FlatList
                onLayout={(e) => setListWidth(e.nativeEvent.layout.width)}
                key={numColumns}
                data={isEmpty ? skeletonData : screenshots}
                keyExtractor={(item) => item.id}
                numColumns={numColumns}
                initialNumToRender={10}
                windowSize={5}
                removeClippedSubviews={true}
                renderItem={renderItem}
                refreshControl={
                    <RefreshControl refreshing={false} onRefresh={fetchScreenshots} tintColor="#fff" colors={["#6366f1"]} />
                }
                ListEmptyComponent={
                    !isEmpty ? null : (
                        <View className="flex-1 justify-center items-center py-20">
                            <Icon icon={ImageIcon} size={64} className="text-border/50" />
                            <Text className="text-secondary mt-4 text-center">No screenshots captured yet</Text>
                        </View>
                    )
                }
                contentContainerStyle={{ paddingHorizontal: 8, paddingTop: 16, paddingBottom: 32 }}
            />

            <ScreenshotItemDetailsModal
                visible={!!selectedScreenshot}
                screenshot={selectedScreenshot}
                onClose={() => setSelectedScreenshot(null)}
            />

            <RenameModal
                visible={!!renamingScreenshot}
                onClose={() => setRenamingScreenshot(null)}
                onRename={handleRename}
                initialValue={renamingScreenshot?.filename || ""}
                title="Rename Screenshot"
            />

            <ThemedBottomSheet isVisible={!!menuScreenshot} onClose={() => setMenuScreenshot(null)}>
                {menuScreenshot && (
                    <ThemedBottomSheetScrollView contentContainerStyle={{ paddingBottom: 24, paddingHorizontal: 8 }}>
                        <View className="px-4 py-4 mb-2 flex-row items-center gap-4">
                            <View className="w-16 h-16 rounded-lg bg-card overflow-hidden border border-border">
                                <View className="w-full h-full">
                                    <View className="w-full h-full justify-center items-center">
                                        <Icon icon={ImageIcon} size={20} className="text-secondary" />
                                    </View>
                                </View>
                            </View>
                            <View className="flex-1">
                                <Text className="text-text font-bold text-lg" numberOfLines={1}>
                                    {menuScreenshot.filename}
                                </Text>
                                <Text className="text-secondary text-xs uppercase tracking-widest mt-0.5">
                                    Screenshot Options
                                </Text>
                            </View>
                        </View>

                        <TouchableOpacity
                            className="flex-row items-center px-4 py-4 gap-4"
                            onPress={() => {
                                setMenuScreenshot(null);
                                setSelectedScreenshot(menuScreenshot);
                            }}
                        >
                            <Icon icon={Info} size={22} className="text-secondary" />
                            <Text className="text-text text-base font-medium">Info</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            className="flex-row items-center px-4 py-4 gap-4"
                            onPress={() => {
                                setMenuScreenshot(null);
                                setRenamingScreenshot(menuScreenshot);
                            }}
                        >
                            <Icon icon={Edit2} size={22} className="text-secondary" />
                            <Text className="text-text text-base font-medium">Rename</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            className="flex-row items-center px-4 py-4 gap-4"
                            onPress={() => {
                                setMenuScreenshot(null);
                                console.log("Move file", menuScreenshot.id);
                            }}
                        >
                            <Icon icon={FolderInput} size={22} className="text-secondary" />
                            <Text className="text-text text-base font-medium">Move</Text>
                        </TouchableOpacity>

                        <View className="h-[1px] bg-border/50 my-2 mx-4" />

                        <TouchableOpacity
                            className="flex-row items-center px-4 py-4 gap-4"
                            onPress={() => handleDelete(menuScreenshot)}
                        >
                            <Icon icon={Trash2} size={22} className="text-error" />
                            <Text className="text-error text-base font-medium">Delete</Text>
                        </TouchableOpacity>
                    </ThemedBottomSheetScrollView>
                )}
            </ThemedBottomSheet>
        </ThemedView>
    );
};

export default ScreenshotsScreen;
