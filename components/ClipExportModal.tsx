import { useTheme } from "@/context/ThemeContext";
import { cn } from "@/lib/utils";
import { ExportOptions, TransitionStyle, SessionClip } from "@/types/useMedia";
import type { Video } from "@/hooks/domain/Video";
import { normalizeMediaDestination } from "@/utils/mediaDestination";
import { secondsToHhmmss } from "@/utils/secondsToHhmmss";
import * as FileSystem from "expo-file-system/legacy";
import { Scissors, Volume2, VolumeX } from "lucide-react-native";
import React, { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import type { FC } from "react";
import { Switch, Text, TextInput, TouchableOpacity, View } from "react-native";
import { toast } from "sonner-native";
import { Icon } from "./Icon";
import { ThemedBottomSheet, ThemedBottomSheetScrollView } from "./ThemedBottomSheet";
import Slider from "@react-native-community/slider";
import { DEFAULT_EXPORT_OPTIONS } from "@/constants/defaults";
import { useSettings } from "@/hooks/useSettings";

import { DestinationPicker } from "./DestinationPicker";
import { SelectDropdown } from "./SelectDropdown";

interface ClipExportModalProps {
    visible: boolean;
    onClose: () => void;
    video: Video | SessionClip;
    segments: { start: number; end: number }[];
    defaultName: string;
    onExport: (options: ExportOptions) => void;
    initialOptions?: Partial<ExportOptions>;
    isReexport?: boolean;
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

const TRANSITION_OPTIONS: { label: string; value: TransitionStyle }[] = [
    { label: "Crossfade", value: "crossfade" },
    { label: "Slide (Left)", value: "slide-left" },
    { label: "Slide (Right)", value: "slide-right" },
    { label: "Smear (Left)", value: "smear-left" },
    { label: "Smear (Right)", value: "smear-right" },
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

export const ClipExportModal: FC<ClipExportModalProps> = ({
    visible,
    onClose,
    video,
    segments,
    defaultName,
    onExport,
    initialOptions,
    isReexport,
}) => {
    const { colors } = useTheme();
    const { settings, updateSettings } = useSettings();

    const [name, setName] = useState(defaultName);

    // Load initial state from: 1. initialOptions, 2. settings.lastExportOptions, 3. defaults
    const getInitialValue = <T,>(key: keyof ExportOptions, fallback: T): T => {
        if (initialOptions && initialOptions[key] !== undefined) return initialOptions[key] as T;

        const savedOptions = settings.lastExportOptions;
        if (savedOptions && savedOptions[key] !== undefined) {
            // Resolution check: only apply if valid for this video
            if (key === "resolution") {
                const resValue = savedOptions[key] as string;
                if (resValue === "original") return resValue as T;
                const p = parseInt(resValue);
                const shorter = Math.min(video.width, video.height);
                if (!isNaN(p) && p <= shorter) return resValue as T;
                return "original" as T;
            }
            return savedOptions[key] as T;
        }
        return fallback;
    };

    const [quality, setQuality] = useState<ExportOptions["quality"]>(getInitialValue("quality", DEFAULT_EXPORT_OPTIONS.quality));
    const [customCRF, setCustomCRF] = useState(getInitialValue("crf", DEFAULT_EXPORT_OPTIONS.crf));
    const [resolution, setResolution] = useState(getInitialValue("resolution", DEFAULT_EXPORT_OPTIONS.resolution));
    const [format, setFormat] = useState<ExportOptions["format"]>(getInitialValue("format", DEFAULT_EXPORT_OPTIONS.format));
    const [preset, setPreset] = useState<string>(getInitialValue("preset", DEFAULT_EXPORT_OPTIONS.preset));
    const [removeAudio, setRemoveAudio] = useState(getInitialValue("removeAudio", DEFAULT_EXPORT_OPTIONS.removeAudio));
    const [removeMarkers, setRemoveMarkers] = useState(getInitialValue("removeMarkers", DEFAULT_EXPORT_OPTIONS.removeMarkers));

    // Local destination — starts from settings but does NOT write back unless markAsDefault is checked
    const [destination, setDestination] = useState(settings.clipDestination || "");
    const [markAsDefault, setMarkAsDefault] = useState(true);
    const [isDestinationValid, setIsDestinationValid] = useState(true);

    const [useTransition, setUseTransition] = useState(segments.length > 1 ? getInitialValue("useTransition", true) : false);
    const [transitionDuration, setTransitionDuration] = useState(() => {
        const val = getInitialValue("transitionDuration", 1);
        return val > 0 ? val : 1;
    });
    const [transitionStyle, setTransitionStyle] = useState<TransitionStyle>(getInitialValue("transitionStyle", "smear-left"));

    // Persist on change globally
    const persistOptions = useCallback(
        (updated: Partial<ExportOptions>) => {
            const current: ExportOptions = {
                name,
                quality,
                resolution,
                format,
                removeAudio,
                removeMarkers,
                crf: customCRF,
                preset,
                useTransition,
                transitionDuration: useTransition ? transitionDuration : 0,
                transitionStyle,
                ...updated,
            };
            if (updateSettings) {
                updateSettings({ lastExportOptions: current });
            }
        },
        [
            name,
            quality,
            resolution,
            format,
            removeAudio,
            removeMarkers,
            customCRF,
            preset,
            useTransition,
            transitionDuration,
            transitionStyle,
            updateSettings,
        ],
    );

    // Sync state if video changes or modal opens with new initialOptions
    useEffect(() => {
        if (visible) {
            setQuality(getInitialValue("quality", DEFAULT_EXPORT_OPTIONS.quality));
            setCustomCRF(getInitialValue("crf", DEFAULT_EXPORT_OPTIONS.crf));
            setResolution(getInitialValue("resolution", DEFAULT_EXPORT_OPTIONS.resolution));
            setFormat(getInitialValue("format", DEFAULT_EXPORT_OPTIONS.format));
            setPreset(getInitialValue("preset", DEFAULT_EXPORT_OPTIONS.preset));
            setRemoveAudio(getInitialValue("removeAudio", DEFAULT_EXPORT_OPTIONS.removeAudio));
            setRemoveMarkers(getInitialValue("removeMarkers", DEFAULT_EXPORT_OPTIONS.removeMarkers));

            // Default transitions to last saved state if multiple segments
            setUseTransition(segments.length > 1 ? getInitialValue("useTransition", DEFAULT_EXPORT_OPTIONS.useTransition) : false);
            const savedDur = getInitialValue("transitionDuration", DEFAULT_EXPORT_OPTIONS.transitionDuration);
            setTransitionDuration(Math.min(5.0, Math.max(0, savedDur)));
            setTransitionStyle(getInitialValue("transitionStyle", DEFAULT_EXPORT_OPTIONS.transitionStyle));
        }
    }, [visible, video.id, segments.length]);

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
        const resolved = normalizeMediaDestination(destination);

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
        let targetCRF = DEFAULT_EXPORT_OPTIONS.crf;
        if (quality === "high") targetCRF = 18;
        else if (quality === "low") targetCRF = 32;
        else if (quality === "custom") targetCRF = customCRF;

        if (markAsDefault && destination && updateSettings) {
            updateSettings({ clipDestination: destination });
        }
        onExport({
            name,
            quality,
            resolution,
            format,
            removeAudio,
            removeMarkers,
            crf: targetCRF,
            preset,
            useTransition,
            transitionDuration: useTransition ? transitionDuration : 0,
            transitionStyle,
        });
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
                    <Text className="text-text text-lg font-bold">{isReexport ? "Re-export Clip" : "Export Clip"}</Text>
                </View>
                <TouchableOpacity
                    onPress={handleExport}
                    className="bg-primary px-6 rounded-full items-center justify-center"
                    style={{ height: ROW_H - 12 }}
                >
                    <Text className="text-white font-bold text-base">{isReexport ? "Re-export" : "Start"}</Text>
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
                    <DestinationPicker
                        value={destination}
                        onChange={(_, path) => setDestination(path)}
                        isValid={isDestinationValid}
                    />

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
                                if (quality === "high") return "CRF 18";
                                if (quality === "balanced") return `CRF ${DEFAULT_EXPORT_OPTIONS.crf}`;
                                if (quality === "low") return "CRF 32";
                                return "---";
                            })()}
                        </Text>
                    </View>
                    <SegmentedControl
                        value={quality}
                        onChange={(val) => {
                            setQuality(val);
                            persistOptions({ quality: val });
                        }}
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
                            <View className="h-10 justify-center">
                                <Slider
                                    onResponderGrant={() => true} // Allows touch to work inside a scrollable view
                                    minimumValue={crfRange.min}
                                    maximumValue={crfRange.max}
                                    step={1}
                                    value={customCRF}
                                    onValueChange={setCustomCRF}
                                    onSlidingComplete={(val) => persistOptions({ crf: val })}
                                    minimumTrackTintColor={colors.primary}
                                    maximumTrackTintColor="#3f3f46"
                                    thumbTintColor={colors.primary}
                                />
                            </View>
                            <View className="flex-row justify-between">
                                <Text className="text-zinc-500 text-xs">{crfRange.min} (Better)</Text>
                                <Text className="text-zinc-500 text-xs">{crfRange.max} (Smaller)</Text>
                            </View>
                        </View>
                    )}
                </View>

                {/* Preset */}
                <View className="gap-2">
                    <SectionLabel>Encoder Preset</SectionLabel>
                    <SelectDropdown
                        value={preset}
                        onChange={(val) => {
                            setPreset(val);
                            persistOptions({ preset: val });
                        }}
                        options={[
                            {
                                label: "Ultrafast",
                                value: "ultrafast",
                                sublabel: "Fastest export · Largest file · Lower quality",
                                enabled: true,
                            },
                            { label: "Fast", value: "fast", sublabel: "Quick export · Moderate file size", enabled: true },
                            { label: "Medium", value: "medium", sublabel: "Balanced speed and compression", enabled: true },
                            {
                                label: "Slower",
                                value: "slower",
                                sublabel: "Best compression · Smallest file · Recommended",
                                enabled: true,
                            },
                        ]}
                    />
                </View>

                {/* Resolution + Format — side by side */}
                <View className="flex-row gap-4">
                    <View className="flex-1 gap-2">
                        <SectionLabel>Resolution</SectionLabel>
                        <SelectDropdown
                            value={resolution}
                            options={resolutionDropdownOptions}
                            onChange={(val) => {
                                setResolution(val);
                                persistOptions({ resolution: val });
                            }}
                        />
                    </View>
                    <View className="flex-1 gap-2">
                        <SectionLabel>Format</SectionLabel>
                        <SelectDropdown
                            value={format}
                            options={formatDropdownOptions}
                            onChange={(val) => {
                                setFormat(val);
                                persistOptions({ format: val });
                            }}
                        />
                    </View>
                </View>

                {/* Segments summary */}
                {segments.length > 0 &&
                    (() => {
                        const totalSegmentsSec = segments.reduce((acc, s) => acc + (s.end - s.start), 0);
                        const transSec = useTransition && segments.length > 1 ? (segments.length - 1) * transitionDuration : 0;
                        const totalSec = totalSegmentsSec + transSec;

                        return (
                            <View className="bg-zinc-800/40 rounded-xl border border-white/5 p-3 gap-1">
                                <View className="flex-row items-center justify-between pb-1">
                                    <Text className="text-secondary text-sm uppercase font-bold tracking-widest ml-1">
                                        Clip Segments ({segments.length})
                                    </Text>
                                    <Text className="text-zinc-400 text-sm font-mono">{secondsToHhmmss(totalSec)}</Text>
                                </View>
                                {segments.map((seg, idx) => (
                                    <Fragment key={idx}>
                                        <View className="flex-row items-center gap-2 py-1.5">
                                            <TriangleDown color={colors.primary} size={9} />
                                            <Text className="text-text text-sm font-mono">
                                                {secondsToHhmmss(seg.start)} – {secondsToHhmmss(seg.end)}
                                            </Text>
                                            <Text className="text-zinc-500 text-sm ml-auto">
                                                {secondsToHhmmss(seg.end - seg.start)}
                                            </Text>
                                        </View>
                                        {useTransition && idx < segments.length - 1 && (
                                            <View className="flex-row items-center gap-2 py-1 bg-primary/5 rounded px-2 my-0.5 border border-primary/10">
                                                <Icon icon={Scissors} size={10} className="text-primary/60" />
                                                <Text className="text-primary/70 text-[10px] font-bold uppercase tracking-wider">
                                                    {TRANSITION_OPTIONS.find((o) => o.value === transitionStyle)?.label ||
                                                        transitionStyle}{" "}
                                                    Transition
                                                </Text>
                                                <Text className="text-primary/50 text-[10px] font-mono ml-auto">
                                                    +{transitionDuration}s
                                                </Text>
                                            </View>
                                        )}
                                    </Fragment>
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
                            onValueChange={(val) => {
                                setRemoveAudio(val);
                                persistOptions({ removeAudio: val });
                            }}
                            trackColor={{ false: "#3f3f46", true: colors.primary }}
                            thumbColor={removeAudio ? "#fff" : "#a1a1aa"}
                        />
                    </View>
                    <View
                        className="flex-row items-center justify-between px-4 border-b border-white/5"
                        style={{ height: ROW_H }}
                    >
                        <View className="flex-row items-center gap-4">
                            <TriangleDown color={removeMarkers ? colors.error : colors.primary} size={10} className="mx-0.5" />
                            <Text className="text-text text-base">Remove All Markers</Text>
                        </View>
                        <Switch
                            value={removeMarkers}
                            onValueChange={(val) => {
                                setRemoveMarkers(val);
                                persistOptions({ removeMarkers: val });
                            }}
                            trackColor={{ false: "#3f3f46", true: colors.primary }}
                            thumbColor={removeMarkers ? "#fff" : "#a1a1aa"}
                        />
                    </View>

                    {/* Transition Setting */}
                    <View
                        className="px-4 py-3 border-b border-white/5 gap-4"
                        style={{ opacity: segments.length <= 1 ? 0.3 : 1 }}
                        pointerEvents={segments.length <= 1 ? "none" : "auto"}
                    >
                        <View className="flex-row items-center justify-between">
                            <View className="flex-row items-center gap-3">
                                <Icon icon={Scissors} size={17} color={useTransition ? colors.primary : "#71717a"} />
                                <Text className={cn("text-base", segments.length <= 1 ? "text-zinc-600" : "text-text")}>
                                    Clip Transitions
                                </Text>
                            </View>
                            <Switch
                                value={useTransition}
                                onValueChange={(val) => {
                                    setUseTransition(val);
                                    persistOptions({ useTransition: val, transitionDuration: val ? transitionDuration : 0 });
                                }}
                                disabled={segments.length <= 1}
                                trackColor={{ false: "#3f3f46", true: colors.primary }}
                                thumbColor={useTransition ? "#fff" : "#a1a1aa"}
                            />
                        </View>

                        {useTransition && segments.length > 1 && (
                            <View className="gap-4">
                                <View>
                                    <Text className="text-zinc-500 text-xs font-bold uppercase mb-2">Style</Text>
                                    <SelectDropdown
                                        value={transitionStyle}
                                        options={TRANSITION_OPTIONS}
                                        onChange={(val) => {
                                            const s = val as TransitionStyle;
                                            setTransitionStyle(s);
                                            persistOptions({ transitionStyle: s });
                                        }}
                                    />
                                </View>

                                <View>
                                    <View className="flex-row justify-between items-center mb-1">
                                        <Text className="text-zinc-500 text-xs font-bold uppercase">Duration</Text>
                                        <Text className="text-primary font-mono font-bold">{transitionDuration.toFixed(1)}s</Text>
                                    </View>
                                    <Slider
                                        onResponderGrant={() => true} // Allows touch to work inside a scrollable view
                                        style={{ height: 40 }}
                                        minimumValue={0}
                                        maximumValue={5}
                                        step={0.1}
                                        value={transitionDuration}
                                        onValueChange={setTransitionDuration}
                                        onSlidingComplete={(val) => persistOptions({ transitionDuration: val })}
                                        minimumTrackTintColor={colors.primary}
                                        maximumTrackTintColor="#3f3f46"
                                        thumbTintColor={colors.primary}
                                    />
                                </View>
                            </View>
                        )}
                    </View>
                </View>
            </ThemedBottomSheetScrollView>
        </ThemedBottomSheet>
    );
};
