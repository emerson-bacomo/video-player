import {
    BottomSheetBackdrop,
    BottomSheetBackdropProps,
    BottomSheetModalProps,
    BottomSheetModal as GBottomSheetModal,
    BottomSheetScrollView as GBottomSheetScrollView,
} from "@gorhom/bottom-sheet";
import { cssInterop } from "nativewind";
import React, { useCallback, useEffect, useMemo, useRef } from "react";
import type { ForwardRefExoticComponent, RefAttributes, ReactNode } from "react";
import { BackHandler, useWindowDimensions } from "react-native";

// 1. Define the interface for our new interop props
interface StyledBottomSheetModalProps extends BottomSheetModalProps {
    backgroundClassName?: string;
    handleIndicatorClassName?: string;
}

// 2. Create a typed version of the component that includes the interop props
const BottomSheetModal = GBottomSheetModal as ForwardRefExoticComponent<
    StyledBottomSheetModalProps & RefAttributes<GBottomSheetModal>
>;

// 3. Enable Tailwind classes for BottomSheetModal's inner styles at runtime
cssInterop(BottomSheetModal, {
    backgroundClassName: "backgroundStyle",
    handleIndicatorClassName: "handleIndicatorStyle",
});

export const ThemedBottomSheetScrollView = GBottomSheetScrollView as any;

cssInterop(ThemedBottomSheetScrollView, {
    className: "style",
    contentContainerClassName: "contentContainerStyle",
});

import { BottomSheetFlatList as GBottomSheetFlatList } from "@gorhom/bottom-sheet";
export const ThemedBottomSheetFlatList = GBottomSheetFlatList as any;

cssInterop(ThemedBottomSheetFlatList, {
    className: "style",
    contentContainerClassName: "contentContainerStyle",
    columnWrapperClassName: "columnWrapperStyle",
});

interface ThemedBottomSheetProps {
    isVisible: boolean;
    children?: ReactNode;
    onClose: () => void;
}

export const ThemedBottomSheet = ({ isVisible, children, onClose }: ThemedBottomSheetProps) => {
    const { height: screenHeight } = useWindowDimensions();
    const bottomSheetModalRef = useRef<GBottomSheetModal>(null);

    useEffect(() => {
        if (isVisible) {
            bottomSheetModalRef.current?.present();
        } else {
            bottomSheetModalRef.current?.dismiss();
        }
    }, [isVisible]);

    useEffect(() => {
        const onBackPress = () => {
            if (isVisible) {
                onClose();
                return true;
            }
            return false;
        };

        const subscription = BackHandler.addEventListener("hardwareBackPress", onBackPress);
        return () => subscription.remove();
    }, [isVisible, onClose]);

    const renderBackdrop = useCallback(
        (props: BottomSheetBackdropProps) => (
            <BottomSheetBackdrop {...props} disappearsOnIndex={-1} appearsOnIndex={0} opacity={0.7} />
        ),
        [],
    );

    const snapPoints = useMemo(() => ["80%"], []);

    return (
        <BottomSheetModal
            ref={bottomSheetModalRef}
            snapPoints={snapPoints}
            index={0}
            enableDynamicSizing={true}
            maxDynamicContentSize={screenHeight * 0.8}
            onDismiss={onClose}
            backdropComponent={renderBackdrop}
            backgroundClassName="bg-card"
            handleIndicatorClassName="bg-secondary w-10"
        >
            {children}
        </BottomSheetModal>
    );
};
