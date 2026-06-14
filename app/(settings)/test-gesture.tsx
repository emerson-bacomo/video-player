import { PlayerCentralIndicator } from "@/components/PlayerCentralIndicator";
import { PlayerGestureDetector } from "@/components/PlayerGestureDetector";
import { BasePlayerHeader } from "@/components/PlayerHeader";
import { PlayerOrientationButton } from "@/components/PlayerOrientationButton";
import { ThemedKeyboardAvoidingView } from "@/components/ThemedKeyboardAvoidingView";
import { useSettings } from "@/hooks/useSettings";
import { useOrientationLock } from "@/hooks/useOrientationLock";
import React, { useEffect, useRef } from "react";
import { Text, TextInput, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { PlayerProvider, usePlayerContext } from "@/context/PlayerContext";

function GestureTestContent() {
    const { settings, updateSettings } = useSettings();
    const insets = useSafeAreaInsets();
    useOrientationLock();

    const {
        setDuration,
        playerRef,
        currentDisplayTime,
        setCurrentDisplayTime,
        setShowControls,
    } = usePlayerContext();

    const currentMockTime = useRef(36000);

    // Initialize mock values
    useEffect(() => {
        setDuration(999999);
        setShowControls(true);
        // Setup mock player
        playerRef.current = {
            get currentTime() {
                return currentMockTime.current;
            },
            seek: (time: number) => {
                currentMockTime.current = time;
                setCurrentDisplayTime(time);
            },
        } as any;
    }, []);

    // Also sync the local ref when currentDisplayTime changes, just in case
    useEffect(() => {
        currentMockTime.current = currentDisplayTime;
    }, [currentDisplayTime]);

    const adjustSensitivity = (delta: number) => {
        const newVal = Math.max(1, Math.min(60, settings.panSeekSensitivity + delta));
        updateSettings({ panSeekSensitivity: newVal });
    };

    return (
        <View style={{ flex: 1, paddingTop: insets.top, backgroundColor: "black" }}>
            <BasePlayerHeader rightSection={<PlayerOrientationButton />}>
                <Text className="text-white font-bold">Gesture Calibration</Text>
            </BasePlayerHeader>

            <PlayerGestureDetector>
                <View className="flex-1 items-center justify-center">
                    <View className="p-8 border border-white/10 rounded-3xl bg-white/5 items-center">
                        <Text className="text-secondary text-sm mb-4 uppercase font-bold tracking-widest">
                            Pan here to test sensitivity
                        </Text>
                        <Text className="text-primary font-bold text-lg text-center">Sensitivity Test Area</Text>
                        <Text className="text-secondary font-bold mt-2 text-xs">
                            Base Time: {new Date(currentDisplayTime * 1000).toISOString().substring(11, 19)}
                        </Text>
                    </View>

                    <PlayerCentralIndicator />
                </View>
            </PlayerGestureDetector>

            <View className="px-6 py-4" style={{ backgroundColor: "black" }}>
                <View className="flex-row items-center justify-center gap-3 bg-white/5 p-4 rounded-2xl border border-white/5">
                    <TouchableOpacity
                        onPress={() => adjustSensitivity(-5)}
                        className="w-12 h-12 items-center justify-center bg-white/10 rounded-xl"
                    >
                        <Text className="text-white/80 text-xs font-bold">-5</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        onPress={() => adjustSensitivity(-1)}
                        className="w-12 h-12 items-center justify-center bg-white/10 rounded-xl"
                    >
                        <Text className="text-white/80 text-xs font-bold">-1</Text>
                    </TouchableOpacity>

                    <View className="items-center px-4">
                        <TextInput
                            className="w-20 h-14 bg-white/10 rounded-xl text-white text-center font-bold text-xl"
                            keyboardType="decimal-pad"
                            value={String(settings.panSeekSensitivity)}
                            onChangeText={(val) => {
                                const parsed = parseFloat(val);
                                if (!isNaN(parsed)) updateSettings({ panSeekSensitivity: Math.max(1, Math.min(60, parsed)) });
                            }}
                        />
                        <Text className="text-secondary text-[10px] font-bold mt-1 uppercase">S/CM</Text>
                    </View>

                    <TouchableOpacity
                        onPress={() => adjustSensitivity(1)}
                        className="w-12 h-12 items-center justify-center bg-white/10 rounded-xl"
                    >
                        <Text className="text-white/80 text-xs font-bold">+1</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        onPress={() => adjustSensitivity(5)}
                        className="w-12 h-12 items-center justify-center bg-white/10 rounded-xl"
                    >
                        <Text className="text-white/80 text-xs font-bold">+5</Text>
                    </TouchableOpacity>
                </View>
            </View>
        </View>
    );
}

export default function TestGestureScreen() {
    return (
        <View className="flex-1 bg-background">
            <ThemedKeyboardAvoidingView style={{ backgroundColor: "black" }}>
                <PlayerProvider>
                    <GestureTestContent />
                </PlayerProvider>
            </ThemedKeyboardAvoidingView>
        </View>
    );
}
