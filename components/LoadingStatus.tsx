import { ChevronDown, ChevronLeft, Database, Film, Info } from "lucide-react-native";
import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, BackHandler, Dimensions, LayoutAnimation, Text, TouchableOpacity, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { useMedia } from "../hooks/useMedia";

import { cn } from "../lib/utils";

export interface LoadingTask {
    id?: string;
    label: string;
    detail: string;
    isImportant: boolean;
    dismissAfter?: number;
    minimizeAfter?: number;
    onDismiss?: () => void;
}

export interface LoadingStatusProps {
    task?: LoadingTask | null;
    /**
     * "bottom" (default) — popup opens below the indicator, horizontally centered on screen.
     * "left"             — popup opens to the left of the indicator, top-aligned with it,
     *                      expanding downward only. Useful when the indicator is on the right edge.
     */
    popupSide?: "bottom" | "left";
}

export const LoadingStatus: React.FC<LoadingStatusProps> = ({ task: manualTask = null, popupSide = "bottom" }) => {
    const { loadingTask, isLoadingPopupVisible, setIsLoadingPopupVisible, isLoadingExpanded, setIsLoadingExpanded } = useMedia();
    const screenWidth = Dimensions.get("window").width;
    const MENU_OFFSET = 40;
    const ARROW_WIDTH = 12;

    // Local display state — only for deferred clear (250ms fade-out delay)
    const [taskToDisplay, setTaskToDisplay] = useState(loadingTask);
    const [canExpand, setCanExpand] = useState(false);
    const [iconX, setIconX] = useState<number>(screenWidth - 60);
    const [iconWidth, setIconWidth] = useState<number>(32);
    const containerRef = useRef<View>(null);
    const fadeAnim = useSharedValue(0);
    // Ref to prevent auto-show from firing more than once per task session
    const hasAutoShownRef = useRef(false);

    // ── Geometry ────────────────────────────────────────────────────────────────

    // "bottom" mode: horizontally centered tooltip below the indicator
    const tooltipWidth = Math.min(screenWidth - 32, 380);
    const globalTargetX = (screenWidth - tooltipWidth) / 2;
    const leftOffset = globalTargetX - iconX; // shift left so the box centres on screen

    // "left" mode: the popup sits immediately to the left of the indicator,
    // with its right edge flush against the indicator's left edge.
    // We cap the width so it never overflows the left side of the screen.
    const LEFT_GAP = 8; // gap between popup right edge and indicator left edge
    const leftSideWidth = Math.min(iconX - LEFT_GAP, 320); // available space to the left

    // Prioritize global important tasks (sync, thumb gen) over local manual tasks (UI sorting)
    const effectiveTask = loadingTask?.isImportant ? loadingTask : manualTask || loadingTask;

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
                hasAutoShownRef.current = false;
                return { ...effectiveTask, isImportant: effectiveTask.isImportant ?? false };
            });
        } else {
            const timeout = setTimeout(() => {
                setTaskToDisplay(null);
                hasAutoShownRef.current = false;
                setIsLoadingPopupVisible(false);
            }, 250);
            return () => clearTimeout(timeout);
        }
    }, [effectiveTask]);

    // Animation only — no setState calls, safe from loops
    // Auto-show logic uses a ref guard so setIsLoadingPopupVisible fires at most once per task
    useEffect(() => {
        if (taskToDisplay) {
            if (taskToDisplay.isImportant && !hasAutoShownRef.current) {
                hasAutoShownRef.current = true;
                setIsLoadingPopupVisible(true);
            }
            fadeAnim.value = withTiming(isLoadingPopupVisible ? 1 : 0, { duration: 120 });
        } else {
            fadeAnim.value = withTiming(0, { duration: 150 });
        }
    }, [taskToDisplay, isLoadingPopupVisible, setIsLoadingPopupVisible, fadeAnim]);

    // Animate when user manually toggles visibility
    useEffect(() => {
        fadeAnim.value = withTiming(isLoadingPopupVisible && !!taskToDisplay ? 1 : 0, { duration: 120 });
    }, [isLoadingPopupVisible, taskToDisplay, fadeAnim]);

    useEffect(() => {
        const onBackPress = () => {
            if (isLoadingPopupVisible) {
                setIsLoadingPopupVisible(false);
                return true;
            }
            return false;
        };
        const subscription = BackHandler.addEventListener("hardwareBackPress", onBackPress);
        return () => subscription.remove();
    }, [isLoadingPopupVisible, setIsLoadingPopupVisible]);

    const toggleVisible = () => setIsLoadingPopupVisible((prev) => !prev);
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

    if (!taskToDisplay) return null;

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

            {isLoadingPopupVisible && (
                <>
                    {popupSide === "left" ? (
                        /* ── Left-side popup ──────────────────────────────────────────────────
                         * Right edge is flush with the indicator's left edge (minus gap).
                         * Top is aligned with the top of the activity indicator (top: 0).
                         * Expanding the popup only grows downward — no displacement.
                         */
                        <Animated.View
                            style={[
                                animatedStyle,
                                {
                                    // Position relative to the indicator container:
                                    // right = iconWidth + gap puts the popup's right edge just left of the indicator
                                    right: iconWidth + LEFT_GAP,
                                    width: leftSideWidth,
                                    top: 0,
                                },
                            ]}
                            className="absolute z-50"
                            pointerEvents="box-none"
                        >
                            {/* Tooltip Box — no arrow needed for left-side mode */}
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
                                                    e.nativeEvent.lines.length > 1 ||
                                                    e.nativeEvent.lines[0]?.width > leftSideWidth - 64;
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
                    ) : (
                        /* ── Bottom popup (default) ───────────────────────────────────────── */
                        <Animated.View
                            style={[animatedStyle, { left: leftOffset, width: tooltipWidth, top: MENU_OFFSET }]}
                            className="absolute z-50"
                            pointerEvents="box-none"
                        >
                            <View
                                pointerEvents="none"
                                style={{
                                    position: "absolute",
                                    top: -ARROW_WIDTH / 2,
                                    left: iconX + iconWidth / 2 - globalTargetX - ARROW_WIDTH / 2,
                                    zIndex: 55,
                                }}
                            >
                                <View
                                    className="bg-zinc-900 border-t border-l border-zinc-800"
                                    style={{
                                        width: ARROW_WIDTH,
                                        height: ARROW_WIDTH,
                                        transform: [{ rotate: "45deg" }],
                                    }}
                                />
                            </View>

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
                                                    e.nativeEvent.lines.length > 1 ||
                                                    e.nativeEvent.lines[0]?.width > tooltipWidth - 64;
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
                </>
            )}
        </View>
    );
};
