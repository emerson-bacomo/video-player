import { cn } from "@/lib/utils";
import React from "react";
import { Modal, TouchableWithoutFeedback, View } from "react-native";

interface AppModalProps {
    visible: boolean;
    onClose: () => void;
    children: React.ReactNode;
    className?: string;
    /** When false, uses a semi-transparent backdrop so an underlying modal shows through. Default: true */
    dimmed?: boolean;
}

/**
 * A reusable centered modal with a dark overlay backdrop.
 * Tapping outside or pressing back closes the modal.
 */
export const AppModal: React.FC<AppModalProps> = ({ visible, onClose, children, className, dimmed = true }) => {
    return (
        <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
            <TouchableWithoutFeedback onPress={onClose}>
                <View className={cn("flex-1 items-center justify-center px-6", dimmed ? "bg-black/80" : "bg-black/50")}>
                    <TouchableWithoutFeedback>
                        <View
                            style={{ maxHeight: "90%" }}
                            className={cn(
                                "w-full max-w-sm rounded-2xl shadow-2xl border bg-zinc-900 border-white/10 overflow-hidden",
                                className,
                            )}
                        >
                            {children}
                        </View>
                    </TouchableWithoutFeedback>
                </View>
            </TouchableWithoutFeedback>
        </Modal>
    );
};
