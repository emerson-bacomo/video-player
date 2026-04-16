import { ChevronLeft, Search, X } from "lucide-react-native";
import React from "react";
import { Text, TextInput, TouchableOpacity, View } from "react-native";
import { Icon } from "./Icon";
import { useMedia } from "@/hooks/useMedia";
import { useTheme } from "@/context/ThemeContext";

interface HeaderProps {
    children: React.ReactNode;
}

const Header = ({ children }: HeaderProps) => {
    return (
        <View className="px-4 pt-2 pb-4 border-b border-border bg-background flex-row items-center justify-between gap-4">
            {children}
        </View>
    );
};

const Back = ({ onPress }: { onPress: () => void }) => {
    return (
        <TouchableOpacity onPress={onPress} hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }}>
            <Icon icon={ChevronLeft} size={20} className="text-text" />
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
            <Text className="text-text text-2xl font-bold" numberOfLines={1}>
                {title}
            </Text>
            {subtitle && <Text className="text-secondary text-sm">{subtitle}</Text>}
        </View>
    );
};

const Actions = ({ children }: { children: React.ReactNode }) => {
    return <View className="flex-row items-center gap-2">{children}</View>;
};

const SearchAction = () => {
    const { setIsSearchVisible } = useMedia();
    return (
        <TouchableOpacity onPress={() => setIsSearchVisible(true)} className="p-2">
            <Icon icon={Search} size={20} className="text-text" />
        </TouchableOpacity>
    );
};

Header.Back = Back;
Header.Title = Title;
Header.Actions = Actions;
Header.SearchAction = SearchAction;

export { Header };
