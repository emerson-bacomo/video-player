/**
 * Global constants for default values across the application.
 */

export type Orientation = "portrait" | "landscape" | "system";

export interface Settings {
    clipDestination: string;
    defaultOrientation: Orientation;
    brightnessSensitivity: number;
    nameReplacements: { find: string; replace: string; active: boolean }[];
    cornerConfigs: Record<string, (string | null)[]>;
    timeDisplayMode: "duration" | "remaining";
    autoPlayOnEnd: boolean;
    autoPlaySimilarPrefixOnly: boolean;
    doubleTapSeekAmount: number;
    panSeekSensitivity: number; // seconds per cm
}

export const DEFAULT_SETTINGS: Settings = {
    clipDestination: "",
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
};

/** The default sorting scope for albums. */
export const DEFAULT_SORT_SCOPE = "global";

/** The default sorting type (null means use global settings). */
export const DEFAULT_SORT_TYPE = null;

/** The default playback position in seconds. */
export const DEFAULT_PLAYED_SEC = -1;

/** The default last opened timestamp. */
export const DEFAULT_OPENED_TIME = 0;
