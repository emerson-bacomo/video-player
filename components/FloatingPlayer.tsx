import { LinearGradient } from "expo-linear-gradient";
import { router, usePathname } from "expo-router";
import { ChevronLeft, ChevronRight, Maximize2, Play, RotateCcw, X } from "lucide-react-native";
import React, { useEffect, useRef, useState } from "react";
import { Dimensions, Text, TouchableOpacity, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { toast } from "sonner-native";
import { useFloatingPlayer } from "../context/FloatingPlayerContext";
import { useMedia } from "../hooks/useMedia";
import { cn } from "../utils/cn";
import { CorePlayer } from "./CorePlayer";

const PLAYER_W = 200;
const PLAYER_H = Math.round(PLAYER_W * (9 / 16)); // ≈113
const TAB_W = 32;
const CORNER_INSET = 14;
const TUCK_ZONE = 70; // px from screen edge to trigger tuck
const TAB_BAR_H = 60;

const SPRING = { damping: 80, stiffness: 1000 };

type TuckDir = "left" | "right" | null;

function getNearestCorner(cardCX: number, cardCY: number, screenW: number, screenH: number, safeTop: number, safeBottom: number) {
    const topY = CORNER_INSET + safeTop;
    const botY = screenH - PLAYER_H - CORNER_INSET - safeBottom - TAB_BAR_H;
    const leftX = CORNER_INSET;
    const rightX = screenW - PLAYER_W - CORNER_INSET;

    const corners = [
        { x: leftX, y: topY },
        { x: rightX, y: topY },
        { x: leftX, y: botY },
        { x: rightX, y: botY },
    ];

    let best = corners[3];
    let bestD = Infinity;
    for (const c of corners) {
        const cx = c.x + PLAYER_W / 2;
        const cy = c.y + PLAYER_H / 2;
        const d = Math.hypot(cardCX - cx, cardCY - cy);
        if (d < bestD) {
            bestD = d;
            best = c;
        }
    }
    return best;
}

export const FloatingPlayer: React.FC = () => {
    const { lastPlayed, showFloater, dismissFloater } = useFloatingPlayer();
    const { allAlbumsVideos, getVideoById } = useMedia();
    const insets = useSafeAreaInsets();
    const pathname = usePathname();
    const { width: screenW, height: screenH } = Dimensions.get("window");
    const videoRef = useRef<any>(null);

    // ── Live metadata ──────────────────────────────────────────────────────
    const liveVideo = React.useMemo(() => {
        if (!lastPlayed?.id || !lastPlayed?.albumId) return null;
        const albumVids = allAlbumsVideos[lastPlayed.albumId];
        let video = albumVids?.find((v) => v.id === lastPlayed.id) || null;

        if (!video) {
            video = getVideoById(lastPlayed.id);
        }

        return video;
    }, [lastPlayed?.id, lastPlayed?.albumId, allAlbumsVideos, getVideoById]);

    useEffect(() => {
        if (lastPlayed?.id) {
            // Do not dismiss if allAlbumsVideos is completely empty (still initializing)
            if (Object.keys(allAlbumsVideos).length === 0) return;

            if (!liveVideo) {
                toast.error("Last played video not found.");
                dismissFloater();
            }
        }
    }, [lastPlayed?.id, liveVideo, dismissFloater, allAlbumsVideos]);

    const displayTitle = liveVideo?.title || "Video Player";

    // ── Initial position: bottom-right corner ─────────────────────────────
    const initX = screenW - PLAYER_W - CORNER_INSET;
    const initY = screenH - PLAYER_H - CORNER_INSET - insets.bottom - TAB_BAR_H;

    const posX = useSharedValue(initX);
    const posY = useSharedValue(initY);
    const startX = useRef(initX);
    const startY = useRef(initY);

    const [tuckedDir, setTuckedDir] = useState<TuckDir>(null);
    // JS-side Y for positioning tuck tab (shared value read from JS on drag end)
    const tabYRef = useRef(initY);

    const [isMinPaused, setIsMinPaused] = useState(true);
    const [isMinEnded, setIsMinEnded] = useState(false);
    const [hasLoaded, setHasLoaded] = useState(false);
    const floaterOpacity = useSharedValue(0);

    useEffect(() => {
        floaterOpacity.value = withTiming(hasLoaded ? 1 : 0, { duration: 200 });
    }, [hasLoaded]);

    // Reset load state when video source changes (e.g. from player screen back to home)
    useEffect(() => {
        setHasLoaded(false);
        setIsMinEnded(false);
        floaterOpacity.value = 0;

        // Fail-safe for hot reload/slow ready events
        const timer = setTimeout(() => {
            setHasLoaded(true);
        }, 0);
        return () => clearTimeout(timer);
    }, [lastPlayed?.id]);

    // ── Derived visibility ─────────────────────────────────────────────────
    const [isActuallyOnPlayer, setIsActuallyOnPlayer] = useState(pathname.includes("player"));

    useEffect(() => {
        const onExcludedRoute = pathname.includes("player") || pathname.includes("test-gesture");
        if (onExcludedRoute) {
            setIsActuallyOnPlayer(true);
        } else {
            // Delay setting to false when leaving player to wait for transition
            const timer = setTimeout(() => setIsActuallyOnPlayer(false), 100);
            return () => clearTimeout(timer);
        }
    }, [pathname]);

    const isVisible = !!lastPlayed && !!showFloater && !isActuallyOnPlayer && !!liveVideo;

    // Force a fresh state whenever the video changes or becomes visible
    useEffect(() => {
        if (!isVisible) {
            setHasLoaded(false);
            floaterOpacity.value = 0;
        }
    }, [isVisible, lastPlayed?.id]);

    // ── Gesture ────────────────────────────────────────────────────────────
    const panGesture = Gesture.Pan()
        .activeOffsetX([-6, 6])
        .activeOffsetY([-6, 6])
        .runOnJS(true)
        .onStart(() => {
            startX.current = posX.value;
            startY.current = posY.value;
        })
        .onUpdate((e) => {
            posX.value = startX.current + e.translationX;
            posY.value = startY.current + e.translationY;
        })
        .onEnd(() => {
            const cx = posX.value + PLAYER_W / 2;
            const cy = posY.value + PLAYER_H / 2;
            tabYRef.current = posY.value;

            if (cx < TUCK_ZONE) {
                // Tuck left — slide most of card off-screen
                posX.value = withSpring(-(PLAYER_W - TAB_W), SPRING);
                setTuckedDir("left");
            } else if (cx > screenW - TUCK_ZONE) {
                // Tuck right
                posX.value = withSpring(screenW - TAB_W, SPRING);
                setTuckedDir("right");
            } else {
                const corner = getNearestCorner(cx, cy, screenW, screenH, insets.top, insets.bottom);
                posX.value = withSpring(corner.x, SPRING);
                posY.value = withSpring(corner.y, SPRING);
                setTuckedDir(null);
            }
        });

    const unTuck = () => {
        const cy = posY.value + PLAYER_H / 2;
        const midY = screenH / 2;
        const topY = CORNER_INSET + insets.top;
        const botY = screenH - PLAYER_H - CORNER_INSET - insets.bottom - TAB_BAR_H;

        if (tuckedDir === "left") {
            posX.value = withSpring(CORNER_INSET, SPRING);
            posY.value = withSpring(cy < midY ? topY : botY, SPRING);
        } else {
            posX.value = withSpring(screenW - PLAYER_W - CORNER_INSET, SPRING);
            posY.value = withSpring(cy < midY ? topY : botY, SPRING);
        }
        setTuckedDir(null);
    };

    const animStyle = useAnimatedStyle(() => ({
        transform: [{ translateX: posX.value }, { translateY: posY.value }],
    }));

    // ── Progress ───────────────────────────────────────────────────────────
    const progressPercent =
        (liveVideo?.duration ?? 0) > 0
            ? Math.min(100, Math.max(0, ((liveVideo?.lastPlayedSec ?? 0) / (liveVideo?.duration ?? 1)) * 100))
            : 0;

    // ── Navigate to full player ────────────────────────────────────────────
    const openFullPlayer = () => {
        if (!lastPlayed) return;
        router.push({
            pathname: "/player",
            params: {
                videoId: lastPlayed.id,
                albumId: lastPlayed.albumId,
            },
        });
    };

    if (!isVisible) return null;

    return (
        <View className="absolute inset-0" pointerEvents="box-none">
            <GestureDetector gesture={panGesture}>
                <Animated.View
                    key={lastPlayed.id}
                    style={[
                        {
                            position: "absolute",
                            width: PLAYER_W,
                            height: PLAYER_H,
                            borderRadius: 10,
                            overflow: "hidden",
                            elevation: 10,
                            shadowColor: "#000",
                            shadowOffset: { width: 0, height: 4 },
                            shadowOpacity: 0.4,
                            shadowRadius: 8,
                            backgroundColor: "#111",
                            opacity: floaterOpacity,
                        },
                        animStyle,
                    ]}
                >
                    {tuckedDir === null ? (
                        <>
                            {/* ── Video Player (Fades in over thumbnail) ──────────── */}
                            <Animated.View style={{ flex: 1, opacity: floaterOpacity }}>
                                <CorePlayer
                                    ref={videoRef}
                                    video={liveVideo!}
                                    paused={isMinPaused}
                                    resizeMode="cover"
                                    onReadyForDisplay={() => setHasLoaded(true)}
                                    onEnd={() => setIsMinEnded(true)}
                                    style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
                                    isFloating={true}
                                />
                            </Animated.View>

                            {/* ── Tap Area for Toggle ────────────────────── */}
                            <TouchableOpacity
                                className="absolute inset-0 z-20"
                                activeOpacity={1}
                                onPress={() => {
                                    if (isMinEnded) {
                                        videoRef.current?.seek(0);
                                        setIsMinEnded(false);
                                        setIsMinPaused(false);
                                    } else {
                                        setIsMinPaused((p) => !p);
                                    }
                                }}
                            />

                            {/* ── Overlays (Only on Pause) ────────────────── */}
                            {isMinPaused && (
                                <>
                                    {/* ── Title Label ──────────────────────────────── */}
                                    <LinearGradient
                                        colors={["transparent", "rgba(0,0,0,0.8)"]}
                                        className="absolute bottom-0 left-0 right-0 px-2 pb-1.5 pt-3.5"
                                        pointerEvents="none"
                                    >
                                        <Text className="text-[9px] text-white" numberOfLines={1}>
                                            {displayTitle}
                                        </Text>
                                    </LinearGradient>

                                    {/* ── Header Controls ────────────────────────── */}
                                    <View className="absolute top-0 left-0 right-0 flex-row justify-between p-2 z-30">
                                        <TouchableOpacity
                                            className="w-7 h-7 rounded-full bg-black/40 items-center justify-center border border-white/20"
                                            onPress={dismissFloater}
                                        >
                                            <X size={16} color="white" />
                                        </TouchableOpacity>

                                        <View className="flex-row gap-2">
                                            <TouchableOpacity
                                                className="w-7 h-7 rounded-full bg-black/40 items-center justify-center border border-white/20"
                                                onPress={() => {
                                                    if (isMinEnded) {
                                                        videoRef.current?.seek(0);
                                                        setIsMinEnded(false);
                                                        setIsMinPaused(false);
                                                    } else {
                                                        setIsMinPaused(false);
                                                    }
                                                }}
                                            >
                                                {isMinEnded ? (
                                                    <RotateCcw size={14} color="white" />
                                                ) : (
                                                    <Play size={14} color="white" />
                                                )}
                                            </TouchableOpacity>
                                            <TouchableOpacity
                                                className="w-7 h-7 rounded-full bg-black/40 items-center justify-center border border-white/20"
                                                onPress={openFullPlayer}
                                            >
                                                <Maximize2 size={14} color="white" />
                                            </TouchableOpacity>
                                        </View>
                                    </View>

                                    {/* ── Progress bar ────────────────────────────── */}
                                    <View className="absolute bottom-0 left-0 right-0 h-[2px] bg-white/20 overflow-hidden">
                                        <View className="h-full bg-red-600" style={{ width: `${progressPercent}%` }} />
                                    </View>
                                </>
                            )}
                        </>
                    ) : (
                        /* ── Tuck arrow tab (inside the card bounds) ──────── */
                        <TouchableOpacity
                            className={cn(
                                "absolute top-0 bottom-0 w-[32px] bg-black/80 items-center justify-center border border-white/40",
                                tuckedDir === "left" ? "right-0 rounded-r-xl border-l-0" : "left-0 rounded-l-xl border-r-0",
                            )}
                            onPress={unTuck}
                            activeOpacity={0.8}
                        >
                            {tuckedDir === "left" ? (
                                <ChevronRight size={18} color="white" />
                            ) : (
                                <ChevronLeft size={18} color="white" />
                            )}
                        </TouchableOpacity>
                    )}
                </Animated.View>
            </GestureDetector>
        </View>
    );
};
