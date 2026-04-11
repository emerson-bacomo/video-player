import { BottomSheetModalProvider } from "@gorhom/bottom-sheet";
import { Stack } from "expo-router";
import { useEffect } from "react";
import { View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { ThemeProvider, useTheme } from "../context/ThemeContext";
import "../global.css";
import { MediaProvider } from "../hooks/useMedia";
import { initDB } from "../utils/db";

function ThemeWrapper({ children }: { children: React.ReactNode }) {
    const { themeVars } = useTheme();
    return <View style={[{ flex: 1 }, themeVars]}>{children}</View>;
}

export default function RootLayout() {
    useEffect(() => {
        initDB();
    }, []);
    return (
        <GestureHandlerRootView style={{ flex: 1 }}>
            <ThemeProvider>
                <BottomSheetModalProvider>
                    <ThemeWrapper>
                        <MediaProvider>
                            <Stack screenOptions={{ headerShown: false }}>
                                <Stack.Screen name="(tabs)" />
                                <Stack.Screen name="player" />
                            </Stack>
                        </MediaProvider>
                    </ThemeWrapper>
                </BottomSheetModalProvider>
            </ThemeProvider>
        </GestureHandlerRootView>
    );
}
