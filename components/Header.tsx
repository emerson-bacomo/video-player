import { useTheme } from "@/context/ThemeContext";
import { useMedia } from "@/hooks/useMedia";
import { router } from "expo-router";
import {
    CheckSquare,
    ChevronLeft,
    MoreVertical,
    Search,
    Square,
    X,
} from "lucide-react-native";
import { LucideIcon } from "lucide-react-native";
import React from "react";
import { Text, TouchableOpacity, View } from "react-native";
import { cn } from "../utils/cn";
import { Icon } from "./Icon";
import { Menu } from "./Menu";

export interface SelectionAction {
    label: string;
    icon: LucideIcon;
    onPress: (ids: Set<string>) => void;
    destructive?: boolean;
}

interface SelectionActionsContextType {
    actions: SelectionAction[] | null;
    setActions: (actions: SelectionAction[] | null) => void;
}

interface HeaderProps {
    children: React.ReactNode;
}

const Header = ({ children }: HeaderProps) => {
    const [customActions, setCustomActions] = React.useState<SelectionAction[] | null>(null);

    return (
        <SelectionActionsContext.Provider
            value={{ actions: customActions, setActions: setCustomActions } as SelectionActionsContextType}
        >
            <View className="relative">
                <View className="px-4 pt-2 pb-4 border-b border-border bg-background flex-row items-center justify-between gap-4">
                    {children}
                </View>
                <SelectionMode />
            </View>
        </SelectionActionsContext.Provider>
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
    return (
        <TouchableOpacity onPress={() => router.push("/search")} className="p-2">
            <Icon icon={Search} size={20} className="text-text" />
        </TouchableOpacity>
    );
};

const SelectionActionsContext = React.createContext<SelectionActionsContextType | null>(null);

const SelectionMode = () => {
    const selectionActions = React.useContext(SelectionActionsContext);
    const { selectedIds, isSelectionMode, clearSelection, selectAll, albums, currentAlbum, currentAlbumVideos } =
        useMedia();
    const { colors } = useTheme();

    if (!isSelectionMode) return null;

    const totalItems = currentAlbum ? currentAlbumVideos.length : albums.length;
    const isAllSelected = selectedIds.size === totalItems && totalItems > 0;

    return (
        <View className="absolute inset-0 z-50 flex-row items-center justify-between px-4 bg-background border-b border-border">
            <View className="flex-row items-center gap-6">
                <TouchableOpacity onPress={clearSelection} activeOpacity={0.7}>
                    <Icon icon={X} size={24} className="text-text" />
                </TouchableOpacity>
                <Text className="text-text text-xl font-bold">{selectedIds.size} selected</Text>
            </View>

            <View className="flex-row items-center gap-4">
                <TouchableOpacity onPress={selectAll} activeOpacity={0.7}>
                    <Icon
                        icon={isAllSelected ? CheckSquare : Square}
                        size={24}
                        color={isAllSelected ? colors.primary : colors.text}
                    />
                </TouchableOpacity>

                {selectionActions?.actions && (
                    <Menu variant="POPUP" anchorHorizontal="right">
                        <Menu.Trigger className="w-10 h-10 items-center justify-center">
                            <Icon icon={MoreVertical} size={24} className="text-text" />
                        </Menu.Trigger>
                        <Menu.Content className="w-48">
                            {selectionActions.actions.map((act, idx) => (
                                <Menu.Item
                                    key={idx}
                                    className={cn(
                                        "flex-row items-center px-4 py-3 gap-3",
                                        idx < selectionActions.actions!.length - 1 && "border-b border-white/5",
                                    )}
                                    onPress={() => {
                                        act.onPress(selectedIds);
                                    }}
                                >
                                    <Icon
                                        icon={act.icon}
                                        size={18}
                                        className={act.destructive ? "text-error" : "text-secondary"}
                                    />
                                    <Text className={cn("text-sm font-medium", act.destructive ? "text-error" : "text-white")}>
                                        {act.label}
                                    </Text>
                                </Menu.Item>
                            ))}
                        </Menu.Content>
                    </Menu>
                )}
            </View>
        </View>
    );
};

const HeaderNamespace = Object.assign(Header, {
    Back,
    Title,
    Actions,
    SearchAction,
    SelectionActions: ({ actions }: { actions: SelectionAction[] }) => {
        const context = React.useContext(SelectionActionsContext);
        React.useEffect(() => {
            if (context) {
                context.setActions(actions);
            }
            return () => {
                if (context) {
                    context.setActions(null);
                }
            };
        }, [actions, context]);
        return null;
    },
});

export { HeaderNamespace as Header };
