/**
 * Global constants for default values across the application.
 */

import { ExportOptions } from "@/types/useMedia";

export type Orientation = "portrait" | "landscape" | "system";
export type CornerPosition = "top-left" | "top-right" | "bottom-left" | "bottom-right";

export interface PlayerOperation {
    id: string;
    type: "seek" | "play-next" | "play-prev" | "double-tap-seek-left" | "double-tap-seek-right";
    value: number;
    iconName: string;
    label: string;
}

export interface Settings {
    clipDestination: string;
    screenshotDestination: string;
    defaultOrientation: Orientation;
    brightnessSensitivity: number;
    nameReplacements: { find: string; replace: string; active: boolean }[];
    cornerConfigs: Record<string, (PlayerOperation | null)[]>;
    timeDisplayMode: "duration" | "remaining";
    autoPlayOnEnd: boolean;
    autoPlaySimilarPrefixOnly: boolean;
    doubleTapSeekAmount: number;
    panSeekSensitivity: number; // seconds per cm
    lastExportOptions?: Partial<ExportOptions>;
}

export const DEFAULT_SETTINGS: Settings = {
    clipDestination: "",
    screenshotDestination: "",
    defaultOrientation: "system",
    brightnessSensitivity: 1.0,
    nameReplacements: [],
    cornerConfigs: {
        "top-left": [null, null, null, null],
        "top-right": [null, null, null, null],
        "bottom-left": [null, null, null, null],
        "bottom-right": [null, null, null, null],
    },
    timeDisplayMode: "remaining",
    autoPlayOnEnd: true,
    autoPlaySimilarPrefixOnly: true,
    doubleTapSeekAmount: 5,
    panSeekSensitivity: 10.0,
    lastExportOptions: undefined,
};

/** The default sorting scope for albums. */
export const DEFAULT_SORT_SCOPE = "global";

/** The default sorting type (null means use global settings). */
export const DEFAULT_SORT_TYPE = null;

/** The default playback position in seconds. */
export const DEFAULT_PLAYED_SEC = -1;

/** The default last opened timestamp. */
export const DEFAULT_OPENED_TIME = 0;

/**
 * Default options for video export.
 */
export const DEFAULT_EXPORT_OPTIONS = {
    quality: "balanced" as ExportOptions["quality"],
    crf: 25,
    resolution: "original",
    format: "mp4" as ExportOptions["format"],
    preset: "slower",
    removeAudio: false,
    removeMarkers: true,
    useTransition: true,
    transitionDuration: 0.5,
    transitionStyle: "smear-left" as ExportOptions["transitionStyle"],
};
