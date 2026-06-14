import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { TouchableWithoutFeedback, View, ViewStyle } from "react-native";
import { Portal } from "react-native-portalize";
import Animated, { useAnimatedStyle, useSharedValue, withTiming, Easing } from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";

export interface ModalRef {
    show: () => void;
    hide: () => void;
    showDuration: number;
    hideDuration: number;
}

interface ModalProps {
    /** Controlled visibility. Omit to let the modal manage its own visibility internally. */
    visible?: boolean;
    /** Called after the exit animation completes. */
    onClose?: () => void;
    /**
     * Called when the backdrop is pressed (controlled modals only).
     * Use this to set your `visible` state to false, keeping onClose as
     * a post-animation-only signal. Falls back to onClose if not provided.
     */
    onRequestClose?: () => void;
    closeOnBackdropPress?: boolean;
    /** "none" animates only the backdrop; children handle their own animation. */
    animationType?: "fade" | "scale" | "slide" | "none";
    backdropOpacity?: number;
    children?: React.ReactNode;
    style?: ViewStyle;
    /** When true (default), content is centered. When false, content fills absolute space. */
    center?: boolean;
    /** Duration of the show animation in milliseconds. Default: 100 */
    showDuration?: number;
    /** Duration of the hide animation in milliseconds. Default: 80 */
    hideDuration?: number;
}

export const Modal = forwardRef<ModalRef, ModalProps>(
    (
        {
            visible: controlledVisible,
            onClose,
            onRequestClose,
            closeOnBackdropPress = true,
            animationType = "scale",
            backdropOpacity = 0.8,
            children,
            style,
            center = true,
            showDuration = 100,
            hideDuration = 80,
        },
        ref,
    ) => {
        const isControlled = controlledVisible !== undefined;

        const [internalVisible, setInternalVisible] = useState(false);
        const visible = isControlled ? controlledVisible! : internalVisible;

        const [shouldRender, setShouldRender] = useState(visible);

        // Tracks the visibility state from the previous render.
        // We use this to ensure the exit animation and onClose callback only fire
        // when the modal is actually transitioning from open to closed,
        // preventing them from erroneously firing when the modal mounts in a closed state.
        const prevVisible = useRef(visible);

        const onCloseRef = useRef(onClose);
        onCloseRef.current = onClose;

        const backdropOpacityVal = useSharedValue(0);
        const opacity = useSharedValue(0);
        const scale = useSharedValue(animationType === "scale" ? 0.96 : 1.0);
        const translateY = useSharedValue(animationType === "scale" ? 8 : animationType === "slide" ? 50 : 0);

        useImperativeHandle(ref, () => ({
            show: () => {
                if (!isControlled) setInternalVisible(true);
            },
            hide: () => {
                if (!isControlled) setInternalVisible(false);
                else if (onRequestClose) onRequestClose();
                else onClose?.();
            },
            showDuration,
            hideDuration,
        }));

        useEffect(() => {
            if (visible) {
                setShouldRender(true);

                backdropOpacityVal.value = withTiming(backdropOpacity, {
                    duration: showDuration,
                    easing: Easing.out(Easing.quad),
                });

                if (animationType !== "none") {
                    opacity.value = withTiming(1, { duration: showDuration, easing: Easing.out(Easing.quad) });
                    if (animationType === "scale") {
                        scale.value = withTiming(1, { duration: showDuration, easing: Easing.out(Easing.quad) });
                        translateY.value = withTiming(0, { duration: showDuration, easing: Easing.out(Easing.quad) });
                    } else if (animationType === "slide") {
                        translateY.value = withTiming(0, { duration: showDuration * 1.5, easing: Easing.out(Easing.quad) });
                    }
                }
            } else {
                if (prevVisible.current) {
                    // The modal was previously visible and is now closing.
                    // Run the hide animation and call onClose when finished.
                    const onAnimationComplete = (finished?: boolean) => {
                        if (finished) {
                            scheduleOnRN(() => {
                                setShouldRender(false);
                                if (onCloseRef.current) onCloseRef.current();
                            });
                        }
                    };

                    backdropOpacityVal.value = withTiming(
                        0,
                        { duration: hideDuration, easing: Easing.in(Easing.quad) },
                        onAnimationComplete,
                    );

                    if (animationType !== "none") {
                        opacity.value = withTiming(0, { duration: hideDuration, easing: Easing.in(Easing.quad) });
                        if (animationType === "scale") {
                            scale.value = withTiming(0.96, { duration: hideDuration, easing: Easing.in(Easing.quad) });
                            translateY.value = withTiming(8, { duration: hideDuration, easing: Easing.in(Easing.quad) });
                        } else if (animationType === "slide") {
                            translateY.value = withTiming(50, { duration: hideDuration * 1.25, easing: Easing.in(Easing.quad) });
                        }
                    }
                } else {
                    // The modal was already closed (e.g. on initial mount).
                    // Skip the hide animation and onClose callback to prevent unexpected side effects.
                    setShouldRender(false);
                }
            }
            prevVisible.current = visible;
        }, [visible, animationType, backdropOpacity, showDuration, hideDuration, backdropOpacityVal, opacity, scale, translateY]);

        const backdropAnimatedStyle = useAnimatedStyle(() => ({
            opacity: backdropOpacityVal.value,
        }));

        const contentAnimatedStyle = useAnimatedStyle(() => {
            if (animationType === "none") return {};

            const transforms: any[] = [];
            if (animationType === "scale") {
                transforms.push({ scale: scale.value });
                transforms.push({ translateY: translateY.value });
            } else if (animationType === "slide") {
                transforms.push({ translateY: translateY.value });
            }

            return {
                opacity: opacity.value,
                transform: transforms,
            };
        });

        const handleBackdropPress = () => {
            if (!closeOnBackdropPress) return;
            if (!isControlled) {
                setInternalVisible(false);
            } else {
                // Prefer onRequestClose so callers can set visible=false and let
                // the exit animation run before onClose fires. Falls back to
                // onClose for backward compatibility.
                if (onRequestClose) onRequestClose();
                else onClose?.();
            }
        };

        if (!shouldRender) return null;

        return (
            <Portal>
                <View className="absolute inset-0" pointerEvents="box-none">
                    {/* Backdrop — must use style (not className) on Reanimated Animated.View */}
                    <TouchableWithoutFeedback onPress={handleBackdropPress}>
                        <Animated.View
                            style={[
                                { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, backgroundColor: "#000" },
                                backdropAnimatedStyle,
                            ]}
                        />
                    </TouchableWithoutFeedback>

                    {/* Content container */}
                    <View className={center ? "flex-1 justify-center items-center" : "absolute inset-0"} pointerEvents="box-none">
                        <Animated.View style={[contentAnimatedStyle, style]} pointerEvents="box-none">
                            {children}
                        </Animated.View>
                    </View>
                </View>
            </Portal>
        );
    },
);

Modal.displayName = "Modal";
