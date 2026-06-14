import React, { useState } from "react";
import { View, Text, TouchableOpacity, ActivityIndicator } from "react-native";
import { FolderOpen, X } from "lucide-react-native";
import { Icon } from "./Icon";
import { cn } from "@/lib/utils";
import * as FileSystem from "expo-file-system/legacy";
import { normalizeMediaDestination } from "@/utils/mediaDestination";

interface DestinationPickerProps {
    value: string; // Display path
    onChange: (uri: string, displayPath: string) => void;
    isValid?: boolean;
    placeholder?: string;
    containerClassName?: string;
}

const ROW_H = 48;

export function DestinationPicker({
    value,
    onChange,
    isValid = true,
    placeholder = "Select directory...",
    containerClassName,
}: DestinationPickerProps) {
    const [isLoading, setIsLoading] = useState(false);

    const handlePick = async () => {
        if (isLoading) return;
        setIsLoading(true);
        try {
            const result = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
            if (result.granted) {
                const uri = result.directoryUri;
                const normalized = normalizeMediaDestination(uri) ?? uri;
                onChange(uri, normalized);
            }
        } catch (err) {
            console.warn("Failed to pick directory", err);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <View className={cn("gap-2", containerClassName)}>
            <View className="flex-row gap-2">
                <TouchableOpacity
                    onPress={handlePick}
                    disabled={isLoading}
                    className={cn(
                        "bg-zinc-800/80 border rounded-2xl px-4 flex-row items-center justify-between flex-1",
                        isValid ? "border-white/10" : "border-red-500/50",
                        isLoading && "opacity-80",
                    )}
                    style={{ height: ROW_H }}
                >
                    <View className="flex-row items-center gap-3 flex-1 mr-4">
                        <Icon icon={FolderOpen} size={20} color={isValid ? "#a1a1aa" : "#ef4444"} />
                        <Text className={cn("text-base flex-1", value ? "text-zinc-100" : "text-zinc-500")} numberOfLines={1}>
                            {value || placeholder}
                        </Text>
                    </View>
                    {!isValid && <Text className="text-red-400 text-xs font-bold">Invalid</Text>}

                    {/* Loading Overlay */}
                    {isLoading && (
                        <View
                            className="absolute inset-0 bg-black/60 rounded-2xl items-center justify-center flex-row gap-2"
                            pointerEvents="none"
                        >
                            <ActivityIndicator size="small" color="#fff" />
                        </View>
                    )}
                </TouchableOpacity>

                {value && !isLoading ? (
                    <TouchableOpacity
                        style={{ height: ROW_H, width: ROW_H }}
                        className="items-center justify-center bg-zinc-800/80 rounded-2xl border border-white/10"
                        onPress={() => onChange("", "")}
                    >
                        <Icon icon={X} size={18} className="text-zinc-500" />
                    </TouchableOpacity>
                ) : null}
            </View>
        </View>
    );
}
