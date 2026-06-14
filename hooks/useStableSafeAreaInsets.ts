import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useWindowDimensions } from "react-native";
import { useEffect, useRef, useState } from "react";

export const useStableSafeAreaInsets = (isLandscapeOverride?: boolean) => {
    const rawInsets = useSafeAreaInsets();
    const { width, height } = useWindowDimensions();
    const [insets, setInsets] = useState(rawInsets);
    const cache = useRef({ portrait: rawInsets, landscape: rawInsets });

    const isLandscape = isLandscapeOverride ?? width > height;

    useEffect(() => {
        if (isLandscape) {
            cache.current.landscape = rawInsets;
        } else {
            cache.current.portrait = rawInsets;
        }
    }, [rawInsets, isLandscape]);

    useEffect(() => {
        setInsets(isLandscape ? cache.current.landscape : cache.current.portrait);
    }, [isLandscape, rawInsets]);

    return insets;
};
