import { Header } from "@/components/Header";
import { ThemedSafeAreaView } from "@/components/Themed";
import { VpcPreview } from "@/components/VpcPreview";
import { useMediaStoreLoadData } from "@/hooks/MediaStoreBridge/useMediaStoreLoadData";
import { useSettings } from "@/hooks/useSettings";

import { applyConfigData, getPendingImportData, setPendingImportData } from "@/utils/configManager";
import { router, Stack } from "expo-router";
import { Database } from "lucide-react-native";
import React, { useEffect, useState } from "react";
import { Text, TouchableOpacity, View } from "react-native";
import { toast } from "sonner-native";

export default function ImportVpcPreviewScreen() {
    const { updateSettings } = useSettings();
    const { loadDataFromDB } = useMediaStoreLoadData();
    const [importing, setImporting] = useState(false);
    const [configData] = useState(getPendingImportData());
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

    useEffect(() => {
        if (!configData) {
            toast.error("No import data found.");
            router.back();
        }
    }, [configData]);

    if (!configData) return null;

    const handleStartImport = async () => {
        setImporting(true);
        try {
            // Filter configData based on selection
            const filteredConfig = {
                settings: selectedIds.has("settings") ? configData.settings : {},
                themes: configData.themes.filter((t) => selectedIds.has(`theme:${t.name}`)),
                videos: configData.videos.filter((v) => selectedIds.has(`video:${v.uri}`)),
                albums: configData.albums.filter((a) => selectedIds.has(`album:${a.uri}`)),
            };

            await applyConfigData(filteredConfig, updateSettings, loadDataFromDB);

            toast.success("Configuration imported successfully!");
            setPendingImportData(null);

            router.back();
        } catch (error: any) {
            toast.error("Import failed: " + error.message);
        } finally {
            setImporting(false);
        }
    };


    const headerComponent = (
        <View className="p-4 bg-amber-500/10 m-4 rounded-2xl border border-amber-500/20">
            <View className="flex-row items-center gap-2 mb-2">
                <Database size={20} color="#f59e0b" />
                <Text className="text-amber-400 font-bold">Import Warning</Text>
            </View>
            <Text className="text-amber-100/70 text-sm leading-relaxed">
                Importing this file will overwrite existing settings, theme presets, and media metadata for matching videos. 
                New themes and markers will be added. This action cannot be undone.
            </Text>
        </View>
    );

    return (
        <ThemedSafeAreaView className="flex-1 bg-black">
            <Stack.Screen options={{ title: "Import VPC", headerShown: false }} />

            <Header>
                <Header.Back onPress={() => router.back()} />
                <Header.Title
                    title="Import VPC"
                    subtitle={`${configData.videos.length} videos, ${configData.albums.length} albums`}
                />
                <Header.Actions>
                    <TouchableOpacity
                        onPress={handleStartImport}
                        disabled={importing}
                        className="bg-primary px-4 py-2 rounded-full flex-row items-center gap-2"
                    >
                        {importing ? (
                            <Text className="text-white font-bold">...</Text>
                        ) : (
                            <Text className="text-white font-bold">Apply Import</Text>
                        )}
                    </TouchableOpacity>
                </Header.Actions>
            </Header>

            <VpcPreview
                configData={configData}
                ListHeaderComponent={headerComponent}
                selectedIds={selectedIds}
                onToggleId={handleToggleId}
            />
        </ThemedSafeAreaView>
    );
}
