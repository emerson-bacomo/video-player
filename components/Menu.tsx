import { cn } from "@/utils/cn";
import React, { createContext, useContext, useLayoutEffect, useRef, useState } from "react";
import {
    Dimensions,
    DimensionValue,
    FlatList,
    FlatListProps,
    GestureResponderEvent,
    TouchableOpacity,
    TouchableOpacityProps,
    TouchableWithoutFeedback,
    View,
} from "react-native";
import Modal from "react-native-modal";
import { useSafeAreaInsets } from "react-native-safe-area-context";

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
    closeMenu: () => void;
    onClose?: () => void;
    shouldRender: boolean;
}

const MenuContext = createContext<MenuContextType | null>(null);

const MENU_OFFSET = 16;
const ARROW_HEIGHT = 10;
const ARROW_WIDTH = 16;

export const Menu = ({
    children,
    variant = "POPUP",
    anchorHorizontal,
    horizontalScreenFill = false,
    maxWidth = 400,
    visible: controlledVisible,
    onClose,
}: {
    children: React.ReactNode;
    variant?: MenuVariant;
    anchorHorizontal?: "left" | "right" | "center";
    horizontalScreenFill?: boolean;
    maxWidth?: DimensionValue | "fit-content";
    visible?: boolean;
    onClose?: () => void;
}) => {
    const [internalVisible, setInternalVisible] = useState(false);
    const [shouldRender, setShouldRender] = useState(false);
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
    const visible = controlledVisible ?? internalVisible;

    // Synchronize shouldRender with visible
    useLayoutEffect(() => {
        if (visible) {
            setShouldRender(true);
        }
    }, [visible]);

    const setVisible = (nextVisible: boolean) => {
        if (controlledVisible === undefined) {
            setInternalVisible(nextVisible);
        }
    };

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
            updateLayout();
        }
    }, [visible, children]);

    const triggerElement = React.Children.toArray(children).find(
        (child) => React.isValidElement(child) && child.type === Trigger,
    ) as React.ReactElement<TouchableOpacityProps> | null;

    const handleModalHide = () => {
        setShouldRender(false);
        if (!visible) {
            onClose?.();
        }
    };

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
                closeMenu: () => setVisible(false),
                onClose: handleModalHide,
                shouldRender,
            }}
        >
            <View>{children}</View>
        </MenuContext.Provider>
    );
};

const Trigger = ({ children, ...props }: TouchableOpacityProps) => {
    const context = useContext(MenuContext);
    if (!context) throw new Error("Trigger must be used within Menu");

    const open = () => {
        context.updateLayout?.();
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

const Item = ({ children, onPress, ...props }: TouchableOpacityProps) => {
    const context = useContext(MenuContext);
    if (!context) throw new Error("Item must be used within Menu");

    return (
        <TouchableOpacity
            {...props}
            onPress={(e) => {
                onPress?.(e);
                context.closeMenu();
            }}
        >
            {children}
        </TouchableOpacity>
    );
};

const BOTTOM_PADDING = 16;

const Content = ({ children, className }: { children: React.ReactNode; className?: string }) => {
    const context = useContext(MenuContext);
    if (!context) throw new Error("Content must be used within Menu");

    const {
        visible,
        setVisible,
        menuLayout,
        variant,
        anchorHorizontal,
        horizontalScreenFill,
        maxWidth,
        triggerElement,
        onClose,
        shouldRender,
    } = context;

    const insets = useSafeAreaInsets();
    const { width: screenWidth, height: screenHeight } = Dimensions.get("window");

    // Height available between where the menu spawns and the bottom of the safe area
    const popupMaxHeight = Math.max(80, screenHeight - menuLayout.top - insets.bottom - BOTTOM_PADDING);
    const finalAnchor = anchorHorizontal || menuLayout.autoAnchor;

    if (!shouldRender) return null;

    return (
        <Modal
            isVisible={visible}
            hasBackdrop={false}
            onBackButtonPress={() => setVisible(false)}
            onModalHide={onClose}
            animationIn="fadeIn"
            animationOut="fadeOut"
            animationInTiming={100}
            animationOutTiming={100}
            useNativeDriver={true}
            style={{ margin: 0 }}
        >
            <View className="flex-1">
                {/* Manual Backdrop */}
                <TouchableWithoutFeedback onPress={() => setVisible(false)}>
                    <View className="absolute inset-0 bg-black/60" />
                </TouchableWithoutFeedback>

                {variant === "POPUP" && (
                    <>
                        <View
                            style={{
                                position: "absolute",
                                top: menuLayout.triggerY,
                                left: menuLayout.triggerX,
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
                        </View>

                        {/* Positioned Content */}
                        <View
                            pointerEvents="none"
                            style={{
                                position: "absolute",
                                top: menuLayout.top - ARROW_WIDTH / 2 + 1,
                                left: menuLayout.triggerX + menuLayout.triggerWidth / 2 - ARROW_WIDTH / 2,
                                zIndex: 55,
                            }}
                        >
                            <View
                                className="bg-menu border-t border-l border-border"
                                style={{
                                    width: ARROW_WIDTH,
                                    height: ARROW_WIDTH,
                                    transform: [{ rotate: "45deg" }],
                                }}
                            />
                        </View>

                        <View
                            style={{
                                position: "absolute",
                                top: menuLayout.top,
                                ...(horizontalScreenFill
                                    ? { left: 16, right: 16 }
                                    : finalAnchor === "left"
                                      ? { left: Math.max(16, menuLayout.triggerX) }
                                      : finalAnchor === "right"
                                        ? {
                                              right: Math.max(16, screenWidth - (menuLayout.triggerX + menuLayout.triggerWidth)),
                                          }
                                        : { left: 16, right: 16 }),
                                alignSelf:
                                    finalAnchor === "right" ? "flex-end" : finalAnchor === "center" ? "center" : "flex-start",
                            }}
                        >
                            <View
                                className={cn("rounded-2xl shadow-2xl border bg-menu border-border", className)}
                                style={{
                                    maxWidth: maxWidth === "fit-content" ? undefined : maxWidth,
                                    maxHeight: popupMaxHeight,
                                }}
                            >
                                <View className="rounded-2xl overflow-hidden" style={{ maxHeight: popupMaxHeight }}>
                                    {children}
                                </View>
                            </View>
                        </View>
                    </>
                )}

                {variant === "MODAL" && (
                    <View className="flex-1 justify-center items-center px-6">
                        <View
                            onStartShouldSetResponder={() => true}
                            className={cn(
                                "rounded-2xl shadow-2xl overflow-hidden w-full max-w-sm border bg-menu border-border",
                                className,
                            )}
                        >
                            {children}
                        </View>
                    </View>
                )}
            </View>
        </Modal>
    );
};

const Header = ({ children, className }: { children: React.ReactNode; className?: string }) => {
    return (
        <View className={cn("flex-row items-center justify-between px-5 h-14 border-b border-border", className)}>
            {children}
        </View>
    );
};

const List = <T,>({ className, ...props }: FlatListProps<T>) => {
    return (
        <FlatList
            className={cn("flex-grow-0", className)}
            showsVerticalScrollIndicator={true}
            contentContainerStyle={[{ paddingBottom: 12 }, props.contentContainerStyle]}
            {...props}
        />
    );
};

Menu.Trigger = Trigger;
Menu.Item = Item;
Menu.Content = Content;
Menu.Header = Header;
Menu.List = List;
