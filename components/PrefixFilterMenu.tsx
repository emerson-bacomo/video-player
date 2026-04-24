import { useMedia } from "@/hooks/useMedia";
import { Check, ListFilter, RotateCcw } from "lucide-react-native";
import React from "react";
import { ActivityIndicator, Text, TouchableOpacity, View } from "react-native";
import { cn } from "../utils/cn";
import { Icon } from "./Icon";
import { Menu } from "./Menu";

interface PrefixFilterMenuProps {
    options: { label: string; value: string; count: number }[];
    selectedOptions: string[];
    onOptionToggle: (option: string) => void;
    onClearAll: () => void;
    isLoading?: boolean;
}

export const PrefixFilterMenu = ({
    options,
    selectedOptions,
    onOptionToggle,
    onClearAll,
    isLoading = false,
}: PrefixFilterMenuProps) => {
    const hasFilters = selectedOptions.length > 0;
    const { loadingTask } = useMedia();

    const [internalSelectedOptions, setInternalSelectedOptions] = React.useState<string[]>(selectedOptions);

    const handleOpen = () => {
        setInternalSelectedOptions(selectedOptions);
    };

    const handleOptionToggle = (value: string) => {
        setInternalSelectedOptions((prev) => {
            if (prev.includes(value)) {
                return prev.filter((v) => v !== value);
            }
            return [...prev, value];
        });
        
        // Defer the heavy global update so the UI feedback is instant
        setTimeout(() => {
            onOptionToggle(value);
        }, 0);
    };

    const handleClearAll = () => {
        setInternalSelectedOptions([]);
        setTimeout(() => {
            onClearAll();
        }, 0);
    };

    return (
        <Menu variant="POPUP" anchorHorizontal="center" horizontalScreenFill={true} maxWidth="fit-content" onOpen={handleOpen}>
            <Menu.Trigger
                activeOpacity={0.7}
                className={cn(
                    "flex-row items-center p-2 px-3 rounded-full border gap-1.5",
                    hasFilters ? "bg-primary/20 border-primary/50" : "bg-card border-border",
                )}
            >
                <View className="flex-row items-center gap-1.5" style={{ opacity: isLoading ? 0 : 1 }}>
                    <Icon icon={ListFilter} size={18} className={hasFilters ? "text-primary" : "text-secondary"} />
                    {hasFilters && (
                        <View className="bg-primary rounded-full px-1.5 min-w-[18px] h-[18px] items-center justify-center">
                            <Text className="text-white text-[10px] font-bold">{selectedOptions.length}</Text>
                        </View>
                    )}
                </View>
            </Menu.Trigger>

            <Menu.Content>
                <Menu.Header>
                    <View className="flex-row items-center gap-4">
                        <Text className="text-secondary font-bold text-[10px] uppercase tracking-widest">Filter by Prefix</Text>
                        <View>{loadingTask && <ActivityIndicator color="#3b82f6" />}</View>
                    </View>

                    {internalSelectedOptions.length > 0 && (
                        <TouchableOpacity
                            onPress={handleClearAll}
                            className="flex-row items-center gap-1.5 bg-primary/10 px-2.5 py-1.5 rounded-full border border-primary/20"
                        >
                            <Icon icon={RotateCcw} size={10} className="text-primary" />
                            <Text className="text-primary text-[10px] font-bold">Clear All</Text>
                        </TouchableOpacity>
                    )}
                </Menu.Header>

                <Menu.List
                    data={options}
                    keyExtractor={(item: any) => item.value}
                    renderItem={({ item: option }: any) => {
                        const isSelected = internalSelectedOptions.includes(option.value);
                        return (
                            <TouchableOpacity
                                activeOpacity={0.7}
                                className={cn(
                                    "flex-row items-center justify-between px-5 py-4",
                                    isSelected ? "bg-primary/5" : "active:bg-card",
                                )}
                                onPress={() => handleOptionToggle(option.value)}
                            >
                                <View className="flex-row items-center gap-4 flex-1">
                                    <View
                                        className={cn(
                                            "w-5 h-5 rounded-md border items-center justify-center",
                                            isSelected ? "bg-primary border-primary" : "border-border bg-card",
                                        )}
                                    >
                                        {isSelected && <Icon icon={Check} size={14} className="text-white" />}
                                    </View>
                                    <Text
                                        className={cn("text-sm font-semibold flex-1", isSelected ? "text-primary" : "text-text")}
                                        numberOfLines={1}
                                    >
                                        {option.label}
                                    </Text>
                                </View>
                                <View className="bg-card/80 px-2 py-1 rounded-lg ml-3 border border-border/50">
                                    <Text className="text-secondary text-[11px] font-bold">{option.count}</Text>
                                </View>
                            </TouchableOpacity>
                        );
                    }}
                    ListEmptyComponent={
                        <View className="px-4 py-10 items-center">
                            <Text className="text-secondary text-sm text-center italic">No common patterns detected</Text>
                        </View>
                    }
                />
            </Menu.Content>
        </Menu>
    );
};
