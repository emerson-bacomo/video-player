import { createContext, useContext, useCallback, useEffect, useRef, useState } from "react";
import type { LoadingTask } from "@/components/LoadingStatus";
import type { ReactNode } from "react";

export const TASK_IDS = {
    MEDIA_SYNC: "media-sync",
    THUMBNAIL_GEN: "thumbnail-gen",
    CACHE_CLEAR: "cache-clear",
    LIBRARY_RESET: "library-reset",
    LIBRARY_LOAD: "library-load",
} as const;

export type SetLoadingTask = (
    taskOrFn: LoadingTask | null | ((prev: LoadingTask | null) => LoadingTask | null),
    target?: string | ((id: string | null) => boolean),
) => void;

export type OnBeforeSet = (task: LoadingTask) => boolean | void;

export interface LoadingTaskContextType {
    loadingTask: LoadingTask | null;
    setLoadingTask: SetLoadingTask;
    setOnBeforeSet: (fn: OnBeforeSet | null) => void;
    isLoadingPopupVisible: boolean;
    setLoadingPopupVisible: (visible: boolean | ((prev: boolean) => boolean)) => void;
    isLoadingExpanded: boolean;
    setLoadingExpanded: (expanded: boolean | ((prev: boolean) => boolean)) => void;
}

const LoadingTaskContext = createContext<LoadingTaskContextType | null>(null);

export function useLoadingTask(): LoadingTaskContextType {
    const ctx = useContext(LoadingTaskContext);
    if (!ctx) throw new Error("useLoadingTask must be used within a LoadingTaskProvider");
    return ctx;
}

export function LoadingTaskProvider({ children, initialTask = null }: { children: ReactNode; initialTask?: LoadingTask | null }) {
    const [loadingTask, setLoadingTaskInternal] = useState<LoadingTask | null>(initialTask);
    const [isLoadingPopupVisible, setIsLoadingPopupVisible] = useState(false);
    const [isLoadingExpanded, setIsLoadingExpanded] = useState(false);

    const onBeforeSetRef = useRef<OnBeforeSet | null>(null);

    const setOnBeforeSet = useCallback((fn: OnBeforeSet | null) => {
        onBeforeSetRef.current = fn;
    }, []);

    const setLoadingTask: SetLoadingTask = useCallback((taskOrFn, target) => {
        setLoadingTaskInternal((prev) => {
            if (target !== undefined) {
                const currentId = prev?.id ?? null;
                const matches = typeof target === "function" ? target(currentId) : currentId === target;
                if (!matches) return prev;
            }

            let nextTask: LoadingTask | null;
            if (typeof taskOrFn === "function") {
                nextTask = (taskOrFn as (prev: LoadingTask | null) => LoadingTask | null)(prev);
            } else {
                nextTask = taskOrFn;
            }

            if (nextTask && onBeforeSetRef.current) {
                const result = onBeforeSetRef.current(nextTask);
                if (result === false) return prev;
            }

            return nextTask;
        });
    }, []);

    const pendingDismissRef = useRef<(() => void) | null>(null);
    const dismissTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const minimizeTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    useEffect(() => {
        if (dismissTimeoutRef.current) clearTimeout(dismissTimeoutRef.current);
        if (minimizeTimeoutRef.current) clearTimeout(minimizeTimeoutRef.current);

        pendingDismissRef.current = loadingTask?.onDismiss || null;

        if (loadingTask?.dismissAfter) {
            dismissTimeoutRef.current = setTimeout(() => {
                const callback = pendingDismissRef.current;
                const taskIdToDismiss = loadingTask?.id;
                console.log("[LoadingTask] Task dismissed, calling onDismiss...");
                setLoadingTask(null, taskIdToDismiss);
                dismissTimeoutRef.current = null;
                callback?.();
            }, loadingTask.dismissAfter);
        }

        if (loadingTask?.minimizeAfter) {
            minimizeTimeoutRef.current = setTimeout(() => {
                setIsLoadingPopupVisible(false);
                minimizeTimeoutRef.current = null;
            }, loadingTask.minimizeAfter);
        }

        return () => {
            if (dismissTimeoutRef.current) clearTimeout(dismissTimeoutRef.current);
            if (minimizeTimeoutRef.current) clearTimeout(minimizeTimeoutRef.current);
        };
    }, [loadingTask, setLoadingTask]);

    const lastTaskIdRef = useRef<string | null>(null);
    const hasAutoTriggeredRef = useRef(false);

    useEffect(() => {
        if (!loadingTask) {
            lastTaskIdRef.current = null;
            hasAutoTriggeredRef.current = false;
            return;
        }

        const isNewTask = loadingTask.id !== lastTaskIdRef.current;
        if (isNewTask) {
            lastTaskIdRef.current = loadingTask.id ?? null;
            hasAutoTriggeredRef.current = false;
        }

        if (!hasAutoTriggeredRef.current && loadingTask.importance && loadingTask.showPopup !== false) {
            if (loadingTask.importance === "SHOW_POPUP_AND_EXPAND") {
                setIsLoadingExpanded(true);
                setIsLoadingPopupVisible(true);
                hasAutoTriggeredRef.current = true;
            } else if (loadingTask.importance === "SHOW_POPUP") {
                setIsLoadingPopupVisible(true);
                hasAutoTriggeredRef.current = true;
            }
        }
    }, [loadingTask]);

    return (
        <LoadingTaskContext.Provider
            value={{
                loadingTask,
                setLoadingTask,
                setOnBeforeSet,
                isLoadingPopupVisible,
                setLoadingPopupVisible: setIsLoadingPopupVisible,
                isLoadingExpanded,
                setLoadingExpanded: setIsLoadingExpanded,
            }}
        >
            {children}
        </LoadingTaskContext.Provider>
    );
}
