import { cn } from "@/utils/cn";
import React, { createContext, useContext, useLayoutEffect, useRef, useState } from "react";
import {
    Dimensions,
    DimensionValue,
    GestureResponderEvent,
    LayoutChangeEvent,
    Modal,
    TouchableOpacity,
    TouchableOpacityProps,
    TouchableWithoutFeedback,
    View,
} from "react-native";

type MenuVariant = "POPUP" | "MODAL";

interface MenuContextType {
    visible: boolean;
    setVisible: (v: boolean) => void;
    triggerRef: React.RefObject<View>;
    menuLayout: {
        top: number;
        left: number;
        right: number;
        triggerX: number;
        triggerY: number;
        triggerWidth: number;
        triggerHeight: number;
        autoAnchor: "left" | "right" | "center";
    };
    variant: MenuVariant;
    anchorHorizontal?: "left" | "right" | "center";
    horizontalScreenFill: boolean;
    maxWidth: DimensionValue | "fit-content";
    updateLayout: () => Promise<void>;
    triggerElement: React.ReactElement<TouchableOpacityProps> | null;
    children: React.ReactNode;
}

const MenuContext = createContext<MenuContextType | null>(null);

const MENU_OFFSET = 16;
const ARROW_HEIGHT = 10;
const ARROW_WIDTH = 16;
const ARROW_MARGIN = MENU_OFFSET - ARROW_HEIGHT;

export const BaseMenu = ({
    children,
    variant = "POPUP",
    anchorHorizontal,
    horizontalScreenFill = false,
    maxWidth = 400,
}: {
    children: React.ReactNode;
    variant?: MenuVariant;
    anchorHorizontal?: "left" | "right" | "center";
    horizontalScreenFill?: boolean;
    maxWidth?: DimensionValue | "fit-content";
}) => {
    const [visible, setVisible] = useState(false);
    const [menuLayout, setMenuLayout] = useState({
        top: 0,
        left: 16,
        right: 16,
        triggerX: 0,
        triggerY: 0,
        triggerWidth: 0,
        triggerHeight: 0,
        autoAnchor: "center" as "left" | "right" | "center",
    });
    const triggerRef = useRef<View>(null);

    const updateLayout = () => {
        return new Promise<void>((resolve) => {
            triggerRef.current?.measure((_x, _y, width, height, pageX, pageY) => {
                if (pageX !== 0 || pageY !== 0) {
                    const screenWidth = Dimensions.get("window").width;
                    const triggerCenterX = pageX + width / 2;
                    let autoAnchor: "left" | "right" | "center" = "center";

                    if (triggerCenterX > screenWidth * 0.6) autoAnchor = "right";
                    else if (triggerCenterX < screenWidth * 0.4) autoAnchor = "left";

                    setMenuLayout({
                        top: pageY + height + MENU_OFFSET,
                        left: 16,
                        right: 16,
                        triggerX: pageX,
                        triggerY: pageY,
                        triggerWidth: width,
                        triggerHeight: height,
                        autoAnchor,
                    });
                }
                resolve();
            });
        });
    };

    useLayoutEffect(() => {
        if (visible) {
            updateLayout(); // So that the measurements happen before paint and there won't be flicker
        }
    }, [visible, children]);

    const triggerElement = React.Children.toArray(children).find(
        (child) => React.isValidElement(child) && child.type === Trigger,
    ) as React.ReactElement<TouchableOpacityProps> | null;

    return (
        <MenuContext.Provider
            value={{
                visible,
                setVisible,
                triggerRef: triggerRef as React.RefObject<View>,
                menuLayout,
                variant,
                anchorHorizontal,
                horizontalScreenFill,
                maxWidth,
                updateLayout,
                triggerElement: triggerElement || null,
                children,
            }}
        >
            <View>{children}</View>
        </MenuContext.Provider>
    );
};

const Trigger = ({ children, ...props }: TouchableOpacityProps) => {
    const context = useContext(MenuContext);
    if (!context) throw new Error("Trigger must be used within BaseMenu");

    const open = async () => {
        await context.updateLayout?.();
        context.setVisible(true);
    };

    return (
        <TouchableOpacity
            ref={context.triggerRef as any}
            {...props}
            onPress={(e: GestureResponderEvent) => {
                open();
                props.onPress?.(e);
            }}
        >
            {children}
        </TouchableOpacity>
    );
};

const Content = ({ children, className }: { children: React.ReactNode; className?: string }) => {
    const context = useContext(MenuContext);
    if (!context) throw new Error("Content must be used within BaseMenu");

    const { visible, setVisible, menuLayout, variant, anchorHorizontal, horizontalScreenFill, maxWidth, triggerElement } =
        context;

    const screenWidth = Dimensions.get("window").width;
    const finalAnchor = anchorHorizontal || menuLayout.autoAnchor;

    return (
        <Modal visible={visible} transparent animationType="fade" onRequestClose={() => setVisible(false)}>
            <TouchableWithoutFeedback onPress={() => setVisible(false)}>
                <View className="flex-1" style={{ backgroundColor: `rgba(0, 0, 0, 0.6)` }}>
                    {variant === "POPUP" && (
                        <>
                            {/* Duplicated Trigger on top to avoid flicker */}
                            <View
                                style={{
                                    position: "absolute",
                                    top: menuLayout.triggerY,
                                    left: menuLayout.triggerX,
                                    zIndex: 60,
                                }}
                            >
                                <TouchableWithoutFeedback onPress={() => setVisible(false)}>
                                    <View>
                                        {triggerElement && (
                                            <TouchableOpacity
                                                activeOpacity={triggerElement.props.activeOpacity}
                                                className={triggerElement.props.className}
                                                style={triggerElement.props.style}
                                                onPress={() => setVisible(false)}
                                            >
                                                {triggerElement.props.children}
                                            </TouchableOpacity>
                                        )}
                                    </View>
                                </TouchableWithoutFeedback>

                                {/* Arrow */}
                                <View
                                    style={{
                                        width: 0,
                                        height: 0,
                                        backgroundColor: "transparent",
                                        borderStyle: "solid",
                                        borderLeftWidth: ARROW_WIDTH / 2,
                                        borderRightWidth: ARROW_WIDTH / 2,
                                        borderBottomWidth: ARROW_HEIGHT,
                                        borderLeftColor: "transparent",
                                        borderRightColor: "transparent",
                                        borderBottomColor: "#18181b", // Matches bg-zinc-900
                                        marginTop: ARROW_MARGIN,
                                        marginLeft: menuLayout.triggerWidth / 2 - ARROW_WIDTH / 2,
                                    }}
                                />
                            </View>

                            {/* Positioned Content */}
                            <View
                                style={{
                                    position: "absolute",
                                    top: menuLayout.top,
                                    zIndex: 50,
                                    ...(horizontalScreenFill
                                        ? { left: 16, right: 16 }
                                        : finalAnchor === "left"
                                          ? { left: Math.max(16, menuLayout.triggerX) }
                                          : finalAnchor === "right"
                                            ? { right: Math.max(16, screenWidth - (menuLayout.triggerX + menuLayout.triggerWidth)) }
                                            : { left: 16, right: 16 }),
                                    alignSelf: finalAnchor === "right" ? "flex-end" : finalAnchor === "center" ? "center" : "flex-start",
                                }}
                            >
                                <View
                                    className={cn(
                                        "bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden",
                                        className,
                                    )}
                                    style={{ maxWidth: maxWidth === "fit-content" ? undefined : maxWidth }}
                                >
                                    {children}
                                </View>
                            </View>
                        </>
                    )}

                    {variant === "MODAL" && (
                        <View className="flex-1 justify-center items-center px-6">
                            <View
                                onStartShouldSetResponder={() => true}
                                className={cn(
                                    "bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden w-full max-w-sm",
                                    className,
                                )}
                            >
                                {children}
                            </View>
                        </View>
                    )}
                </View>
            </TouchableWithoutFeedback>
        </Modal>
    );
};

BaseMenu.Trigger = Trigger;
BaseMenu.Content = Content;
