import { useCallback, useEffect, useRef, useState } from "react";
import { LoadingTask } from "../components/LoadingStatus";

// Centralized task IDs for tracking specific background work
export const TASK_IDS = {
    MEDIA_SYNC: "media-sync",
    THUMBNAIL_GEN: "thumbnail-gen",
    CACHE_CLEAR: "cache-clear",
    LIBRARY_RESET: "library-reset",
    LIBRARY_LOAD: "library-load",
} as const;

export const useMediaLoadingTask = (initialTask: LoadingTask | null = null) => {
    const [loadingTask, setLoadingTaskInternal] = useState<LoadingTask | null>(initialTask);
    const [isLoadingPopupVisible, setIsLoadingPopupVisible] = useState(false);
    const [isLoadingExpanded, setIsLoadingExpanded] = useState(false);

    const onBeforeSetRef = useRef<((task: LoadingTask) => boolean | void) | null>(null);

    const setOnBeforeSet = useCallback((fn: ((task: LoadingTask) => boolean | void) | null) => {
        onBeforeSetRef.current = fn;
    }, []);

    const setLoadingTask = useCallback(
        (taskOrFn: LoadingTask | null | ((prev: LoadingTask | null) => LoadingTask | null)) => {
            setLoadingTaskInternal((prev) => {
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
        },
        [],
    );

    const lastTaskIdRef = useRef<string | null>(null);
    const hasAutoTriggeredRef = useRef(false);
    const dismissTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const minimizeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const pendingDismissRef = useRef<(() => void) | null>(null);

    // Auto-dismiss and auto-minimize loading tasks
    useEffect(() => {
        if (dismissTimeoutRef.current) {
            clearTimeout(dismissTimeoutRef.current);
            dismissTimeoutRef.current = null;
        }
        if (minimizeTimeoutRef.current) {
            clearTimeout(minimizeTimeoutRef.current);
            minimizeTimeoutRef.current = null;
        }

        // Store the callback for when this specific task is dismissed
        pendingDismissRef.current = loadingTask?.onDismiss || null;

        if (loadingTask?.dismissAfter) {
            dismissTimeoutRef.current = setTimeout(() => {
                const callback = pendingDismissRef.current;
                console.log("[MediaLoadingTask] Task dismissed, calling onDismiss...");
                setLoadingTask(null);
                dismissTimeoutRef.current = null;
                // Execute callback AFTER state update to ensure UI is ready
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

    // Side-effects for loading task changes: Visibility & Auto-Expansion based on importance
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

        // Auto-expand/show if requested and not yet triggered for this task session
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

    return {
        loadingTask,
        setLoadingTask,
        setOnBeforeSet,
        isLoadingPopupVisible,
        setLoadingPopupVisible: setIsLoadingPopupVisible,
        isLoadingExpanded,
        setLoadingExpanded: setIsLoadingExpanded,
    };
};

