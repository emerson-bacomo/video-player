import { PlayerCentralIndicator, PlayerCentralIndicatorProps } from "@/components/PlayerCentralIndicator";
import { PlayerGestureDetector } from "@/components/PlayerGestureDetector";
import { BasePlayerHeader } from "@/components/PlayerHeader";
import { PlayerOrientationButton } from "@/components/PlayerOrientationButton";
import { ThemedKeyboardAvoidingView } from "@/components/ThemedKeyboardAvoidingView";
import { useSettings } from "@/hooks/useSettings";
import React, { useRef, useState } from "react";
import { Text, TextInput, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function TestGestureScreen() {
    const { settings, updateSettings } = useSettings();
    const insets = useSafeAreaInsets();

    // States for Mock Player
    const [currentTime, setCurrentTime] = useState(36000); // Start at 10h to avoid 0 limit
    const [duration] = useState(999999); // Large mock duration
    const [paused, setPaused] = useState(false);
    const [centralIndicator, setCentralIndicator] = useState<PlayerCentralIndicatorProps["indicator"]>(null);
    const [panSeekTime, setPanSeekTime] = useState<number | null>(null);

    // Refs
    const panStartTime = useRef<number>(0);
    const playerRef = useRef<any>({
        seek: () => {
            // Mock seek for testing gestures
        },
    });
    const controlsTimeout = useRef<any>(null);
    const skipTimeout = useRef<any>(null);

    const adjustSensitivity = (delta: number) => {
        const newVal = Math.max(1, Math.min(60, settings.panSeekSensitivity + delta));
        updateSettings({ panSeekSensitivity: newVal });
    };

    return (
        <View className="flex-1 bg-background">
            <ThemedKeyboardAvoidingView style={{ backgroundColor: "black" }}>
                <View style={{ flex: 1, paddingTop: insets.top, backgroundColor: "black" }}>
                    <BasePlayerHeader rightSection={<PlayerOrientationButton />}>
                        <Text className="text-white font-bold">Gesture Calibration</Text>
                    </BasePlayerHeader>

                    <PlayerGestureDetector
                        showControls={true}
                        setShowControls={() => {}}
                        currentTime={currentTime}
                        setCurrentTime={setCurrentTime}
                        duration={duration}
                        paused={paused}
                        setPaused={setPaused}
                        setPlaybackRate={() => {}}
                        setCentralIndicator={setCentralIndicator}
                        setPanSeekTime={setPanSeekTime}
                        resetControlsTimer={() => {}}
                        playerRef={playerRef}
                        controlsTimeout={controlsTimeout}
                        skipTimeout={skipTimeout}
                        panStartTime={panStartTime}
                    >
                        <View className="flex-1 items-center justify-center">
                            <View className="p-8 border border-white/10 rounded-3xl bg-white/5 items-center">
                                <Text className="text-secondary text-sm mb-4 uppercase font-bold tracking-widest">
                                    Pan here to test sensitivity
                                </Text>
                                <Text className="text-primary font-bold text-lg text-center">Sensitivity Test Area</Text>
                                <Text className="text-secondary font-bold mt-2 text-xs">
                                    Base Time: {new Date(currentTime * 1000).toISOString().substr(11, 8)}
                                </Text>
                            </View>

                            <PlayerCentralIndicator
                                indicator={centralIndicator}
                                panSeekTime={panSeekTime}
                                panStartTime={panStartTime.current}
                            />
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
                                        if (!isNaN(parsed))
                                            updateSettings({ panSeekSensitivity: Math.max(1, Math.min(60, parsed)) });
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
            </ThemedKeyboardAvoidingView>
        </View>
    );
}
