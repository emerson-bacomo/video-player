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

export type SetLoadingTask = (
    taskOrFn: LoadingTask | null | ((prev: LoadingTask | null) => LoadingTask | null),
    target?: string | ((id: string | null) => boolean),
) => void;

export type OnBeforeSet = (task: LoadingTask) => boolean | void;

export const useMediaLoadingTask = (initialTask: LoadingTask | null = null) => {
    const [loadingTask, setLoadingTaskInternal] = useState<LoadingTask | null>(initialTask);
    const [isLoadingPopupVisible, setIsLoadingPopupVisible] = useState(false);
    const [isLoadingExpanded, setIsLoadingExpanded] = useState(false);

    const onBeforeSetRef = useRef<OnBeforeSet | null>(null);

    const setOnBeforeSet = useCallback((fn: OnBeforeSet | null) => {
        onBeforeSetRef.current = fn;
    }, []);

    const setLoadingTask: SetLoadingTask = useCallback((taskOrFn, target) => {
        setLoadingTaskInternal((prev) => {
            // If a target (id or filter function) is provided and we are trying to clear/set,
            // verify that the current task matches the target.
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

    // Side-effects for loading task changes: Dismiss/Minimize timers
    useEffect(() => {
        if (dismissTimeoutRef.current) clearTimeout(dismissTimeoutRef.current);
        if (minimizeTimeoutRef.current) clearTimeout(minimizeTimeoutRef.current);

        // Store the callback for when this specific task is dismissed
        pendingDismissRef.current = loadingTask?.onDismiss || null;

        if (loadingTask?.dismissAfter) {
            dismissTimeoutRef.current = setTimeout(() => {
                const callback = pendingDismissRef.current;
                const taskIdToDismiss = loadingTask?.id;
                console.log("[MediaLoadingTask] Task dismissed, calling onDismiss...");
                setLoadingTask(null, taskIdToDismiss);
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

    const lastTaskIdRef = useRef<string | null>(null);
    const hasAutoTriggeredRef = useRef(false);

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
