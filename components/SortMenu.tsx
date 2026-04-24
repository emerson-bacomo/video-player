import { ArrowDown, ArrowUp, ArrowUpDown, SortAsc } from "lucide-react-native";
import React from "react";
import { ActivityIndicator, Text, TouchableOpacity, View } from "react-native";
import { SortBy, SortOrder, useMedia } from "../hooks/useMedia";
import { cn } from "../utils/cn";
import { Icon } from "./Icon";
import { Menu } from "./Menu";

interface SortMenuProps<T extends string = SortBy> {
    currentSort: { by: T; order: SortOrder };
    onSortChange: (sort: { by: T; order: SortOrder }) => void;
    options: { label: string; value: T; icon: any }[];
    mode?: "local" | "global";
    onModeChange?: (mode: "local" | "global") => void;
    showTabs?: boolean;
    isLoading?: boolean;
}

export const SortMenu = <T extends string = SortBy>({
    currentSort,
    onSortChange,
    options,
    mode = "global",
    onModeChange,
    showTabs,
    isLoading = false,
}: SortMenuProps<T>) => {
    const CurrentIcon = options.find((o) => o.value === currentSort.by)?.icon || SortAsc;
    const { loadingTask } = useMedia();

    return (
        <Menu variant="POPUP">
            <Menu.Trigger
                activeOpacity={0.7}
                className="flex-row items-center bg-card p-2 px-3 rounded-full border border-border gap-1.5"
            >
                <View className="flex-row items-center gap-1.5" style={{ opacity: isLoading ? 0 : 1 }}>
                    <Icon icon={CurrentIcon} size={18} className="text-primary" />
                    <Icon icon={ArrowUpDown} size={12} className="text-secondary" />
                </View>
            </Menu.Trigger>

            <Menu.Content>
                {showTabs && onModeChange && (
                    <View className="flex-row p-1 bg-zinc-900 mx-3 mt-3 mb-2 rounded-xl border border-white/5">
                        <TouchableOpacity
                            onPress={() => onModeChange("local")}
                            className={cn(
                                "flex-1 py-1.5 rounded-lg items-center justify-center",
                                mode === "local" ? "bg-zinc-800" : "bg-transparent",
                            )}
                        >
                            <Text
                                className={cn(
                                    "text-[10px] font-black uppercase tracking-widest",
                                    mode === "local" ? "text-primary" : "text-secondary",
                                )}
                            >
                                Local
                            </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            onPress={() => onModeChange("global")}
                            className={cn(
                                "flex-1 py-1.5 rounded-lg items-center justify-center",
                                mode === "global" ? "bg-zinc-800" : "bg-transparent",
                            )}
                        >
                            <Text
                                className={cn(
                                    "text-[10px] font-black uppercase tracking-widest",
                                    mode === "global" ? "text-primary" : "text-secondary",
                                )}
                            >
                                Global
                            </Text>
                        </TouchableOpacity>
                    </View>
                )}

                <View className="px-4 py-2.5 border-b border-white/5 flex-row justify-between items-center">
                    <Text className="text-secondary font-bold text-[10px] uppercase tracking-widest">{mode} Sort</Text>
                    <TouchableOpacity
                        onPress={() => onSortChange({ ...currentSort, order: currentSort.order === "asc" ? "desc" : "asc" })}
                        activeOpacity={0.7}
                        className="bg-zinc-900/50 p-2 px-3 rounded-full border border-white/5 flex-row items-center gap-2"
                    >
                        <Text className="text-primary text-[9px] font-black uppercase tracking-tight">
                            {currentSort.order === "asc" ? "Asc" : "Desc"}
                        </Text>
                        <Icon icon={currentSort.order === "asc" ? ArrowUp : ArrowDown} size={14} className="text-primary" />
                    </TouchableOpacity>
                </View>

                {options.map((option) => {
                    const isSelected = currentSort.by === option.value;
                    const LucideIconProp = option.icon;

                    return (
                        <TouchableOpacity
                            key={option.value}
                            className={cn(
                                "flex-row items-center justify-between px-4 py-3.5 min-w-56",
                                isSelected ? "bg-primary/10" : "active:bg-card",
                            )}
                            onPress={() => {
                                onSortChange({
                                    by: option.value,
                                    order: currentSort.order,
                                });
                            }}
                        >
                            <View className="flex-row items-center gap-3">
                                <Icon
                                    icon={LucideIconProp}
                                    size={18}
                                    className={isSelected ? "text-primary" : "text-secondary"}
                                />
                                <Text className={cn("text-sm font-medium", isSelected ? "text-primary" : "text-text")}>
                                    {option.label}
                                </Text>
                            </View>
                            {isSelected && loadingTask && (
                                <View className="absolute right-4 inset-y-0 justify-center">
                                    <ActivityIndicator size="small" color="#3b82f6" />
                                </View>
                            )}
                        </TouchableOpacity>
                    );
                })}
            </Menu.Content>
        </Menu>
    );
};
