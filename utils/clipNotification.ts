/**
 * clipNotification.ts
 *
 * Manages Android foreground-service notifications for clip export using Notifee.
 *
 * Lifecycle:
 *  - While the app is in the foreground  → no notification shown.
 *  - While the app is backgrounded/screen off → shows a progress notification via a
 *    foreground service so the OS doesn't kill the JS thread.
 *  - When export finishes:
 *      - If user is still away → post a "Clip saved" or "Clip failed" notification.
 *      - If user returned to the app → cancel the notification silently (the in-app
 *        LoadingTask UI already shows the result).
 */

import notifee, { AndroidImportance, AndroidColor } from "@notifee/react-native";
import { AppState, AppStateStatus, Platform } from "react-native";

// ─── constants ─────────────────────────────────────────────────────────────────
const CHANNEL_PROGRESS_ID = "clip_export_progress_v6";
const CHANNEL_RESULT_ID = "clip_export_result_v6";
const NOTIF_PROGRESS_ID = "clip-progress";
const NOTIF_RESULT_ID = "clip-result";

// ─── internal state ────────────────────────────────────────────────────────────
let _channelsCreated = false;
let _appState: AppStateStatus = AppState.currentState;
let _appStateSubscription: ReturnType<typeof AppState.addEventListener> | null = null;

function trackAppState() {
    if (_appStateSubscription) return;
    _appStateSubscription = AppState.addEventListener("change", (next) => {
        _appState = next;
    });
    // Request permission once track starts
    notifee.requestPermission().catch(() => {});
}

// ─── public helpers ─────────────────────────────────────────────────────────────

/** Call once at app startup (or lazily on first export). */
export async function ensureNotifeeChannels() {
    if (_channelsCreated || Platform.OS !== "android") return;
    _channelsCreated = true;
    trackAppState();

    await notifee.createChannel({
        id: CHANNEL_PROGRESS_ID,
        name: "Export Progress",
        importance: AndroidImportance.DEFAULT,
        vibration: false,
    });

    await notifee.createChannel({
        id: CHANNEL_RESULT_ID,
        name: "Clip Export Result",
        importance: AndroidImportance.HIGH,
        vibration: false,
    });
}

/** True when the app is backgrounded or screen is off */
export function isAppBackgrounded() {
    // Check both tracked state and real-time state for maximum reliability
    return _appState !== "active" || AppState.currentState !== "active";
}

/**
 * Start (or update) the foreground-service progress notification.
 * Safe to call repeatedly — it updates an existing notification if already shown.
 *
 * @param label   e.g. "Exporting clip"
 * @param detail  e.g. "Saving to /storage/…"
 * @param progress 0.0–1.0
 * @param subText  Optional small text (e.g. "45% • ETA 00:12")
 */
export async function showProgressNotification(label: string, detail: string, progress: number, subText?: string) {
    if (Platform.OS !== "android") return;
    await ensureNotifeeChannels();

    await notifee.displayNotification({
        id: NOTIF_PROGRESS_ID,
        title: subText ? `${label} (${subText})` : label,
        body: detail,
        android: {
            channelId: CHANNEL_PROGRESS_ID,
            importance: AndroidImportance.DEFAULT, // Always DEFAULT to ensure FGS is fully established instantly
            ongoing: true,
            asForegroundService: true,
            progress: {
                max: 100,
                current: Math.round(progress * 100),
                indeterminate: progress <= 0,
            },
            smallIcon: "ic_notification",
            color: AndroidColor.CYAN,
            pressAction: { id: "default" },
        },
    });
}

/**
 * Cancel the progress notification and stop the foreground service.
 */
export async function cancelProgressNotification() {
    if (Platform.OS !== "android") return;
    try {
        await notifee.stopForegroundService();
    } catch {}
    await notifee.cancelNotification(NOTIF_PROGRESS_ID);
}

/**
 * Post a completion notification (success or failure).
 * Only shown when the user is still away from the app.
 */
export async function showResultNotification(success: boolean, name: string, videoId?: string, albumId?: string) {
    if (Platform.OS !== "android") return;
    await ensureNotifeeChannels();

    if (!isAppBackgrounded()) return; // user is already in app — skip

    const data: { [key: string]: string } = {};
    if (videoId) data.videoId = videoId;
    if (albumId) data.albumId = albumId;

    await notifee.displayNotification({
        id: NOTIF_RESULT_ID,
        title: success ? "Clip Saved" : "Clip Export Failed",
        body: success ? `"${name}" has been saved successfully.` : `Export of "${name}" failed.`,
        data,
        android: {
            channelId: CHANNEL_RESULT_ID,
            importance: AndroidImportance.HIGH,
            pressAction: { id: "default" },
            smallIcon: "ic_notification",
            color: success ? "#4CAF50" : "#F44336",
        },
    });
}

/**
 * Cancel the result notification (call when the user opens the app).
 */
export async function cancelResultNotification() {
    if (Platform.OS !== "android") return;
    await notifee.cancelNotification(NOTIF_RESULT_ID);
}
