import { AlertCircle, CheckCircle2, ChevronDown, ChevronLeft, Database, Film, Info } from "lucide-react-native";
import React, { useEffect, useRef, useState } from "react";
import type { FC } from "react";
import { ActivityIndicator, LayoutAnimation, Text, TouchableOpacity, useWindowDimensions, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { useIsFocused } from "@react-navigation/native";
import { useLoadingTask } from "@/context/LoadingTaskContext";
import { useStableSafeAreaInsets } from "@/hooks/useStableSafeAreaInsets";

import { cn } from "../lib/utils";
import { Icon } from "./Icon";
import { Portal } from "react-native-portalize";

export interface LoadingTask {
    id?: string;
    label: string;
    detail: string;
    importance?: "SHOW_POPUP" | "SHOW_POPUP_AND_EXPAND";
    progress?: number; // 0 to 1
    dismissAfter?: number;
    minimizeAfter?: number;
    onDismiss?: () => void;
    onEtaUpdate?: (etaSeconds: number | null, progress: number) => void;
    showPopup?: boolean;
    status?: "success" | "error";
}

export interface LoadingStatusProps {
    /**
     * "bottom" (default) — popup opens below the indicator, horizontally centered on screen.
     * "left"             — popup opens to the left of the indicator, top-aligned with it,
     *                      expanding downward only. Useful when the indicator is on the right edge.
     */
    popupSide?: "bottom" | "left";
    onBeforeSet?: (task: LoadingTask) => boolean | void;
    forceHidden?: boolean;
}

export const LoadingStatus: FC<LoadingStatusProps> = ({ popupSide = "bottom", onBeforeSet, forceHidden = false }) => {
    const { loadingTask, isLoadingPopupVisible, setLoadingPopupVisible, isLoadingExpanded, setLoadingExpanded, setOnBeforeSet } =
        useLoadingTask();
    const { width: screenWidth } = useWindowDimensions();
    const ARROW_WIDTH = 12;
    const POPUP_GAP = 8;

    // Local display state — only for deferred clear (250ms fade-out delay)
    const [taskToDisplay, setTaskToDisplay] = useState<LoadingTask | null>(loadingTask);
    const [canExpand, setCanExpand] = useState(false);
    const [iconX, setIconX] = useState<number>(screenWidth - 60);
    const [iconWidth, setIconWidth] = useState<number>(32);
    const [iconLocalY, setIconLocalY] = useState<number>(0);
    const [iconHeight, setIconHeight] = useState<number>(32);
    const [etaSeconds, setEtaSeconds] = useState<number | null>(null);
    const etaSnapshotRef = useRef<{ progress: number; time: number; id: string } | null>(null);
    const onEtaUpdateRef = useRef(taskToDisplay?.onEtaUpdate);
    const ignoreCountRef = useRef(0);
    const lastReportedEtaRef = useRef<number | null>(null);
    const indicatorRef = useRef<View>(null);
    const fadeAnim = useSharedValue(0);

    const isFocused = useIsFocused();
    const effectivelyVisible = isLoadingPopupVisible && isFocused && !forceHidden;

    // Geometry

    // When screenWidth changes (orientation change), reset measured position
    // so the overflow calculation doesn't use a stale value from the previous orientation.
    // measureInWindow in handleLayout will update to the real indicator position on the next frame.
    const prevScreenWidth = useRef(screenWidth);
    useEffect(() => {
        if (screenWidth !== prevScreenWidth.current) {
            setIconX(screenWidth - 60);
            setIconWidth(32);
            setIconLocalY(0);
            setIconHeight(32);
            prevScreenWidth.current = screenWidth;
        }
    }, [screenWidth]);

    // "bottom" mode: centered tooltip with screen-edge overflow handling
    const insets = useStableSafeAreaInsets();
    const tooltipWidth = Math.min(screenWidth - 32, 320);
    const indicatorCenter = iconX + iconWidth / 2;

    const leftMargin = Math.max(insets.left, 16);
    const rightMargin = Math.max(insets.right, 16);
    const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
    const centeredLeftOffset = iconWidth / 2 - tooltipWidth / 2;
    const centeredScreenLeft = iconX + centeredLeftOffset;
    const centeredScreenRight = centeredScreenLeft + tooltipWidth;
    const rightBoundary = screenWidth - rightMargin;
    const rightOverflow = Math.max(0, centeredScreenRight - rightBoundary);
    const leftOverflow = Math.max(0, leftMargin - (centeredScreenLeft - rightOverflow));

    // left: 0 aligns the popup with the indicator; start centered from there,
    // then shift only enough to keep the popup inside the screen padding.
    const popupLeftOffset = centeredLeftOffset - rightOverflow + leftOverflow;
    const popupScreenLeft = iconX + popupLeftOffset;
    const popupTop = iconLocalY + iconHeight + POPUP_GAP;
    const arrowLeft = clamp(indicatorCenter - popupScreenLeft - ARROW_WIDTH / 2, ARROW_WIDTH, tooltipWidth - ARROW_WIDTH * 2);

    // "left" mode: popup sits immediately to the left of the indicator
    const LEFT_GAP = 16;
    const leftSideWidth = Math.min(iconX - LEFT_GAP, 280);

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
        onEtaUpdateRef.current = taskToDisplay?.onEtaUpdate;
    }, [taskToDisplay?.progress, taskToDisplay?.onEtaUpdate]);

    // ETA tracking — 1s interval, samples progress to compute remaining time
    useEffect(() => {
        const taskId = taskToDisplay?.id;
        if (taskId == null) {
            etaSnapshotRef.current = null;
            setEtaSeconds(null);
            lastReportedEtaRef.current = null;
            ignoreCountRef.current = 0;
            onEtaUpdateRef.current?.(null, 0);
            return;
        }

        // Initialize snapshot immediately if we have progress, so the first tick (at 1s) can already compute ETA
        if (progressRef.current != null && progressRef.current >= 0) {
            etaSnapshotRef.current = { progress: progressRef.current, time: Date.now(), id: taskId };
        }

        const interval = setInterval(() => {
            const p = progressRef.current;
            if (p == null || p < 0) return;

            const now = Date.now();
            const snap = etaSnapshotRef.current;

            if (snap && snap.id === taskId) {
                const deltaProgress = p - snap.progress;
                const deltaSec = (now - snap.time) / 1000;
                if (deltaProgress > 0 && deltaSec > 0.5) {
                    const rate = deltaProgress / deltaSec;
                    const remaining = (1 - p) / rate;
                    const nextEta = Math.round(remaining);

                    const currentEta = lastReportedEtaRef.current;
                    let shouldUpdate = true;

                    if (currentEta != null && nextEta > currentEta) {
                        ignoreCountRef.current++;
                        if (ignoreCountRef.current <= 2) {
                            shouldUpdate = false;
                        } else {
                            // Too many ignores, force update
                            ignoreCountRef.current = 0;
                        }
                    } else {
                        // Improved or same ETA, reset count
                        ignoreCountRef.current = 0;
                    }

                    if (shouldUpdate) {
                        lastReportedEtaRef.current = nextEta;
                        setEtaSeconds(nextEta);
                        onEtaUpdateRef.current?.(nextEta, p);
                    }

                    etaSnapshotRef.current = { progress: p, time: now, id: taskId };
                }
            } else {
                etaSnapshotRef.current = { progress: p, time: now, id: taskId };
                onEtaUpdateRef.current?.(null, p);
            }
        }, 1000);

        return () => {
            clearInterval(interval);
            setEtaSeconds(null);
            onEtaUpdateRef.current?.(null, 0);
        };
    }, [taskToDisplay?.id]);

    // Re-measure indicator screen x when popup is about to show,
    // so overflow calculations are fresh.
    useEffect(() => {
        if (effectivelyVisible) {
            indicatorRef.current?.measure((_x, _y, width, _height, pageX) => {
                if (pageX !== 0 && (Math.abs(pageX - iconX) > 1 || width !== iconWidth)) {
                    setIconX(pageX);
                    setIconWidth(width);
                }
            });
        }
    }, [effectivelyVisible]);

    // Animate when user manually toggles visibility
    useEffect(() => {
        fadeAnim.value = withTiming(effectivelyVisible && !!taskToDisplay ? 1 : 0, { duration: 120 });
    }, [effectivelyVisible, taskToDisplay, fadeAnim]);

    const toggleVisible = () => setLoadingPopupVisible((prev) => !prev);
    const toggleExpanded = () => {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setLoadingExpanded((prev) => !prev);
    };

    const handleLayout = () => {
        indicatorRef.current?.measure((_x, _y, width, height, pageX, pageY) => {
            if (pageX !== 0) {
                setIconX(pageX);
                setIconWidth(width);
            }
            if (pageY !== 0) {
                setIconLocalY(pageY);
                setIconHeight(height);
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
        if (taskToDisplay.status === "success") return <Icon icon={CheckCircle2} size={14} className="text-success" />;
        if (taskToDisplay.status === "error") return <Icon icon={AlertCircle} size={14} className="text-error" />;
        if (taskToDisplay.label.toLowerCase().includes("thumbnail"))
            return <Icon icon={Film} size={14} className="text-blue-500" />;
        if (taskToDisplay.label.toLowerCase().includes("sync") || taskToDisplay.label.toLowerCase().includes("media"))
            return <Icon icon={Database} size={14} className="text-blue-500" />;
        return <Icon icon={Info} size={14} className="text-blue-500" />;
    };

    const renderPopupContent = (width: number) => (
        <View
            className={cn(
                "bg-zinc-900 rounded-2xl border border-zinc-800 shadow-2xl overflow-hidden backdrop-blur-xl",
                isLoadingExpanded ? "pb-2" : "",
            )}
        >
            <View className="p-4">
                <View className="flex-row items-center gap-2 mb-2">
                    {getIcon()}
                    <Text
                        className={cn(
                            "text-[10px] font-bold uppercase tracking-widest flex-1",
                            taskToDisplay.status === "success"
                                ? "text-success"
                                : taskToDisplay.status === "error"
                                  ? "text-error"
                                  : "text-blue-400",
                        )}
                    >
                        {taskToDisplay.label}
                    </Text>
                </View>

                <View className="flex-row items-start gap-2">
                    <Text
                        className="text-zinc-100 text-sm leading-5 flex-1 pl-1"
                        numberOfLines={isLoadingExpanded ? 0 : 1}
                        onTextLayout={(e) => {
                            const isTruncated = e.nativeEvent.lines.length > 1 || e.nativeEvent.lines[0]?.width > width - 64;
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
                            {etaSeconds != null && etaSeconds >= 0 && (
                                <Text className="text-[10px] text-zinc-500 font-mono">
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
    );

    return (
        <View className="relative items-end">
            <View ref={indicatorRef} onLayout={handleLayout}>
                <TouchableOpacity activeOpacity={0.7} onPress={toggleVisible} className="p-1">
                    {taskToDisplay.status === "success" ? (
                        <Icon icon={CheckCircle2} size={20} className="text-success" />
                    ) : taskToDisplay.status === "error" ? (
                        <Icon icon={AlertCircle} size={20} className="text-error" />
                    ) : (
                        <ActivityIndicator size="small" color="#3b82f6" />
                    )}
                </TouchableOpacity>
            </View>

            {effectivelyVisible && (
                <>
                    {popupSide === "left" ? (
                        <Portal>
                            <Animated.View
                                style={[
                                    animatedStyle,
                                    {
                                        left: iconX - leftSideWidth - LEFT_GAP,
                                        width: leftSideWidth,
                                        top: iconLocalY - 24,
                                    },
                                ]}
                                pointerEvents="box-none"
                            >
                                <View
                                    pointerEvents="none"
                                    style={{
                                        position: "absolute",
                                        top: 32,
                                        right: -ARROW_WIDTH / 2,
                                        zIndex: 55,
                                    }}
                                >
                                    <View
                                        className="bg-zinc-900 border-t border-r border-zinc-800"
                                        style={{
                                            width: ARROW_WIDTH,
                                            height: ARROW_WIDTH,
                                            transform: [{ rotate: "45deg" }],
                                        }}
                                    />
                                </View>
                                {renderPopupContent(leftSideWidth)}
                            </Animated.View>
                        </Portal>
                    ) : (
                        <Portal>
                            <Animated.View
                                style={[animatedStyle, { left: popupScreenLeft, width: tooltipWidth, top: popupTop }]}
                                pointerEvents="box-none"
                            >
                                <View
                                    pointerEvents="none"
                                    style={{
                                        position: "absolute",
                                        top: -ARROW_WIDTH / 2,
                                        left: arrowLeft,
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
                                {renderPopupContent(tooltipWidth)}
                            </Animated.View>
                        </Portal>
                    )}
                </>
            )}
        </View>
    );
};
