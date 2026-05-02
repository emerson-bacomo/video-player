import { useState, useCallback, useRef, useEffect } from "react";
import { AppState, AppStateStatus } from "react-native";
import { Directory } from "expo-file-system";
import * as FileSystem from "expo-file-system/legacy";
import { requireNativeModule } from "expo-modules-core";
import ExpoFFmpeg from "@/modules/expo-ffmpeg/src/index";
import { ExportOptions, SessionClip, VideoMedia } from "@/types/useMedia";
import { normalizeClipDestination } from "@/utils/clipDestination";
import {
    ensureNotifeeChannels,
    showProgressNotification,
    cancelProgressNotification,
    showResultNotification,
    cancelResultNotification,
    isAppBackgrounded,
} from "@/utils/clipNotification";
import { savePendingMediaDataDb } from "@/utils/db";

import { secondsToHhmmss } from "@/utils/secondsToHhmmss";

const _ffmpegEmitter = requireNativeModule("ExpoFFmpeg");

import type { MediaContextType } from "./useMedia";
import { useSettings } from "./useSettings";

export interface ExportLabels {
    title: string;
    successTitle: string;
    failTitle: string;
}

export interface ExportQueueItem {
    inputUri: string;
    segments: { start: number; end: number }[];
    options: ExportOptions;
    labels: ExportLabels;
    onSuccess?: (outPathStr: string) => void;
}

export type ExportDependencies = Pick<
    MediaContextType,
    "setLoadingTask" | "fetchAlbums" | "registerSessionClip" | "allAlbumsVideos" | "addPendingClipAssignment"
>;

export function useMediaExport(deps: ExportDependencies) {
    const { settingsRef, updateSettings } = useSettings();

    const [exportQueue, setExportQueue] = useState<ExportQueueItem[]>([]);
    const isExportingRef = useRef(false);
    const queueRef = useRef<ExportQueueItem[]>([]);
    const activeProcessRef = useRef<Promise<void> | null>(null);
    const appStateRef = useRef<AppStateStatus>(AppState.currentState);
    // Track whether a notification was posted so we know to cancel it on return
    const notifPostedRef = useRef(false);
    const latestProgressRef = useRef(0);
    const lastEtaSecRef = useRef<number | null>(null);
    const currentLabelRef = useRef("");
    const currentDetailRef = useRef("");

    const depsRef = useRef(deps);
    useEffect(() => {
        depsRef.current = deps;
    }, [deps]);

    // Init channels once
    useEffect(() => {
        ensureNotifeeChannels();
    }, []);

    // When user returns to the app, cancel any lingering notifications.
    // In-app LoadingTask UI takes over from here, whether export is still running or already done.
    useEffect(() => {
        const sub = AppState.addEventListener("change", (next) => {
            const prev = appStateRef.current;
            appStateRef.current = next;
            if (next === "active" && prev !== "active") {
                cancelResultNotification();
                if (notifPostedRef.current) {
                    cancelProgressNotification();
                    notifPostedRef.current = false;
                }
            }
        });
        return () => sub.remove();
    }, []);

    const performActualExport = async (item: ExportQueueItem, queueInfo: { current: number; total: number }) => {
        const { inputUri, segments, options, labels, onSuccess } = item;
        const { setLoadingTask, fetchAlbums, registerSessionClip, allAlbumsVideos, addPendingClipAssignment } = depsRef.current;
        const clipDestination = settingsRef.current.clipDestination;

        const queuePosPrefix = queueInfo.total === 1 ? "" : `(${queueInfo.current} of ${queueInfo.total}) `;

        const label = `${queuePosPrefix}${labels.title}`;
        const detail = `Initializing export...`;
        currentLabelRef.current = label;
        currentDetailRef.current = detail;

        setLoadingTask({
            id: "clip-export",
            label,
            detail,
            importance: "SHOW_POPUP_AND_EXPAND",
            progress: 0,
        });

        try {
            let resolvedDest = normalizeClipDestination(clipDestination || "");
            if (!resolvedDest) {
                try {
                    const directory = await Directory.pickDirectoryAsync();
                    if (!directory?.uri) {
                        setLoadingTask({
                            label: "Config Error",
                            detail: "Clip destination is not valid, change in settings.",
                            importance: "SHOW_POPUP",
                            dismissAfter: 4000,
                        });

                        return false;
                    }
                    resolvedDest = normalizeClipDestination(directory.uri);
                    if (!resolvedDest) {
                        setLoadingTask({
                            label: "Config Error",
                            detail: "Clip destination is not valid, change in settings.",
                            importance: "SHOW_POPUP",
                            dismissAfter: 4000,
                        });

                        return false;
                    }
                    await updateSettings({ clipDestination: resolvedDest });
                } catch (pickerError) {
                    console.warn("[useMediaExport] Failed to pick clip destination", pickerError);
                    setLoadingTask({
                        label: "Config Error",
                        detail: "Clip destination is not valid, change in settings.",
                        importance: "SHOW_POPUP",
                        dismissAfter: 4000,
                    });
                    return false;
                }
            }

            const destDir = resolvedDest.replace(/\/+$/, "");
            const ext = options.format;
            const sanitizedName = options.name.replace(/[<>:"/\\|?*]/g, "_").trim();
            const outPathStr = `${destDir}/${sanitizedName}.${ext}`;
            const outPathStrDisplay = outPathStr.split("/0/")[1];

            const destInfo = await FileSystem.getInfoAsync(`file://${destDir}`);
            if (!destInfo.exists || !destInfo.isDirectory) {
                setLoadingTask({
                    label: "File Error",
                    detail: "Clip destination is not valid, change in settings.",
                    importance: "SHOW_POPUP",
                    dismissAfter: 4000,
                });
                return false;
            }

            const clipTaskBase = {
                id: "clip-export",
                label: `${queuePosPrefix}${labels.title}`,
                detail: `Saving to ${outPathStrDisplay}`,
                importance: "SHOW_POPUP_AND_EXPAND" as const,
            };

            // Start notification immediately (at DEFAULT importance) while app is active
            // to ensure the foreground service is fully established before backgrounding.
            await showProgressNotification(`${queuePosPrefix}${labels.title}`, `Saving to ${outPathStrDisplay}`, 0);
            notifPostedRef.current = true;
            // Give Android 200ms to fully bind the foreground service before starting the heavy C++ FFmpeg workload and progress events,
            // otherwise the notification show would be delayed when app is minimized.
            await new Promise((r) => setTimeout(r, 200));

            const progressSub = _ffmpegEmitter.addListener(
                "onClipProgress",
                ({ progress, eta }: { progress: number; eta: number | null }) => {
                    if (progress >= 1.0) return;

                    latestProgressRef.current = progress;
                    const progressDetail = `Saving to ${outPathStrDisplay}`;
                    currentDetailRef.current = progressDetail;

                    if (eta !== null) {
                        lastEtaSecRef.current = eta;
                    }

                    setLoadingTask((prev: any) => {
                        const base = prev?.id === "clip-export" ? prev : clipTaskBase;
                        const currentProgress = base.progress || 0;
                        if (Math.abs(currentProgress - progress) < 0.005) return prev;
                        return {
                            ...base,
                            progress,
                            detail: progressDetail,
                        };
                    });

                    if (isAppBackgrounded()) {
                        notifPostedRef.current = true;
                        const percent = Math.round(progress * 100);
                        const currentEta = eta ?? lastEtaSecRef.current;
                        const etaStr = currentEta != null ? ` • ETA ${secondsToHhmmss(currentEta, true)}` : "";
                        const subText = `${percent}%${etaStr}`;
                        showProgressNotification(`${queuePosPrefix}${labels.title}`, progressDetail, progress, subText).catch(
                            () => {},
                        );
                    }
                },
            );

            let ffmpegSuccess = false;

            try {
                ffmpegSuccess = await ExpoFFmpeg.clipVideo(inputUri, outPathStr, segments, options);
            } finally {
                progressSub.remove();
                lastEtaSecRef.current = null;
            }

            // Update foreground-service notification during rescan/finalizing phase
            const updateFinalizingNotif = () => {
                if (isAppBackgrounded()) {
                    notifPostedRef.current = true;
                    showProgressNotification("Saving & Indexing", `Registering ${options.name}.${ext}…`, 0.98).catch(() => {});
                }
            };

            if (ffmpegSuccess) {
                // Detect if this is an overwrite of an existing library entry
                const allVids = Object.values(allAlbumsVideos).flat();
                const existingEntry = allVids.find((v) => v.uri.includes(outPathStr) || outPathStr.includes(v.uri));
                if (existingEntry) {
                    savePendingMediaDataDb(`file://${outPathStr}`, "video", { isNewOverride: true });
                }

                setLoadingTask({
                    id: "clip-export-finalizing",
                    label: "Saving & Indexing",
                    detail: "Registering file with Media Store...",
                    importance: "SHOW_POPUP",
                });
                updateFinalizingNotif();
                let finalClip: VideoMedia | undefined = undefined;
                try {
                    addPendingClipAssignment(`file://${outPathStr}`, inputUri);
                    await ExpoFFmpeg.scanFile(outPathStr);
                    await fetchAlbums();

                    const allVids = Object.values(allAlbumsVideos).flat();
                    finalClip = allVids.find((v) => v.uri.includes(outPathStr) || outPathStr.includes(v.uri));
                    if (finalClip) {
                        registerSessionClip(finalClip, segments, options, inputUri);
                    }
                } catch (idxError) {
                    console.warn("[useMediaExport] Failed to scan asset:", idxError);
                    await fetchAlbums();
                }

                if (onSuccess) onSuccess(outPathStr);

                // Cancel the progress foreground service and post a result notif if away
                await cancelProgressNotification();
                notifPostedRef.current = false;
                await showResultNotification(true, `${options.name}.${ext}`, finalClip?.id, finalClip?.albumId);

                setLoadingTask({
                    id: "clip-export-success",
                    label: labels.successTitle,
                    detail: `Saved to ${options.name}.${ext}`,
                    importance: "SHOW_POPUP",
                    dismissAfter: 5000,
                    status: "success",
                });
                return true;
            } else {
                const nativeError = await ExpoFFmpeg.getLastClipError();

                await cancelProgressNotification();
                notifPostedRef.current = false;
                await showResultNotification(false, options.name);

                setLoadingTask({
                    label: labels.failTitle,
                    detail: nativeError ? `FFmpeg error: ${nativeError}` : "Clipping failed.",
                    importance: "SHOW_POPUP",
                    dismissAfter: 6000,
                    status: "error",
                });
                return false;
            }
        } catch (e: any) {
            console.error("[useMediaExport] Export error:", e);
            await cancelProgressNotification();
            notifPostedRef.current = false;
            setLoadingTask({
                label: "Critical Error",
                detail: "An unexpected error occurred during export.",
                importance: "SHOW_POPUP",
                dismissAfter: 5000,
                status: "error",
            });
            return false;
        }
    };

    const processQueue = useCallback(async () => {
        if (activeProcessRef.current) return activeProcessRef.current;

        activeProcessRef.current = (async () => {
            isExportingRef.current = true;
            while (queueRef.current.length > 0) {
                const currentItem = queueRef.current[0];
                const total = queueRef.current.length;
                await performActualExport(currentItem, { current: 1, total });
                queueRef.current = queueRef.current.slice(1);
                setExportQueue([...queueRef.current]);
            }
            isExportingRef.current = false;
            activeProcessRef.current = null;
        })();

        return activeProcessRef.current;
    }, []);

    const performExport = useCallback(
        async (
            inputUri: string,
            segments: { start: number; end: number }[],
            options: ExportOptions,
            labels: ExportLabels,
            onSuccess?: (outPathStr: string) => void,
        ) => {
            const newItem: ExportQueueItem = { inputUri, segments, options, labels, onSuccess };
            queueRef.current = [...queueRef.current, newItem];
            setExportQueue([...queueRef.current]);

            await processQueue();
        },
        [processQueue],
    );

    const executeReexport = useCallback(
        async (clip: SessionClip, options: ExportOptions) => {
            const uri = clip.clipSourceUri!;

            await performExport(uri, clip.segments, options, {
                title: "Re-exporting Clip",
                successTitle: "Re-export Success",
                failTitle: "Re-export Failed",
            });
        },
        [performExport],
    );

    return {
        exportQueue,
        performExport,
        executeReexport,
    };
}
