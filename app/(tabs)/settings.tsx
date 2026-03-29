import { Directory } from "expo-file-system";
import { StatusBar } from "expo-status-bar";
import { FolderOpen, Info, Monitor, Smartphone } from "lucide-react-native";
import React from "react";
import { ActivityIndicator, ScrollView, Text, TouchableOpacity, View } from "react-native";
import { Button } from "../../components/Button";
import { useMedia } from "../../hooks/useMedia";
import { Orientation, useSettings } from "../../hooks/useSettings";

const SettingsScreen = () => {
    const { settings, updateSettings, loading: settingsLoading } = useSettings();
    const { regenerateAllThumbnails, resetEverything } = useMedia();

    if (settingsLoading) {
        return (
            <View className="flex-1 bg-black justify-center items-center">
                <ActivityIndicator size="large" color="#ffffff" />
            </View>
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

    const OrientationOption = ({ label, value, icon: Icon }: { label: string; value: Orientation; icon: any }) => (
        <TouchableOpacity
            className={`flex-1 flex-row items-center justify-center p-4 rounded-xl border gap-2 ${
                settings.defaultOrientation === value ? "bg-blue-600 border-blue-500" : "bg-zinc-900 border-zinc-800"
            }`}
            onPress={() => updateSettings({ defaultOrientation: value })}
        >
            <Icon size={18} color="white" />
            <Text className="text-white font-semibold">{label}</Text>
        </TouchableOpacity>
    );

    return (
        <View className="flex-1 bg-black">
            <StatusBar style="light" />

            <View className="px-4 pt-14 pb-4 border-b border-zinc-900">
                <Text className="text-white text-2xl font-bold">Settings</Text>
            </View>

            <ScrollView className="flex-1 px-4 py-6">
                <View className="mb-8">
                    <Text className="text-zinc-500 text-sm font-bold uppercase tracking-wider mb-4">Developer Options</Text>
                    <View className="bg-zinc-900 rounded-2xl p-4 border border-zinc-800">
                        <Text className="text-white font-semibold mb-2">Thumbnail Management</Text>
                        <Button
                            title="Regenerate All Thumbnails"
                            className="bg-zinc-800 p-4 rounded-xl border border-zinc-700"
                            textClassName="text-blue-400 font-bold"
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

                        <Text className="text-white font-semibold mb-2">Database Management</Text>
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
                    </View>
                </View>

                <View className="mb-8">
                    <Text className="text-zinc-500 text-sm font-bold uppercase tracking-wider mb-4">Clipping</Text>
                    <View className="bg-zinc-900 rounded-2xl p-4 border border-zinc-800">
                        <Text className="text-white font-semibold mb-2">Clip Destination Folder</Text>
                        <TouchableOpacity
                            className="bg-zinc-800 p-4 rounded-xl border border-zinc-700 flex-row items-center justify-between"
                            onPress={pickDirectory}
                        >
                            <Text className="text-white flex-1 mr-2" numberOfLines={1}>
                                {settings.clipDestination || "Select folder..."}
                            </Text>
                            <FolderOpen size={20} color="#3b82f6" />
                        </TouchableOpacity>
                        <Text className="text-zinc-500 text-xs mt-3">
                            Videos will be saved to this folder in your media library.
                        </Text>
                    </View>
                </View>

                <View className="mb-8">
                    <Text className="text-zinc-500 text-sm font-bold uppercase tracking-wider mb-4">Playback</Text>
                    <View className="bg-zinc-900 rounded-2xl p-4 border border-zinc-800">
                        <Text className="text-white font-semibold mb-4">Default Orientation</Text>
                        <View className="flex-row gap-2">
                            <OrientationOption label="Portrait" value="portrait" icon={Smartphone} />
                            <OrientationOption label="Landscape" value="landscape" icon={Monitor} />
                            <OrientationOption label="System" value="auto" icon={Info} />
                        </View>
                        <Text className="text-zinc-500 text-xs mt-4">Override system orientation when starting a video.</Text>
                    </View>
                </View>

                <View className="bg-zinc-900/50 rounded-2xl p-6 border border-zinc-800/50 items-center">
                    <Text className="text-zinc-500 text-xs">Video Player Expo v1.0.0</Text>
                </View>
            </ScrollView>
        </View>
    );
};

export default SettingsScreen;
