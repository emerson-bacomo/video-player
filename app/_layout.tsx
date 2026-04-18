import { BottomSheetModalProvider } from "@gorhom/bottom-sheet";
import { Stack } from "expo-router";
import { useEffect } from "react";
import { View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { FloatingPlayer } from "../components/FloatingPlayer";
import { FloatingPlayerProvider } from "../context/FloatingPlayerContext";
import { SettingsProvider } from "../context/SettingsContext";
import { ThemeProvider, useTheme } from "../context/ThemeContext";
import "../global.css";
import { MediaProvider } from "../hooks/useMedia";
import { initDB } from "../utils/db";

function InnerRoot() {
    const { themeVars } = useTheme();
    return (
        <View className="bg-background flex-1" style={[themeVars]}>
            <SettingsProvider>
                <MediaProvider>
                    <BottomSheetModalProvider>
                        <Stack screenOptions={{ headerShown: false }}>
                            <Stack.Screen name="(tabs)" />
                            <Stack.Screen name="player" />
                            <Stack.Screen name="search" />
                        </Stack>
                    </BottomSheetModalProvider>
                    {/* Floats above all screens, hidden automatically on the player route */}
                    <FloatingPlayer />
                </MediaProvider>
            </SettingsProvider>
        </View>
    );
}

export default function RootLayout() {
    useEffect(() => {
        initDB();
    }, []);

    return (
        <GestureHandlerRootView style={{ flex: 1 }}>
            <ThemeProvider>
                <FloatingPlayerProvider>
                    <InnerRoot />
                </FloatingPlayerProvider>
            </ThemeProvider>
        </GestureHandlerRootView>
    );
}
