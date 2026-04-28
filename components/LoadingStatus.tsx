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
    importance?: "SHOW_POPUP" | "SHOW_POPUP_AND_EXPAND";
    progress?: number; // 0 to 1
    dismissAfter?: number;
    minimizeAfter?: number;
    onDismiss?: () => void;
    showPopup?: boolean;
}

export interface LoadingStatusProps {
    /**
     * "bottom" (default) — popup opens below the indicator, horizontally centered on screen.
     * "left"             — popup opens to the left of the indicator, top-aligned with it,
     *                      expanding downward only. Useful when the indicator is on the right edge.
     */
    popupSide?: "bottom" | "left";
    onBeforeSet?: (task: LoadingTask) => boolean | void;
}

export const LoadingStatus: React.FC<LoadingStatusProps> = ({ popupSide = "bottom", onBeforeSet }) => {
    const { loadingTask, isLoadingPopupVisible, setLoadingPopupVisible, isLoadingExpanded, setLoadingExpanded, setOnBeforeSet } =
        useMedia();
    const screenWidth = Dimensions.get("window").width;
    const MENU_OFFSET = 40;
    const ARROW_WIDTH = 12;

    // Local display state — only for deferred clear (250ms fade-out delay)
    const [taskToDisplay, setTaskToDisplay] = useState<LoadingTask | null>(loadingTask);
    const [canExpand, setCanExpand] = useState(false);
    const [iconX, setIconX] = useState<number>(screenWidth - 60);
    const [iconWidth, setIconWidth] = useState<number>(32);
    const [etaSeconds, setEtaSeconds] = useState<number | null>(null);
    const etaSnapshotRef = useRef<{ progress: number; time: number; id: string } | null>(null);
    const containerRef = useRef<View>(null);
    const fadeAnim = useSharedValue(0);

    // Geometry

    // "bottom" mode: horizontally centered tooltip below the indicator
    const tooltipWidth = Math.min(screenWidth - 32, 380);
    const globalTargetX = (screenWidth - tooltipWidth) / 2;
    const leftOffset = globalTargetX - iconX; // shift left so the box centres on screen

    // "left" mode: the popup sits immediately to the left of the indicator,
    // with its right edge flush against the indicator's left edge.
    // We cap the width so it never overflows the left side of the screen.
    const LEFT_GAP = 8; // gap between popup right edge and indicator left edge
    const leftSideWidth = Math.min(iconX - LEFT_GAP, 320); // available space to the left

    const lastProcessedTaskIdRef = useRef<string | null>(null);

    useEffect(() => {
        if (onBeforeSet) {
            setOnBeforeSet(onBeforeSet);
            return () => setOnBeforeSet(null);
        }
    }, [onBeforeSet, setOnBeforeSet]);

    // ── effectiveTask: Sync taskToDisplay with deferred clear ──
    useEffect(
        function effectiveTask() {
            if (loadingTask) {
                setTaskToDisplay((prev) => {
                    const isNewTask = prev?.id !== loadingTask.id;
                    if (
                        !isNewTask &&
                        prev?.label === loadingTask.label &&
                        prev?.detail === loadingTask.detail &&
                        prev?.importance === loadingTask.importance &&
                        prev?.progress === loadingTask.progress
                    ) {
                        return prev;
                    }
                    return loadingTask;
                });
            } else {
                const timeout = setTimeout(() => {
                    setTaskToDisplay(null);
                    setLoadingPopupVisible(false);
                    lastProcessedTaskIdRef.current = null;
                }, 250);
                return () => clearTimeout(timeout);
            }
        },
        [loadingTask, setLoadingPopupVisible],
    );

    const progressRef = useRef(taskToDisplay?.progress);
    useEffect(() => {
        progressRef.current = taskToDisplay?.progress;
    }, [taskToDisplay?.progress]);

    // ETA tracking — 1s interval, samples progress to compute remaining time
    useEffect(() => {
        const taskId = taskToDisplay?.id;
        if (taskId == null) {
            etaSnapshotRef.current = null;
            setEtaSeconds(null);
            return;
        }

        const interval = setInterval(() => {
            const p = progressRef.current;
            if (p == null || p <= 0) return;

            const now = Date.now();
            const snap = etaSnapshotRef.current;

            if (snap && snap.id === taskId) {
                const deltaProgress = p - snap.progress;
                const deltaSec = (now - snap.time) / 1000;
                if (deltaProgress > 0 && deltaSec > 0) {
                    const rate = deltaProgress / deltaSec; // progress per second
                    const remaining = (1 - p) / rate;
                    setEtaSeconds(Math.round(remaining));
                }
            }
            etaSnapshotRef.current = { progress: p, time: now, id: taskId };
        }, 1000);

        return () => {
            clearInterval(interval);
            etaSnapshotRef.current = null;
            setEtaSeconds(null);
        };
    }, [taskToDisplay?.id]);

    // Animate when user manually toggles visibility
    useEffect(() => {
        fadeAnim.value = withTiming(isLoadingPopupVisible && !!taskToDisplay ? 1 : 0, { duration: 120 });
    }, [isLoadingPopupVisible, taskToDisplay, fadeAnim]);

    const toggleVisible = () => setLoadingPopupVisible((prev) => !prev);
    const toggleExpanded = () => {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setLoadingExpanded((prev) => !prev);
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

    const getIcon = () => {
        if (taskToDisplay.label.toLowerCase().includes("thumbnail")) return <Film size={14} color="#3b82f6" />;
        if (taskToDisplay.label.toLowerCase().includes("sync") || taskToDisplay.label.toLowerCase().includes("media"))
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
                                            {taskToDisplay.label}
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
                                            {taskToDisplay.detail}
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

                                    {taskToDisplay.progress !== undefined && (
                                        <View className="mt-3">
                                            <View className="h-1 w-full bg-zinc-800/50 rounded-full overflow-hidden">
                                                <Animated.View
                                                    className="h-full bg-blue-500"
                                                    style={{
                                                        width: `${Math.min(100, Math.max(0, taskToDisplay.progress * 100))}%`,
                                                    }}
                                                />
                                            </View>
                                            {isLoadingExpanded && (
                                                <View className="flex-row justify-end mt-1">
                                                    <Text className="text-[10px] text-zinc-500 font-mono">
                                                        {Math.round(taskToDisplay.progress * 100)}%
                                                    </Text>
                                                </View>
                                            )}
                                        </View>
                                    )}
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
                                            {taskToDisplay.label}
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
                                            {taskToDisplay.detail}
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

                                    {taskToDisplay.progress !== undefined && (
                                        <View className="mt-3">
                                            <View className="h-1 w-full bg-zinc-800/50 rounded-full overflow-hidden">
                                                <Animated.View
                                                    className="h-full bg-blue-500"
                                                    style={{
                                                        width: `${Math.min(100, Math.max(0, taskToDisplay.progress * 100))}%`,
                                                    }}
                                                />
                                            </View>
                                            <View className="flex-row justify-end items-center gap-2 mt-1">
                                                {etaSeconds != null && etaSeconds > 1 && (
                                                    <Text className="text-[10px] text-zinc-600 font-mono">
                                                        {etaSeconds >= 60
                                                            ? `${Math.floor(etaSeconds / 60)}m ${etaSeconds % 60}s left`
                                                            : `${etaSeconds}s left`}
                                                    </Text>
                                                )}
                                                <Text className="text-[10px] text-zinc-500 font-mono">
                                                    {Math.round(taskToDisplay.progress * 100)}%
                                                </Text>
                                            </View>
                                        </View>
                                    )}
                                </View>
                            </View>
                        </Animated.View>
                    )}
                </>
            )}
        </View>
    );
};
