import { ChevronDown, ChevronLeft, Database, Film, Info } from "lucide-react-native";
import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Animated, Dimensions, LayoutAnimation, Text, TouchableOpacity, View } from "react-native";
import { useMedia } from "../hooks/useMedia";

import { cn } from "../lib/utils";

export const LoadingStatus = () => {
    const { loadingTask, manualRefresh } = useMedia();
    const screenWidth = Dimensions.get("window").width;
    const [taskToDisplay, setTaskToDisplay] = useState(loadingTask);
    const [isVisible, setIsVisible] = useState(true);
    const [isExpanded, setIsExpanded] = useState(false);
    const [canExpand, setCanExpand] = useState(false);
    const [iconX, setIconX] = useState<number>(screenWidth - 60);
    const [iconWidth, setIconWidth] = useState<number>(32);
    const containerRef = useRef<View>(null);
    const fadeAnim = useRef(new Animated.Value(0)).current;

    const tooltipWidth = Math.min(screenWidth - 32, 380);

    // Calculate centering:
    // We want the tooltip to be at X = (screenWidth - tooltipWidth) / 2 globally.
    // Our View is at iconX globally.
    // So relative left = ((screenWidth - tooltipWidth) / 2) - iconX
    const globalTargetX = (screenWidth - tooltipWidth) / 2;
    const leftOffset = globalTargetX - iconX;

    useEffect(() => {
        if (loadingTask) {
            setTaskToDisplay(loadingTask);
            if (loadingTask.isImportant) {
                setIsVisible(true);
            }
            Animated.timing(fadeAnim, {
                toValue: isVisible ? 1 : 0,
                duration: 200,
                useNativeDriver: true,
            }).start();
        } else {
            Animated.timing(fadeAnim, {
                toValue: 0,
                duration: 250,
                useNativeDriver: true,
            }).start(() => {
                setTaskToDisplay(null);
            });
        }
    }, [isVisible, loadingTask]);

    const toggleVisible = () => setIsVisible(!isVisible);
    const toggleExpanded = () => {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setIsExpanded(!isExpanded);
    };

    const handleLayout = () => {
        containerRef.current?.measureInWindow((x, _y, width) => {
            if (x !== 0) {
                setIconX(x);
                setIconWidth(width);
            }
        });
    };

    if (!taskToDisplay || manualRefresh) return null;

    // Guard for when we have a spinner but no specific task
    const activeTask = taskToDisplay || {
        label: "Processing Task",
        detail: "Handling background activity...",
        isImportant: false,
    };

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

            {isVisible && (
                <Animated.View
                    style={{
                        opacity: fadeAnim,
                        transform: [{ translateY: fadeAnim.interpolate({ inputRange: [0, 1], outputRange: [-10, 0] }) }],
                        left: leftOffset,
                        width: tooltipWidth,
                    }}
                    className="absolute top-10 z-50"
                    pointerEvents="box-none"
                >
                    {/* The Triangle Arrow - Positioned to point globally at the icon */}
                    <View
                        style={{
                            width: 0,
                            height: 0,
                            backgroundColor: "transparent",
                            borderStyle: "solid",
                            borderLeftWidth: 8,
                            borderRightWidth: 8,
                            borderBottomWidth: 10,
                            borderLeftColor: "transparent",
                            borderRightColor: "transparent",
                            borderBottomColor: "#18181b",
                            position: "absolute",
                            top: -10,
                            // The icon is at global iconX + iconWidth/2.
                            // The tooltip box is at globalTargetX.
                            // Arrow should be at (iconX + iconWidth/2) - globalTargetX - 8 (half arrow width)
                            left: iconX + iconWidth / 2 - globalTargetX - 8,
                        }}
                    />

                    {/* The Tooltip Box */}
                    <View
                        className={cn(
                            "bg-zinc-900 rounded-2xl border border-zinc-800 shadow-2xl overflow-hidden backdrop-blur-xl",
                            isExpanded ? "pb-2" : "",
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
                                    numberOfLines={isExpanded ? 0 : 1}
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
                                        {isExpanded ? (
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
