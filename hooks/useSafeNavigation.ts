import { router } from "expo-router";
import { useCallback, useRef } from "react";

/**
 * Hook to prevent rapid multiple navigations (double-taps).
 * Provides a 'safePush' method that includes a 500ms cooldown.
 */
export const useSafeNavigation = () => {
    const navigationLockRef = useRef(false);

    const safePush = useCallback((...args: Parameters<typeof router.push>) => {
        if (navigationLockRef.current) return;
        navigationLockRef.current = true;

        router.push(...args);

        // Release the lock after 500ms
        setTimeout(() => {
            navigationLockRef.current = false;
        }, 500);
    }, []);

    const safeBack = useCallback((...args: Parameters<typeof router.back>) => {
        if (navigationLockRef.current) return;
        navigationLockRef.current = true;

        if (router.canGoBack()) {
            router.back(...args);
        }

        setTimeout(() => {
            navigationLockRef.current = false;
        }, 500);
    }, []);

    return { safePush, safeBack };
};
