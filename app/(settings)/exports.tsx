import { ConfirmationModal } from "@/components/ConfirmationModal";
import { Header } from "@/components/Header";
import { ThemedSafeAreaView } from "@/components/Themed";
import { useMedia } from "@/hooks/useMedia";
import { useSettings } from "@/hooks/useSettings";
import { applyConfigData } from "@/utils/configManager";
import { deleteVpcExportDb, getVpcExportsDb, VpcExport } from "@/utils/db";
import { format } from "date-fns";
import { router, Stack } from "expo-router";
import { AlertTriangle, CheckCircle2, ChevronRight, Clock, FileJson, RotateCcw, Trash2, XCircle } from "lucide-react-native";
import React, { useCallback, useEffect, useState } from "react";
import { FlatList, ScrollView, Text, TouchableOpacity, View } from "react-native";
import Animated, { FadeInRight, FadeOutLeft } from "react-native-reanimated";

export default function ExportViewerScreen() {
    const [exports, setExports] = useState<VpcExport[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedExport, setSelectedExport] = useState<VpcExport | null>(null);
    const [modalConfig, setModalConfig] = useState<{
        visible: boolean;
        title: string;
        message: string;
        confirmText?: string;
        variant?: "default" | "destructive" | "success" | "warning";
        icon?: any;
        onConfirm: () => void;
        hideCancel?: boolean;
    }>({
        visible: false,
        title: "",
        message: "",
        onConfirm: () => {},
    });
    const { loadDataFromDB } = useMedia();
    const { updateSettings } = useSettings();

    const loadExports = useCallback(async () => {
        setLoading(true);
        try {
            const data = getVpcExportsDb();
            // Removed automatic pruning as it might fail for SAF paths and we can still restore from DB JSON
            setExports(data);
        } catch (e) {
            console.error("Failed to load exports", e);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadExports();
    }, [loadExports]);

    const handleDelete = (item: VpcExport) => {
        setModalConfig({
            visible: true,
            title: "Delete Export Entry",
            message: "This will remove the entry from the app's history. The file itself will not be deleted.",
            confirmText: "Delete",
            variant: "destructive",
            icon: Trash2,
            onConfirm: () => {
                deleteVpcExportDb(item.id);
                setExports((prev) => prev.filter((e) => e.id !== item.id));
                if (selectedExport?.id === item.id) setSelectedExport(null);
                setModalConfig((prev) => ({ ...prev, visible: false }));
            },
        });
    };

    const handleRestore = (item: VpcExport) => {
        setModalConfig({
            visible: true,
            title: "Restore Backup?",
            message: "This will overwrite your current settings, themes, and media metadata. This action cannot be undone.",
            confirmText: "Yes, Restore",
            variant: "destructive",
            icon: RotateCcw,
            onConfirm: async () => {
                try {
                    const config = JSON.parse(item.config_json);
                    await applyConfigData(config, updateSettings);

                    setModalConfig((prev) => ({ ...prev, visible: false }));

                    setTimeout(() => {
                        loadDataFromDB();
                        setModalConfig({
                            visible: true,
                            title: "Success",
                            message: "Configuration restored from backup. Library refreshed.",
                            confirmText: "OK",
                            variant: "success",
                            icon: CheckCircle2,
                            hideCancel: true,
                            onConfirm: () => setModalConfig((prev) => ({ ...prev, visible: false })),
                        });
                    }, 500);
                } catch (e) {
                    setModalConfig({
                        visible: true,
                        title: "Error",
                        message: "Failed to restore backup.",
                        confirmText: "Close",
                        variant: "destructive",
                        icon: XCircle,
                        hideCancel: true,
                        onConfirm: () => setModalConfig((prev) => ({ ...prev, visible: false })),
                    });
                    console.error("Restore failed", e);
                }
            },
        });
    };

    const renderItem = ({ item, index }: { item: VpcExport; index: number }) => (
        <Animated.View entering={FadeInRight.delay(index * 50)} exiting={FadeOutLeft} className="mb-3 px-4">
            <TouchableOpacity
                activeOpacity={0.7}
                onPress={() => setSelectedExport(item)}
                className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 flex-row items-center gap-4"
            >
                <View className="bg-blue-500/10 p-3 rounded-full">
                    <FileJson size={24} color="#3b82f6" />
                </View>

                <View className="flex-1">
                    <Text className="text-zinc-100 font-bold text-base" numberOfLines={1}>
                        {item.filename}
                    </Text>
                    <View className="flex-row items-center gap-1 mt-1">
                        <Clock size={12} color="#71717a" />
                        <Text className="text-zinc-500 text-xs">{format(item.timestamp, "MMM d, yyyy · h:mm a")}</Text>
                    </View>
                </View>

                <ChevronRight size={20} color="#3f3f46" />
            </TouchableOpacity>
        </Animated.View>
    );

    return (
        <ThemedSafeAreaView className="flex-1 bg-black">
            <Stack.Screen options={{ headerShown: false }} />

            <Header>
                <Header.Back onPress={() => (selectedExport ? setSelectedExport(null) : router.back())} />
                <Header.Title
                    title={selectedExport ? "Export Details" : "Export History"}
                    subtitle={selectedExport ? selectedExport.filename : "Previous configuration backups"}
                />
            </Header>

            {selectedExport ? (
                <View className="flex-1 p-4">
                    <View className="flex-row items-center justify-between mb-4">
                        <Text className="text-zinc-500 text-xs font-bold uppercase tracking-widest">Config Content</Text>
                        <View className="flex-row gap-2">
                            <TouchableOpacity
                                onPress={() => handleRestore(selectedExport)}
                                className="bg-blue-600 p-2 px-4 rounded-xl flex-row items-center gap-2"
                            >
                                <RotateCcw size={16} color="white" />
                                <Text className="text-white font-bold">Restore</Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                                onPress={() => handleDelete(selectedExport)}
                                className="bg-red-500/10 p-2 rounded-xl border border-red-500/20"
                            >
                                <Trash2 size={20} color="#ef4444" />
                            </TouchableOpacity>
                        </View>
                    </View>

                    <View className="bg-zinc-900 rounded-3xl border border-zinc-800 flex-1 overflow-hidden">
                        <View className="p-4 border-b border-zinc-800 bg-zinc-900/50">
                            <Text className="text-zinc-100 font-bold">{selectedExport.filename}</Text>
                            <Text className="text-zinc-500 text-xs break-all mt-1">{selectedExport.filepath}</Text>
                        </View>

                        <ScrollView className="flex-1 p-4">
                            <Text className="text-zinc-400 font-mono text-xs">{selectedExport.config_json}</Text>
                        </ScrollView>
                    </View>
                </View>
            ) : (
                <FlatList
                    data={exports}
                    keyExtractor={(item) => item.id.toString()}
                    renderItem={renderItem}
                    contentContainerStyle={{ paddingVertical: 20 }}
                    ListEmptyComponent={
                        !loading ? (
                            <View className="flex-1 items-center justify-center py-20 px-10">
                                <View className="bg-zinc-900 p-6 rounded-full mb-4">
                                    <AlertTriangle size={48} color="#3f3f46" />
                                </View>
                                <Text className="text-zinc-100 font-bold text-lg text-center">No backups found</Text>
                                <Text className="text-zinc-500 text-sm mt-2 text-center">
                                    Your exported configuration files will appear here automatically.
                                </Text>
                            </View>
                        ) : null
                    }
                    ListHeaderComponent={
                        <View className="px-4 mb-6">
                            <View className="bg-zinc-900/50 p-4 rounded-2xl border border-white/5">
                                <Text className="text-zinc-400 text-xs leading-relaxed">
                                    This history tracks your manual exports. You can restore your settings and media metadata even
                                    if the original .vpc file was deleted from your storage.
                                </Text>
                            </View>
                        </View>
                    }
                    onRefresh={loadExports}
                    refreshing={loading}
                />
            )}

            <ConfirmationModal {...modalConfig} onClose={() => setModalConfig((prev) => ({ ...prev, visible: false }))} />
        </ThemedSafeAreaView>
    );
}
