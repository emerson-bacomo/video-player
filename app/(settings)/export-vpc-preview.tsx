import { Header } from "@/components/Header";
import { Icon } from "@/components/Icon";
import { ThemedSafeAreaView } from "@/components/Themed";
import { VpcPreview } from "@/components/VpcPreview";
import { useSettings } from "@/hooks/useSettings";
import { normalizeClipDestination } from "@/utils/clipDestination";
import { exportConfig, generateConfigData } from "@/utils/configManager";
import { getSettingDb, saveSettingDb } from "@/utils/db";
import * as FileSystem from "expo-file-system/legacy";
import { router, Stack } from "expo-router";
import { Database, FolderOpen, X } from "lucide-react-native";
import React, { useMemo, useState } from "react";
import { Text, TouchableOpacity, View } from "react-native";
import { toast } from "sonner-native";

export default function ExportVpcPreviewScreen() {
    const { settings } = useSettings();
    const [exporting, setExporting] = useState(false);
    const [directoryUri, setDirectoryUri] = useState<string | null>(getSettingDb("lastExportDirectoryUri"));
    const [displayPath, setDisplayPath] = useState<string | null>(getSettingDb("lastExportDirectory"));

    const configData = useMemo(() => generateConfigData(settings), [settings]);

    const pickDirectory = async () => {
        try {
            const result = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
            if (result.granted) {
                const uri = result.directoryUri;
                const normalized = normalizeClipDestination(uri) ?? uri;
                setDirectoryUri(uri);
                setDisplayPath(normalized);
                saveSettingDb("lastExportDirectoryUri", uri);
                saveSettingDb("lastExportDirectory", normalized);
            }
        } catch (e) {
            console.error("Failed to pick directory", e);
        }
    };

    const handleStartExport = async () => {
        if (!directoryUri) {
            toast.error("Please select an export directory first.");
            return;
        }
        setExporting(true);
        try {
            const res = await exportConfig(settings);
            if (res.success) {
                toast.success("Configuration exported successfully!");
                router.back();
            } else if (!res.cancelled) {
                toast.error("Export failed. Check logs.");
            }
        } finally {
            setExporting(false);
        }
    };

    const headerComponent = (
        <View className="p-4 bg-blue-500/10 m-4 rounded-2xl border border-blue-500/20">
            <View className="flex-row items-center gap-2 mb-2">
                <Database size={20} color="#3b82f6" />
                <Text className="text-blue-400 font-bold">Export Summary</Text>
            </View>
            <Text className="text-blue-100/70 text-sm leading-relaxed">
                Your export will include all current settings, theme presets, media metadata (last played, hidden
                status), and custom markers. This file (.vpc) can be used to restore your library state later.
            </Text>
        </View>
    );

    return (
        <ThemedSafeAreaView className="flex-1 bg-black">
            <Stack.Screen options={{ title: "Export VPC", headerShown: false }} />

            <Header>
                <Header.Back onPress={() => router.back()} />
                <Header.Title
                    title="Export VPC"
                    subtitle={`${configData.videos.length} videos, ${configData.albums.length} albums`}
                />
                <Header.Actions>
                    <TouchableOpacity
                        onPress={handleStartExport}
                        disabled={exporting}
                        className="bg-primary px-4 py-2 rounded-full flex-row items-center gap-2"
                    >
                        {exporting ? (
                            <Text className="text-white font-bold">...</Text>
                        ) : (
                            <Text className="text-white font-bold">Export</Text>
                        )}
                    </TouchableOpacity>
                </Header.Actions>
            </Header>

            {/* Top Bar - Directory Picker */}
            <View className="px-4 py-3 bg-zinc-900/50 border-b border-border flex-row items-center gap-3">
                <View className="flex-1 flex-row items-center bg-zinc-800/50 rounded-xl border border-white/5 overflow-hidden">
                    <TouchableOpacity onPress={pickDirectory} className="flex-1 flex-row items-center px-4 py-3 gap-3">
                        <FolderOpen size={20} color="#a1a1aa" />
                        <Text className="flex-1 text-zinc-100 text-sm" numberOfLines={1}>
                            {displayPath || "Select Export Directory..."}
                        </Text>
                    </TouchableOpacity>

                    {directoryUri && (
                        <TouchableOpacity
                            onPress={() => {
                                setDirectoryUri(null);
                                setDisplayPath(null);
                                saveSettingDb("lastExportDirectoryUri", "");
                                saveSettingDb("lastExportDirectory", "");
                            }}
                            className="px-4 py-3"
                        >
                            <Icon icon={X} size={18} className="text-error" />
                        </TouchableOpacity>
                    )}
                </View>
            </View>

            <VpcPreview configData={configData} ListHeaderComponent={headerComponent} />
        </ThemedSafeAreaView>
    );
}
