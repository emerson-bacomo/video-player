import { Header } from "@/components/Header";
import { ThemedSafeAreaView } from "@/components/Themed";
import { VpcPreview } from "@/components/VpcPreview";
import { useSettings } from "@/hooks/useSettings";
import { exportConfig, generateConfigData } from "@/utils/configManager";
import { getSettingDb, saveSettingDb } from "@/utils/db";
import { router, Stack } from "expo-router";
import { Database } from "lucide-react-native";
import React, { useEffect, useMemo, useState } from "react";
import { Text, TouchableOpacity, View } from "react-native";
import { toast } from "sonner-native";

import { DestinationPicker } from "@/components/DestinationPicker";

export default function ExportVpcPreviewScreen() {
    const { settings } = useSettings();
    const [exporting, setExporting] = useState(false);
    const [directoryUri, setDirectoryUri] = useState<string | null>(getSettingDb("lastExportDirectoryUri"));
    const [displayPath, setDisplayPath] = useState<string | null>(getSettingDb("lastExportDirectory"));

    const configData = useMemo(() => generateConfigData(settings), [settings]);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

    useEffect(() => {
        if (configData) {
            const ids = new Set<string>();
            ids.add("settings");
            configData.themes.forEach((t) => ids.add(`theme:${t.name}`));
            configData.videos.forEach((v) => ids.add(`video:${v.uri}`));
            configData.albums.forEach((a) => ids.add(`album:${a.uri}`));
            setSelectedIds(ids);
        }
    }, [configData]);

    const handleToggleId = (id: string) => {
        const next = new Set(selectedIds);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        setSelectedIds(next);
    };

    const handleStartExport = async () => {
        if (!directoryUri) {
            toast.error("Please select an export directory first.");
            return;
        }
        setExporting(true);
        try {
            // Filter configData based on selection
            const filteredConfig = {
                settings: selectedIds.has("settings") ? configData.settings : {},
                themes: configData.themes.filter((t) => selectedIds.has(`theme:${t.name}`)),
                videos: configData.videos.filter((v) => selectedIds.has(`video:${v.uri}`)),
                albums: configData.albums.filter((a) => selectedIds.has(`album:${a.uri}`)),
            };

            const res = await exportConfig(settings, filteredConfig);
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
                Your export will include all current settings, theme presets, media metadata (last played, hidden status), and
                custom markers. This file (.vpc) can be used to restore your library state later.
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

            <View className="px-4 py-3 bg-zinc-900/50 border-b border-border">
                <DestinationPicker
                    value={displayPath || ""}
                    placeholder="Select Export Directory..."
                    onChange={(uri, path) => {
                        setDirectoryUri(uri);
                        setDisplayPath(path);
                        saveSettingDb("lastExportDirectoryUri", uri);
                        saveSettingDb("lastExportDirectory", path);
                    }}
                />
            </View>

            <VpcPreview
                configData={configData}
                ListHeaderComponent={headerComponent}
                selectedIds={selectedIds}
                onToggleId={handleToggleId}
            />
        </ThemedSafeAreaView>
    );
}
