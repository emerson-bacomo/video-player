import {
    BottomSheetBackdrop,
    BottomSheetBackdropProps,
    BottomSheetModalProps,
    BottomSheetView,
    BottomSheetModal as GBottomSheetModal,
} from "@gorhom/bottom-sheet";
import { cssInterop } from "nativewind";
import React, { useCallback } from "react";
import { useWindowDimensions, View } from "react-native";

// 1. Define the interface for our new interop props
interface StyledBottomSheetModalProps extends BottomSheetModalProps {
    backgroundClassName?: string;
    handleIndicatorClassName?: string;
}

// 2. Create a typed version of the component that includes the interop props
const BottomSheetModal = GBottomSheetModal as React.ForwardRefExoticComponent<
    StyledBottomSheetModalProps & React.RefAttributes<GBottomSheetModal>
>;

// 3. Enable Tailwind classes for BottomSheetModal's inner styles at runtime
cssInterop(BottomSheetModal, {
    backgroundClassName: "backgroundStyle",
    handleIndicatorClassName: "handleIndicatorStyle",
});

interface ThemedBottomSheetProps {
    isVisible: boolean;
    children?: React.ReactNode;
    onClose: () => void;
}

export const ThemedBottomSheet = ({ isVisible, children, onClose }: ThemedBottomSheetProps) => {
    const { height: screenHeight } = useWindowDimensions();
    const bottomSheetModalRef = React.useRef<GBottomSheetModal>(null);

    React.useEffect(() => {
        if (isVisible) {
            bottomSheetModalRef.current?.present();
        } else {
            bottomSheetModalRef.current?.dismiss();
        }
    }, [isVisible]);

    const renderBackdrop = useCallback(
        (props: BottomSheetBackdropProps) => (
            <BottomSheetBackdrop {...props} disappearsOnIndex={-1} appearsOnIndex={0} opacity={0.7} />
        ),
        [],
    );

    const snapPoints = React.useMemo(() => ["80%"], []);

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
            <BottomSheetView>{children}</BottomSheetView>
        </BottomSheetModal>
    );
};
