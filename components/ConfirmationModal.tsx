import React from "react";
import { Text, View } from "react-native";
import { AppModal } from "./AppModal";
import { Button } from "./Button";
import { Icon } from "./Icon";
import { LucideIcon } from "lucide-react-native";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/utils/cn";

const modalIconBgVariants = cva(
    "p-4 rounded-full mb-4",
    {
        variants: {
            variant: {
                default: "bg-blue-500/10",
                destructive: "bg-red-500/10",
                success: "bg-green-500/10",
                warning: "bg-yellow-500/10",
            }
        },
        defaultVariants: {
            variant: "default"
        }
    }
);

const modalIconTextVariants = cva(
    "",
    {
        variants: {
            variant: {
                default: "text-blue-500",
                destructive: "text-red-500",
                success: "text-green-500",
                warning: "text-yellow-500",
            }
        },
        defaultVariants: {
            variant: "default"
        }
    }
);

interface ConfirmationModalProps extends VariantProps<typeof modalIconBgVariants> {
    visible: boolean;
    onClose: () => void;
    onConfirm: () => void;
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    icon?: LucideIcon;
    isLoading?: boolean;
    hideCancel?: boolean;
}

export const ConfirmationModal: React.FC<ConfirmationModalProps> = ({
    visible,
    onClose,
    onConfirm,
    title,
    message,
    confirmText = "Confirm",
    cancelText = "Cancel",
    variant = "default",
    icon,
    isLoading = false,
    hideCancel = false,
}) => {
    const getButtonVariant = () => {
        switch (variant) {
            case "destructive": return "danger";
            case "success": return "success";
            case "warning": return "warning";
            default: return "primary";
        }
    };

    return (
        <AppModal visible={visible} onClose={onClose}>
            <View className="p-6">
                <View className="items-center mb-4">
                    {icon && (
                        <View className={cn(modalIconBgVariants({ variant }))}>
                            <Icon 
                                icon={icon} 
                                size={32} 
                                className={modalIconTextVariants({ variant }) || ""} 
                            />
                        </View>
                    )}
                    <Text className="text-xl font-bold text-white text-center">{title}</Text>
                    <Text className="text-zinc-400 text-center mt-2 leading-5">
                        {message}
                    </Text>
                </View>

                <View className="gap-3 mt-4">
                    <Button
                        title={confirmText}
                        onPress={onConfirm}
                        variant={getButtonVariant()}
                        className="rounded-xl py-4"
                        textClassName="font-bold"
                        loading={isLoading}
                    />
                    {!isLoading && !hideCancel && (
                        <Button
                            title={cancelText}
                            variant="secondary"
                            onPress={onClose}
                            className="rounded-xl py-4"
                        />
                    )}
                </View>
            </View>
        </AppModal>
    );
};
