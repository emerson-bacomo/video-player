import { useCallback } from "react";
import { useMediaStore } from "@/hooks/MediaStoreBridge/MediaStoreProvider";

export function useMediaStoreLoadData() {
    const store = useMediaStore();
    const loadDataFromDB = useCallback(async () => {
        await store.loadFromDb();
    }, [store]);
    return { loadDataFromDB };
}
