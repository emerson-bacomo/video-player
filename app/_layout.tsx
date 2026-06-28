import { BottomSheetModalProvider } from "@gorhom/bottom-sheet";
import { DarkTheme, ThemeProvider as NavigationThemeProvider } from "@react-navigation/native";
import { Host } from "react-native-portalize";
import { Stack, useRouter } from "expo-router";
import { Platform, View } from "react-native";
import React, { useEffect } from "react";
import notifee, { EventType } from "@notifee/react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { Toaster } from "sonner-native";
import { FloatingPlayer } from "../components/FloatingPlayer";
import { FloatingPlayerProvider } from "../context/FloatingPlayerContext";
import { SettingsProvider } from "../context/SettingsContext";
import { ThemeProvider, useTheme } from "../context/ThemeContext";
import "../global.css";
import { LoadingTaskProvider } from "@/context/LoadingTaskContext";
import { SelectionProvider } from "@/context/SelectionContext";
import { MediaProvider } from "../hooks/useMedia";
import { initDB } from "../utils/db";
import { ensureNotifeeChannels } from "@/utils/clipNotification";

// Register the Notifee foreground service handler.
// This MUST be called before any component renders so Android can keep
// the JS thread alive while the app is backgrounded during an export.
if (Platform.OS === "android") {
    notifee.registerForegroundService((_notification: any) => {
        // Return a promise that never resolves — the service runs until
        // we call notifee.stopForegroundService() in clipNotification.ts
        return new Promise<void>(() => {});
    });

    notifee.onBackgroundEvent(async () => {
        // Check if the user pressed the "Dismiss" action or similar if we add any.
        // For now, we just acknowledge the event to satisfy Notifee's requirements.
    });
}

function InnerRoot() {
    const { themeVars, colors } = useTheme();
    const router = useRouter();

    useEffect(() => {
        // Handle notification clicks while the app is in foreground/background
        const unsubscribe = notifee.onForegroundEvent(({ type, detail }) => {
            if (type === EventType.PRESS && detail.notification?.data?.videoId) {
                const { videoId, albumId } = detail.notification.data as { videoId: string; albumId: string };
                router.push({
                    pathname: "/(videos)/player",
                    params: { videoId, albumId },
                });
            }
        });

        // Handle app opened from notification while app was completely closed
        notifee.getInitialNotification().then((notification) => {
            if (notification?.notification?.data?.videoId) {
                const { videoId, albumId } = notification.notification.data as { videoId: string; albumId: string };
                router.push({
                    pathname: "/(videos)/player",
                    params: { videoId, albumId },
                });
            }
        });

        return () => unsubscribe();
    }, [router]);

    return (
        <View className="bg-background flex-1" style={[themeVars]}>
            <Host>
                <SettingsProvider>
                    <LoadingTaskProvider initialTask={{ label: "Initializing", detail: "Loading media library..." }}>
                        <SelectionProvider>
                            <MediaProvider>
                                <BottomSheetModalProvider>
                                    <SafeAreaProvider>
                                        <NavigationThemeProvider
                                            value={{
                                                ...DarkTheme,
                                                colors: {
                                                    ...DarkTheme.colors,
                                                    background: colors.background,
                                                },
                                            }}
                                        >
                                            <Stack
                                                screenOptions={{
                                                    headerShown: false,
                                                }}
                                            >
                                                <Stack.Screen name="(tabs)" />
                                                <Stack.Screen
                                                    name="(videos)/player"
                                                    options={{ presentation: "fullScreenModal", animation: "fade" }}
                                                />
                                                <Stack.Screen
                                                    name="(videos)/player-settings"
                                                    options={{ presentation: "modal" }}
                                                />
                                                <Stack.Screen name="(videos)/search" options={{ animation: "fade" }} />
                                                <Stack.Screen
                                                    name="(videos)/delete-preview"
                                                    options={{ presentation: "modal" }}
                                                />
                                                <Stack.Screen
                                                    name="(settings)/export-vpc-preview"
                                                    options={{ presentation: "modal" }}
                                                />
                                                <Stack.Screen
                                                    name="(settings)/import-vpc-preview"
                                                    options={{ presentation: "modal" }}
                                                />
                                                <Stack.Screen name="(settings)/exports" options={{ presentation: "modal" }} />
                                                <Stack.Screen name="(settings)/logs" options={{ presentation: "modal" }} />
                                                <Stack.Screen
                                                    name="(settings)/hidden-media"
                                                    options={{ presentation: "modal" }}
                                                />
                                                <Stack.Screen
                                                    name="(settings)/theme-editor"
                                                    options={{ presentation: "modal" }}
                                                />
                                                <Stack.Screen
                                                    name="(settings)/test-gesture"
                                                    options={{ presentation: "modal" }}
                                                />
                                            </Stack>
                                        </NavigationThemeProvider>
                                    </SafeAreaProvider>
                                </BottomSheetModalProvider>
                                {/* Floats above all screens, hidden automatically on the player route */}
                                <FloatingPlayer />
                                <Toaster />
                            </MediaProvider>
                        </SelectionProvider>
                    </LoadingTaskProvider>
                </SettingsProvider>
            </Host>
        </View>
    );
}

export default function RootLayout() {
    initDB();
    // Pre-create notification channels (no-op after first call)
    ensureNotifeeChannels();

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
