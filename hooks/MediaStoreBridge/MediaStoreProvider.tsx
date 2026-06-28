import React, { createContext, useContext } from "react";
import type { ReactNode } from "react";
import { MediaStore } from "@/hooks/MediaStore";

const MediaStoreContext = createContext<MediaStore>(null!);

interface MediaStoreProviderProps {
    store: MediaStore;
    children: ReactNode;
}

export function MediaStoreProvider({ store, children }: MediaStoreProviderProps) {
    return <MediaStoreContext.Provider value={store}>{children}</MediaStoreContext.Provider>;
}

export function useMediaStore(): MediaStore {
    return useContext(MediaStoreContext);
}
