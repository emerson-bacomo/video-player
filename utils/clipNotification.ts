import notifee, { AndroidImportance, AndroidColor } from "@notifee/react-native";
import { AppState, AppStateStatus, Platform } from "react-native";

const CHANNEL_PROGRESS_ID = "clip_export_progress_v6";
const CHANNEL_RESULT_ID = "clip_export_result_v6";
const NOTIF_PROGRESS_ID = "clip-progress";
const NOTIF_RESULT_ID = "clip-result";

let _channelsCreated = false;
let _appState: AppStateStatus = AppState.currentState;
let _appStateSubscription: ReturnType<typeof AppState.addEventListener> | null = null;

function trackAppState() {
    if (_appStateSubscription) return;
    _appStateSubscription = AppState.addEventListener("change", (next) => {
        _appState = next;
    });
    notifee.requestPermission().catch(() => {});
}

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

export function isAppBackgrounded() {
    return _appState !== "active" || AppState.currentState !== "active";
}

export async function showProgressNotification(label: string, detail: string, progress: number, subText?: string) {
    if (Platform.OS !== "android") return;
    await ensureNotifeeChannels();

    await notifee.displayNotification({
        id: NOTIF_PROGRESS_ID,
        title: subText ? `${label} (${subText})` : label,
        body: detail,
        android: {
            channelId: CHANNEL_PROGRESS_ID,
            importance: AndroidImportance.DEFAULT,
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

export async function cancelProgressNotification() {
    if (Platform.OS !== "android") return;
    try {
        await notifee.stopForegroundService();
    } catch {}
    await notifee.cancelNotification(NOTIF_PROGRESS_ID);
}

export async function showResultNotification(success: boolean, name: string, videoId?: string, albumId?: string) {
    if (Platform.OS !== "android") return;
    await ensureNotifeeChannels();

    if (!isAppBackgrounded()) return;

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

export async function cancelResultNotification() {
    if (Platform.OS !== "android") return;
    await notifee.cancelNotification(NOTIF_RESULT_ID);
}
