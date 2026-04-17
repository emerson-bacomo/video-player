import * as Brightness from "expo-brightness";
import * as Icons from "lucide-react-native";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Dimensions, FlatList, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { CornerPosition, PlayerOperation } from "@/context/SettingsContext";
import { useSettings } from "@/hooks/useSettings";
import { cn } from "@/lib/utils";
import { AppModal } from "./AppModal";
import { Icon } from "./Icon";

interface PlayerCornerProps {
    position: CornerPosition;
    hasPermission: boolean;
    showPieMenu: boolean;
    sensitivity?: number;
    onDoubleTap: () => void;
    onSingleTap: () => void;
    onBrightnessChange: (val: number) => void;
    onExecuteOperation: (op: PlayerOperation) => void;
    onModalChange?: (isOpen: boolean) => void;
}

export const PlayerCorner: React.FC<PlayerCornerProps> = ({
    position,
    hasPermission,
    showPieMenu,
    sensitivity = 0.3,
    onDoubleTap,
    onSingleTap,
    onBrightnessChange,
    onExecuteOperation,
    onModalChange,
}) => {
    const { settings, updateSettings } = useSettings();
    const insets = useSafeAreaInsets();
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
                    // Convert raw system value to perceptual (roughly cubic on Android)
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
                    // Sync baseline with current perceptual value
                    dragBaseline.current = Math.pow(realBrightness, 1 / 3);
                    syncTranslation.current = activeTranslation.current;
                })
                .catch(() => {});
        })
        .onUpdate((event) => {
            if (!hasPermission) return;
            activeTranslation.current = event.translationY;
            const screenHeight = dimensions.height;
            // Formula works on perceptual scale (0 to 1)
            const deltaP = (event.translationY - syncTranslation.current) / (screenHeight / (sensitivity * 5));
            let newP = dragBaseline.current - deltaP;
            newP = Math.max(0, Math.min(1, newP));

            // Output perceptual for UI indicator
            onBrightnessChange(newP);

            // Convert perceptual back to raw for system (P^3)
            const raw = Math.pow(newP, 3);
            Brightness.setSystemBrightnessAsync(raw).catch(() => {});
        });

    const doubleTapGesture = Gesture.Tap()
        .numberOfTaps(2)
        .runOnJS(true)
        .onStart(() => {
            onDoubleTap();
        });

    const singleTapGesture = Gesture.Tap()
        .numberOfTaps(1)
        .runOnJS(true)
        .onEnd(() => {
            if (!showPieMenu) onSingleTap();
        });

    const composed = Gesture.Simultaneous(panGesture, Gesture.Exclusive(doubleTapGesture, singleTapGesture));

    // --- Modal State ---
    const [configModal, setConfigModal] = useState<{ slotIndex: number; op: PlayerOperation | null } | null>(null);
    const [searchQuery, setSearchQuery] = useState("");
    const [editOp, setEditOp] = useState<Partial<PlayerOperation>>({});
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const [iconPickerOpen, setIconPickerOpen] = useState(false);

    // Notify parent when any modal opens/closes so it can hide the controls layer
    useEffect(() => {
        onModalChange?.(!!configModal || iconPickerOpen);
    }, [configModal, iconPickerOpen]);

    const allIconNames = useMemo(
        () =>
            Object.keys(Icons)
                .filter((k) => {
                    // Skip non-component exports
                    if (k === "default" || k === "Icon") return false;
                    // Skip *Icon aliases (e.g. PlayIcon) — keep only base names (e.g. Play)
                    if (k.endsWith("Icon")) return false;
                    // Must start with uppercase
                    if (k[0] !== k[0].toUpperCase()) return false;
                    // Must be a non-null object or function (forwardRef components)
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
            setEditOp(configModal.op || { type: "seek" });
            setSearchQuery("");
        }
    }, [configModal]);

    const handleSaveOperation = () => {
        if (!configModal) return;
        const newConfigs = { ...settings.cornerConfigs };
        const currentOps = [...newConfigs[position]];

        const val = Number(editOp.value) || 0;

        const finalizedOp: PlayerOperation = {
            id: editOp.id || Math.random().toString(36).substr(2, 9),
            type: "seek",
            value: val,
            iconName: editOp.iconName || "Plus",
            label: `${val > 0 ? "+" : ""}${val}s`,
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
                            onExecuteOperation={onExecuteOperation}
                            onSetConfigModal={setConfigModal}
                        />
                    )}
                </Animated.View>
            </GestureDetector>

            <AppModal visible={!!configModal} onClose={() => setConfigModal(null)}>
                <View className="px-6 pt-6 pb-2">
                    <Text className="text-white text-xl font-bold mb-4">
                        {configModal?.op ? "Edit Operation" : "Add Operation"}
                    </Text>

                    <View className="mb-4">
                        <Text className="text-zinc-400 text-xs uppercase mb-2">Operator Type</Text>
                        <View className="bg-black/40 border border-white/5 rounded-lg px-4 py-3">
                            <Text className="text-white font-medium">Seek By</Text>
                        </View>
                    </View>

                    <Text className="text-zinc-400 text-xs uppercase mb-2">Seek Value (seconds)</Text>
                    <TextInput
                        keyboardType="numeric"
                        value={editOp.value?.toString()}
                        onChangeText={(t) => setEditOp((prev) => ({ ...prev, value: Number(t) }))}
                        placeholder="e.g. 10 or -5"
                        placeholderTextColor="#555"
                        className="bg-black/40 text-white rounded-lg px-4 py-2 mb-4 border border-white/5"
                    />

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

                    <View className="flex-row gap-3 mt-8 mb-4">
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
            </AppModal>

            {/* Icon Picker — second modal stacked on top of config modal */}
            <AppModal
                visible={iconPickerOpen}
                onClose={() => {
                    setIconPickerOpen(false);
                    setSearchQuery("");
                }}
                dimmed={false}
                className="max-w-sm"
            >
                {/* Sticky search bar */}
                <View className="px-4 pt-4 pb-2 border-b border-white/10">
                    <Text className="text-white font-bold text-base mb-2">Pick Icon</Text>
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
                    data={filteredIcons}
                    keyExtractor={(item) => item}
                    numColumns={5}
                    keyboardShouldPersistTaps="handled"
                    showsVerticalScrollIndicator={true}
                    indicatorStyle="white"
                    contentContainerStyle={{ padding: 8 }}
                    columnWrapperStyle={{ gap: 4, marginBottom: 4 }}
                    renderItem={({ item: name }) => {
                        const IconComp = (Icons as any)[name];
                        if (!IconComp) return null;
                        const isSelected = editOp.iconName === name;
                        return (
                            <TouchableOpacity
                                onPress={() => {
                                    setEditOp((p) => ({ ...p, iconName: name }));
                                    setIconPickerOpen(false);
                                    setSearchQuery("");
                                }}
                                style={{ flex: 1, aspectRatio: 1 }}
                                className={cn(
                                    "items-center justify-center rounded-lg",
                                    isSelected ? "bg-blue-600" : "bg-white/5",
                                )}
                            >
                                <Icon icon={IconComp} size={20} color={isSelected ? "white" : "#aaa"} />
                            </TouchableOpacity>
                        );
                    }}
                />
            </AppModal>
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
}

const PieButtons = React.memo<PieButtonsProps>(
    ({ ops, isLeft, isTop, pieRadius, piePadding, labelRadius, onExecuteOperation, onSetConfigModal }) => {
        const angles = [0, 30, 60, 90];

        return (
            <>
                {/* <TouchableOpacity
                    disabled
                    className="absolute w-12 h-12 rounded-full items-center justify-center border border-white/10 bg-black/40 shadow-lg"
                    style={{
                        left: isLeft ? 0 : undefined,
                        right: !isLeft ? 0 : undefined,
                        top: isTop ? 0 : undefined,
                        bottom: !isTop ? 0 : undefined,
                        transform: [
                            { translateX: isLeft ? piePadding : -piePadding },
                            { translateY: isTop ? piePadding : -piePadding },
                        ],
                    }}
                >
                    <Icon icon={Icons.Plus} size={20} color="rgba(255,255,255,0.4)" />
                </TouchableOpacity> */}

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
                    const IconComp = op ? (Icons as any)[op.iconName] || Icons.HelpCircle : Icons.Plus;

                    return (
                        <React.Fragment key={index}>
                            <TouchableOpacity
                                onPress={() => (op ? onExecuteOperation(op) : onSetConfigModal({ slotIndex: index, op: null }))}
                                onLongPress={() => op && onSetConfigModal({ slotIndex: index, op })}
                                className={cn(
                                    "absolute w-12 h-12 rounded-full items-center justify-center border border-white/20 bg-black/80 shadow-lg",
                                    !op && "bg-black/25",
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
                                        height: 48, // Match button height for vertical centering
                                        transform: [
                                            { translateX: lTranslateX },
                                            { translateY: lTranslateY }, // Aligned with button top
                                        ],
                                        // On most systems, the text will be naturally right-aligned if right: 0
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
                        </React.Fragment>
                    );
                })}
            </>
        );
    },
);
