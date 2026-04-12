import { ArrowUpDown, Check, SortAsc } from "lucide-react-native";
import React from "react";
import { Text, TouchableOpacity, View } from "react-native";
import { SortBy, SortOrder } from "../hooks/useMedia";
import { cn } from "../utils/cn";
import { Menu } from "./Menu";
import { Icon } from "./Icon";

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
                className="flex-row items-center bg-card p-2 rounded-full border border-border gap-1.5"
            >
                <Icon icon={CurrentIcon} size={18} className="text-primary" />
                <Icon icon={ArrowUpDown} size={12} className="text-secondary" />
            </Menu.Trigger>

            <Menu.Content>
                <View className="px-4 py-3 border-b border-border">
                    <Text className="text-secondary font-bold text-[10px] uppercase tracking-widest">Sort By</Text>
                </View>

                {options.map((option) => {
                    const isSelected = currentSort.by === option.value;
                    const LucideIconProp = option.icon;

                    return (
                        <TouchableOpacity
                            key={option.value}
                            className={cn(
                                "flex-row items-center justify-between px-4 py-3.5 min-w-52",
                                isSelected ? "bg-primary/10" : "active:bg-card",
                            )}
                            onPress={() => {
                                onSortChange({
                                    by: option.value,
                                    order: isSelected ? (currentSort.order === "asc" ? "desc" : "asc") : "asc",
                                });
                            }}
                        >
                            <View className="flex-row items-center gap-3">
                                <Icon icon={LucideIconProp} size={18} className={isSelected ? "text-primary" : "text-secondary"} />
                                <Text className={cn("text-sm font-medium", isSelected ? "text-primary" : "text-text")}>
                                    {option.label}
                                </Text>
                            </View>
                            {isSelected && (
                                <View className="flex-row items-center gap-1.5">
                                    <Text className="text-primary/50 text-[9px] uppercase font-bold">{currentSort.order}</Text>
                                    <Icon icon={Check} size={14} className="text-primary" />
                                </View>
                            )}
                        </TouchableOpacity>
                    );
                })}
            </Menu.Content>
        </Menu>
    );
};
