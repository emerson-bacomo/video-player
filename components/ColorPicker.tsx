import { useTheme } from "@/context/ThemeContext";
import { LinearGradient } from "expo-linear-gradient";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Dimensions, StyleSheet, Text, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { runOnJS, useAnimatedStyle, useSharedValue } from "react-native-reanimated";

const { width } = Dimensions.get("window");
const PICKER_SIZE = width - 80;
const HUE_HEIGHT = 20;

interface HSVColor {
    h: number;
    s: number;
    v: number;
}

const hsvToRgb = (h: number, s: number, v: number) => {
    let r;
    let g;
    let b;
    const i = Math.floor(h * 6);
    const f = h * 6 - i;
    const p = v * (1 - s);
    const q = v * (1 - f * s);
    const t = v * (1 - (1 - f) * s);
    switch (i % 6) {
        case 0:
            r = v;
            g = t;
            b = p;
            break;
        case 1:
            r = q;
            g = v;
            b = p;
            break;
        case 2:
            r = p;
            g = v;
            b = t;
            break;
        case 3:
            r = p;
            g = q;
            b = v;
            break;
        case 4:
            r = t;
            g = p;
            b = v;
            break;
        default:
            r = v;
            g = p;
            b = q;
            break;
    }
    return {
        r: Math.round(r * 255),
        g: Math.round(g * 255),
        b: Math.round(b * 255),
    };
};

const rgbToHex = (r: number, g: number, b: number) =>
    `#${[r, g, b]
        .map((value) => {
            const hex = value.toString(16);
            return hex.length === 1 ? `0${hex}` : hex;
        })
        .join("")}`;

const hexToRgb = (hex: string) => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result
        ? {
              r: parseInt(result[1], 16),
              g: parseInt(result[2], 16),
              b: parseInt(result[3], 16),
          }
        : { r: 0, g: 0, b: 0 };
};

const rgbToHsv = (r: number, g: number, b: number) => {
    const nr = r / 255;
    const ng = g / 255;
    const nb = b / 255;
    const max = Math.max(nr, ng, nb);
    const min = Math.min(nr, ng, nb);
    const delta = max - min;
    let h = 0;
    const s = max === 0 ? 0 : delta / max;
    const v = max;

    if (delta !== 0) {
        switch (max) {
            case nr:
                h = (ng - nb) / delta + (ng < nb ? 6 : 0);
                break;
            case ng:
                h = (nb - nr) / delta + 2;
                break;
            default:
                h = (nr - ng) / delta + 4;
                break;
        }
        h /= 6;
    }

    return { h, s, v };
};

export const ColorPicker = ({ initialColor, onColorChange }: { initialColor: string; onColorChange: (color: string) => void }) => {
    const { theme } = useTheme();
    const hsvRef = useRef<HSVColor>({ h: 0, s: 1, v: 1 });
    const [displayHex, setDisplayHex] = useState(initialColor.toUpperCase());
    const [currentHueColor, setCurrentHueColor] = useState("#ff0000");

    const hX = useSharedValue(0);
    const svX = useSharedValue(0);
    const svY = useSharedValue(0);

    const syncVisuals = useCallback((nextHsv: HSVColor, nextHex: string) => {
        hsvRef.current = nextHsv;
        setDisplayHex(nextHex.toUpperCase());
        const hueRgb = hsvToRgb(nextHsv.h, 1, 1);
        setCurrentHueColor(rgbToHex(hueRgb.r, hueRgb.g, hueRgb.b));
    }, []);

    useEffect(() => {
        const rgb = hexToRgb(initialColor);
        const nextHsv = rgbToHsv(rgb.r, rgb.g, rgb.b);
        hsvRef.current = nextHsv;
        hX.value = nextHsv.h * PICKER_SIZE;
        svX.value = nextHsv.s * PICKER_SIZE;
        svY.value = (1 - nextHsv.v) * PICKER_SIZE;
        syncVisuals(nextHsv, initialColor);
    }, [hX, initialColor, svX, svY, syncVisuals]);

    const applyHsv = useCallback(
        (nextHsv: HSVColor) => {
            const rgb = hsvToRgb(nextHsv.h, nextHsv.s, nextHsv.v);
            const hex = rgbToHex(rgb.r, rgb.g, rgb.b);
            syncVisuals(nextHsv, hex);
            onColorChange(hex);
        },
        [onColorChange, syncVisuals],
    );

    const hueGesture = Gesture.Pan().onUpdate((event) => {
        const nextX = Math.min(Math.max(event.x, 0), PICKER_SIZE);
        hX.value = nextX;
        const nextHsv = { ...hsvRef.current, h: nextX / PICKER_SIZE };
        runOnJS(applyHsv)(nextHsv);
    });

    const svGesture = Gesture.Pan().onUpdate((event) => {
        const nextX = Math.min(Math.max(event.x, 0), PICKER_SIZE);
        const nextY = Math.min(Math.max(event.y, 0), PICKER_SIZE);
        svX.value = nextX;
        svY.value = nextY;
        const nextHsv = {
            ...hsvRef.current,
            s: nextX / PICKER_SIZE,
            v: 1 - nextY / PICKER_SIZE,
        };
        runOnJS(applyHsv)(nextHsv);
    });

    const hueIndicatorStyle = useAnimatedStyle(() => ({
        transform: [{ translateX: hX.value - 10 }],
    }));

    const svIndicatorStyle = useAnimatedStyle(() => ({
        transform: [{ translateX: svX.value - 10 }, { translateY: svY.value - 10 }],
    }));

    return (
        <View style={[styles.container, { backgroundColor: theme.card }]}>
            <GestureDetector gesture={svGesture}>
                <View style={[styles.svArea, { backgroundColor: currentHueColor }]}>
                    <LinearGradient
                        colors={["rgba(255,255,255,1)", "rgba(255,255,255,0)"]}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0 }}
                        style={StyleSheet.absoluteFill}
                    />
                    <LinearGradient
                        colors={["rgba(0,0,0,0)", "rgba(0,0,0,1)"]}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 0, y: 1 }}
                        style={StyleSheet.absoluteFill}
                    />
                    <Animated.View style={[styles.svIndicator, svIndicatorStyle]} />
                </View>
            </GestureDetector>

            <GestureDetector gesture={hueGesture}>
                <View style={styles.hueArea}>
                    <LinearGradient
                        colors={["#ff0000", "#ffff00", "#00ff00", "#00ffff", "#0000ff", "#ff00ff", "#ff0000"]}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0 }}
                        style={styles.hueGradient}
                    />
                    <Animated.View style={[styles.hueIndicator, hueIndicatorStyle]} />
                </View>
            </GestureDetector>

            <Text style={[styles.hexText, { color: theme.text }]}>{displayHex}</Text>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        alignItems: "center",
        gap: 20,
        padding: 20,
        borderRadius: 20,
    },
    svArea: {
        width: PICKER_SIZE,
        height: PICKER_SIZE,
        borderRadius: 8,
        overflow: "hidden",
    },
    svIndicator: {
        width: 20,
        height: 20,
        borderRadius: 10,
        borderWidth: 2,
        borderColor: "white",
        position: "absolute",
    },
    hueArea: {
        width: PICKER_SIZE,
        height: HUE_HEIGHT,
        borderRadius: 10,
        overflow: "visible",
        justifyContent: "center",
    },
    hueGradient: {
        width: "100%",
        height: "100%",
        borderRadius: 10,
    },
    hueIndicator: {
        width: 20,
        height: 20,
        borderRadius: 10,
        borderWidth: 2,
        borderColor: "white",
        position: "absolute",
        backgroundColor: "transparent",
    },
    hexText: {
        fontSize: 18,
        fontFamily: "monospace",
        fontWeight: "bold",
    },
});
