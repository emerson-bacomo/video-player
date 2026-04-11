import { ArrowUpDown, Check, SortAsc } from "lucide-react-native";
import React from "react";
import { Text, TouchableOpacity, View } from "react-native";
import { SortBy, SortOrder } from "../hooks/useMedia";
import { cn } from "../utils/cn";
import { Menu } from "./Menu";

interface SortMenuProps {
    currentSort: { by: SortBy; order: SortOrder };
    onSortChange: (sort: { by: SortBy; order: SortOrder }) => void;
    options: { label: string; value: SortBy; icon: any }[];
}

export const SortMenu = ({ currentSort, onSortChange, options }: SortMenuProps) => {
    const CurrentIcon = options.find((o) => o.value === currentSort.by)?.icon || SortAsc;

    return (
        <Menu variant="POPUP">
            <Menu.Trigger
                activeOpacity={0.7}
                className="flex-row items-center bg-zinc-900 p-2 rounded-full border border-zinc-800 gap-1.5"
            >
                <CurrentIcon size={18} color="#3b82f6" />
                <ArrowUpDown size={12} color="#71717a" />
            </Menu.Trigger>

            <Menu.Content>
                <View className="px-4 py-3 border-b border-zinc-800">
                    <Text className="text-zinc-500 font-bold text-[10px] uppercase tracking-widest">Sort By</Text>
                </View>

                {options.map((option) => {
                    const isSelected = currentSort.by === option.value;
                    const Icon = option.icon;

                    return (
                        <TouchableOpacity
                            key={option.value}
                            className={cn(
                                "flex-row items-center justify-between px-4 py-3.5 min-w-52",
                                isSelected ? "bg-blue-600/10" : "active:bg-zinc-800",
                            )}
                            onPress={() => {
                                onSortChange({
                                    by: option.value,
                                    order: isSelected ? (currentSort.order === "asc" ? "desc" : "asc") : "asc",
                                });
                            }}
                        >
                            <View className="flex-row items-center gap-3">
                                <Icon size={18} color={isSelected ? "#3b82f6" : "#71717a"} />
                                <Text className={cn("text-sm font-medium", isSelected ? "text-blue-500" : "text-zinc-300")}>
                                    {option.label}
                                </Text>
                            </View>
                            {isSelected && (
                                <View className="flex-row items-center gap-1.5">
                                    <Text className="text-blue-500/50 text-[9px] uppercase font-bold">{currentSort.order}</Text>
                                    <Check size={14} color="#3b82f6" />
                                </View>
                            )}
                        </TouchableOpacity>
                    );
                })}
            </Menu.Content>
        </Menu>
    );
};
