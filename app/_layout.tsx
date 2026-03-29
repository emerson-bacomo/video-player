import { Stack } from "expo-router";
import { useEffect } from "react";
import "../global.css";
import { initDB } from "../utils/db";
import { MediaProvider } from "../hooks/useMedia";

export default function RootLayout() {
    useEffect(() => {
        initDB();
    }, []);
    return (
        <MediaProvider>
            <Stack screenOptions={{ headerShown: false }}>
                <Stack.Screen name="(tabs)" />
                <Stack.Screen name="player" />
            </Stack>
        </MediaProvider>
    );
}
