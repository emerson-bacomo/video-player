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
    raisedRef: React.RefObject<View>;
    menuLayout: {
        top: number;
        left: number;
        right: number;
        triggerX: number;
        triggerY: number;
        triggerWidth: number;
        triggerHeight: number;
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
    updateLayout: (customTriggerRef?: React.RefObject<View>, customRaisedRef?: React.RefObject<View>) => Promise<void>;
    triggerElement: React.ReactElement<TouchableOpacityProps> | null;
    raisedElement: React.ReactNode | null;
    setRaisedElement: (el: React.ReactNode | null) => void;
    children: React.ReactNode;
    closeMenu: () => void;
    onClose?: () => void;
    shouldRender: boolean;
    contentHeight: number;
    setContentHeight: (h: number) => void;
    activeData: any;
    setActiveData: (data: any) => void;
}

const MenuContext = createContext<MenuContextType | null>(null);

interface RaiseContextType {
    raisedRef: React.RefObject<View>;
    children: React.ReactNode;
}

const RaiseContext = createContext<RaiseContextType | null>(null);

const MENU_OFFSET = 16;
const ARROW_SIZE = 12;

export const Menu = ({
    children,
    variant = "POPUP",
    anchorHorizontal = "center",
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
    });
    const [raisedLayout, setRaisedLayout] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
    const triggerRef = useRef<View>(null);
    const raisedRef = useRef<View>(null);
    const [raisedElement, setRaisedElement] = useState<React.ReactNode | null>(null);
    const [contentHeight, setContentHeight] = useState(0);
    const [activeData, setInternalActiveData] = useState<any>(null);

    const setActiveData = (data: any) => {
        setInternalActiveData(data);
        if (data) {
            // Clear current layout to prevent flash of previous position
            setMenuLayout({ top: -1000, left: -1000, right: 16, triggerX: 0, triggerY: 0, triggerWidth: 0, triggerHeight: 0 });
            setRaisedLayout(null);
        }
    };
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
        if (nextVisible) {
            setShouldRender(true);
        } else {
            setActiveData(null);
        }
    };

    const updateLayout = (customTriggerRef?: React.RefObject<View>, customRaisedRef?: React.RefObject<View>) => {
        return new Promise<void>((resolve) => {
            const activeRaisedRef = customRaisedRef || raisedRef;
            const activeTriggerRef = customTriggerRef || triggerRef;

            // Measure raised element first if it exists
            if (activeRaisedRef.current) {
                activeRaisedRef.current.measure((_x, _y, width, height, pageX, pageY) => {
                    if (pageX !== 0 || pageY !== 0) {
                        setRaisedLayout({ x: pageX, y: pageY, width, height });
                    }
                });
            } else {
                setRaisedLayout(null);
            }

            if (activeTriggerRef.current) {
                activeTriggerRef.current.measure((_x, _y, width, height, pageX, pageY) => {
                    if (pageX !== 0 || pageY !== 0) {
                        setMenuLayout({
                            top: pageY + height + MENU_OFFSET,
                            left: 16,
                            right: 16,
                            triggerX: pageX,
                            triggerY: pageY,
                            triggerWidth: width,
                            triggerHeight: height,
                        });
                    }
                    resolve();
                });
            } else {
                resolve();
            }
        });
    };

    useLayoutEffect(() => {
        if (visible && !activeData) {
            updateLayout();
        }
    }, [visible, children]);

    const triggerElement = React.Children.toArray(children).find(
        (child) => React.isValidElement(child) && child.type === Trigger,
    ) as React.ReactElement<TouchableOpacityProps> | null;

    const handleModalHide = () => {
        setShouldRender(false);
        if (visible) {
            onClose?.();
        }
    };

    return (
        <MenuContext.Provider
            value={{
                visible,
                setVisible,
                triggerRef: triggerRef as React.RefObject<View>,
                raisedRef: raisedRef as React.RefObject<View>,
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
                activeData,
                setActiveData,
            }}
        >
            {children}
        </MenuContext.Provider>
    );
};

const Trigger = ({ children, data, ...props }: TouchableOpacityProps & { data?: any }) => {
    const context = useContext(MenuContext);
    const localRaise = useContext(RaiseContext);
    if (!context) throw new Error("Trigger must be used within Menu");

    const localTriggerRef = useRef<View>(null);

    const open = () => {
        if (data) {
            // Global Mode: provide specific refs and data
            context.setActiveData(data);
            context.updateLayout(localTriggerRef as any, localRaise?.raisedRef as any);
            context.setVisible(true);

            if (localRaise?.children) {
                context.setRaisedElement(localRaise.children);
            }
        } else {
            // Local Mode: pass local ref to updateLayout
            context.updateLayout(localTriggerRef as any);
            context.setVisible(true);
        }
    };

    return (
        <TouchableOpacity
            ref={localTriggerRef as any}
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

const Content = ({
    children,
    className,
}: {
    children: React.ReactNode | ((data: any) => React.ReactNode);
    className?: string;
}) => {
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
        activeData,
    } = context;

    const insets = useSafeAreaInsets();
    const { width: screenWidth, height: screenHeight } = Dimensions.get("window");
    const [contentHeight, setContentHeight] = useState(0);
    const [contentWidth, setContentWidth] = useState(0);

    // Auto-flip: If it would overflow the bottom, show it above the trigger
    const spaceBelow = screenHeight - (menuLayout.triggerY + menuLayout.triggerHeight) - insets.bottom - BOTTOM_PADDING;
    const spaceAbove = menuLayout.triggerY - insets.top - BOTTOM_PADDING;

    // Use a more realistic estimate (350px) if we haven't measured yet to prevent initial misplacement
    const estimatedHeight = contentHeight || 350;
    const vh60 = screenHeight * 0.6;

    // Flip logic:
    // 1. If bottom has > 60% vh, stay there.
    // 2. Otherwise, if top has more space, flip.
    const isAbove = spaceBelow < vh60 && spaceAbove > spaceBelow;

    const availableSpace = isAbove ? spaceAbove : spaceBelow;
    const popupMaxHeight = availableSpace - MENU_OFFSET;

    const finalTop = isAbove
        ? Math.max(
              insets.top + BOTTOM_PADDING,
              menuLayout.triggerY - Math.min(contentHeight || estimatedHeight, popupMaxHeight) - MENU_OFFSET,
          )
        : menuLayout.top;

    if (!shouldRender) return null;

    return (
        <Modal
            isVisible={visible}
            hasBackdrop={false}
            onBackButtonPress={() => setVisible(false)}
            onModalHide={onClose}
            animationIn="fadeIn"
            animationOut="fadeOut"
            animationInTiming={50}
            animationOutTiming={100}
            useNativeDriver={true}
            style={{ margin: 0 }}
        >
            <View className="flex-1">
                {/* Manual Backdrop */}
                <TouchableWithoutFeedback onPress={() => setVisible(false)}>
                    <View className="absolute inset-0 bg-black/80" />
                </TouchableWithoutFeedback>

                {variant === "POPUP" && (
                    <>
                        {/* Duplication Layer: Duplicates either the 'Raise' card or the 'Trigger' button above the backdrop */}
                        {raisedElement && raisedLayout ? (
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
                        ) : (
                            <View
                                pointerEvents="none"
                                style={{
                                    position: "absolute",
                                    top: menuLayout.triggerY,
                                    left: menuLayout.triggerX,
                                }}
                            >
                                {triggerElement && (
                                    <TouchableOpacity
                                        activeOpacity={triggerElement.props.activeOpacity}
                                        className={triggerElement.props.className}
                                        style={triggerElement.props.style}
                                    >
                                        {triggerElement.props.children}
                                    </TouchableOpacity>
                                )}
                            </View>
                        )}

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
                                    : anchorHorizontal === "left"
                                      ? { left: Math.max(16, menuLayout.triggerX) }
                                      : anchorHorizontal === "right"
                                        ? {
                                              right: Math.max(16, screenWidth - (menuLayout.triggerX + menuLayout.triggerWidth)),
                                          }
                                        : {
                                              left: Math.max(
                                                  16,
                                                  Math.min(
                                                      menuLayout.triggerX + menuLayout.triggerWidth / 2 - contentWidth / 2,
                                                      screenWidth - 16 - contentWidth,
                                                  ),
                                              ),
                                          }),
                            }}
                        >
                            <View
                                className={cn("rounded-xl shadow-2xl border bg-menu border-border", className)}
                                style={{
                                    maxWidth: maxWidth === "fit-content" ? undefined : maxWidth,
                                    maxHeight: popupMaxHeight,
                                }}
                            >
                                <View
                                    onLayout={(e) => {
                                        const { width, height } = e.nativeEvent.layout;
                                        if (height > 0) setContentHeight(height);
                                        if (width > 0) setContentWidth(width);
                                    }}
                                    className="rounded-2xl overflow-hidden"
                                >
                                    {typeof children === "function"
                                        ? activeData
                                            ? (children as any)(activeData)
                                            : null
                                        : children}
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
    const raisedRef = useRef<View>(null);

    return (
        <RaiseContext.Provider value={{ raisedRef: raisedRef as any, children }}>
            <View ref={raisedRef as any} collapsable={false}>
                {children}
            </View>
        </RaiseContext.Provider>
    );
};

Menu.Trigger = Trigger;
Menu.Raise = Raise;
Menu.Item = Item;
Menu.Content = Content;
Menu.Header = Header;
Menu.List = List;
