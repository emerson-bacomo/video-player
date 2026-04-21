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
    raiseRef: React.RefObject<View>;
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
    raisedLayout: {
        x: number;
        y: number;
        width: number;
        height: number;
    } | null;
    variant: MenuVariant;
    anchorHorizontal?: "left" | "right" | "center";
    horizontalScreenFill: boolean;
    maxWidth: DimensionValue | "fit-content";
    updateLayout: () => Promise<void>;
    triggerElement: React.ReactElement<TouchableOpacityProps> | null;
    raisedElement: React.ReactNode | null;
    setRaisedElement: (el: React.ReactNode | null) => void;
    children: React.ReactNode;
    closeMenu: () => void;
    onClose?: () => void;
    shouldRender: boolean;
    contentHeight: number;
    setContentHeight: (h: number) => void;
}

const MenuContext = createContext<MenuContextType | null>(null);

const MENU_OFFSET = 16;
const ARROW_SIZE = 12;

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
    const [raisedLayout, setRaisedLayout] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
    const triggerRef = useRef<View>(null);
    const raiseRef = useRef<View>(null);
    const [raisedElement, setRaisedElement] = useState<React.ReactNode | null>(null);
    const [contentHeight, setContentHeight] = useState(0);
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
            // Measure raised element first if it exists
            if (raiseRef.current) {
                raiseRef.current.measure((_x, _y, width, height, pageX, pageY) => {
                    if (pageX !== 0 || pageY !== 0) {
                        setRaisedLayout({ x: pageX, y: pageY, width, height });
                    }
                });
            } else {
                setRaisedLayout(null);
            }

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
                raiseRef: raiseRef as React.RefObject<View>,
                menuLayout,
                raisedLayout,
                variant,
                anchorHorizontal,
                horizontalScreenFill,
                maxWidth,
                updateLayout,
                triggerElement: triggerElement || null,
                raisedElement,
                setRaisedElement,
                children,
                closeMenu: () => setVisible(false),
                onClose: handleModalHide,
                shouldRender,
                contentHeight,
                setContentHeight,
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
        raisedLayout,
        variant,
        anchorHorizontal,
        horizontalScreenFill,
        maxWidth,
        triggerElement,
        raisedElement,
        onClose,
        shouldRender,
    } = context;

    const insets = useSafeAreaInsets();
    const { width: screenWidth, height: screenHeight } = Dimensions.get("window");
    const [contentHeight, setContentHeight] = useState(0);

    // Auto-flip: If it would overflow the bottom, show it above the trigger
    const spaceBelow = screenHeight - (menuLayout.triggerY + menuLayout.triggerHeight) - insets.bottom - BOTTOM_PADDING;
    const spaceAbove = menuLayout.triggerY - insets.top - BOTTOM_PADDING;

    // We flip if it overflows below AND there is more space above
    const isAbove =
        menuLayout.triggerY + menuLayout.triggerHeight + (contentHeight || 200) + MENU_OFFSET > screenHeight - insets.bottom &&
        spaceAbove > spaceBelow;

    const popupMaxHeight = isAbove ? Math.max(100, spaceAbove - MENU_OFFSET) : Math.max(100, spaceBelow - MENU_OFFSET);

    const finalTop = isAbove
        ? Math.max(insets.top + BOTTOM_PADDING, menuLayout.triggerY - Math.min(contentHeight, popupMaxHeight) - MENU_OFFSET)
        : menuLayout.top;

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
                        {/* Raised Element Duplication */}
                        {raisedElement && raisedLayout && (
                            <View
                                pointerEvents="none"
                                style={{
                                    position: "absolute",
                                    top: raisedLayout.y,
                                    left: raisedLayout.x,
                                    width: raisedLayout.width,
                                    height: raisedLayout.height,
                                }}
                            >
                                {raisedElement}
                            </View>
                        )}

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

                        <View
                            pointerEvents="none"
                            style={{
                                position: "absolute",
                                top: isAbove
                                    ? menuLayout.triggerY - ARROW_SIZE / 2 - MENU_OFFSET - 1
                                    : menuLayout.top - ARROW_SIZE / 2 + 1,
                                left: menuLayout.triggerX + menuLayout.triggerWidth / 2 - ARROW_SIZE / 2,
                                zIndex: 55,
                            }}
                        >
                            <View
                                className={cn("bg-menu border-border", isAbove ? "border-b border-r" : "border-t border-l")}
                                style={{
                                    width: ARROW_SIZE,
                                    height: ARROW_SIZE,
                                    transform: [{ rotate: "45deg" }],
                                }}
                            />
                        </View>

                        <View
                            style={{
                                position: "absolute",
                                top: finalTop,
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
                                onLayout={(e) => {
                                    if (e.nativeEvent.layout.height > 0) {
                                        setContentHeight(e.nativeEvent.layout.height);
                                    }
                                }}
                                className={cn("rounded-xl shadow-2xl border bg-menu border-border", className)}
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

const Raise = ({ children }: { children: React.ReactNode }) => {
    const context = useContext(MenuContext);
    if (!context) throw new Error("Raise must be used within Menu");

    useLayoutEffect(() => {
        context.setRaisedElement(children);
    }, [children]);

    return (
        <View ref={context.raiseRef as any} collapsable={false}>
            {children}
        </View>
    );
};

Menu.Trigger = Trigger;
Menu.Raise = Raise;
Menu.Item = Item;
Menu.Content = Content;
Menu.Header = Header;
Menu.List = List;
