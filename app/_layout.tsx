import { BottomSheetModalProvider } from "@gorhom/bottom-sheet";
import { Stack } from "expo-router";
import { View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { Toaster } from "sonner-native";
import { FloatingPlayer } from "../components/FloatingPlayer";
import { FloatingPlayerProvider } from "../context/FloatingPlayerContext";
import { PlaybackProvider } from "../context/PlaybackContext";
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
                <PlaybackProvider>
                    <MediaProvider>
                        <BottomSheetModalProvider>
                            <SafeAreaProvider>
                                <Stack screenOptions={{ headerShown: false }}>
                                    <Stack.Screen name="(tabs)" />
                                    <Stack.Screen name="player" />
                                    <Stack.Screen name="search" />
                                </Stack>
                            </SafeAreaProvider>
                            {/* Floats above all screens, hidden automatically on the player route */}
                            <FloatingPlayer />
                            <Toaster />
                        </BottomSheetModalProvider>
                    </MediaProvider>
                </PlaybackProvider>
            </SettingsProvider>
        </View>
    );
}

export default function RootLayout() {
    initDB();

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
