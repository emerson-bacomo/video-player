import React from 'react';
import { View, Text } from 'react-native';
import { Database } from 'lucide-react-native';
import { ThemedButton } from './Themed';

interface EmptyAlbumStateProps {
  loading: boolean;
  onScan: () => void;
}

export const EmptyAlbumState = ({ loading, onScan }: EmptyAlbumStateProps) => {
    if (loading) return null;

    return (
        <View className="flex-1 justify-center items-center py-20 px-10">
            <View 
                className="w-20 h-20 rounded-full items-center justify-center mb-6 border bg-card border-border"
            >
                <Database size={32} className="text-primary" />
            </View>
            <Text className="text-lg font-bold mb-2 text-center text-text">No Media Found</Text>
            <Text className="text-center mb-8 leading-5 text-secondary">
                We couldn&apos;t find any videos on your device. Ensure you&apos;ve granted gallery access.
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
