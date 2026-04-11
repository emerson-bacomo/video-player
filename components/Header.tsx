import { ChevronLeft } from "lucide-react-native";
import React from "react";
import { Text, View, TextProps, ViewProps, TouchableOpacity, TouchableOpacityProps } from 'react-native';
import { useTheme } from "@/context/ThemeContext";

interface HeaderProps {
    children: React.ReactNode;
}

const Header = ({ children }: HeaderProps) => {
    const { theme } = useTheme();
    return (
        <View
            className="px-4 pt-2 pb-4 border-b flex-row items-center justify-between gap-4"
            style={{
                borderBottomColor: theme.border,
                borderBottomWidth: 1,
                backgroundColor: theme.background,
            }}
        >
            {children}
        </View>
    );
};

const Back = ({ onPress }: { onPress: () => void }) => {
    return (
        <TouchableOpacity onPress={onPress} hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }}>
            <ChevronLeft size={20} color="white" />
        </TouchableOpacity>
    );
};

interface TitleProps {
    title: string;
    subtitle?: string;
}

const Title = ({ title, subtitle }: TitleProps) => {
    return (
        <View className="flex-1">
            <Text className="text-white text-2xl font-bold" numberOfLines={1}>
                {title}
            </Text>
            {subtitle && <Text className="text-zinc-500 text-sm">{subtitle}</Text>}
        </View>
    );
};

const Actions = ({ children }: { children: React.ReactNode }) => {
    return <View className="flex-row items-center gap-2">{children}</View>;
};

Header.Back = Back;
Header.Title = Title;
Header.Actions = Actions;

export { Header };
