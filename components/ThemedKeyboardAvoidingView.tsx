import React, { useCallback, useEffect, useState } from "react";
import {
    Keyboard,
    KeyboardAvoidingView,
    KeyboardAvoidingViewProps,
    Platform,
    TouchableWithoutFeedback,
    View,
} from "react-native";

interface ThemedKeyboardAvoidingViewProps extends KeyboardAvoidingViewProps {
    dismissKeyboardOnTap?: boolean;
}

/**
 * A KeyboardAvoidingView wrapper that fixes the "stuck height" bug on Android
 * by forcing a re-render when the keyboard hides.
 * It also includes a TouchableWithoutFeedback to dismiss the keyboard on tap.
 */
export function ThemedKeyboardAvoidingView({
    children,
    style,
    dismissKeyboardOnTap = true,
    ...props
}: ThemedKeyboardAvoidingViewProps) {
    const [key, setKey] = useState("kav-" + Date.now());

    const resetHeight = useCallback(() => {
        setKey("kav-" + Date.now());
    }, []);

    useEffect(() => {
        const hideEvent = Platform.OS === "android" ? "keyboardDidHide" : "keyboardWillHide";
        const listener = Keyboard.addListener(hideEvent, resetHeight);
        return () => listener.remove();
    }, [resetHeight]);

    const content = <View style={{ flex: 1 }}>{children}</View>;

    return (
        <KeyboardAvoidingView
            key={key}
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            style={[{ flex: 1 }, style]}
            {...props}
        >
            {dismissKeyboardOnTap ? (
                <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
                    {content}
                </TouchableWithoutFeedback>
            ) : (
                content
            )}
        </KeyboardAvoidingView>
    );
}
