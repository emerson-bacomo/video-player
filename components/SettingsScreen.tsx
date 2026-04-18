import { Button } from "@/components/Button";
import { Header } from "@/components/Header";
import { Icon } from "@/components/Icon";
import { LoadingStatus } from "@/components/LoadingStatus";
import { ThemedCard, ThemedSafeAreaView } from "@/components/Themed";
import { useTheme } from "@/context/ThemeContext";
import { useMedia } from "@/hooks/useMedia";
import { Orientation, useSettings } from "@/hooks/useSettings";
import { cn } from "@/lib/utils";
import { Directory } from "expo-file-system";
import { router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import {
    ChevronDown,
    ChevronRight,
    Cpu,
    Filter,
    FolderOpen,
    Monitor,
    Palette,
    RefreshCw,
    Smartphone,
    Sun,
    Trash2,
} from "lucide-react-native";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, Text, TextInput, TouchableOpacity, View } from "react-native";

const SENSITIVITY_PRESETS = [
    { label: "Low", value: 0.15 },
    { label: "Medium", value: 0.5 },
    { label: "High", value: 1 },
];

interface SettingsScreenComponentProps {
    fromPlayer?: boolean;
}

export const SettingsScreenComponent = ({ fromPlayer = false }: SettingsScreenComponentProps) => {
    const { settings, updateSettings, loading: settingsLoading } = useSettings();
    const { regenerateAllThumbnails, resetEverything, loadDataFromDB } = useMedia();
    const { switchPreset, activePresetId, presets } = useTheme();
    const [themeDropdownOpen, setThemeDropdownOpen] = useState(false);
    const [sensitivityInput, setSensitivityInput] = useState("");
    const [seekAmountInput, setSeekAmountInput] = useState("");

    useEffect(() => {
        if (!settingsLoading) {
            setSensitivityInput(String(settings.brightnessSensitivity ?? 0.3));
            setSeekAmountInput(String(settings.doubleTapSeekAmount ?? 10));
        }
    }, [settingsLoading]);

    if (settingsLoading) {
        return (
            <ThemedSafeAreaView className="flex-1 justify-center items-center">
                <ActivityIndicator size="large" className="text-primary" />
            </ThemedSafeAreaView>
        );
    }

    const commitSensitivity = (raw: string) => {
        const parsed = parseFloat(raw);
        if (!isNaN(parsed) && parsed > 0) {
            const clampedUI = Math.max(0.05, Math.min(1, parsed));
            updateSettings({ brightnessSensitivity: clampedUI });
            setSensitivityInput(String(clampedUI));
        } else {
            setSensitivityInput(String(settings.brightnessSensitivity));
        }
    };

    const commitSeekAmount = (raw: string) => {
        const parsed = parseInt(raw, 10);
        if (!isNaN(parsed) && parsed > 0) {
            updateSettings({ doubleTapSeekAmount: parsed });
            setSeekAmountInput(String(parsed));
        } else {
            setSeekAmountInput(String(settings.doubleTapSeekAmount));
        }
    };

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
                className={cn(
                    "flex-1 flex-row items-center justify-center p-4 rounded-xl border gap-2",
                    isActive ? "bg-primary border-primary" : "bg-card border-border",
                )}
                onPress={() => updateSettings({ defaultOrientation: value })}
            >
                <Icon icon={LucideIconProp} size={18} className={isActive ? "text-white" : "text-text"} />
                <Text className={cn("font-semibold", isActive ? "text-white" : "text-text")}>{label}</Text>
            </TouchableOpacity>
        );
    };

    return (
        <ThemedSafeAreaView className="flex-1">
            <StatusBar style="light" />

            <Header>
                {router.canGoBack() && <Header.Back onPress={() => router.back()} />}
                <Header.Title
                    title={fromPlayer ? "Player Settings" : "Settings"}
                    subtitle={fromPlayer ? "Playback & display options" : "Personalize your experience"}
                />
                {!fromPlayer && (
                    <Header.Actions>
                        <Header.SearchAction />
                        <LoadingStatus />
                    </Header.Actions>
                )}
            </Header>

            <ScrollView className="flex-1 px-4 py-6">
                {/* Developer Options — hidden in player context */}
                {!fromPlayer && (
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
                )}

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

                {/* Theming — show Theme Editor link only outside player */}
                <View className="mb-8">
                    <Text className="text-zinc-500 text-sm font-bold uppercase tracking-wider mb-4">Theming</Text>
                    <ThemedCard className="p-4">
                        {!fromPlayer && (
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
                        )}

                        <View className="rounded-xl border border-border bg-background overflow-hidden">
                            <TouchableOpacity
                                className="p-4 flex-row items-center justify-between"
                                onPress={() => setThemeDropdownOpen((prev) => !prev)}
                            >
                                <View className="flex-row items-center gap-3">
                                    <Icon icon={Sun} size={20} className="text-primary" />
                                    <View>
                                        <Text className="text-text font-semibold">Theme Preset</Text>
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
                                                className={cn(
                                                    "px-4 py-3.5 flex-row items-center justify-between",
                                                    isActive ? "bg-card" : "bg-background",
                                                )}
                                                onPress={() => {
                                                    switchPreset(preset.id);
                                                    setThemeDropdownOpen(false);
                                                }}
                                            >
                                                <View className="flex-row items-center gap-3">
                                                    <View
                                                        className={cn(
                                                            "w-2 h-2 rounded-full",
                                                            isActive ? "bg-primary" : "bg-zinc-600",
                                                        )}
                                                    />
                                                    <Text className={cn("font-medium", isActive ? "text-primary" : "text-text")}>
                                                        {preset.name}
                                                    </Text>
                                                </View>
                                                {preset.is_system === 1 && (
                                                    <Text className="text-[10px] bg-zinc-800 text-zinc-400 px-1.5 py-0.5 rounded">
                                                        SYSTEM
                                                    </Text>
                                                )}
                                            </TouchableOpacity>
                                        );
                                    })}
                                </View>
                            )}
                        </View>
                    </ThemedCard>
                </View>

                {/* Name Cleaning */}
                <View className="mb-8">
                    <View className="flex-row justify-between items-center mb-4">
                        <Text className="text-zinc-500 text-sm font-bold uppercase tracking-wider">Name Cleaning</Text>
                        <TouchableOpacity
                            onPress={async () => {
                                // Fast refresh: Re-apply cleanup rules to current memory state from DB
                                await loadDataFromDB();
                            }}
                            className="bg-primary/10 px-3 py-1.5 rounded-full flex-row items-center gap-2"
                        >
                            <Icon icon={RefreshCw} size={12} className="text-primary" />
                            <Text className="text-primary text-[10px] font-bold">APPLY CHANGES</Text>
                        </TouchableOpacity>
                    </View>
                    <ThemedCard className="p-4">
                        <View className="flex-row items-center gap-3 mb-4">
                            <Icon icon={Filter} size={18} className="text-primary" />
                            <Text className="text-text font-semibold">Find and Replace Patterns</Text>
                        </View>
                        <Text className="text-secondary text-xs mb-6">
                            Clean up display names by removing unwanted text. Rules only apply when you click "Apply" above.
                        </Text>

                        {settings.nameReplacements.length === 0 ? (
                            <View className="items-center py-6 bg-background rounded-xl border border-dashed border-border mb-4">
                                <Text className="text-secondary text-sm">No rules defined yet</Text>
                            </View>
                        ) : (
                            <View className="gap-3 mb-4">
                                {settings.nameReplacements.map((rule, idx) => (
                                    <View key={idx} className="flex-row items-center gap-2">
                                        <TouchableOpacity
                                            onPress={() => {
                                                const newRules = [...settings.nameReplacements];
                                                newRules[idx].active = !newRules[idx].active;
                                                updateSettings({ nameReplacements: newRules });
                                            }}
                                            className={cn(
                                                "w-7 h-7 rounded-lg items-center justify-center border",
                                                rule.active ? "bg-primary border-primary" : "bg-zinc-800 border-zinc-700",
                                            )}
                                        >
                                            <View
                                                className={cn("w-2 h-2 rounded-full", rule.active ? "bg-white" : "bg-zinc-500")}
                                            />
                                        </TouchableOpacity>

                                        <View
                                            className={cn(
                                                "flex-1 flex-row gap-2 bg-background border rounded-xl p-1",
                                                rule.active ? "border-border" : "border-zinc-800 opacity-50",
                                            )}
                                        >
                                            <TextInput
                                                className="flex-1 px-2 py-2 text-text text-sm"
                                                placeholder="Find..."
                                                placeholderTextColor="#71717a"
                                                value={rule.find}
                                                onChangeText={(val) => {
                                                    const newRules = [...settings.nameReplacements];
                                                    newRules[idx].find = val;
                                                    updateSettings({ nameReplacements: newRules });
                                                }}
                                            />
                                            <View className="w-px bg-border my-1" />
                                            <TextInput
                                                className="flex-1 px-2 py-2 text-text text-sm"
                                                placeholder="Replace..."
                                                placeholderTextColor="#71717a"
                                                value={rule.replace}
                                                onChangeText={(val) => {
                                                    const newRules = [...settings.nameReplacements];
                                                    newRules[idx].replace = val;
                                                    updateSettings({ nameReplacements: newRules });
                                                }}
                                            />
                                        </View>
                                        <TouchableOpacity
                                            onPress={() => {
                                                const newRules = settings.nameReplacements.filter((_, i) => i !== idx);
                                                updateSettings({ nameReplacements: newRules });
                                            }}
                                            className="w-10 h-10 items-center justify-center bg-red-900/10 rounded-xl"
                                        >
                                            <Icon icon={Trash2} size={16} className="text-red-400" />
                                        </TouchableOpacity>
                                    </View>
                                ))}
                            </View>
                        )}

                        <Button
                            title="Add New Pattern"
                            className="bg-primary/10 border border-primary/20 rounded-xl py-3"
                            textClassName="text-primary font-bold text-center"
                            onPress={async () => {
                                updateSettings({
                                    nameReplacements: [...settings.nameReplacements, { find: "", replace: "", active: true }],
                                });
                            }}
                        />
                    </ThemedCard>
                </View>

                {/* Playback */}
                <View className="mb-8">
                    <Text className="text-zinc-500 text-sm font-bold uppercase tracking-wider mb-4">Playback</Text>
                    <ThemedCard className="p-4 mb-4">
                        <Text className="text-text font-semibold mb-4">Default Orientation</Text>
                        <View className="flex-row gap-2">
                            <OrientationOption label="Portrait" value="portrait" icon={Smartphone} />
                            <OrientationOption label="Landscape" value="landscape" icon={Monitor} />
                            <OrientationOption label="System" value="system" icon={Cpu} />
                        </View>
                        <Text className="text-zinc-500 text-xs mt-4">Override system orientation when starting a video.</Text>
                    </ThemedCard>

                    <ThemedCard className="p-4 mb-4">
                        <Text className="text-text font-semibold mb-1">Double Tap Seek Amount</Text>
                        <Text className="text-zinc-500 text-xs mb-4">Seconds to skip forwards or backwards.</Text>

                        <TextInput
                            className="bg-background border border-border rounded-xl px-4 py-3 text-text text-base mb-4"
                            keyboardType="number-pad"
                            value={seekAmountInput}
                            onChangeText={setSeekAmountInput}
                            onBlur={() => commitSeekAmount(seekAmountInput)}
                            onSubmitEditing={() => commitSeekAmount(seekAmountInput)}
                            returnKeyType="done"
                            placeholderTextColor="#71717a"
                            placeholder="e.g. 10"
                        />

                        <View className="flex-row gap-2">
                            {[5, 10, 15, 30].map((val) => {
                                const isActive = settings.doubleTapSeekAmount === val;
                                return (
                                    <TouchableOpacity
                                        key={val}
                                        className={cn(
                                            "flex-1 items-center justify-center py-3 rounded-xl border",
                                            isActive ? "bg-primary border-primary" : "bg-card border-border",
                                        )}
                                        onPress={() => {
                                            updateSettings({ doubleTapSeekAmount: val });
                                            setSeekAmountInput(String(val));
                                        }}
                                    >
                                        <Text className={cn("font-semibold", isActive ? "text-white" : "text-text")}>{val}s</Text>
                                    </TouchableOpacity>
                                );
                            })}
                        </View>
                    </ThemedCard>

                    <ThemedCard className="p-4 mb-4">
                        <Text className="text-text font-semibold mb-1">Brightness Drag Sensitivity</Text>
                        <Text className="text-zinc-500 text-xs mb-4">Higher value = more sensitive. Range: 0.05 – 1.0</Text>

                        <TextInput
                            className="bg-background border border-border rounded-xl px-4 py-3 text-text text-base mb-4"
                            keyboardType="decimal-pad"
                            value={sensitivityInput}
                            onChangeText={setSensitivityInput}
                            onBlur={() => commitSensitivity(sensitivityInput)}
                            onSubmitEditing={() => commitSensitivity(sensitivityInput)}
                            returnKeyType="done"
                            placeholderTextColor="#71717a"
                            placeholder="e.g. 0.3"
                        />

                        <View className="flex-row gap-2">
                            {SENSITIVITY_PRESETS.map((p) => {
                                const isActive = settings.brightnessSensitivity === p.value;
                                return (
                                    <TouchableOpacity
                                        key={p.label}
                                        className={cn(
                                            "flex-1 items-center justify-center py-3 rounded-xl border",
                                            isActive ? "bg-primary border-primary" : "bg-card border-border",
                                        )}
                                        onPress={() => {
                                            updateSettings({ brightnessSensitivity: p.value });
                                            setSensitivityInput(String(p.value));
                                        }}
                                    >
                                        <Text className={cn("font-semibold", isActive ? "text-white" : "text-text")}>
                                            {p.label}
                                        </Text>
                                    </TouchableOpacity>
                                );
                            })}
                        </View>
                        <Text className="text-zinc-500 text-xs mt-4">
                            High sensitivity requires a shorter swipe to reach max brightness.
                        </Text>
                    </ThemedCard>

                    <ThemedCard className="p-4 mt-4">
                        <Text className="text-text font-semibold mb-2">Auto-play Next Video</Text>
                        <Text className="text-secondary text-xs mb-4">
                            Automatically play the next video in the album when the current one finishes.
                        </Text>

                        <View className="flex-row items-center justify-between mb-4">
                            <Text className="text-text font-medium">Enable Auto-play</Text>
                            <TouchableOpacity
                                onPress={() => updateSettings({ autoPlayOnEnd: !settings.autoPlayOnEnd })}
                                className={cn(
                                    "w-12 h-6 rounded-full px-1 justify-center",
                                    settings.autoPlayOnEnd ? "bg-primary" : "bg-zinc-800",
                                )}
                            >
                                <View
                                    className={cn(
                                        "w-4 h-4 rounded-full bg-white transition-transform duration-200",
                                        settings.autoPlayOnEnd ? "translate-x-6" : "translate-x-0",
                                    )}
                                />
                            </TouchableOpacity>
                        </View>

                        <View
                            className={cn("pl-5 flex-row items-center justify-between", !settings.autoPlayOnEnd && "opacity-50")}
                        >
                            <View className="flex-1 mr-4">
                                <Text className="text-text font-medium">Similar Prefix Only</Text>
                                <Text className="text-secondary text-[10px] mt-1">
                                    Only auto-play if the next video shares the same series prefix (e.g. "[Series]").
                                </Text>
                            </View>
                            <TouchableOpacity
                                disabled={!settings.autoPlayOnEnd}
                                onPress={() => updateSettings({ autoPlaySimilarPrefixOnly: !settings.autoPlaySimilarPrefixOnly })}
                                className={cn(
                                    "w-12 h-6 rounded-full px-1 justify-center",
                                    settings.autoPlaySimilarPrefixOnly && settings.autoPlayOnEnd ? "bg-primary" : "bg-zinc-800",
                                )}
                            >
                                <View
                                    className={cn(
                                        "w-4 h-4 rounded-full bg-white transition-transform duration-200",
                                        settings.autoPlaySimilarPrefixOnly && settings.autoPlayOnEnd
                                            ? "translate-x-6"
                                            : "translate-x-0",
                                    )}
                                />
                            </TouchableOpacity>
                        </View>
                    </ThemedCard>
                </View>

                {/* About — hidden in player context */}
                {!fromPlayer && (
                    <ThemedCard className="p-6 items-center mb-10">
                        <Text className="text-zinc-500 text-xs">Video Player Expo v1.0.0</Text>
                    </ThemedCard>
                )}
            </ScrollView>
        </ThemedSafeAreaView>
    );
};
