import { useTheme } from "@/context/ThemeContext";
import { BottomSheetBackdrop, BottomSheetBackdropProps, BottomSheetModal, BottomSheetView } from "@gorhom/bottom-sheet";
import React, { useCallback } from "react";
import { Dimensions, StyleSheet } from "react-native";

const { height: SCREEN_HEIGHT } = Dimensions.get("window");

interface ThemedBottomSheetProps {
    isVisible: boolean;
    children?: React.ReactNode;
    onClose: () => void;
}

export const ThemedBottomSheet = ({ isVisible, children, onClose }: ThemedBottomSheetProps) => {
    const { theme } = useTheme();
    const bottomSheetModalRef = React.useRef<BottomSheetModal>(null);

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

    return (
        <BottomSheetModal
            ref={bottomSheetModalRef}
            enableDynamicSizing={true}
            maxDynamicContentSize={SCREEN_HEIGHT * 0.8}
            onDismiss={onClose}
            backdropComponent={renderBackdrop}
            backgroundStyle={{ backgroundColor: theme.card }}
            handleIndicatorStyle={{ backgroundColor: theme.secondary, width: 40 }}
        >
            <BottomSheetView style={styles.contentContainer}>{children}</BottomSheetView>
        </BottomSheetModal>
    );
};

const styles = StyleSheet.create({
    contentContainer: {
        paddingBottom: 20,
    },
});
