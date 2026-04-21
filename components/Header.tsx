import { useTheme } from "@/context/ThemeContext";
import { useMedia } from "@/hooks/useMedia";
import { router } from "expo-router";
import {
    CheckCircle,
    CheckSquare,
    ChevronLeft,
    Circle,
    EyeOff,
    Film,
    MoreVertical,
    FolderInput,
    Search,
    Square,
    Trash2,
    X,
} from "lucide-react-native";
import React from "react";
import { Text, TouchableOpacity, View } from "react-native";
import { cn } from "../utils/cn";
import { Icon } from "./Icon";
import { Menu } from "./Menu";

interface HeaderProps {
    children: React.ReactNode;
}

const Header = ({ children }: HeaderProps) => {
    const [overrideActions, setOverrideActions] = React.useState<any[] | null>(null);

    return (
        <SelectionOverrideContext.Provider value={{ actions: overrideActions, setOverrideActions } as any}>
            <View className="relative">
                <View className="px-4 pt-2 pb-4 border-b border-border bg-background flex-row items-center justify-between gap-4">
                    {children}
                </View>
                <SelectionMode />
            </View>
        </SelectionOverrideContext.Provider>
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

const SelectionOverrideContext = React.createContext<{
    actions: { label: string; icon: any; onPress: (ids: Set<string>) => void; destructive?: boolean }[] | null;
} | null>(null);

const SelectionMode = () => {
    const override = React.useContext(SelectionOverrideContext);
    const {
        selectedIds,
        isSelectionMode,
        clearSelection,
        selectAll,
        albums,
        currentAlbum,
        currentAlbumVideos,
        updateMultipleVideoProgress,
        selectPrefixesOfSelected,
        hideMultipleVideos,
        hideMultipleAlbums,
    } = useMedia();
    const { colors } = useTheme();

    if (!isSelectionMode) return null;

    const totalItems = currentAlbum ? currentAlbumVideos.length : albums.length;
    const isAllSelected = selectedIds.size === totalItems && totalItems > 0;

    // Determine watched state based on first selected item
    const firstSelectedId = Array.from(selectedIds)[0];
    const firstItem = currentAlbumVideos.find((v) => v.id === firstSelectedId);
    const isWatched = firstItem ? firstItem.lastPlayedSec >= firstItem.duration * 0.95 : false;

    const hasAnyPrefixesInSelection = React.useMemo(() => {
        return Array.from(selectedIds).some((id) => {
            const v = currentAlbumVideos.find((vid) => vid.id === id);
            return !!v?.prefix;
        });
    }, [selectedIds, currentAlbumVideos]);

    const handleToggleWatched = () => {
        const ids = Array.from(selectedIds);
        const newProgress = isWatched ? 0 : firstItem?.duration || 0;
        updateMultipleVideoProgress(ids, newProgress);
        clearSelection();
    };

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

                <Menu variant="POPUP" anchorHorizontal="right">
                    <Menu.Trigger className="w-10 h-10 items-center justify-center">
                        <Icon icon={MoreVertical} size={24} className="text-text" />
                    </Menu.Trigger>
                    <Menu.Content className="w-48">
                        {override?.actions ? (
                            override.actions.map((act, idx) => (
                                <Menu.Item
                                    key={idx}
                                    className={cn(
                                        "flex-row items-center px-4 py-3 gap-3",
                                        idx < override.actions!.length - 1 && "border-b border-white/5",
                                    )}
                                    onPress={() => act.onPress(selectedIds)}
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
                            ))
                        ) : (
                            <>
                                <Menu.Item
                                    className="flex-row items-center px-4 py-3 gap-3 border-b border-white/5"
                                    onPress={handleToggleWatched}
                                >
                                    <Icon icon={isWatched ? Circle : CheckCircle} size={18} className="text-secondary" />
                                    <Text className="text-white text-sm font-medium">
                                        {isWatched ? "Mark as Unwatched" : "Mark as Watched"}
                                    </Text>
                                </Menu.Item>
                                {hasAnyPrefixesInSelection && (
                                    <Menu.Item
                                        className="flex-row items-center px-4 py-3 gap-3 border-b border-white/5"
                                        onPress={selectPrefixesOfSelected}
                                    >
                                        <Icon icon={Film} size={18} className="text-secondary" />
                                        <Text className="text-white text-sm font-medium">Select same prefix</Text>
                                    </Menu.Item>
                                )}
                                <Menu.Item
                                    className="flex-row items-center px-4 py-3 gap-3 border-b border-white/5"
                                    onPress={() => console.log("Move multiple", Array.from(selectedIds))}
                                >
                                    <Icon icon={FolderInput} size={18} className="text-secondary" />
                                    <Text className="text-white text-sm font-medium">Move</Text>
                                </Menu.Item>
                                <Menu.Item
                                    className="flex-row items-center px-4 py-3 gap-3 border-b border-white/5"
                                    onPress={() => {
                                        const ids = Array.from(selectedIds);
                                        if (currentAlbum) hideMultipleVideos(ids);
                                        else hideMultipleAlbums(ids);
                                    }}
                                >
                                    <Icon icon={EyeOff} size={18} className="text-secondary" />
                                    <Text className="text-white text-sm font-medium">Hide Selected</Text>
                                </Menu.Item>
                                <Menu.Item
                                    className="flex-row items-center px-4 py-3 gap-3"
                                    onPress={() => console.log("Delete multiple", Array.from(selectedIds))}
                                >
                                    <Icon icon={Trash2} size={18} className="text-error" />
                                    <Text className="text-error text-sm font-medium">Delete</Text>
                                </Menu.Item>
                            </>
                        )}
                    </Menu.Content>
                </Menu>
            </View>
        </View>
    );
};

const HeaderNamespace = Object.assign(Header, {
    Back,
    Title,
    Actions,
    SearchAction,
    SelectionOverrideActions: ({ actions }: { actions: any[] }) => {
        const context = React.useContext(SelectionOverrideContext);
        React.useEffect(() => {
            if (context) {
                // @ts-ignore
                context.setOverrideActions(actions);
            }
            return () => {
                if (context) {
                    // @ts-ignore
                    context.setOverrideActions(null);
                }
            };
        }, [actions, context]);
        return null;
    },
});

export { HeaderNamespace as Header };
