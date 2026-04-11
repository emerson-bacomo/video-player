import React from 'react';
import { View, Text } from 'react-native';
import { Database } from 'lucide-react-native';
import { useTheme } from '@/context/ThemeContext';
import { ThemedButton } from './Themed';

interface EmptyAlbumStateProps {
  loading: boolean;
  onScan: () => void;
}

export const EmptyAlbumState = ({ loading, onScan }: EmptyAlbumStateProps) => {
    const { theme } = useTheme();

    if (loading) return null;

    return (
        <View className="flex-1 justify-center items-center py-20 px-10">
            <View 
                style={{ backgroundColor: theme.card, borderColor: theme.border }}
                className="w-20 h-20 rounded-full items-center justify-center mb-6 border"
            >
                <Database size={32} color={theme.primary} />
            </View>
            <Text style={{ color: theme.text }} className="text-lg font-bold mb-2 text-center">No Media Found</Text>
            <Text style={{ color: theme.secondary }} className="text-center mb-8 leading-5">
                We couldn't find any videos on your device. Ensure you've granted gallery access.
            </Text>
            <ThemedButton
                title="Scan Device"
                className="px-8 py-3.5 shadow-lg shadow-blue-500/20"
                onPress={(setLoading) => {
                    setLoading(true);
                    onScan();
                }}
            />
        </View>
    );
};
