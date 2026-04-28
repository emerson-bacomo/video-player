import { ColorPicker } from "@/components/ColorPicker";
import { Header } from "@/components/Header";
import { Menu } from "@/components/Menu";
import { ThemedSafeAreaView } from "@/components/Themed";
import { ThemedBottomSheet } from "@/components/ThemedBottomSheet";
import defaultTheme from "@/constants/theme.json";
import { ThemeColors, useTheme } from "@/context/ThemeContext";
import * as db from "@/utils/db";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import { cn } from "@/lib/utils";
import { useRouter } from "expo-router";
import { ArrowLeft, Download, Plus, RotateCcw, Save, Trash, Upload } from "lucide-react-native";
import React, { useEffect, useMemo, useState } from "react";
import { Alert, ScrollView, Text, TouchableOpacity, View } from "react-native";

const ThemeEditor = () => {
    const { colors, theme, updateTheme, previewTheme, switchPreset, activePresetId, presets, refreshPresets } = useTheme();
    const router = useRouter();
    const [editingProp, setEditingProp] = useState<keyof ThemeColors | null>(null);
    const [resetTarget, setResetTarget] = useState<keyof ThemeColors | null>(null);
    const [draftColors, setDraftColors] = useState<ThemeColors>(colors);
    const [savedColors, setSavedColors] = useState<ThemeColors>(colors);

    useEffect(() => {
        const activePreset = presets.find((preset) => preset.id === activePresetId);
        if (!activePreset) return;
        const nextColors = JSON.parse(activePreset.config) as ThemeColors;
        setDraftColors(nextColors);
        setSavedColors(nextColors);
        previewTheme(nextColors);
    }, [activePresetId, presets, previewTheme]);

    const changedKeys = useMemo(
        () =>
            Object.keys(draftColors).filter(
                (key) => draftColors[key as keyof ThemeColors] !== savedColors[key as keyof ThemeColors],
            ) as (keyof ThemeColors)[],
        [draftColors, savedColors],
    );

    const hasDraftChanges = changedKeys.length > 0;

    const applyDraft = (nextColors: ThemeColors) => {
        setDraftColors(nextColors);
        previewTheme(nextColors);
    };

    const handleDraftColorChange = (key: keyof ThemeColors, color: string) => {
        applyDraft({ ...draftColors, [key]: color });
    };

    const handleCancelDraft = () => {
        applyDraft(savedColors);
        setEditingProp(null);
        setResetTarget(null);
    };

    const handleSaveDraft = async () => {
        await updateTheme(draftColors);
        setSavedColors(draftColors);
        setEditingProp(null);
        setResetTarget(null);
    };

    const handleAddSlot = () => {
        const name = `Preset ${presets.length + 1}`;
        db.saveThemePresetDb(name, JSON.stringify(draftColors), 0, 0);
        refreshPresets();
        Alert.alert("Success", "New theme slot added.");
    };

    const handleDeleteSlot = (id: number, isSystem: boolean) => {
        if (isSystem) {
            Alert.alert("Error", "Cannot delete system default theme.");
            return;
        }
        Alert.alert("Delete Preset", "Are you sure you want to delete this preset?", [
            { text: "Cancel", style: "cancel" },
            {
                text: "Delete",
                style: "destructive",
                onPress: () => {
                    db.deleteThemePresetDb(id);
                    refreshPresets();
                },
            },
        ]);
    };

    const handleExport = async () => {
        try {
            const content = JSON.stringify({ name: "Custom Theme", colors: draftColors });
            const fileName = `theme_${Date.now()}.vpt`;
            const fileUri = `${FileSystem.documentDirectory}${fileName}`;
            await FileSystem.writeAsStringAsync(fileUri, content);
            Alert.alert("Exported", `Theme saved as ${fileName} in app storage.`);
        } catch {
            Alert.alert("Error", "Failed to export theme.");
        }
    };

    const handleImport = async () => {
        try {
            const result = await DocumentPicker.getDocumentAsync({ type: "*/*" });
            if (result.canceled) return;
            const content = await FileSystem.readAsStringAsync(result.assets[0].uri);
            const data = JSON.parse(content);
            if (data.colors) {
                applyDraft(data.colors as ThemeColors);
                Alert.alert("Imported", "Theme loaded into draft.");
            }
        } catch {
            Alert.alert("Error", "Failed to import theme. Make sure it's a valid .vpt file.");
        }
    };

    const handleResetToDefault = () => {
        applyDraft(defaultTheme.colors as ThemeColors);
    };

    const confirmResetColor = () => {
        if (!resetTarget) return;
        handleDraftColorChange(resetTarget, savedColors[resetTarget]);
        setResetTarget(null);
    };

    return (
        <ThemedSafeAreaView className="flex-1">
            <Header>
                <Header.Back onPress={() => router.back()} />
                <Header.Title title="Theme Editor" subtitle="Customize your workspace" />
            </Header>

            <ScrollView className="flex-1 px-4 py-6">
                <View className="mb-8">
                    <View className="flex-row items-center justify-between mb-4">
                        <Text className="text-zinc-500 font-bold uppercase tracking-wider text-xs">Colors</Text>
                        <View className="flex-row items-center gap-2">
                            <TouchableOpacity
                                onPress={handleCancelDraft}
                                disabled={!hasDraftChanges}
                                className="px-3 py-2 rounded-xl border"
                                style={{
                                    borderColor: theme.border,
                                    opacity: hasDraftChanges ? 1 : 0.45,
                                }}
                            >
                                <Text style={{ color: theme.text }} className="font-bold text-xs uppercase tracking-wider">
                                    Cancel
                                </Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                onPress={handleSaveDraft}
                                disabled={!hasDraftChanges}
                                className="px-3 py-2 rounded-xl flex-row items-center gap-2"
                                style={{
                                    backgroundColor: hasDraftChanges ? theme.primary : theme.border,
                                }}
                            >
                                <Save size={14} color="white" />
                                <Text className="text-white font-bold text-xs uppercase tracking-wider">Save</Text>
                            </TouchableOpacity>
                        </View>
                    </View>

                    <View className="flex-row flex-wrap justify-between">
                        {Object.entries(draftColors).map(([key, value]) => {
                            const colorKey = key as keyof ThemeColors;
                            const isChanged = value !== savedColors[colorKey];

                            return (
                                <View
                                    key={key}
                                    style={{
                                        backgroundColor: theme.card,
                                        borderColor: theme.border,
                                        width: "48%",
                                        marginBottom: 12,
                                    }}
                                    className="rounded-2xl border overflow-visible relative"
                                >
                                    {isChanged && (
                                        <TouchableOpacity
                                            onPress={() => setResetTarget(colorKey)}
                                            className="absolute z-10"
                                            style={{ left: -6, top: "50%", marginTop: -6 }}
                                        >
                                            <View className="w-3 h-3 rounded-full bg-green-500" />
                                        </TouchableOpacity>
                                    )}

                                    <TouchableOpacity
                                        onPress={() => setEditingProp(colorKey)}
                                        className="p-4 flex-row items-center gap-3"
                                    >
                                        <View
                                            style={{
                                                width: 24,
                                                height: 24,
                                                borderRadius: 12,
                                                backgroundColor: value as string,
                                                borderWidth: 1,
                                                borderColor: "rgba(255,255,255,0.1)",
                                            }}
                                        />
                                        <View className="flex-1">
                                            <Text style={{ color: theme.text }} className="capitalize font-semibold text-sm">
                                                {key}
                                            </Text>
                                            <Text className="text-zinc-500 text-[10px] font-bold uppercase tracking-widest mt-1">
                                                {(value as string).toUpperCase()}
                                            </Text>
                                        </View>
                                    </TouchableOpacity>
                                </View>
                            );
                        })}
                    </View>
                </View>

                <View className="mb-8">
                    <View className="flex-row justify-between items-center mb-4">
                        <Text className="text-zinc-500 font-bold uppercase tracking-wider text-xs">Presets</Text>
                        <TouchableOpacity onPress={handleAddSlot} className="flex-row items-center gap-1">
                            <Plus size={16} color={theme.primary} />
                            <Text style={{ color: theme.primary }} className="font-bold text-sm">
                                Add Slot
                            </Text>
                        </TouchableOpacity>
                    </View>
                    <View className="flex-col gap-3">
                        {presets.map((preset) => (
                            <View
                                key={preset.id}
                                style={{
                                    backgroundColor: theme.card,
                                    borderColor: preset.id === activePresetId ? theme.primary : theme.border,
                                }}
                                className="p-4 rounded-2xl border flex-row justify-between items-center"
                            >
                                <TouchableOpacity
                                    className="flex-1 flex-row items-center gap-3"
                                    onPress={() => switchPreset(preset.id)}
                                >
                                    <View
                                        className="w-2 h-2 rounded-full"
                                        style={{ backgroundColor: preset.id === activePresetId ? theme.primary : "#52525b" }}
                                    />
                                    <Text
                                        style={{ color: theme.text }}
                                        className={cn("font-bold", preset.id === activePresetId ? "text-lg" : "text-base")}
                                    >
                                        {preset.name}
                                    </Text>
                                    {preset.is_system === 1 && (
                                        <Text className="text-[10px] bg-zinc-800 text-zinc-400 px-1.5 py-0.5 rounded ml-1">
                                            SYSTEM
                                        </Text>
                                    )}
                                </TouchableOpacity>

                                {preset.is_system !== 1 && (
                                    <TouchableOpacity onPress={() => handleDeleteSlot(preset.id, false)}>
                                        <Trash size={16} color="#ef4444" />
                                    </TouchableOpacity>
                                )}
                            </View>
                        ))}
                    </View>
                </View>

                <View className="mb-8 flex-row gap-4">
                    <TouchableOpacity
                        onPress={handleExport}
                        style={{ backgroundColor: theme.card, borderColor: theme.border }}
                        className="flex-1 border p-4 rounded-2xl flex-row items-center justify-center gap-2"
                    >
                        <Download size={18} color={theme.text} />
                        <Text style={{ color: theme.text }} className="font-bold">
                            Export
                        </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        onPress={handleImport}
                        style={{ backgroundColor: theme.card, borderColor: theme.border }}
                        className="flex-1 border p-4 rounded-2xl flex-row items-center justify-center gap-2"
                    >
                        <Upload size={18} color={theme.text} />
                        <Text style={{ color: theme.text }} className="font-bold">
                            Import
                        </Text>
                    </TouchableOpacity>
                </View>

                <TouchableOpacity
                    onPress={handleResetToDefault}
                    className="mb-32 p-5 rounded-2xl border flex-row items-center justify-center gap-2"
                    style={{ backgroundColor: "rgba(239, 68, 68, 0.05)", borderColor: "rgba(239, 68, 68, 0.2)" }}
                >
                    <RotateCcw size={18} color="#ef4444" />
                    <Text className="text-red-500 font-bold">Load Default Colors Into Draft</Text>
                </TouchableOpacity>
            </ScrollView>

            <ThemedBottomSheet isVisible={!!editingProp} onClose={() => setEditingProp(null)}>
                <View className="p-8 pb-12">
                    <View className="mb-8">
                        <Text className="text-zinc-500 text-xs font-bold uppercase tracking-widest mb-1">Editing Property</Text>
                        <Text style={{ color: theme.text }} className="text-2xl font-bold capitalize">
                            {editingProp}
                        </Text>
                        <Text className="text-zinc-500 text-sm mt-2">Changes are applied live to your current draft.</Text>
                    </View>

                    {editingProp && (
                        <ColorPicker
                            initialColor={draftColors[editingProp]}
                            onColorChange={(color) => handleDraftColorChange(editingProp, color)}
                        />
                    )}
                </View>
            </ThemedBottomSheet>

            <Menu variant="MODAL" visible={!!resetTarget} onClose={() => setResetTarget(null)}>
                <Menu.Content>
                    <View className="p-6 gap-6">
                        <View>
                            <Text className="text-zinc-500 text-[10px] font-bold uppercase tracking-widest mb-2">
                                Reset Color
                            </Text>
                            <Text style={{ color: theme.text }} className="text-xl font-bold capitalize">
                                Reset {resetTarget}
                            </Text>
                            {resetTarget && (
                                <Text className="text-zinc-400 text-sm mt-3 leading-6">
                                    Reset to {(savedColors[resetTarget] || "").toUpperCase()}?
                                </Text>
                            )}
                        </View>

                        <View className="flex-row gap-3">
                            <TouchableOpacity
                                onPress={() => setResetTarget(null)}
                                className="flex-1 rounded-2xl border px-4 py-3 flex-row items-center justify-center gap-2"
                                style={{ borderColor: theme.border }}
                            >
                                <ArrowLeft size={16} color={theme.text} />
                                <Text style={{ color: theme.text }} className="font-bold">
                                    Cancel
                                </Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                onPress={confirmResetColor}
                                className="flex-1 rounded-2xl px-4 py-3 flex-row items-center justify-center gap-2"
                                style={{ backgroundColor: theme.primary }}
                            >
                                <RotateCcw size={16} color="white" />
                                <Text className="text-white font-bold">Reset</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </Menu.Content>
            </Menu>
        </ThemedSafeAreaView>
    );
};

export default ThemeEditor;
