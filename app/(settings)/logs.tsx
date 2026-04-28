import { Header } from "@/components/Header";
import { Icon } from "@/components/Icon";
import { Menu } from "@/components/Menu";
import { ThemedSafeAreaView } from "@/components/Themed";
import { LogEntry, useLogs } from "@/hooks/useLogs";
import { cn } from "@/utils/cn";
import { format } from "date-fns";
import { router } from "expo-router";
import { AlertCircle, AlertTriangle, Check, Info, ListFilter, RotateCcw, Share2, Trash2 } from "lucide-react-native";
import React, { useEffect, useMemo, useState } from "react";
import { FlatList, Share, Text, TouchableOpacity, View } from "react-native";

export default function LogsScreen() {
    const { logs, fetchLogs, clearLogs } = useLogs();
    const [refreshing, setRefreshing] = useState(false);
    const [selectedAction, setSelectedAction] = useState<string | null>(null);

    const actionOptions = useMemo(() => {
        const counts: Record<string, number> = {};
        logs.forEach((l) => {
            counts[l.action] = (counts[l.action] || 0) + 1;
        });

        const sortedActions = Object.keys(counts).sort();
        return [
            { label: "All Actions", value: null, count: logs.length },
            ...sortedActions.map((action) => ({
                label: action,
                value: action,
                count: counts[action],
            })),
        ];
    }, [logs]);

    const filteredLogs = useMemo(() => {
        if (!selectedAction) return logs;
        return logs.filter((l) => l.action === selectedAction);
    }, [logs, selectedAction]);

    useEffect(() => {
        fetchLogs();
    }, []);

    const onRefresh = () => {
        setRefreshing(true);
        fetchLogs();
        setRefreshing(false);
    };

    const handleShareLogs = async () => {
        const text = logs
            .map(
                (l) =>
                    `[${format(l.timestamp, "yyyy-MM-dd HH:mm:ss")}] ${l.level}: ${l.message} ${l.details ? `\nDetails: ${l.details}` : ""}`,
            )
            .join("\n\n");

        try {
            await Share.share({
                message: text,
                title: "App Logs",
            });
        } catch (error) {
            console.error("Error sharing logs", error);
        }
    };

    const LogItem = ({ item }: { item: LogEntry }) => {
        const isError = item.level === "ERROR";
        const isWarning = item.level === "WARNING";

        return (
            <View className="mb-3 border-b border-zinc-800 pb-3">
                <View className="flex-row items-center gap-2 mb-1">
                    <Icon
                        icon={isError ? AlertCircle : isWarning ? AlertTriangle : Info}
                        size={14}
                        className={cn(isError ? "text-red-500" : isWarning ? "text-yellow-500" : "text-blue-500")}
                    />
                    <Text className="text-[10px] text-zinc-500 font-mono">{format(item.timestamp, "yyyy-MM-dd HH:mm:ss")}</Text>
                    <View
                        className={cn(
                            "px-1.5 py-0.5 rounded",
                            isError ? "bg-red-500/10" : isWarning ? "bg-yellow-500/10" : "bg-blue-500/10",
                        )}
                    >
                        <Text
                            className={cn(
                                "text-[8px] font-bold",
                                isError ? "text-red-500" : isWarning ? "text-yellow-500" : "text-blue-500",
                            )}
                        >
                            {item.level}
                        </Text>
                    </View>
                </View>
                <Text className="text-text text-sm font-medium leading-5">{item.message}</Text>
                {item.details && (
                    <Text className="text-zinc-500 text-xs mt-1 font-mono bg-zinc-900/50 p-2 rounded">{item.details}</Text>
                )}
            </View>
        );
    };

    return (
        <ThemedSafeAreaView className="flex-1">
            <Header>
                <Header.Back onPress={() => router.back()} />
                <Header.Title title="System Logs" subtitle="Track app operations & errors" />
                <Header.Actions>
                    <TouchableOpacity onPress={handleShareLogs} className="p-2">
                        <Icon icon={Share2} size={20} className="text-primary" />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={clearLogs} className="p-2">
                        <Icon icon={Trash2} size={20} className="text-red-500" />
                    </TouchableOpacity>
                </Header.Actions>
            </Header>

            <View className="flex-row justify-end px-4 py-2 items-center gap-2">
                <Menu variant="POPUP" anchorHorizontal="center" horizontalScreenFill={true} maxWidth="fit-content">
                    <Menu.Trigger
                        activeOpacity={0.7}
                        className={cn(
                            "flex-row items-center p-2 px-3 rounded-full border gap-1.5",
                            selectedAction ? "bg-primary/20 border-primary/50" : "bg-card border-border",
                        )}
                    >
                        <View className="flex-row items-center gap-1.5">
                            <Icon icon={ListFilter} size={18} className={selectedAction ? "text-primary" : "text-secondary"} />
                        </View>
                    </Menu.Trigger>

                    <Menu.Content>
                        <Menu.Header>
                            <Text className="text-secondary font-bold text-xs uppercase tracking-widest">Filter Logs</Text>
                            {selectedAction && (
                                <TouchableOpacity
                                    onPress={() => setSelectedAction(null)}
                                    className="flex-row items-center gap-1.5 bg-primary/10 px-2.5 py-1.5 rounded-full border border-primary/20"
                                >
                                    <Icon icon={RotateCcw} size={10} className="text-primary" />
                                    <Text className="text-primary text-xs font-bold">Clear</Text>
                                </TouchableOpacity>
                            )}
                        </Menu.Header>

                        <Menu.List
                            data={actionOptions}
                            keyExtractor={(item: any) => item.label}
                            renderItem={({ item: option }: any) => {
                                const isSelected = selectedAction === option.value;
                                return (
                                    <TouchableOpacity
                                        activeOpacity={0.7}
                                        className={cn(
                                            "flex-row items-center justify-between px-5 py-4",
                                            isSelected ? "bg-primary/5" : "",
                                        )}
                                        onPress={() => setSelectedAction(option.value)}
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
                                                className={cn(
                                                    "text-sm font-semibold flex-1",
                                                    isSelected ? "text-primary" : "text-text",
                                                )}
                                                numberOfLines={1}
                                            >
                                                {option.label}
                                            </Text>
                                        </View>
                                        <View className="bg-card/80 px-2 py-1 rounded-lg ml-3 border border-border/50">
                                            <Text className="text-secondary text-sm font-bold">{option.count}</Text>
                                        </View>
                                    </TouchableOpacity>
                                );
                            }}
                        />
                    </Menu.Content>
                </Menu>
            </View>

            <View className="flex-1 px-4">
                <FlatList
                    data={filteredLogs}
                    keyExtractor={(item) => item.id.toString()}
                    renderItem={({ item }) => <LogItem item={item} />}
                    onRefresh={onRefresh}
                    refreshing={refreshing}
                    ListEmptyComponent={
                        <View className="flex-1 items-center justify-center pt-20">
                            <Text className="text-zinc-500 italic">No logs found</Text>
                        </View>
                    }
                    contentContainerStyle={{ paddingBottom: 40 }}
                />
            </View>
        </ThemedSafeAreaView>
    );
}
