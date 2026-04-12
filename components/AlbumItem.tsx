import React from 'react';
import { View, Text, TouchableOpacity, Image } from 'react-native';
import { Folder } from 'lucide-react-native';
import { Skeleton } from './Skeleton';
import { Icon } from './Icon';

interface AlbumItemProps {
  item: any;
  onPress: () => void;
  onLongPress: () => void;
}

export const AlbumItem = React.memo(({ item, onPress, onLongPress }: AlbumItemProps) => {
    if (item.isPlaceholder) {
        return (
            <View className="w-[48%] mb-6">
                <Skeleton className="aspect-square rounded-2xl mb-2 border border-border" />
                <View className="px-1 mt-1 gap-1.5">
                    <Skeleton className="h-3.5 w-3/4 rounded border border-border" />
                    <Skeleton className="h-2.5 w-1/3 rounded border border-border" />
                </View>
            </View>
        );
    }

    return (
        <View className="w-[48%] mb-6">
            <TouchableOpacity activeOpacity={0.8} onPress={onPress} onLongPress={onLongPress}>
                <View 
                    className="aspect-square rounded-2xl overflow-hidden border border-border bg-card shadow-md mb-2"
                >
                    {item.thumbnail ? (
                        <Image source={{ uri: item.thumbnail }} className="w-full h-full" resizeMode="cover" />
                    ) : (
                        <View className="w-full h-full justify-center items-center bg-card">
                            <Icon icon={Folder} size={48} className="text-primary fill-primary/20" />
                        </View>
                    )}
                    {item.hasNew && (
                        <View
                            pointerEvents="none"
                            className="absolute top-2 right-2 h-[20px] px-2 rounded-full justify-center items-center bg-error/80 backdrop-blur-md"
                        >
                            <Text className="text-white text-[9px] font-bold tracking-wider">NEW</Text>
                        </View>
                    )}
                </View>
            </TouchableOpacity>

            <TouchableOpacity activeOpacity={0.7} onPress={onLongPress} className="px-1">
                <Text className="text-text font-semibold text-sm" numberOfLines={1}>
                    {item.title}
                </Text>
                <Text className="text-secondary text-[11px] mt-0.5">{item.assetCount} videos</Text>
            </TouchableOpacity>
        </View>
    );
});

AlbumItem.displayName = "AlbumItem";
