import { cn } from "@/utils/cn";
import React, { createContext, useContext, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
    DimensionValue,
    FlatList,
    FlatListProps,
    GestureResponderEvent,
    TouchableOpacity,
    TouchableOpacityProps,
    useWindowDimensions,
    View,
} from "react-native";
import { Modal, ModalRef } from "./Modal";
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
    width: DimensionValue | "fit-content";
    updateLayout: (customTriggerRef?: React.RefObject<View>, customRaisedRef?: React.RefObject<View>) => Promise<void>;
    triggerElement: React.ReactElement<TouchableOpacityProps> | null;
    raisedElement: React.ReactNode | null;
    setRaisedElement: (el: React.ReactNode | null) => void;
    children: React.ReactNode;
    closeMenu: () => void;
    onClose?: () => void;
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
    width = "fit-content",
    visible: controlledVisible,
    onClose,
    onOpen,
}: {
    children: React.ReactNode;
    variant?: MenuVariant;
    anchorHorizontal?: "left" | "right" | "center";
    horizontalScreenFill?: boolean;
    width?: DimensionValue | "fit-content";
    visible?: boolean;
    onClose?: () => void;
    onOpen?: () => void;
}) => {
    const [internalVisible, setInternalVisible] = useState(false);
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
    const [raisedElement, setRaisedElement] = useState<React.ReactNode | null>(null);
    const [activeData, setInternalActiveData] = useState<any>(null);

    const triggerRef = useRef<View>(null);
    const raisedRef = useRef<View>(null);
    const activeRefs = useRef({ trigger: triggerRef, raised: raisedRef });

    const setActiveData = (data: any) => {
        setInternalActiveData(data);
        if (data) {
            // Clear current layout to prevent flash of previous position
            setMenuLayout({ top: -1000, left: -1000, right: 16, triggerX: 0, triggerY: 0, triggerWidth: 0, triggerHeight: 0 });
            setRaisedLayout(null);
        }
    };
    const visible = controlledVisible ?? internalVisible;

    const setVisible = (nextVisible: boolean) => {
        if (controlledVisible === undefined) {
            setInternalVisible(nextVisible);
        }
        if (nextVisible) {
            onOpen?.();
        } else {
            setActiveData(null);
        }
    };

    const updateLayout = (customTriggerRef?: React.RefObject<View>, customRaisedRef?: React.RefObject<View>) => {
        return new Promise<void>((resolve) => {
            if (customTriggerRef) activeRefs.current.trigger = customTriggerRef;
            if (customRaisedRef) activeRefs.current.raised = customRaisedRef;

            const activeRaisedRef = activeRefs.current.raised;
            const activeTriggerRef = activeRefs.current.trigger;

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
        if (visible && !activeData && menuLayout.top === 0) {
            updateLayout();
        }
    }, [visible, children, menuLayout.top, activeData]);

    const triggerElement = React.Children.toArray(children).find(
        (child) => React.isValidElement(child) && child.type === Trigger,
    ) as React.ReactElement<TouchableOpacityProps> | null;

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
                width,
                updateLayout,
                triggerElement: triggerElement || null,
                raisedElement,
                setRaisedElement,
                children,
                closeMenu: () => setVisible(false),
                onClose: onClose,
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

    const open = async () => {
        if (data) {
            // Global Mode: provide specific refs and data
            context.setActiveData(data);
            await context.updateLayout(localTriggerRef as any, localRaise?.raisedRef as any);
            context.setVisible(true);

            if (localRaise?.children) {
                context.setRaisedElement(localRaise.children);
            }
        } else {
            // Local Mode: pass local ref to updateLayout
            await context.updateLayout(localTriggerRef as any);
            context.setVisible(true);
        }
    };

    return (
        <TouchableOpacity
            ref={localTriggerRef as any}
            {...props}
            onLayout={(e) => {
                props.onLayout?.(e);
                if (context.visible) {
                    if (data && context.activeData === data) {
                        context.updateLayout(localTriggerRef as any, localRaise?.raisedRef as any);
                    } else if (!data) {
                        context.updateLayout(localTriggerRef as any, localRaise?.raisedRef as any);
                    }
                }
            }}
            onPress={(e: GestureResponderEvent) => {
                open();
                props.onPress?.(e);
            }}
        >
            {children}
        </TouchableOpacity>
    );
};

const Item = ({ children, onPress, closeOnPress = true, ...props }: TouchableOpacityProps & { closeOnPress?: boolean }) => {
    const context = useContext(MenuContext);
    console.log("[MenuItem] context is null?", context === null, "closeMenu?", context?.closeMenu);

    return (
        <TouchableOpacity
            {...props}
            onPress={(e) => {
                if (closeOnPress && context) {
                    context.closeMenu();
                }
                onPress?.(e);
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
        width,
        triggerElement,
        raisedElement,
        onClose,
        activeData,
    } = context;

    const insets = useSafeAreaInsets();
    const { width: screenWidth, height: screenHeight } = useWindowDimensions();
    const [contentHeight, setContentHeight] = useState(0);
    const [contentWidth, setContentWidth] = useState(0);
    const [layoutReady, setLayoutReady] = useState(false);

    const modalRef = useRef<ModalRef>(null);

    const [fadeIn, setFadeIn] = useState(false);

    useEffect(() => {
        if (visible && layoutReady) {
            setFadeIn(true);
        } else if (!visible) {
            setFadeIn(false);
        }
    }, [visible, layoutReady]);

    // Safety: show after 300ms even if onLayout never fires
    useEffect(() => {
        if (!visible) return;
        const id = setTimeout(() => setLayoutReady(true), 300);
        return () => clearTimeout(id);
    }, [visible]);

    // Auto-flip: If it would overflow the bottom, show it above the trigger
    const spaceBelow = screenHeight - (menuLayout.triggerY + menuLayout.triggerHeight) - insets.bottom - BOTTOM_PADDING;
    const spaceAbove = menuLayout.triggerY - insets.top - BOTTOM_PADDING;

    // Use estimates if we haven't measured yet to prevent initial misplacement
    const estimatedHeight = contentHeight || 350;
    const estimatedWidth = contentWidth || 250;
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

    return (
        <Modal
            ref={modalRef}
            center={false}
            animationType="none"
            visible={visible}
            onClose={onClose}
            onRequestClose={() => setVisible(false)}
        >
            {menuLayout.top > 0 && variant === "POPUP" && (
                <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, opacity: fadeIn ? 1 : 0 }} pointerEvents="box-none">
                    {/* Duplication Layer: Duplicates either the 'Raise' card or the 'Trigger' button above the backdrop */}
                    {raisedElement && raisedLayout ? (
                        <View
                            className="absolute pointer-events-none"
                            style={{
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

                    {/* Arrow — inside the animated wrapper so it fades in/out with the content */}
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

                    {/* Content popup */}
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
                                                  menuLayout.triggerX + menuLayout.triggerWidth / 2 - estimatedWidth / 2,
                                                  screenWidth - 16 - estimatedWidth,
                                              ),
                                          ),
                                      }),
                        }}
                    >
                        <View
                            className={cn("rounded-xl shadow-2xl border bg-menu border-border flex-shrink", className)}
                            style={[
                                {
                                    width: width === "fit-content" ? undefined : width,
                                    maxWidth: screenWidth - 32,
                                    maxHeight: popupMaxHeight,
                                },
                            ]}
                        >
                            <View
                                onLayout={(e) => {
                                    const { width: layoutWidth, height: layoutHeight } = e.nativeEvent.layout;
                                    if (layoutHeight > 0) setContentHeight(layoutHeight);
                                    if (layoutWidth > 0) {
                                        setContentWidth(layoutWidth);
                                        setLayoutReady(true);
                                    }
                                }}
                                className="rounded-2xl overflow-hidden flex-shrink"
                            >
                                {(() => {
                                    const resolvedChildren =
                                        typeof children === "function"
                                            ? activeData
                                                ? (children as any)(activeData)
                                                : null
                                            : children;

                                    const childrenArray = React.Children.toArray(resolvedChildren);
                                    const items = childrenArray.filter(
                                        (child) => !React.isValidElement(child) || child.type !== EmptyContent,
                                    );
                                    const empty = childrenArray.find(
                                        (child) => React.isValidElement(child) && child.type === EmptyContent,
                                    );

                                    if (items.length > 0) {
                                        return items;
                                    }
                                    return empty || null;
                                })()}
                            </View>
                        </View>
                    </View>
                </View>
            )}
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

const EmptyContent = ({ children }: { children: React.ReactNode }) => {
    return <>{children}</>;
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
Menu.EmptyContent = EmptyContent;
Menu.Header = Header;
Menu.List = List;
