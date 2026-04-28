import { Icon } from "@/components/Icon";
import { ChevronDown, ChevronRight, Folder, Palette, Settings, Video } from "lucide-react-native";
import React, { useMemo, useState } from "react";
import { SectionList, Text, TouchableOpacity, View } from "react-native";
import { ConfigData } from "@/utils/configManager";
import { cn } from "@/lib/utils";

interface VpcPreviewProps {
    configData: ConfigData;
    ListHeaderComponent?: React.ReactElement;
}

export function VpcPreview({ configData, ListHeaderComponent }: VpcPreviewProps) {
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});

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

    const sections = useMemo(
        () => [
            {
                title: "Settings",
                icon: Settings,
                type: "settings",
                data: collapsedSections["Settings"]
                    ? []
                    : [
                          {
                              id: "global-settings",
                              label: "Global Configuration",
                              sub: `${Object.keys(configData.settings || {}).length} values`,
                              raw: configData.settings,
                          },
                      ],
                count: Object.keys(configData.settings || {}).length,
            },
            {
                title: "Themes",
                icon: Palette,
                type: "theme",
                data: collapsedSections["Themes"]
                    ? []
                    : configData.themes.map((t) => ({
                          id: String(t.id),
                          label: t.name,
                          sub: `${Object.keys(t.colors || {}).length} colors`,
                          raw: t,
                      })),
                count: configData.themes.length,
            },
            {
                title: "Videos",
                icon: Video,
                type: "video",
                data: collapsedSections["Videos"]
                    ? []
                    : configData.videos.slice(0, 10).map((v) => ({
                          id: v.uri,
                          label: v.uri.split("/").pop(),
                          sub: v.uri,
                          raw: v,
                      })),
                count: configData.videos.length,
            },
            {
                title: "Albums",
                icon: Folder,
                type: "album",
                data: collapsedSections["Albums"]
                    ? []
                    : configData.albums.slice(0, 10).map((a) => ({
                          id: a.uri,
                          label: a.uri.split("/").pop(),
                          sub: a.uri,
                          raw: a,
                      })),
                count: configData.albums.length,
            },
        ],
        [configData, collapsedSections],
    );

    const renderItem = ({ item, section }: { item: any; section: any }) => {
        const isExpanded = expandedId === item.id;
        const raw = item.raw;

        return (
            <View className="border-b border-white/5">
                <TouchableOpacity
                    activeOpacity={0.7}
                    onPress={() => setExpandedId(isExpanded ? null : item.id)}
                    className="px-4 py-3 flex-row gap-3 items-center justify-between bg-black"
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
                                {raw.markers !== undefined && (
                                    <View className="flex-row justify-between">
                                        <Text className="text-zinc-500 text-xs">Markers</Text>
                                        <Text className="text-zinc-300 text-xs font-medium">{raw.markers.length} markers</Text>
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

                                    if (typeof value === "object" && value !== null) return null;
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
            stickySectionHeadersEnabled={false}
            contentContainerStyle={{ paddingBottom: 40 }}
            ListHeaderComponent={ListHeaderComponent}
            ListFooterComponent={
                (configData.videos.length > 10 && !collapsedSections["Videos"]) ||
                (configData.albums.length > 10 && !collapsedSections["Albums"]) ? (
                    <Text className="text-zinc-500 text-center py-6 text-xs italic">
                        ... and {Math.max(0, configData.videos.length - 10) + Math.max(0, configData.albums.length - 10)} more
                        items
                    </Text>
                ) : null
            }
        />
    );
}
