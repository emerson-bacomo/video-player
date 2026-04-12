import { Button } from "@/components/Button";
import { Header } from "@/components/Header";
import { LoadingStatus } from "@/components/LoadingStatus";
import { useMedia } from "@/hooks/useMedia";
import { Orientation, useSettings } from "@/hooks/useSettings";
import { Directory } from "expo-file-system";
import { StatusBar } from "expo-status-bar";
import { ChevronDown, ChevronRight, FolderOpen, Info, Monitor, Palette, Smartphone, Sun } from "lucide-react-native";
import React, { useState } from "react";
import { ActivityIndicator, ScrollView, Text, TouchableOpacity, View } from "react-native";
import { ThemedSafeAreaView, ThemedCard } from "@/components/Themed";
import { useTheme } from "@/context/ThemeContext";
import { router } from "expo-router";
import { Icon } from "@/components/Icon";

const SettingsScreen = () => {
    const { settings, updateSettings, loading: settingsLoading } = useSettings();
    const { regenerateAllThumbnails, resetEverything } = useMedia();
    const { switchPreset, activePresetId, presets } = useTheme();
    const [themeDropdownOpen, setThemeDropdownOpen] = useState(false);

    if (settingsLoading) {
        return (
            <ThemedSafeAreaView className="flex-1 justify-center items-center">
                <ActivityIndicator size="large" className="text-primary" />
            </ThemedSafeAreaView>
        );
    }

    const pickDirectory = async () => {
        try {
            const directory = await Directory.pickDirectoryAsync();
            if (directory) {
                updateSettings({ clipDestination: directory.uri });
            }
        } catch (err) {
            console.warn("Failed to pick directory", err);
        }
    };

    const OrientationOption = ({ label, value, icon: LucideIconProp }: { label: string; value: Orientation; icon: any }) => {
        const isActive = settings.defaultOrientation === value;
        return (
            <TouchableOpacity
                className={`flex-1 flex-row items-center justify-center p-4 rounded-xl border gap-2 ${
                    isActive ? "bg-primary border-primary" : "bg-card border-border"
                }`}
                onPress={() => updateSettings({ defaultOrientation: value })}
            >
                <Icon icon={LucideIconProp} size={18} className={isActive ? "text-white" : "text-text"} />
                <Text className={`font-semibold ${isActive ? "text-white" : "text-text"}`}>{label}</Text>
            </TouchableOpacity>
        );
    };

    return (
        <ThemedSafeAreaView className="flex-1">
            <StatusBar style="light" />

            <Header>
                <Header.Title title="Settings" subtitle="Personalize your experience" />
                <Header.Actions>
                    <LoadingStatus />
                </Header.Actions>
            </Header>

            <ScrollView className="flex-1 px-4 py-6">
                {/* Developer Options */}
                <View className="mb-8">
                    <Text className="text-zinc-500 text-sm font-bold uppercase tracking-wider mb-4">Developer Options</Text>
                    <ThemedCard className="p-4">
                        <Text className="text-text font-semibold mb-2">Thumbnail Management</Text>
                        <Button
                            title="Regenerate All Thumbnails"
                            className="p-4 rounded-xl border bg-background border-border"
                            textClassName="font-bold text-primary"
                            onPress={async (setLoading) => {
                                try {
                                    setLoading(true);
                                    await regenerateAllThumbnails();
                                } finally {
                                    setLoading(false);
                                }
                            }}
                        />
                        <View className="h-px bg-zinc-800 my-4" />

                        <Text className="text-text font-semibold mb-2">Database Management</Text>
                        <Button
                            title="Reset Media Database"
                            className="bg-red-900/20 p-4 rounded-xl border border-red-900/30"
                            textClassName="text-red-400 font-bold"
                            onPress={async (setLoading) => {
                                try {
                                    setLoading(true);
                                    await resetEverything();
                                } finally {
                                    setLoading(false);
                                }
                            }}
                        />
                        <Text className="text-zinc-500 text-xs mt-3">
                            Wipes all cached folder/video data, playback history, and thumbnails.
                        </Text>
                    </ThemedCard>
                </View>

                {/* Clipping */}
                <View className="mb-8">
                    <Text className="text-zinc-500 text-sm font-bold uppercase tracking-wider mb-4">Clipping</Text>
                    <ThemedCard className="p-4">
                        <Text className="text-text font-semibold mb-2">Clip Destination Folder</Text>
                        <TouchableOpacity
                            className="p-4 rounded-xl border border-border bg-background flex-row items-center justify-between"
                            onPress={pickDirectory}
                        >
                            <Text className="text-text flex-1 mr-2" numberOfLines={1}>
                                {settings.clipDestination || "Select folder..."}
                            </Text>
                            <Icon icon={FolderOpen} size={20} className="text-primary" />
                        </TouchableOpacity>
                        <Text className="text-secondary text-xs mt-3">
                            Videos will be saved to this folder in your media library.
                        </Text>
                    </ThemedCard>
                </View>

                {/* Theming */}
                <View className="mb-8">
                    <Text className="text-zinc-500 text-sm font-bold uppercase tracking-wider mb-4">Theming</Text>
                    <ThemedCard className="p-4">
                        <TouchableOpacity
                            className="p-4 rounded-xl border border-border bg-background flex-row items-center justify-between mb-3"
                            onPress={() => router.push("/theme-editor")}
                        >
                            <View className="flex-row items-center gap-3">
                                <Icon icon={Palette} size={20} className="text-primary" />
                                <Text className="text-text font-semibold">Theme Editor</Text>
                            </View>
                            <Icon icon={ChevronRight} size={20} className="text-secondary" />
                        </TouchableOpacity>

                        <View
                            className="rounded-xl border border-border bg-background overflow-hidden"
                        >
                            <TouchableOpacity
                                className="p-4 flex-row items-center justify-between"
                                onPress={() => setThemeDropdownOpen((prev) => !prev)}
                            >
                                <View className="flex-row items-center gap-3">
                                    <Icon icon={Sun} size={20} className="text-primary" />
                                    <View>
                                        <Text className="text-text font-semibold">
                                            Theme Preset
                                        </Text>
                                        <Text className="text-secondary text-xs mt-1">
                                            {presets.find((preset: any) => preset.id === activePresetId)?.name || "Choose theme"}
                                        </Text>
                                    </View>
                                </View>
                                <Icon
                                    icon={ChevronDown}
                                    size={18}
                                    className="text-secondary"
                                    style={{ transform: [{ rotate: themeDropdownOpen ? "180deg" : "0deg" }] }}
                                />
                            </TouchableOpacity>

                            {themeDropdownOpen && (
                                <View className="border-t border-border">
                                    {presets.map((preset: any) => {
                                        const isActive = preset.id === activePresetId;
                                        return (
                                            <TouchableOpacity
                                                key={preset.id}
                                                className={`px-4 py-3.5 flex-row items-center justify-between ${isActive ? "bg-card" : "bg-background"}`}
                                                onPress={() => {
                                                    switchPreset(preset.id);
                                                    setThemeDropdownOpen(false);
                                                }}
                                            >
                                                <View className="flex-row items-center gap-3">
                                                    <View
                                                        className={`w-2 h-2 rounded-full ${isActive ? "bg-primary" : "bg-zinc-600"}`}
                                                    />
                                                    <Text
                                                        className={`font-medium ${isActive ? "text-primary" : "text-text"}`}
                                                    >
                                                        {preset.name}
                                                    </Text>
                                                </View>
                                                {preset.is_system === 1 && (
                                                    <Text className="text-[10px] bg-zinc-800 text-zinc-400 px-1.5 py-0.5 rounded">SYSTEM</Text>
                                                )}
                                            </TouchableOpacity>
                                        );
                                    })}
                                </View>
                            )}
                        </View>
                    </ThemedCard>
                </View>

                {/* Playback */}
                <View className="mb-8">
                    <Text className="text-zinc-500 text-sm font-bold uppercase tracking-wider mb-4">Playback</Text>
                    <ThemedCard className="p-4">
                        <Text className="text-text font-semibold mb-4">Default Orientation</Text>
                        <View className="flex-row gap-2">
                            <OrientationOption label="Portrait" value="portrait" icon={Smartphone} />
                            <OrientationOption label="Landscape" value="landscape" icon={Monitor} />
                            <OrientationOption label="System" value="auto" icon={Info} />
                        </View>
                        <Text className="text-zinc-500 text-xs mt-4">Override system orientation when starting a video.</Text>
                    </ThemedCard>
                </View>

                {/* About */}
                <ThemedCard className="p-6 items-center mb-10">
                    <Text className="text-zinc-500 text-xs">Video Player Expo v1.0.0</Text>
                </ThemedCard>
            </ScrollView>
        </ThemedSafeAreaView>
    );
};

export default SettingsScreen;
