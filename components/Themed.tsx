import { useTheme } from "@/context/ThemeContext";
import { Text, TextProps, View, ViewProps } from "react-native";
import { SafeAreaView, SafeAreaViewProps } from "react-native-safe-area-context";
import { Button, ButtonProps } from "./Button";

export function ThemedView(props: ViewProps) {
    const { theme } = useTheme();
    const { style, ...otherProps } = props;
    return <View style={[{ backgroundColor: theme.background }, style]} {...otherProps} />;
}

export function ThemedSafeAreaView(props: SafeAreaViewProps) {
    const { theme } = useTheme();
    const { style, ...otherProps } = props;
    return <SafeAreaView style={[{ backgroundColor: theme.background, flex: 1 }, style]} {...otherProps} />;
}

export function ThemedText(props: TextProps) {
    const { theme } = useTheme();
    const { style, ...otherProps } = props;
    return <Text style={[{ color: theme.text }, style]} {...otherProps} />;
}

export function ThemedCard(props: ViewProps) {
    const { theme } = useTheme();
    const { style, ...otherProps } = props;
    return (
        <View
            style={[{ backgroundColor: theme.card, borderColor: theme.border, borderWidth: 1, borderRadius: 12 }, style]}
            {...otherProps}
        />
    );
}

export function ThemedButton(props: ButtonProps) {
    const { theme } = useTheme();
    const { style, textStyle, ...otherProps } = props;

    return (
        <Button
            style={[{ backgroundColor: theme.primary, padding: 12, borderRadius: 12 }, style]}
            textStyle={[{ color: theme.text }, textStyle]}
            {...otherProps}
        />
    );
}
