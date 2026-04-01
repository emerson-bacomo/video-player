import { Check, ListFilter, RotateCcw } from "lucide-react-native";
import React from "react";
import { ScrollView, Text, TouchableOpacity, View } from "react-native";
import { cn } from "../utils/cn";
import { BaseMenu } from "./BaseMenu";

interface PrefixFilterMenuProps {
    options: { label: string; count: number }[];
    selectedOptions: string[];
    onOptionToggle: (option: string) => void;
    onClearAll: () => void;
}

export const PrefixFilterMenu = ({ options, selectedOptions, onOptionToggle, onClearAll }: PrefixFilterMenuProps) => {
    const hasFilters = selectedOptions.length > 0;

    return (
        <BaseMenu variant="POPUP" anchorHorizontal="center" horizontalScreenFill={true} maxWidth="fit-content">
            <BaseMenu.Trigger
                activeOpacity={0.7}
                className={cn(
                    "flex-row items-center p-2 rounded-full border gap-1.5",
                    hasFilters ? "bg-blue-600/20 border-blue-500/50" : "bg-zinc-900 border-zinc-800",
                )}
            >
                <ListFilter size={18} color={hasFilters ? "#3b82f6" : "#71717a"} />
                {hasFilters && (
                    <View className="bg-blue-500 rounded-full px-1.5 min-w-[18px] h-[18px] items-center justify-center">
                        <Text className="text-white text-[10px] font-bold">{selectedOptions.length}</Text>
                    </View>
                )}
            </BaseMenu.Trigger>

            <BaseMenu.Content>
                <View className="flex-row items-center justify-between px-5 h-14 border-b border-zinc-800 bg-zinc-900/50">
                    <Text className="text-zinc-500 font-bold text-[10px] uppercase tracking-widest">Filter by Prefix</Text>

                    {hasFilters && (
                        <TouchableOpacity
                            onPress={onClearAll}
                            className="flex-row items-center gap-1.5 bg-blue-600/10 px-2.5 py-1.5 rounded-full border border-blue-500/20"
                        >
                            <RotateCcw size={10} color="#3b82f6" />
                            <Text className="text-blue-500 text-[10px] font-bold">Clear All</Text>
                        </TouchableOpacity>
                    )}
                </View>

                <ScrollView
                    className="flex-grow-0"
                    showsVerticalScrollIndicator={true}
                    contentContainerStyle={{ paddingBottom: 12 }}
                >
                    {options.length === 0 ? (
                        <View className="px-4 py-10 items-center">
                            <Text className="text-zinc-600 text-sm text-center italic">No common patterns detected</Text>
                        </View>
                    ) : (
                        options.map((option) => (
                            <OptionItem
                                key={option.label}
                                option={option}
                                isSelected={selectedOptions.includes(option.label)}
                                onToggle={onOptionToggle}
                            />
                        ))
                    )}
                </ScrollView>
            </BaseMenu.Content>
        </BaseMenu>
    );
};

const OptionItem = React.memo(({ option, isSelected, onToggle }: any) => {
    return (
        <TouchableOpacity
            activeOpacity={0.7}
            className={cn("flex-row items-center justify-between px-5 py-4", isSelected ? "bg-blue-600/5" : "active:bg-zinc-800")}
            onPress={() => onToggle(option.label)}
        >
            <View className="flex-row items-center gap-4 flex-1">
                <View
                    className={cn(
                        "w-5 h-5 rounded-md border items-center justify-center",
                        isSelected ? "bg-blue-500 border-blue-500" : "border-zinc-700 bg-zinc-800",
                    )}
                >
                    {isSelected && <Check size={14} color="white" />}
                </View>
                <Text
                    className={cn("text-sm font-semibold flex-1", isSelected ? "text-blue-500" : "text-zinc-300")}
                    numberOfLines={1}
                >
                    {option.label}
                </Text>
            </View>
            <View className="bg-zinc-800/80 px-2 py-1 rounded-lg ml-3 border border-zinc-700/50">
                <Text className="text-zinc-500 text-[11px] font-bold">{option.count}</Text>
            </View>
        </TouchableOpacity>
    );
});
