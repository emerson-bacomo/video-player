import { AlertTriangle, Database } from "lucide-react-native";
import React from "react";
import { Text, View } from "react-native";
import { Icon } from "./Icon";
import { ThemedButton } from "./Themed";

interface EmptyAlbumStateProps {
    loading: boolean;
    onScan: () => Promise<string | null>;
}

export const EmptyAlbumState = ({ loading, onScan }: EmptyAlbumStateProps) => {
    const [scanError, setScanError] = React.useState<string | null>(null);

    if (loading) return null;

    return (
        <View className="flex-1 justify-center items-center py-20 px-10">
            <View className="w-20 h-20 rounded-full items-center justify-center mb-6 border bg-card border-border">
                <Icon icon={Database} size={32} className="text-primary" />
            </View>
            <Text className="text-lg font-bold mb-2 text-center text-text">No Media Found</Text>
            <Text className="text-center mb-8 leading-5 text-secondary">
                We couldn&apos;t find any videos on your device. Ensure you&apos;ve granted gallery access.
            </Text>
            {!!scanError && (
                <View className="w-full max-w-[420px] mb-8 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3.5">
                    <View className="flex-row items-start gap-3">
                        <View className="w-8 h-8 rounded-full items-center justify-center bg-red-500/20 border border-red-500/30 mt-0.5">
                            <Icon icon={AlertTriangle} size={16} className="text-red-300" />
                        </View>
                        <View className="flex-1">
                            <Text className="text-red-200 font-semibold mb-1">Scan Failed</Text>
                            <Text className="text-red-100/90 leading-5">{scanError}</Text>
                        </View>
                    </View>
                </View>
            )}
            <ThemedButton
                title="Scan Device"
                className="px-8 py-3.5 shadow-lg shadow-blue-500/20 rounded-full"
                onPress={(setLoading) => {
                    setLoading(true);
                    onScan()
                        .then((errorMessage) => setScanError(errorMessage))
                        .catch(() => setScanError("Failed to scan media. Please try again."))
                        .finally(() => setLoading(false));
                }}
            />
        </View>
    );
};
