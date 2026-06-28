import { useSyncExternalStore } from "react";
import { useMediaStore } from "@/hooks/MediaStoreBridge/MediaStoreProvider";
import type { Video } from "@/hooks/domain/Video";

export function useVideo(id: string | undefined): Video | undefined {
    const store = useMediaStore();
    return useSyncExternalStore(
        (onChange) => {
            if (!id) return () => {};
            return store.subscribe(id, onChange);
        },
        () => (id ? store.getVideo(id) : undefined),
    );
}
