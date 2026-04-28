import { useTheme } from "@/context/ThemeContext";
import { cn } from "@/lib/utils";
import { VideoMedia } from "@/types/useMedia";
import { normalizeClipDestination } from "@/utils/clipDestination";
import { secondsToHhmmss } from "@/utils/secondsToHhmmss";
import { Directory } from "expo-file-system";
import * as FileSystem from "expo-file-system/legacy";
import { FolderOpen, Scissors, Volume2, VolumeX, X } from "lucide-react-native";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Switch, Text, TextInput, TouchableOpacity, View } from "react-native";
import { toast } from "sonner-native";
import { Icon } from "./Icon";
import { SelectDropdown } from "./SelectDropdown";
import { ThemedBottomSheet, ThemedBottomSheetScrollView } from "./ThemedBottomSheet";

// Types

interface ClipExportModalProps {
    visible: boolean;
    onClose: () => void;
    video: VideoMedia;
    segments: { start: number; end: number }[];
    defaultName: string;
    onExport: (options: ExportOptions) => void;
    settings: any;
    updateSettings?: (s: any) => Promise<void>;
}

export interface ExportOptions {
    name: string;
    quality: "high" | "balanced" | "low" | "custom";
    resolution: string;
    format: "mp4" | "gif" | "mkv" | "mov" | "avi";
    removeAudio: boolean;
    removeMarkers: boolean;
    crf?: number;
}

// Shared row height for all pickers / inputs
const ROW_H = 48;

// Resolution helpers
const STANDARD_RESOLUTIONS = [
    { p: 2160, label: "4K" },
    { p: 1440, label: "1440p" },
    { p: 1080, label: "1080p" },
    { p: 720, label: "720p" },
    { p: 480, label: "480p" },
    { p: 360, label: "360p" },
    { p: 240, label: "240p" },
];

function getResolutionOptions(videoW: number, videoH: number) {
    const shorter = Math.min(videoW, videoH);
    const longer = Math.max(videoW, videoH);
    const ratio = longer / shorter;

    // Original always first
    const options: { label: string; value: string; enabled: boolean }[] = [
        { label: `Original (${videoW}×${videoH})`, value: "original", enabled: true },
    ];

    for (const { p, label } of STANDARD_RESOLUTIONS) {
        if (p === shorter) continue; // already covered by original
        const w = Math.round(p * ratio);
        const wEven = w % 2 === 0 ? w : w + 1;
        const pEven = p % 2 === 0 ? p : p + 1;
        options.push({
            label: `${wEven}×${pEven} (${label})`,
            value: String(p),
            enabled: p < shorter,
        });
    }

    return options;
}

// Format options
const FORMAT_OPTIONS: { label: string; value: ExportOptions["format"]; desc: string }[] = [
    { label: "MP4", value: "mp4", desc: "H.264 · Universal" },
    { label: "MOV", value: "mov", desc: "Apple QuickTime" },
    { label: "MKV", value: "mkv", desc: "Matroska container" },
    { label: "AVI", value: "avi", desc: "Legacy Windows" },
    { label: "GIF", value: "gif", desc: "Animated image" },
];

// Sub-components

/** Segmented control — for quality */
const SegmentedControl = ({
    options,
    value,
    onChange,
}: {
    options: { label: string; value: any }[];
    value: any;
    onChange: (v: any) => void;
}) => (
    <View className="flex-row bg-zinc-800 p-2 rounded-xl" style={{ height: ROW_H }}>
        {options.map((opt) => (
            <TouchableOpacity
                key={opt.value}
                onPress={() => onChange(opt.value)}
                className={cn(
                    "flex-1 rounded-lg items-center justify-center",
                    value === opt.value ? "bg-primary" : "bg-transparent",
                )}
            >
                <Text className={cn("text-sm font-bold", value === opt.value ? "text-white" : "text-zinc-400")}>{opt.label}</Text>
            </TouchableOpacity>
        ))}
    </View>
);

/** Section label */
const SectionLabel = ({ children }: { children: string }) => (
    <Text className="text-secondary text-sm uppercase font-bold tracking-widest ml-1">{children}</Text>
);

// Marker triangle icon (▼)
const TriangleDown = ({ color = "#71717a", size = 10, className }: { color?: string; size?: number; className?: string }) => (
    <View
        style={{
            width: 0,
            height: 0,
            borderLeftWidth: size * 0.6,
            borderRightWidth: size * 0.6,
            borderTopWidth: size,
            borderLeftColor: "transparent",
            borderRightColor: "transparent",
            borderTopColor: color,
        }}
        className={className}
    />
);

// Main component

export const ClipExportModal: React.FC<ClipExportModalProps> = ({
    visible,
    onClose,
    video,
    segments,
    defaultName,
    onExport,
    settings,
    updateSettings,
}) => {
    const { colors } = useTheme();

    const [name, setName] = useState(defaultName);
    const [quality, setQuality] = useState<ExportOptions["quality"]>("balanced");
    const [customCRF, setCustomCRF] = useState(23);
    const [resolution, setResolution] = useState("original");
    const [format, setFormat] = useState<ExportOptions["format"]>("mp4");
    const [removeAudio, setRemoveAudio] = useState(false);
    const [removeMarkers, setRemoveMarkers] = useState(false);
    // Local destination — starts from settings but does NOT write back unless markAsDefault is checked
    const [destination, setDestination] = useState(settings.clipDestination || "");
    const [markAsDefault, setMarkAsDefault] = useState(true);
    const [isDestinationValid, setIsDestinationValid] = useState(true);

    // Sync name when defaultName changes (new clip)
    useEffect(() => {
        setName(defaultName);
    }, [defaultName]);

    const crfRange = { min: 18, max: 35 };

    const resolutionOptions = useMemo(() => getResolutionOptions(video.width, video.height), [video.width, video.height]);

    // Destination picker
    const validateDestination = useCallback(async () => {
        if (!destination) {
            setIsDestinationValid(true);
            return;
        }
        const resolved = normalizeClipDestination(destination);

        if (!resolved) {
            setIsDestinationValid(false);
            return;
        }
        try {
            const info = await FileSystem.getInfoAsync(`file://${resolved}`);
            setIsDestinationValid(info.exists && (info as any).isDirectory);
        } catch {
            setIsDestinationValid(false);
        }
    }, [destination]);

    useEffect(() => {
        validateDestination();
    }, [destination, validateDestination]);

    const pickDirectory = async () => {
        try {
            const directory = await Directory.pickDirectoryAsync();
            if (directory?.uri) {
                const resolved = normalizeClipDestination(directory.uri);
                if (resolved) setDestination(resolved);
            }
        } catch (err) {
            console.warn("Failed to pick directory", err);
        }
    };

    // Export
    const handleExport = () => {
        if (!name.trim()) {
            toast.error("Please enter a file name");
            return;
        }

        if (!destination) {
            toast.error("Please select a destination directory");
            return;
        }

        if (!isDestinationValid) {
            toast.error("Selected destination is invalid or inaccessible");
            return;
        }

        if (segments.length === 0) {
            toast.error("No segments selected for export");
            return;
        }

        onClose();
        let targetCRF = 23;
        if (quality === "high") targetCRF = 20;
        else if (quality === "low") targetCRF = 28;
        else if (quality === "custom") targetCRF = customCRF;

        if (markAsDefault && destination && updateSettings) {
            updateSettings({ clipDestination: destination });
        }
        onExport({ name, quality, resolution, format, removeAudio, removeMarkers, crf: targetCRF });
    };

    // Format dropdown options
    const formatDropdownOptions = FORMAT_OPTIONS.map((f) => ({
        label: f.label,
        value: f.value,
        sublabel: f.desc,
        enabled: true,
    }));

    // Resolution dropdown options
    const resolutionDropdownOptions = resolutionOptions.map((r) => ({
        label: r.label,
        value: r.value,
        enabled: r.enabled,
    }));

    return (
        <ThemedBottomSheet isVisible={visible} onClose={onClose}>
            {/* Sticky Header */}
            <View className="flex-row items-center px-6 pt-4 pb-3 border-b border-white/5">
                <View className="w-9 h-9 rounded-full bg-primary/10 items-center justify-center mr-3">
                    <Icon icon={Scissors} size={18} className="text-primary" />
                </View>
                <View className="flex-1">
                    <Text className="text-text text-lg font-bold">Export Clip</Text>
                    <Text className="text-secondary text-sm">
                        {quality === "custom"
                            ? `CRF ${customCRF}`
                            : quality === "high"
                              ? "High (20)"
                              : quality === "low"
                                ? "Low (28)"
                                : "Balanced (23)"}
                    </Text>
                </View>
                <TouchableOpacity
                    onPress={handleExport}
                    className="bg-primary px-6 rounded-full items-center justify-center"
                    style={{ height: ROW_H - 12 }}
                >
                    <Text className="text-white font-bold text-base">Start</Text>
                </TouchableOpacity>
            </View>

            {/* Scrollable Body */}
            <ThemedBottomSheetScrollView
                className="px-6"
                contentContainerClassName="gap-10 pt-6 pb-10"
                showsVerticalScrollIndicator={false}
            >
                {/* File Name */}
                <View className="gap-2">
                    <SectionLabel>File Name</SectionLabel>
                    <View
                        className="bg-zinc-800 rounded-xl border border-white/5 px-3"
                        style={{ minHeight: ROW_H, justifyContent: "center" }}
                    >
                        <TextInput
                            value={name}
                            onChangeText={setName}
                            placeholder="Enter file name"
                            placeholderTextColor="#71717a"
                            className="text-text text-base p-0"
                            style={{ minHeight: ROW_H - 4, paddingTop: 10, paddingBottom: 10 }}
                            multiline
                            numberOfLines={3}
                            textAlignVertical="top"
                        />
                    </View>
                </View>

                {/* Destination */}
                <View className="gap-2">
                    <SectionLabel>Destination</SectionLabel>
                    <View className="flex-row gap-2">
                        <TouchableOpacity
                            onPress={pickDirectory}
                            style={{ height: ROW_H }}
                            className={cn(
                                "flex-1 flex-row items-center gap-2 bg-zinc-800 rounded-xl px-3 border",
                                !isDestinationValid ? "border-red-500/60" : "border-white/5",
                            )}
                        >
                            <Icon icon={FolderOpen} size={16} className="text-primary" />
                            <Text
                                className={cn("text-base flex-1", destination ? "text-text" : "text-zinc-500")}
                                numberOfLines={1}
                            >
                                {destination || "Select directory..."}
                            </Text>
                        </TouchableOpacity>

                        {destination ? (
                            <TouchableOpacity
                                style={{ height: ROW_H, width: ROW_H }}
                                className="items-center justify-center bg-red-500/10 rounded-xl border border-red-500/20"
                                onPress={() => setDestination("")}
                            >
                                <Icon icon={X} size={18} className="text-red-500" />
                            </TouchableOpacity>
                        ) : null}
                    </View>
                    {!isDestinationValid && (
                        <Text className="text-red-500 text-sm font-bold uppercase tracking-tight ml-1">
                            ! Directory not found or inaccessible
                        </Text>
                    )}
                    {/* Mark as default checkbox */}
                    <TouchableOpacity
                        onPress={() => setMarkAsDefault((v) => !v)}
                        className="flex-row items-center gap-2 ml-1"
                        activeOpacity={0.7}
                    >
                        <View
                            className={cn(
                                "w-4 h-4 rounded border items-center justify-center",
                                markAsDefault ? "bg-primary border-primary" : "border-zinc-600",
                            )}
                        >
                            {markAsDefault && <View className="w-2 h-2 bg-white rounded-sm" />}
                        </View>
                        <Text className="text-zinc-400 text-sm">Mark as default destination</Text>
                    </TouchableOpacity>
                </View>

                {/* Quality */}
                <View className="gap-2">
                    <View className="flex-row items-center justify-between">
                        <SectionLabel>Quality Profile</SectionLabel>
                        <Text className="text-zinc-500 text-sm font-mono mr-1">
                            {(() => {
                                if (quality === "custom") return `CRF ${customCRF}`;
                                if (quality === "high") return "CRF 20";
                                if (quality === "balanced") return "CRF 23";
                                if (quality === "low") return "CRF 28";
                                return "---";
                            })()}
                        </Text>
                    </View>
                    <SegmentedControl
                        value={quality}
                        onChange={setQuality}
                        options={[
                            { label: "High", value: "high" },
                            { label: "Balanced", value: "balanced" },
                            { label: "Low", value: "low" },
                            { label: "Custom", value: "custom" },
                        ]}
                    />

                    {quality === "custom" && (
                        <View className="bg-zinc-800/60 p-4 rounded-xl border border-white/5 gap-3">
                            <View className="flex-row justify-between">
                                <Text className="text-zinc-400 text-sm">Target Quality (CRF)</Text>
                                <Text className="text-primary font-bold text-base">{customCRF}</Text>
                            </View>
                            <TouchableOpacity
                                activeOpacity={1}
                                className="h-10 justify-center"
                                onPress={(e) => {
                                    const percent = e.nativeEvent.locationX / 300;
                                    const val = crfRange.min + (crfRange.max - crfRange.min) * Math.min(1, Math.max(0, percent));
                                    setCustomCRF(Math.round(val));
                                }}
                            >
                                <View className="h-1.5 bg-zinc-700 rounded-full w-full overflow-hidden">
                                    <View
                                        className="h-full bg-primary"
                                        style={{
                                            width: `${((customCRF - crfRange.min) / (crfRange.max - crfRange.min)) * 100}%`,
                                        }}
                                    />
                                </View>
                            </TouchableOpacity>
                            <View className="flex-row justify-between">
                                <Text className="text-zinc-500 text-xs">{crfRange.min} (Better)</Text>
                                <Text className="text-zinc-500 text-xs">{crfRange.max} (Smaller)</Text>
                            </View>
                        </View>
                    )}
                </View>

                {/* Resolution + Format — side by side */}
                <View className="flex-row gap-4">
                    <View className="flex-1 gap-2">
                        <SectionLabel>Resolution</SectionLabel>
                        <SelectDropdown value={resolution} options={resolutionDropdownOptions} onChange={setResolution} />
                    </View>
                    <View className="flex-1 gap-2">
                        <SectionLabel>Format</SectionLabel>
                        <SelectDropdown value={format} options={formatDropdownOptions} onChange={setFormat} />
                    </View>
                </View>

                {/* Segments summary */}
                {segments.length > 0 &&
                    (() => {
                        const totalSec = segments.reduce((acc, s) => acc + (s.end - s.start), 0);
                        return (
                            <View className="bg-zinc-800/40 rounded-xl border border-white/5 p-3 gap-1">
                                <View className="flex-row items-center justify-between pb-1">
                                    <Text className="text-secondary text-sm uppercase font-bold tracking-widest ml-1">
                                        Clip Segments ({segments.length})
                                    </Text>
                                    <Text className="text-zinc-400 text-sm font-mono">{secondsToHhmmss(totalSec)}</Text>
                                </View>
                                {segments.map((seg, idx) => (
                                    <View key={idx} className="flex-row items-center gap-2 py-1.5">
                                        <TriangleDown color={colors.primary} size={9} />
                                        <Text className="text-text text-sm font-mono">
                                            {secondsToHhmmss(seg.start)} – {secondsToHhmmss(seg.end)}
                                        </Text>
                                        <Text className="text-zinc-500 text-sm ml-auto">
                                            {secondsToHhmmss(seg.end - seg.start)}
                                        </Text>
                                    </View>
                                ))}
                            </View>
                        );
                    })()}

                {/* Toggles */}
                <View className="bg-zinc-800/50 rounded-2xl border border-white/5 overflow-hidden">
                    <View
                        className="flex-row items-center justify-between px-4 border-b border-white/5"
                        style={{ height: ROW_H }}
                    >
                        <View className="flex-row items-center gap-3">
                            <Icon
                                icon={removeAudio ? VolumeX : Volume2}
                                size={17}
                                color={removeAudio ? colors.error : colors.primary}
                            />
                            <Text className="text-text text-base">Remove Audio</Text>
                        </View>
                        <Switch
                            value={removeAudio}
                            onValueChange={setRemoveAudio}
                            trackColor={{ false: "#3f3f46", true: colors.primary }}
                            thumbColor={removeAudio ? "#fff" : "#a1a1aa"}
                        />
                    </View>
                    <View className="flex-row items-center justify-between px-4" style={{ height: ROW_H }}>
                        <View className="flex-row items-center gap-4">
                            <TriangleDown color={removeMarkers ? colors.error : colors.primary} size={10} className="mx-0.5" />
                            <Text className="text-text text-base">Remove All Markers</Text>
                        </View>
                        <Switch
                            value={removeMarkers}
                            onValueChange={setRemoveMarkers}
                            trackColor={{ false: "#3f3f46", true: colors.primary }}
                            thumbColor={removeMarkers ? "#fff" : "#a1a1aa"}
                        />
                    </View>
                </View>
            </ThemedBottomSheetScrollView>
        </ThemedBottomSheet>
    );
};
