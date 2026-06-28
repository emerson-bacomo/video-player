import { useMediaStore } from "@/hooks/MediaStoreBridge/MediaStoreProvider";
import { useEffect, useState } from "react";

export function useMediaStoreScreenshots() {
    const store = useMediaStore();
    const [, forceUpdate] = useState(0);

    useEffect(() => {
        return store.subscribe("list:screenshots", () => forceUpdate((n) => n + 1));
    }, [store]);

    return store.getScreenshots();
}
