import { Icon } from "@/components/Icon";
import { ChevronDown, ChevronRight, Folder, Palette, Settings, Video } from "lucide-react-native";
import * as Icons from "lucide-react-native";
import React, { useMemo, useState } from "react";
import type { ReactElement } from "react";
import { SectionList, Text, TouchableOpacity, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ConfigData } from "@/utils/configManager";
import { cn } from "@/lib/utils";

interface VpcPreviewProps {
    configData: ConfigData;
    ListHeaderComponent?: ReactElement;
    selectedIds: Set<string>;
    onToggleId: (id: string) => void;
}

export function VpcPreview({ configData, ListHeaderComponent, selectedIds, onToggleId }: VpcPreviewProps) {
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});
    const [pages, setPages] = useState<Record<string, number>>({});
    const insets = useSafeAreaInsets();
    const { height: viewportHeight } = useWindowDimensions();

    const ITEM_HEIGHT = 64;
    const TOP_CONTROLS_HEIGHT = 160; // Approximate height of headers/insets/warnings

    const pageSize = useMemo(() => {
        const availableHeight = viewportHeight - insets.top - insets.bottom - TOP_CONTROLS_HEIGHT;
        return Math.max(5, Math.floor(availableHeight / ITEM_HEIGHT));
    }, [viewportHeight, insets]);

    const formatTime = (seconds: number) => {
        if (seconds < 0) return "Never played";
        const m = Math.floor(seconds / 60);
        const s = Math.floor(seconds % 60);
        return `${m}m ${s}s`;
    };

    const toggleSection = (title: string) => {
        setCollapsedSections((prev) => ({
            ...prev,
            [title]: !prev[title],
        }));
    };

    const sections = useMemo(() => {
        const result = [];

        // 1. Settings
        const settingsCount = Object.keys(configData.settings || {}).length;
        if (settingsCount > 0) {
            result.push({
                title: "Settings",
                icon: Settings,
                type: "settings",
                data: collapsedSections["Settings"]
                    ? []
                    : [
                          {
                              id: "settings",
                              label: "Global Configuration",
                              sub: `${settingsCount} values`,
                              raw: configData.settings,
                          },
                      ],
                count: settingsCount,
            });
        }

        // 2. Themes
        if (configData.themes && configData.themes.length > 0) {
            const currentPage = pages["Themes"] || 1;
            const data = configData.themes.map((t) => ({
                id: `theme:${t.name}`,
                label: t.name,
                sub: `${Object.keys(t.colors || {}).length} colors`,
                raw: t,
            }));

            result.push({
                title: "Themes",
                icon: Palette,
                type: "theme",
                data: collapsedSections["Themes"] ? [] : data.slice((currentPage - 1) * pageSize, currentPage * pageSize),
                count: data.length,
            });
        }

        // 3. Videos
        if (configData.videos && configData.videos.length > 0) {
            const currentPage = pages["Videos"] || 1;
            const data = configData.videos.map((v) => ({
                id: `video:${v.uri}`,
                label: v.uri.split("/").pop(),
                sub: v.uri,
                raw: v,
            }));

            result.push({
                title: "Videos",
                icon: Video,
                type: "video",
                data: collapsedSections["Videos"] ? [] : data.slice((currentPage - 1) * pageSize, currentPage * pageSize),
                count: data.length,
            });
        }

        // 4. Albums
        if (configData.albums && configData.albums.length > 0) {
            const currentPage = pages["Albums"] || 1;
            const data = configData.albums.map((a) => ({
                id: `album:${a.uri}`,
                label: a.uri.split("/").pop(),
                sub: a.uri,
                raw: a,
            }));

            result.push({
                title: "Albums",
                icon: Folder,
                type: "album",
                data: collapsedSections["Albums"] ? [] : data.slice((currentPage - 1) * pageSize, currentPage * pageSize),
                count: data.length,
            });
        }

        return result;
    }, [configData, collapsedSections, pages, pageSize]);

    const renderItem = ({ item, section }: { item: any; section: any }) => {
        const isExpanded = expandedId === item.id;
        const isSelected = selectedIds.has(item.id);
        const raw = item.raw;

        return (
            <View className="border-b border-white/5">
                <View className="flex-row items-center bg-black">
                    <TouchableOpacity
                        activeOpacity={0.7}
                        onPress={() => setExpandedId(isExpanded ? null : item.id)}
                        className="flex-1 px-4 py-3 flex-row gap-3 items-center"
                    >
                        <Icon icon={isExpanded ? ChevronDown : ChevronRight} size={16} className="text-text" />
                        <View className="flex-1">
                            <Text className="text-zinc-100 font-medium" numberOfLines={1}>
                                {item.label}
                            </Text>
                            <Text className="text-zinc-500 text-xs mt-0.5" numberOfLines={1}>
                                {item.sub}
                            </Text>
                        </View>
                    </TouchableOpacity>

                    <TouchableOpacity
                        onPress={() => onToggleId(item.id)}
                        className="p-4"
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    >
                        <View
                            className={cn(
                                "w-6 h-6 rounded-md border-2 items-center justify-center",
                                isSelected ? "bg-primary border-primary" : "border-zinc-700 bg-transparent",
                            )}
                        >
                            {isSelected && <Icon icon={Icons.Check} size={14} color="white" />}
                        </View>
                    </TouchableOpacity>
                </View>

                {isExpanded && (
                    <View className="px-4 py-3 bg-zinc-900/50 gap-2 ml-11 mr-5">
                        {section.type === "video" && (
                            <>
                                {raw.lastPlayedSec !== undefined && (
                                    <View className="flex-row justify-between">
                                        <Text className="text-zinc-500 text-xs">Playback Position</Text>
                                        <Text className="text-zinc-300 text-xs font-medium">{formatTime(raw.lastPlayedSec)}</Text>
                                    </View>
                                )}
                                {raw.lastOpenedTime !== undefined && (
                                    <View className="flex-row justify-between">
                                        <Text className="text-zinc-500 text-xs">Last Opened</Text>
                                        <Text className="text-zinc-300 text-xs font-medium">
                                            {new Date(raw.lastOpenedTime).toLocaleString()}
                                        </Text>
                                    </View>
                                )}
                                {raw.markers !== undefined && raw.markers.length > 0 && (
                                    <View className="mt-1">
                                        <Text className="text-zinc-500 text-[10px] font-bold uppercase mb-1.5">
                                            Markers ({raw.markers.length})
                                        </Text>
                                        <View className="flex-row flex-wrap gap-1.5">
                                            {raw.markers.map((m: any, idx: number) => (
                                                <View
                                                    key={idx}
                                                    className="bg-zinc-800/80 px-2 py-1 rounded border border-white/5 flex-row items-center gap-1"
                                                >
                                                    <View className="w-1 h-1 rounded-full bg-primary" />
                                                    <Text className="text-zinc-300 text-[10px] font-mono">
                                                        {formatTime(m.time)}
                                                    </Text>
                                                </View>
                                            ))}
                                        </View>
                                    </View>
                                )}
                                {raw.segments !== undefined && raw.segments.length > 0 && (
                                    <View className="mt-1">
                                        <Text className="text-zinc-500 text-[10px] font-bold uppercase mb-1.5">
                                            Segments ({raw.segments.length})
                                        </Text>
                                        <View className="flex-row flex-wrap gap-1.5">
                                            {raw.segments.map((s: any, idx: number) => (
                                                <View
                                                    key={idx}
                                                    className="bg-zinc-800/80 px-2 py-1 rounded border border-white/5"
                                                >
                                                    <Text className="text-zinc-300 text-[10px] font-mono">
                                                        {s.start.toFixed(1)}s - {s.end.toFixed(1)}s
                                                    </Text>
                                                </View>
                                            ))}
                                        </View>
                                    </View>
                                )}
                                {raw.isHidden && (
                                    <View className="flex-row justify-between">
                                        <Text className="text-zinc-500 text-xs">Visibility</Text>
                                        <Text className="text-red-400 text-xs font-bold uppercase">Hidden</Text>
                                    </View>
                                )}
                            </>
                        )}

                        {section.type === "settings" && (
                            <View className="gap-2">
                                {Object.entries(raw || {}).map(([key, value]: [string, any]) => {
                                    if (key === "nameReplacements" && Array.isArray(value) && value.length > 0) {
                                        return (
                                            <View key={key} className="mt-1">
                                                <Text className="text-zinc-500 text-[10px] font-bold uppercase mb-1">
                                                    Find & Replace Patterns
                                                </Text>
                                                {value.map((rule, idx) => (
                                                    <View
                                                        key={idx}
                                                        className="flex-row items-center bg-zinc-800/30 px-2 py-1.5 rounded mb-1 border border-white/5"
                                                    >
                                                        <View
                                                            className={cn(
                                                                "w-1.5 h-1.5 rounded-full mr-2",
                                                                rule.active ? "bg-primary" : "bg-zinc-600",
                                                            )}
                                                        />
                                                        <View className="flex-1 flex-row">
                                                            <Text
                                                                className="text-zinc-400 text-[10px] w-5/12"
                                                                numberOfLines={1}
                                                            >
                                                                {rule.find}
                                                            </Text>
                                                            <Icon
                                                                icon={ChevronRight}
                                                                size={10}
                                                                className="text-zinc-700 mx-2"
                                                            />
                                                            <Text
                                                                className="text-zinc-100 text-[10px] flex-1 font-medium"
                                                                numberOfLines={1}
                                                            >
                                                                {rule.replace || "(empty)"}
                                                            </Text>
                                                        </View>
                                                    </View>
                                                ))}
                                            </View>
                                        );
                                    }

                                    if (typeof value === "object" && value !== null) {
                                        // Handle cornerConfigs (Pie Menu Operations)
                                        if (key === "cornerConfigs") {
                                            return (
                                                <View key={key} className="mt-1">
                                                    <Text className="text-zinc-500 text-[10px] font-bold uppercase mb-1">
                                                        Pie Menu Operations
                                                    </Text>
                                                    {Object.entries(value).map(([pos, ops]: [string, any]) => (
                                                        <View key={pos} className="mb-2">
                                                            <Text className="text-zinc-600 text-[9px] uppercase mb-1">
                                                                {pos.replace("-", " ")}
                                                            </Text>
                                                            <View className="flex-row flex-wrap gap-1">
                                                                {(ops as any[]).map((op, idx) =>
                                                                    op ? (
                                                                        <View
                                                                            key={idx}
                                                                            className="flex-row items-center bg-zinc-800/50 px-2 py-1 rounded border border-white/5 gap-1.5"
                                                                        >
                                                                            <Icon
                                                                                icon={(Icons as any)[op.iconName] || Icons.HelpCircle}
                                                                                size={10}
                                                                                color="white"
                                                                            />
                                                                            <Text className="text-zinc-200 text-[9px]">
                                                                                {op.label}
                                                                            </Text>
                                                                        </View>
                                                                    ) : null,
                                                                )}
                                                            </View>
                                                        </View>
                                                    ))}
                                                </View>
                                            );
                                        }
                                        return null;
                                    }
                                    return (
                                        <View key={key} className="flex-row justify-between">
                                            <Text className="text-zinc-500 text-xs capitalize">
                                                {key.replace(/([A-Z])/g, " $1")}
                                            </Text>
                                            <Text className="text-zinc-300 text-xs font-medium">
                                                {String(value)}
                                            </Text>
                                        </View>
                                    );
                                })}
                            </View>
                        )}

                        {section.type === "album" && (
                            <>
                                {raw.videoSortSettingScope !== undefined && (
                                    <View className="flex-row justify-between">
                                        <Text className="text-zinc-500 text-xs">Sort Scope</Text>
                                        <Text className="text-zinc-300 text-xs font-medium uppercase">
                                            {raw.videoSortSettingScope}
                                        </Text>
                                    </View>
                                )}
                                {raw.videoSortType !== undefined && (
                                    <View className="flex-row justify-between">
                                        <Text className="text-zinc-500 text-xs">Custom Sort</Text>
                                        <Text className="text-zinc-300 text-xs font-medium" numberOfLines={1}>
                                            {raw.videoSortType}
                                        </Text>
                                    </View>
                                )}
                                {raw.isHidden && (
                                    <View className="flex-row justify-between">
                                        <Text className="text-zinc-500 text-xs">Visibility</Text>
                                        <Text className="text-red-400 text-xs font-bold uppercase">Hidden</Text>
                                    </View>
                                )}
                            </>
                        )}

                        {section.type === "theme" && (
                            <View className="flex-row flex-wrap gap-1.5 mt-1">
                                {Object.entries(raw.colors || {}).map(([key, color]: [string, any]) => (
                                    <View key={key} className="flex-row items-center bg-zinc-800 px-2 py-1 rounded-md gap-1.5">
                                        <View className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }} />
                                        <Text className="text-zinc-400 text-[10px] uppercase font-bold">{key}</Text>
                                    </View>
                                ))}
                            </View>
                        )}
                    </View>
                )}
            </View>
        );
    };

    return (
        <SectionList
            sections={sections}
            keyExtractor={(item) => item.id}
            renderSectionHeader={({ section: { title, icon, count } }) => (
                <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={() => toggleSection(title)}
                    className="px-4 py-3 bg-black flex-row items-center justify-between mt-2 border-b border-white/5"
                >
                    <View className="flex-row items-center gap-2">
                        <Icon icon={icon} size={18} className="text-primary" />
                        <Text className="text-zinc-100 font-bold text-lg">{title}</Text>
                        <Icon
                            icon={collapsedSections[title] ? ChevronRight : ChevronDown}
                            size={14}
                            className="text-zinc-600 ml-1"
                        />
                    </View>
                    <View className="bg-zinc-800 px-2 py-0.5 rounded-full">
                        <Text className="text-zinc-400 text-xs font-bold">{count}</Text>
                    </View>
                </TouchableOpacity>
            )}
            renderItem={renderItem}
            renderSectionFooter={({ section }) => {
                if (collapsedSections[section.title] || section.count <= pageSize) return null;
                const currentPage = pages[section.title] || 1;
                const totalPages = Math.ceil(section.count / pageSize);

                return (
                    <View className="flex-row items-center justify-between px-4 py-3 bg-zinc-900/30 border-b border-white/5">
                        <TouchableOpacity
                            disabled={currentPage === 1}
                            onPress={() => setPages((p) => ({ ...p, [section.title]: currentPage - 1 }))}
                            className={cn("px-3 py-1 rounded-lg", currentPage === 1 ? "opacity-30" : "bg-white/5")}
                        >
                            <Text className="text-white text-xs">Previous</Text>
                        </TouchableOpacity>
                        <Text className="text-zinc-500 text-[10px]">
                            Page {currentPage} of {totalPages}
                        </Text>
                        <TouchableOpacity
                            disabled={currentPage === totalPages}
                            onPress={() => setPages((p) => ({ ...p, [section.title]: currentPage + 1 }))}
                            className={cn("px-3 py-1 rounded-lg", currentPage === totalPages ? "opacity-30" : "bg-white/5")}
                        >
                            <Text className="text-white text-xs">Next</Text>
                        </TouchableOpacity>
                    </View>
                );
            }}
            stickySectionHeadersEnabled={false}
            contentContainerStyle={{ paddingBottom: 40 }}
            ListHeaderComponent={ListHeaderComponent}
        />
    );
}
