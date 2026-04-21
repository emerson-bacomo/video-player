import { cn } from "@/utils/cn";
import React, { useEffect, useState } from "react";
import {
    KeyboardAvoidingView,
    Modal,
    Platform,
    Text,
    TextInput,
    TouchableOpacity,
    TouchableWithoutFeedback,
    View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

interface RenameModalProps {
    visible: boolean;
    onClose: () => void;
    onRename: (newName: string) => void;
    initialValue: string;
    title: string;
}

export const RenameModal = ({ visible, onClose, onRename, initialValue, title }: RenameModalProps) => {
    const [value, setValue] = useState(initialValue);
    const insets = useSafeAreaInsets();

    useEffect(() => {
        if (visible) {
            setValue(initialValue);
        }
    }, [visible, initialValue]);

    const handleSave = () => {
        if (value.trim()) {
            onRename(value.trim());
            onClose();
        }
    };

    return (
        <Modal
            visible={visible}
            transparent
            animationType="fade"
            onRequestClose={onClose}
        >
            <TouchableWithoutFeedback onPress={onClose}>
                <View className="flex-1 bg-black/60 justify-center px-6">
                    <TouchableWithoutFeedback>
                        <KeyboardAvoidingView
                            behavior={Platform.OS === "ios" ? "padding" : "height"}
                        >
                            <View className="bg-card rounded-3xl border border-border shadow-2xl overflow-hidden">
                                <View className="p-6">
                                    <Text className="text-text text-xl font-bold mb-2">{title}</Text>
                                    <Text className="text-secondary text-sm mb-6">
                                        Enter a new display name for this item.
                                    </Text>

                                    <View className="bg-white/5 border border-border rounded-2xl px-4 h-14 justify-center mb-6">
                                        <TextInput
                                            className="text-text text-base"
                                            value={value}
                                            onChangeText={setValue}
                                            placeholder="Item name"
                                            placeholderTextColor="#71717a"
                                            autoFocus={visible}
                                            selectTextOnFocus
                                            onSubmitEditing={handleSave}
                                        />
                                    </View>

                                    <View className="flex-row gap-3">
                                        <TouchableOpacity
                                            onPress={onClose}
                                            className="flex-1 h-12 rounded-xl border border-border justify-center items-center"
                                        >
                                            <Text className="text-text font-semibold text-sm">Cancel</Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity
                                            onPress={handleSave}
                                            disabled={!value.trim()}
                                            className={cn(
                                                "flex-1 h-12 rounded-xl justify-center items-center bg-primary",
                                                !value.trim() && "opacity-50"
                                            )}
                                        >
                                            <Text className="text-primary-foreground font-semibold text-sm">Save</Text>
                                        </TouchableOpacity>
                                    </View>
                                </View>
                            </View>
                        </KeyboardAvoidingView>
                    </TouchableWithoutFeedback>
                </View>
            </TouchableWithoutFeedback>
        </Modal>
    );
};
