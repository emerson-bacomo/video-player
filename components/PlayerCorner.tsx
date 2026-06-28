import * as Brightness from "expo-brightness";
import * as Icons from "lucide-react-native";
import React, { Fragment, memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FC } from "react";
import { Dimensions, FlatList, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated from "react-native-reanimated";

import { CornerPosition, PlayerOperation } from "@/constants/defaults";
import { useSettings } from "@/hooks/useSettings";
import { cn } from "@/lib/utils";
import { Icon } from "./Icon";
import { SelectDropdown } from "./SelectDropdown";

import { usePlayerCorner } from "@/hooks/usePlayerCorner";
import { usePlayerContext } from "@/context/PlayerContext";
import { Modal } from "./Modal";

let copiedOperator: Partial<PlayerOperation> | null = null;

const IconItem = memo(function IconName({
    name,
    isSelected,
    itemSize,
    onPress,
}: {
    name: string;
    isSelected: boolean;
    itemSize: number;
    onPress: (name: string) => void;
}) {
    const IconComp = (Icons as any)[name];
    if (!IconComp) return null;

    return (
        <TouchableOpacity
            onPress={() => onPress(name)}
            style={{ width: itemSize, height: itemSize }}
            className={cn("items-center justify-center rounded-lg", isSelected ? "bg-blue-600" : "bg-white/5")}
        >
            <Icon icon={IconComp} size={20} color={isSelected ? "white" : "#aaa"} />
        </TouchableOpacity>
    );
});

interface PlayerCornerProps {
    position: CornerPosition;
    hasPermission: boolean;
    sensitivity?: number;
}

export const PlayerCorner: FC<PlayerCornerProps> = ({ position, hasPermission, sensitivity = 0.3 }) => {
    const {
        showPieMenu: globalShowPieMenu,
        handleCornerModalChange,
        handleCornerDoubleTap,
        handleBrightnessChange,
        handleSingleTap,
        handleSkipNext,
        handleSkipPrevious,
        setCentralIndicator,
    } = usePlayerCorner();

    const { playerRef, duration, hasNext, hasPrevious: hasPrev, showControls } = usePlayerContext();

    const showPieMenu = globalShowPieMenu && !showControls;

    const { settings, updateSettings } = useSettings();
    const isTop = position.startsWith("top");
    const isLeft = position.endsWith("left");

    const [dimensions, setDimensions] = useState(Dimensions.get("window"));
    useEffect(() => {
        const sub = Dimensions.addEventListener("change", ({ window }) => setDimensions(window));
        return () => sub.remove();
    }, []);

    const cornerSize = Math.min(dimensions.width, dimensions.height) * 0.25;

    // Constant-like variables for menu layout
    const PIE_RADIUS = cornerSize * 1;
    const PIE_PADDING = 10;
    const LABEL_RADIUS = PIE_RADIUS + 50;
    const CORNER_RADIUS = 9999;

    // --- Brightness Logic ---
    const dragBaseline = useRef<number>(0);
    const syncTranslation = useRef<number>(0);
    const activeTranslation = useRef<number>(0);

    useEffect(() => {
        if (hasPermission) {
            Brightness.getSystemBrightnessAsync()
                .then((b) => {
                    const perceptual = Math.pow(b, 1 / 3);
                    dragBaseline.current = perceptual;
                })
                .catch(() => {});
        }
    }, [hasPermission]);

    const panGesture = Gesture.Pan()
        .activeOffsetY([-10, 10])
        .runOnJS(true)
        .onStart(() => {
            activeTranslation.current = 0;
            syncTranslation.current = 0;
            Brightness.getSystemBrightnessAsync()
                .then((realBrightness) => {
                    dragBaseline.current = Math.pow(realBrightness, 1 / 3);
                    syncTranslation.current = activeTranslation.current;
                })
                .catch(() => {});
        })
        .onUpdate((event) => {
            if (!hasPermission) return;
            activeTranslation.current = event.translationY;
            const screenHeight = dimensions.height;
            const deltaP = (event.translationY - syncTranslation.current) / (screenHeight / (sensitivity * 5));
            let newP = dragBaseline.current - deltaP;
            newP = Math.max(0, Math.min(1, newP));

            handleBrightnessChange(newP);

            const raw = Math.pow(newP, 3);
            Brightness.setSystemBrightnessAsync(raw).catch(() => {});
        });

    const doubleTapGesture = Gesture.Tap()
        .numberOfTaps(2)
        .runOnJS(true)
        .onEnd(() => {
            handleCornerDoubleTap();
        });

    const singleTapGesture = Gesture.Tap()
        .numberOfTaps(1)
        .runOnJS(true)
        .onEnd(() => {
            if (!showPieMenu) handleSingleTap();
        });

    const composed = Gesture.Exclusive(doubleTapGesture, panGesture, singleTapGesture);

    // --- Modal State ---
    const [configModal, setConfigModal] = useState<{ slotIndex: number; op: PlayerOperation | null } | null>(null);
    const [searchQuery, setSearchQuery] = useState("");
    const [editOp, setEditOp] = useState<Partial<PlayerOperation>>({});
    const [iconPickerOpen, setIconPickerOpen] = useState(false);
    const flatListRef = useRef<FlatList<string>>(null);
    const [pickerWidth, setPickerWidth] = useState(0);

    const [iconHistory, setIconHistory] = useState<string[]>([]);
    const [historyIndex, setHistoryIndex] = useState(-1);

    // Notify parent when any modal opens/closes so it can hide the controls layer
    useEffect(() => {
        handleCornerModalChange(!!configModal || iconPickerOpen);

        if (iconPickerOpen) {
            if (editOp.iconName) {
                setIconHistory([editOp.iconName]);
                setHistoryIndex(0);
            } else {
                setIconHistory([]);
                setHistoryIndex(-1);
            }
        } else {
            setIconHistory([]);
            setHistoryIndex(-1);
        }
    }, [configModal, iconPickerOpen, handleCornerModalChange, editOp.iconName]);

    const skipTimeout = useRef<any>(null);
    const handleExecuteOperation = useCallback(
        async (op: PlayerOperation) => {
            if (op.type === "seek") {
                const currentPos = playerRef.current?.currentTime || 0;
                const deltaSec = op.value || 0;
                const newTime = Math.max(0, Math.min(duration, currentPos + deltaSec));
                playerRef.current?.seek(newTime);

                const iconName = op.value >= 0 ? "skip-fwd" : "skip-back";
                setCentralIndicator({
                    icon: iconName as any,
                    label: op.label || `${op.value > 0 ? "+" : ""}${op.value}s`,
                });

                if (skipTimeout.current) clearTimeout(skipTimeout.current);
                skipTimeout.current = setTimeout(() => setCentralIndicator(null), 800);
            } else if (op.type === "play-next") {
                if (hasNext) handleSkipNext();
            } else if (op.type === "play-prev") {
                if (hasPrev) handleSkipPrevious();
            } else if (op.type === "double-tap-seek-left") {
                const currentPos = playerRef.current?.currentTime || 0;
                const amount = settings.doubleTapSeekAmount;
                const newTime = Math.max(0, currentPos - amount);
                playerRef.current?.seek(newTime);

                setCentralIndicator({
                    icon: "skip-back",
                    label: `-${amount}s`,
                });
                if (skipTimeout.current) clearTimeout(skipTimeout.current);
                skipTimeout.current = setTimeout(() => setCentralIndicator(null), 800);
            } else if (op.type === "double-tap-seek-right") {
                const currentPos = playerRef.current?.currentTime || 0;
                const amount = settings.doubleTapSeekAmount;
                const newTime = Math.min(duration, currentPos + amount);
                playerRef.current?.seek(newTime);

                setCentralIndicator({
                    icon: "skip-fwd",
                    label: `+${amount}s`,
                });
                if (skipTimeout.current) clearTimeout(skipTimeout.current);
                skipTimeout.current = setTimeout(() => setCentralIndicator(null), 800);
            }
        },
        [
            duration,
            handleSkipNext,
            handleSkipPrevious,
            hasNext,
            hasPrev,
            setCentralIndicator,
            settings.doubleTapSeekAmount,
            playerRef,
        ],
    );

    const allIconNames = useMemo(
        () =>
            Object.keys(Icons)
                .filter((k) => {
                    if (k === "default" || k === "Icon") return false;
                    if (k.endsWith("Icon")) return false;
                    if (k.startsWith("Lucide")) return false;
                    if (k[0] !== k[0].toUpperCase()) return false;
                    const val = (Icons as any)[k];
                    return val != null;
                })
                .sort(),
        [],
    );

    const filteredIcons = useMemo(() => {
        if (!searchQuery) return allIconNames;
        return allIconNames.filter((n) => n.toLowerCase().includes(searchQuery.toLowerCase()));
    }, [searchQuery, allIconNames]);

    useEffect(() => {
        if (configModal) {
            setEditOp(configModal.op || { type: "seek", value: 10 });
            setSearchQuery("");
        }
    }, [configModal]);

    const handleSaveOperation = () => {
        if (!configModal) return;
        const newConfigs = { ...settings.cornerConfigs };
        const currentOps = [...newConfigs[position]];

        const val = Number(editOp.value) || 0;
        const type = editOp.type || "seek";

        let label = editOp.label || "";
        let iconName = editOp.iconName || "Plus";

        if (type === "seek") {
            label = `${val > 0 ? "+" : ""}${val}s`;
            if (iconName === "Plus") iconName = val > 0 ? "FastForward" : "Rewind";
        } else if (type === "play-next") {
            label = "Next";
            if (iconName === "Plus") iconName = "SkipForward";
        } else if (type === "play-prev") {
            label = "Prev";
            if (iconName === "Plus") iconName = "SkipBack";
        } else if (type === "double-tap-seek-left") {
            label = `-${settings.doubleTapSeekAmount}s`;
            if (iconName === "Plus") iconName = "ChevronsLeft";
        } else if (type === "double-tap-seek-right") {
            label = `+${settings.doubleTapSeekAmount}s`;
            if (iconName === "Plus") iconName = "ChevronsRight";
        }

        const finalizedOp: PlayerOperation = {
            id: editOp.id || Math.random().toString(36).substr(2, 9),
            type: type as any,
            value: val,
            iconName,
            label,
        };

        currentOps[configModal.slotIndex] = finalizedOp;
        newConfigs[position] = currentOps;
        updateSettings({ cornerConfigs: newConfigs });
        setConfigModal(null);
    };

    const handleDeleteOperation = () => {
        if (!configModal) return;
        const newConfigs = { ...settings.cornerConfigs };
        const currentOps = [...newConfigs[position]];
        currentOps[configModal.slotIndex] = null;
        newConfigs[position] = currentOps;
        updateSettings({ cornerConfigs: newConfigs });
        setConfigModal(null);
    };

    const isLandscape = dimensions.width > dimensions.height;
    const modalHeight = isLandscape ? dimensions.height * 0.9 : dimensions.height * 0.5;

    const historyRef = useRef({ history: iconHistory, index: historyIndex });
    useEffect(() => {
        historyRef.current = { history: iconHistory, index: historyIndex };
    }, [iconHistory, historyIndex]);

    const handleIconSelect = useCallback((name: string) => {
        setEditOp((p: Partial<PlayerOperation>) => {
            if (p.iconName === name) return p;

            const { history, index } = historyRef.current;
            const newHistory = history.slice(0, index + 1);
            newHistory.push(name);
            setIconHistory(newHistory);
            setHistoryIndex(newHistory.length - 1);

            return { ...p, iconName: name };
        });
    }, []);

    const renderIconItem = useCallback(
        ({ item: name }: { item: string }) => {
            const isSelected = editOp.iconName === name;
            const itemSize = pickerWidth > 0 ? (pickerWidth - 32) / 5 : 40;
            return <IconItem name={name} isSelected={isSelected} itemSize={itemSize} onPress={handleIconSelect} />;
        },
        [editOp.iconName, pickerWidth, handleIconSelect],
    );

    return (
        <>
            <GestureDetector gesture={composed}>
                <Animated.View
                    style={[
                        {
                            position: "absolute",
                            width: cornerSize,
                            height: cornerSize,
                            top: isTop ? 0 : undefined,
                            bottom: !isTop ? 0 : undefined,
                            left: isLeft ? 0 : undefined,
                            right: !isLeft ? 0 : undefined,
                            zIndex: 400,
                        },
                        showPieMenu && {
                            backgroundColor: "rgba(0, 0, 0, 0.5)",
                            borderColor: "rgba(255, 255, 255, 0.3)",
                            borderTopWidth: isTop ? 0 : 1.5,
                            borderBottomWidth: !isTop ? 0 : 1.5,
                            borderLeftWidth: isLeft ? 0 : 1.5,
                            borderRightWidth: !isLeft ? 0 : 1.5,
                            borderStyle: showPieMenu ? "solid" : "dashed",
                            borderTopLeftRadius: !isTop && !isLeft ? CORNER_RADIUS : 0,
                            borderTopRightRadius: !isTop && isLeft ? CORNER_RADIUS : 0,
                            borderBottomLeftRadius: isTop && !isLeft ? CORNER_RADIUS : 0,
                            borderBottomRightRadius: isTop && isLeft ? CORNER_RADIUS : 0,
                        },
                    ]}
                >
                    {showPieMenu && (
                        <PieButtons
                            ops={settings.cornerConfigs[position]}
                            isLeft={isLeft}
                            isTop={isTop}
                            pieRadius={PIE_RADIUS}
                            piePadding={PIE_PADDING}
                            labelRadius={LABEL_RADIUS}
                            onExecuteOperation={handleExecuteOperation}
                            onSetConfigModal={setConfigModal}
                            hasNext={hasNext}
                            hasPrev={hasPrev}
                        />
                    )}
                </Animated.View>
            </GestureDetector>

            <Modal visible={!!configModal} onClose={() => setConfigModal(null)}>
                <View className="px-6 pt-6 pb-2 flex-col justify-between" style={{ height: modalHeight }}>
                    <View className="flex-1">
                        <View className="flex-row justify-between items-center mb-4">
                            <Text className="text-white text-xl font-bold">
                                {configModal?.op ? "Edit Operation" : "Add Operation"}
                            </Text>
                            <View className="flex-row gap-2">
                                {!configModal?.op && (
                                    <TouchableOpacity
                                        disabled={!copiedOperator}
                                        onPress={() => {
                                            if (copiedOperator) setEditOp({ ...copiedOperator });
                                        }}
                                        className={`px-3 py-1.5 rounded-lg ${!copiedOperator ? "bg-white/5" : "bg-blue-600"}`}
                                    >
                                        <Text className={!copiedOperator ? "text-white/30" : "text-white"}>Paste</Text>
                                    </TouchableOpacity>
                                )}
                                {configModal?.op && (
                                    <TouchableOpacity
                                        onPress={() => {
                                            copiedOperator = { ...editOp };
                                        }}
                                        className="px-3 py-1.5 rounded-lg bg-white/10"
                                    >
                                        <Text className="text-white">Copy</Text>
                                    </TouchableOpacity>
                                )}
                            </View>
                        </View>

                        <View className="mb-4">
                            <Text className="text-zinc-400 text-xs uppercase mb-2">Operator Type</Text>
                            <SelectDropdown
                                value={editOp.type || "seek"}
                                options={[
                                    { label: "Seek By", value: "seek" },
                                    { label: "Play Next Video", value: "play-next" },
                                    { label: "Play Previous Video", value: "play-prev" },
                                    {
                                        label: `Double Tap Seek Left (-${settings.doubleTapSeekAmount}s)`,
                                        value: "double-tap-seek-left",
                                    },
                                    {
                                        label: `Double Tap Seek Right (+${settings.doubleTapSeekAmount}s)`,
                                        value: "double-tap-seek-right",
                                    },
                                ]}
                                onChange={(v) => setEditOp((p) => ({ ...p, type: v as any }))}
                            />
                        </View>

                        {editOp.type === "seek" && (
                            <>
                                <Text className="text-zinc-400 text-xs uppercase mb-2">Seek Value (seconds)</Text>
                                <TextInput
                                    keyboardType="numeric"
                                    value={editOp.value?.toString()}
                                    onChangeText={(t) =>
                                        setEditOp((prev: Partial<PlayerOperation>) => ({ ...prev, value: Number(t) }))
                                    }
                                    placeholder="e.g. 10 or -5"
                                    placeholderTextColor="#555"
                                    className="bg-black/40 text-white rounded-lg px-4 py-2 mb-4 border border-white/5"
                                />
                            </>
                        )}

                        <Text className="text-zinc-400 text-xs uppercase mb-2">Icon</Text>
                        <TouchableOpacity
                            onPress={() => setIconPickerOpen(true)}
                            className="bg-black/40 border border-white/5 rounded-lg px-4 py-3 flex-row items-center gap-3"
                        >
                            {editOp.iconName && (Icons as any)[editOp.iconName] ? (
                                <Icon icon={(Icons as any)[editOp.iconName]} size={20} color="white" />
                            ) : (
                                <View className="w-5 h-5 rounded bg-white/10" />
                            )}
                            <Text className="text-white/70 flex-1">{editOp.iconName || "Select an icon..."}</Text>
                            <Text className="text-blue-400 text-sm">Change</Text>
                        </TouchableOpacity>
                    </View>

                    <View className="flex-row gap-3 mt-4 mb-4">
                        <TouchableOpacity
                            onPress={() => setConfigModal(null)}
                            className="flex-1 bg-white/10 py-3 rounded-xl items-center"
                        >
                            <Text className="text-white font-medium">Cancel</Text>
                        </TouchableOpacity>
                        {configModal?.op && (
                            <TouchableOpacity
                                onPress={handleDeleteOperation}
                                className="px-4 bg-red-900/40 border border-red-500/50 py-3 rounded-xl items-center"
                            >
                                <Text className="text-red-400 font-medium">Delete</Text>
                            </TouchableOpacity>
                        )}
                        <TouchableOpacity
                            onPress={handleSaveOperation}
                            className="flex-1 bg-blue-600 py-3 rounded-xl items-center"
                        >
                            <Text className="text-white font-medium">Save</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>

            {/* Icon Picker — second modal stacked on top of config modal */}
            <Modal
                visible={iconPickerOpen}
                onClose={() => {
                    setIconPickerOpen(false);
                    setSearchQuery("");
                }}
            >
                <View style={{ height: modalHeight }} className="flex-col">
                    {/* Sticky search bar */}
                    <View className="px-4 pt-4 pb-2 border-b border-white/10">
                        <View className="flex-row justify-between items-center mb-2">
                            <Text className="text-white font-bold text-base">Pick Icon</Text>
                            <View className="flex-row items-center gap-2">
                                <TouchableOpacity
                                    disabled={historyIndex <= 0}
                                    onPress={() => {
                                        if (historyIndex > 0) {
                                            const prev = iconHistory[historyIndex - 1];
                                            setHistoryIndex(historyIndex - 1);
                                            setEditOp((p: Partial<PlayerOperation>) => ({ ...p, iconName: prev }));
                                        }
                                    }}
                                    className={`px-2 py-1.5 rounded-lg ${historyIndex <= 0 ? "bg-white/5" : "bg-white/10"}`}
                                >
                                    <Icon icon={Icons.Undo} size={18} color={historyIndex <= 0 ? "#555" : "white"} />
                                </TouchableOpacity>
                                <TouchableOpacity
                                    disabled={historyIndex >= iconHistory.length - 1}
                                    onPress={() => {
                                        if (historyIndex < iconHistory.length - 1) {
                                            const next = iconHistory[historyIndex + 1];
                                            setHistoryIndex(historyIndex + 1);
                                            setEditOp((p: Partial<PlayerOperation>) => ({ ...p, iconName: next }));
                                        }
                                    }}
                                    className={`px-2 py-1.5 rounded-lg ${historyIndex >= iconHistory.length - 1 ? "bg-white/5" : "bg-white/10"}`}
                                >
                                    <Icon
                                        icon={Icons.Redo}
                                        size={18}
                                        color={historyIndex >= iconHistory.length - 1 ? "#555" : "white"}
                                    />
                                </TouchableOpacity>
                                <TouchableOpacity
                                    onPress={() => {
                                        setIconPickerOpen(false);
                                        setSearchQuery("");
                                    }}
                                    className="bg-blue-600 px-4 py-1.5 rounded-lg ml-1"
                                >
                                    <Text className="text-white font-medium text-sm">
                                        Select {editOp.iconName ? `(${editOp.iconName})` : ""}
                                    </Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                        <TextInput
                            value={searchQuery}
                            onChangeText={setSearchQuery}
                            placeholder="Search icons..."
                            placeholderTextColor="#555"
                            autoFocus
                            className="bg-black/40 text-white rounded-lg px-4 py-2 border border-white/5"
                        />
                    </View>
                    <FlatList
                        ref={flatListRef}
                        data={filteredIcons}
                        keyExtractor={(item) => item}
                        numColumns={5}
                        keyboardShouldPersistTaps="handled"
                        showsVerticalScrollIndicator={true}
                        indicatorStyle="white"
                        contentContainerStyle={{ padding: 8 }}
                        columnWrapperStyle={{ gap: 4, marginBottom: 4 }}
                        initialNumToRender={50}
                        maxToRenderPerBatch={50}
                        windowSize={10}
                        removeClippedSubviews={true}
                        onLayout={(e) => {
                            setPickerWidth(e.nativeEvent.layout.width);
                            if (editOp.iconName && !searchQuery) {
                                const idx = filteredIcons.indexOf(editOp.iconName);
                                if (idx > 0) {
                                    flatListRef.current?.scrollToIndex({ index: idx, animated: false, viewPosition: 0.4 });
                                }
                            }
                        }}
                        onScrollToIndexFailed={(info) => {
                            setTimeout(() => {
                                flatListRef.current?.scrollToIndex({ index: info.index, animated: false, viewPosition: 0.4 });
                            }, 100);
                        }}
                        renderItem={renderIconItem}
                    />
                </View>
            </Modal>
        </>
    );
};

interface PieButtonsProps {
    ops: (PlayerOperation | null)[];
    isLeft: boolean;
    isTop: boolean;
    pieRadius: number;
    piePadding: number;
    labelRadius: number;
    onExecuteOperation: (op: PlayerOperation) => void;
    onSetConfigModal: (modal: { slotIndex: number; op: PlayerOperation | null } | null) => void;
    hasNext: boolean;
    hasPrev: boolean;
}

const PieButtons = memo<PieButtonsProps>(function PieButtons({
    ops,
    isLeft,
    isTop,
    pieRadius,
    piePadding,
    labelRadius,
    onExecuteOperation,
    onSetConfigModal,
    hasNext,
    hasPrev,
}) {
    const angles = [0, 30, 60, 90];

    return (
        <>
            {angles.map((angle, index) => {
                const rad = (angle * Math.PI) / 180;
                const x = pieRadius * Math.cos(rad);
                const y = pieRadius * Math.sin(rad);
                const lx = labelRadius * Math.cos(rad);
                const ly = labelRadius * Math.sin(rad);

                const translateX = isLeft ? x + piePadding : -(x + piePadding);
                const translateY = isTop ? y + piePadding : -(y + piePadding);
                const lTranslateX = isLeft ? lx + piePadding : -(lx + piePadding);
                const lTranslateY = isTop ? ly + piePadding : -(ly + piePadding);

                const op = ops[index];
                const isDisabled = op && ((op.type === "play-next" && !hasNext) || (op.type === "play-prev" && !hasPrev));
                const IconComp = op ? (Icons as any)[op.iconName] || Icons.HelpCircle : Icons.Plus;

                return (
                    <Fragment key={index}>
                        <TouchableOpacity
                            onPress={() =>
                                op ? !isDisabled && onExecuteOperation(op) : onSetConfigModal({ slotIndex: index, op: null })
                            }
                            onLongPress={() => op && onSetConfigModal({ slotIndex: index, op })}
                            className={cn(
                                "absolute w-12 h-12 rounded-full items-center justify-center border border-white/20 bg-black/80 shadow-lg",
                                !op && "bg-black/25",
                                isDisabled && "opacity-30",
                            )}
                            style={{
                                left: isLeft ? 0 : undefined,
                                right: !isLeft ? 0 : undefined,
                                top: isTop ? 0 : undefined,
                                bottom: !isTop ? 0 : undefined,
                                transform: [{ translateX }, { translateY }],
                            }}
                        >
                            <Icon icon={IconComp} size={24} color={op ? "white" : "rgba(255,255,255,0.4)"} />
                        </TouchableOpacity>
                        {op && op.label && (
                            <View
                                className="absolute flex-row items-center"
                                style={{
                                    left: isLeft ? 0 : undefined,
                                    right: !isLeft ? 0 : undefined,
                                    top: isTop ? 0 : undefined,
                                    bottom: !isTop ? 0 : undefined,
                                    height: 48,
                                    transform: [{ translateX: lTranslateX }, { translateY: lTranslateY }],
                                    justifyContent: isLeft ? "flex-start" : "flex-end",
                                }}
                            >
                                <View className="px-2 py-0.5 rounded bg-black/80 border border-white/10">
                                    <Text className="text-white text-[10px]" numberOfLines={1}>
                                        {op.label}
                                    </Text>
                                </View>
                            </View>
                        )}
                    </Fragment>
                );
            })}
        </>
    );
});
