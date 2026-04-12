import { Text, TextProps, View, ViewProps } from "react-native";
import { SafeAreaView, SafeAreaViewProps } from "react-native-safe-area-context";
import { Button, ButtonProps } from "./Button";
import { useTheme } from "@/context/ThemeContext";

export function ThemedView({ style, ...otherProps }: ViewProps) {
    const { colors } = useTheme();
    return <View className="bg-background" style={[{ backgroundColor: colors.background }, style]} {...otherProps} />;
}

export function ThemedSafeAreaView({ style, ...otherProps }: SafeAreaViewProps) {
    const { colors } = useTheme();
    return <SafeAreaView className="bg-background flex-1" style={[{ backgroundColor: colors.background }, style]} {...otherProps} />;
}

export function ThemedText({ style, ...otherProps }: TextProps) {
    const { colors } = useTheme();
    return <Text className="text-text" style={[{ color: colors.text }, style]} {...otherProps} />;
}

export function ThemedCard({ style, ...otherProps }: ViewProps) {
    const { colors } = useTheme();
    return (
        <View
            className="bg-card border-border border rounded-xl"
            style={[{ backgroundColor: colors.card, borderColor: colors.border }, style]}
            {...otherProps}
        />
    );
}

export function ThemedButton({ style, textStyle, ...otherProps }: ButtonProps) {
    const { colors } = useTheme();

    return (
        <Button
            className="bg-primary p-3 rounded-xl"
            style={[{ backgroundColor: colors.primary }, style]}
            textStyle={[{ color: "white" }, textStyle]}
            {...otherProps}
        />
    );
}
