import { cn } from "@/lib/utils";
import { Check } from "lucide-react-native";
import React, { useState } from "react";
import { Text, TouchableOpacity, TouchableWithoutFeedback, View } from "react-native";
import Modal from "react-native-modal";
import { Icon } from "./Icon";

const ROW_H = 48;

/** A thin inline dropdown (select) rendered as a modal overlay */
export const SelectDropdown = <T extends string>({
    value,
    options,
    onChange,
}: {
    value: T;
    options: { label: string; value: T; sublabel?: string; enabled?: boolean }[];
    onChange: (v: T) => void;
}) => {
    const [open, setOpen] = useState(false);
    const selected = options.find((o) => o.value === value);

    return (
        <>
            <TouchableOpacity
                onPress={() => setOpen(true)}
                style={{ height: ROW_H }}
                className="flex-row items-center justify-between bg-zinc-800 rounded-xl px-3 border border-white/5"
            >
                <Text className="text-text text-base flex-1 mr-2" numberOfLines={1}>
                    {selected?.label ?? value}
                </Text>
                {/* ▼ triangle */}
                <View
                    style={{
                        width: 0,
                        height: 0,
                        borderLeftWidth: 5,
                        borderRightWidth: 5,
                        borderTopWidth: 7,
                        borderLeftColor: "transparent",
                        borderRightColor: "transparent",
                        borderTopColor: "#71717a",
                    }}
                />
            </TouchableOpacity>

            <Modal
                isVisible={open}
                hasBackdrop={false}
                onBackButtonPress={() => setOpen(false)}
                animationIn="fadeIn"
                animationOut="fadeOut"
                animationInTiming={150}
                animationOutTiming={150}
                useNativeDriver
                style={{ margin: 0 }}
            >
                <View className="flex-1 justify-center px-6">
                    <TouchableWithoutFeedback onPress={() => setOpen(false)}>
                        <View className="absolute inset-0 bg-black/60" />
                    </TouchableWithoutFeedback>
                    
                    <View className="w-full bg-zinc-900 rounded-2xl overflow-hidden border border-white/10 relative z-10">
                    {options.map((opt, idx) => {
                        const isSelected = opt.value === value;
                        const isDisabled = opt.enabled === false;
                        return (
                            <TouchableOpacity
                                key={opt.value}
                                activeOpacity={isDisabled ? 1 : 0.7}
                                onPress={() => {
                                    if (isDisabled) return;
                                    onChange(opt.value);
                                    setOpen(false);
                                }}
                                className={cn(
                                    "flex-row items-center justify-between px-4 py-3.5",
                                    idx < options.length - 1 && "border-b border-white/5",
                                    isDisabled && "opacity-35",
                                )}
                            >
                                <View className="flex-1 mr-3">
                                    <Text className={cn("text-base font-medium", isSelected ? "text-primary" : "text-text")}>
                                        {opt.label}
                                    </Text>
                                    {opt.sublabel ? <Text className="text-zinc-500 text-sm mt-0.5">{opt.sublabel}</Text> : null}
                                </View>
                                {isSelected && <Icon icon={Check} size={18} className="text-primary" />}
                            </TouchableOpacity>
                        );
                    })}
                    </View>
                </View>
            </Modal>
        </>
    );
};
