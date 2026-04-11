import { ChevronDown, ChevronLeft, Database, Film, Info } from "lucide-react-native";
import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Dimensions, LayoutAnimation, Text, TouchableOpacity, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { useMedia } from "../hooks/useMedia";

import { cn } from "../lib/utils";

export interface LoadingTask {
    id?: string;
    label: string;
    detail: string;
    isImportant: boolean;
}

export interface LoadingStatusProps {
    task?: LoadingTask | null;
}

export const LoadingStatus: React.FC<LoadingStatusProps> = ({ task: manualTask = null }) => {
    const { loadingTask, manualRefresh, isLoadingVisible, setIsLoadingVisible, isLoadingExpanded, setIsLoadingExpanded } = useMedia();
    const screenWidth = Dimensions.get("window").width;
    const MENU_OFFSET = 40;
    const ARROW_HEIGHT = 10;
    const ARROW_WIDTH = 16;

    // Local display state — only for deferred clear (250ms fade-out delay)
    const [taskToDisplay, setTaskToDisplay] = useState(loadingTask);
    const [canExpand, setCanExpand] = useState(false);
    const [iconX, setIconX] = useState<number>(screenWidth - 60);
    const [iconWidth, setIconWidth] = useState<number>(32);
    const containerRef = useRef<View>(null);
    const fadeAnim = useSharedValue(0);
    // Ref to prevent auto-show from firing more than once per task session
    const hasAutoShownRef = useRef(false);

    const tooltipWidth = Math.min(screenWidth - 32, 380);
    const globalTargetX = (screenWidth - tooltipWidth) / 2;
    const leftOffset = globalTargetX - iconX;

    const effectiveTask = manualTask || loadingTask;

    // Sync taskToDisplay with deferred clear — no setState for visibility here
    useEffect(() => {
        if (effectiveTask) {
            setTaskToDisplay((prev) => {
                if (
                    prev?.label === effectiveTask.label &&
                    prev?.detail === effectiveTask.detail &&
                    prev?.isImportant === effectiveTask.isImportant
                ) {
                    return prev;
                }
                return { ...effectiveTask, isImportant: effectiveTask.isImportant ?? false };
            });
        } else {
            const timeout = setTimeout(() => {
                setTaskToDisplay(null);
                hasAutoShownRef.current = false;
            }, 250);
            return () => clearTimeout(timeout);
        }
    }, [effectiveTask]);

    // Animation only — no setState calls, safe from loops
    // Auto-show logic uses a ref guard so setIsLoadingVisible fires at most once per task
    useEffect(() => {
        if (taskToDisplay) {
            if (taskToDisplay.isImportant && !hasAutoShownRef.current) {
                hasAutoShownRef.current = true;
                setIsLoadingVisible(true);
            }
            fadeAnim.value = withTiming(isLoadingVisible ? 1 : 0, { duration: 200 });
        } else {
            fadeAnim.value = withTiming(0, { duration: 250 });
        }
    }, [taskToDisplay]);

    // Animate when user manually toggles visibility
    useEffect(() => {
        fadeAnim.value = withTiming(isLoadingVisible && !!taskToDisplay ? 1 : 0, { duration: 200 });
    }, [isLoadingVisible]);

    const toggleVisible = () => setIsLoadingVisible((prev) => !prev);
    const toggleExpanded = () => {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setIsLoadingExpanded((prev) => !prev);
    };

    const handleLayout = () => {
        containerRef.current?.measureInWindow((x, _y, width) => {
            if (x !== 0 && (Math.abs(x - iconX) > 1 || width !== iconWidth)) {
                setIconX(x);
                setIconWidth(width);
            }
        });
    };

    const animatedStyle = useAnimatedStyle(() => {
        return {
            opacity: fadeAnim.value,
            transform: [{ translateY: -10 * (1 - fadeAnim.value) }],
        };
    });

    if (!taskToDisplay || manualRefresh) return null;

    const activeTask = taskToDisplay;

    const getIcon = () => {
        if (activeTask.label.toLowerCase().includes("thumbnail")) return <Film size={14} color="#3b82f6" />;
        if (activeTask.label.toLowerCase().includes("sync") || activeTask.label.toLowerCase().includes("media"))
            return <Database size={14} color="#3b82f6" />;
        return <Info size={14} color="#3b82f6" />;
    };

    return (
        <View ref={containerRef} onLayout={handleLayout} className="relative items-end">
            <TouchableOpacity activeOpacity={0.7} onPress={toggleVisible} className="p-1">
                <ActivityIndicator size="small" color="#3b82f6" />
            </TouchableOpacity>

            {isLoadingVisible && (
                <Animated.View
                    style={[animatedStyle, { left: leftOffset, width: tooltipWidth, top: MENU_OFFSET }]}
                    className="absolute z-50"
                    pointerEvents="box-none"
                >
                    {/* Triangle Arrow */}
                    <View
                        style={{
                            width: 0,
                            height: 0,
                            backgroundColor: "transparent",
                            borderStyle: "solid",
                            borderLeftWidth: ARROW_WIDTH / 2,
                            borderRightWidth: ARROW_WIDTH / 2,
                            borderBottomWidth: ARROW_HEIGHT,
                            borderLeftColor: "transparent",
                            borderRightColor: "transparent",
                            borderBottomColor: "#18181b",
                            position: "absolute",
                            top: -ARROW_HEIGHT,
                            left: iconX + iconWidth / 2 - globalTargetX - ARROW_WIDTH / 2,
                        }}
                    />

                    {/* Tooltip Box */}
                    <View
                        className={cn(
                            "bg-zinc-900 rounded-2xl border border-zinc-800 shadow-2xl overflow-hidden backdrop-blur-xl",
                            isLoadingExpanded ? "pb-2" : "",
                        )}
                    >
                        <View className="p-4">
                            <View className="flex-row items-center gap-2 mb-2">
                                {getIcon()}
                                <Text className="text-blue-400 text-[10px] font-bold uppercase tracking-widest flex-1">
                                    {activeTask.label}
                                </Text>
                            </View>

                            <View className="flex-row items-start gap-2">
                                <Text
                                    className="text-zinc-100 text-sm leading-5 flex-1 pl-1"
                                    numberOfLines={isLoadingExpanded ? 0 : 1}
                                    onTextLayout={(e) => {
                                        const isTruncated =
                                            e.nativeEvent.lines.length > 1 || e.nativeEvent.lines[0]?.width > tooltipWidth - 64;
                                        if (isTruncated && !canExpand) setCanExpand(true);
                                    }}
                                >
                                    {activeTask.detail}
                                </Text>
                                {canExpand && (
                                    <TouchableOpacity onPress={toggleExpanded} className="p-1 -mt-1 pt-1">
                                        {isLoadingExpanded ? (
                                            <ChevronDown size={16} color="#3b82f6" />
                                        ) : (
                                            <ChevronLeft size={16} color="#3b82f6" />
                                        )}
                                    </TouchableOpacity>
                                )}
                            </View>
                        </View>
                    </View>
                </Animated.View>
            )}
        </View>
    );
};
