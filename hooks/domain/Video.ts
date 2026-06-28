import type { VideoData, VideoSortConfig } from "@/types/useMedia";
import type { MediaStore } from "@/hooks/MediaStore";
import { deleteMultipleVideosDb, addLogDb } from "@/utils/db";
import { getThumbnailUri } from "@/utils/videoUtils";
import ExpoFFmpeg from "@/modules/expo-ffmpeg";
import * as FileSystem from "expo-file-system/legacy";
import * as MediaLibrary from "expo-media-library";

export class Video {
    static globalSortConfig: VideoSortConfig = { by: "episode", order: "asc" };

    static compareBySort(a: VideoData, b: VideoData, vSort?: VideoSortConfig): number {
        const sort = vSort ?? Video.globalSortConfig;
        let comp = 0;
        if (sort.by === "episode") {
            const prefixA = a.prefix ?? "";
            const prefixB = b.prefix ?? "";
            const prefixComp = prefixA.localeCompare(prefixB);
            if (prefixComp !== 0) {
                comp = prefixComp;
            } else {
                const seasonA = (a.season ?? -1) < 0 ? 0 : (a.season ?? 0);
                const seasonB = (b.season ?? -1) < 0 ? 0 : (b.season ?? 0);
                const seasonComp = seasonA - seasonB;
                if (seasonComp !== 0) {
                    comp = seasonComp;
                } else {
                    comp = (a.episode ?? 0) - (b.episode ?? 0);
                }
            }
        } else if (sort.by === "name") {
            comp = a.title.localeCompare(b.title);
        } else if (sort.by === "date") {
            comp = (a.modificationTime || 0) - (b.modificationTime || 0);
        } else if (sort.by === "duration") {
            comp = (a.duration || 0) - (b.duration || 0);
        }
        return sort.order === "asc" ? comp : -comp;
    }

    private data: VideoData;
    private store: MediaStore;

    constructor(data: VideoData, store: MediaStore) {
        this.data = data;
        this.store = store;
    }

    get id(): string { return this.data.id; }
    get filename(): string { return this.data.filename; }
    get title(): string { return this.data.title; }
    get uri(): string { return this.data.uri; }
    get duration(): number { return this.data.duration; }
    get width(): number { return this.data.width; }
    get height(): number { return this.data.height; }
    get modificationTime(): number { return this.data.modificationTime; }
    get thumbnail(): string | undefined { return this.data.thumbnail; }
    get baseThumbnailUri(): string { return this.data.baseThumbnailUri; }
    get albumId(): string { return this.data.albumId; }
    get markers(): { time: number; markerId: string }[] | undefined { return this.data.markers; }
    get lastOpenedTime(): number | undefined { return this.data.lastOpenedTime; }
    get clipSourceUri(): string | undefined { return this.data.clipSourceUri; }
    get isNewOverride(): boolean | undefined { return this.data.isNewOverride; }
    get prefix(): string | undefined { return this.data.prefix; }
    get rawPrefix(): string | undefined { return this.data.rawPrefix; }
    get episode(): number | undefined { return this.data.episode; }
    get season(): number | undefined { return this.data.season; }
    get size(): number | undefined { return this.data.size; }
    get isPlaceholder(): boolean | undefined { return this.data.isPlaceholder; }

    get lastPlayedSec(): number { return this.data.lastPlayedSec; }
    set lastPlayedSec(sec: number) {
        this.data.lastPlayedSec = sec;
        this.store.updateVideoData(this.id, { ...this.data, lastPlayedSec: sec });
    }

    // ── Hide / Unhide ─────────────────────────────────────────────────────

    async hide(): Promise<void> {
        await this.store.setVideoHidden(this.id, true);
    }

    async unhide(): Promise<void> {
        await this.store.setVideoHidden(this.id, false);
    }

    static async hideMany(items: (string | Video)[], store: MediaStore): Promise<void> {
        for (const item of items) {
            const video = typeof item === "string" ? store.getVideo(item) : item;
            await video?.hide();
        }
    }

    static async unhideMany(items: (string | Video)[], store: MediaStore): Promise<void> {
        for (const item of items) {
            const video = typeof item === "string" ? store.getVideo(item) : item;
            await video?.unhide();
        }
    }

    // ── Rename ────────────────────────────────────────────────────────────

    async rename(name: string): Promise<void> {
        this.data.title = name;
        await this.store.updateVideoData(this.id, { ...this.data, title: name });

        if (this.uri.startsWith("file://")) {
            try {
                const oldPath = this.uri;
                const ext = oldPath.substring(oldPath.lastIndexOf("."));
                const parent = oldPath.substring(0, oldPath.lastIndexOf("/"));
                const newPath = `${parent}/${name}${ext}`;
                await FileSystem.moveAsync({ from: oldPath, to: newPath });
            } catch (e) {
                console.error("[Video] Physical file rename failed:", e);
            }
        }
    }

    // ── Delete ────────────────────────────────────────────────────────────

    async delete(): Promise<void> {
        await this.store.removeVideos([this.id]);
    }

    static async deleteMany(videoIds: string[], store: MediaStore): Promise<boolean> {
        try {
            addLogDb("INFO", "Delete Media", `Attempting to delete ${videoIds.length} videos`);
            const success = await MediaLibrary.deleteAssetsAsync(videoIds);
            if (success) {
                addLogDb("INFO", "Delete Media", `Successfully deleted ${videoIds.length} videos`);
                for (const id of videoIds) {
                    try {
                        const thumbUri = getThumbnailUri(id);
                        await FileSystem.deleteAsync(thumbUri, { idempotent: true });
                    } catch (e) {
                        console.error(`[DeleteMedia] Failed to delete thumbnail for ${id}:`, e);
                    }
                }
                deleteMultipleVideosDb(videoIds);
                await store.loadFromDb();
                return true;
            }
        } catch (e) {
            addLogDb("ERROR", "Delete Media", "Failed to delete videos", e);
        }
        return false;
    }

    // ── Playback ──────────────────────────────────────────────────────────

    async updateProgress(sec: number): Promise<void> {
        const finalSec = Math.min(sec, this.data.duration);
        this.data.lastPlayedSec = finalSec;

        let lastOpenedTime = this.data.lastOpenedTime;
        if (finalSec === -1) {
            lastOpenedTime = 0;
        } else if (finalSec === this.data.duration) {
            lastOpenedTime = Date.now();
        }

        await this.store.repo.savePlaybackData(this.id, finalSec);
        if (finalSec > 0) {
            await this.store.repo.clearVideoNewOverride(this.id);
            this.data.isNewOverride = false;
        }
        if (lastOpenedTime !== this.data.lastOpenedTime) {
            this.data.lastOpenedTime = lastOpenedTime;
            await this.store.repo.updateVideoLastOpenedTime(this.id, lastOpenedTime);
        }

        this.store.notifyVideoUpdate(this.id);
    }

    async setLastOpenedTime(time: number): Promise<void> {
        this.data.lastOpenedTime = time;
        await this.store.repo.updateVideoLastOpenedTime(this.id, time);
        this.store.notifyVideoUpdate(this.id);
    }

    // ── Markers ───────────────────────────────────────────────────────────

    async updateMarkers(markers: { time: number; markerId: string }[] | null): Promise<void> {
        this.data.markers = markers || undefined;
        await this.store.repo.updateVideoMarkers(this.id, markers);
        this.store.notifyVideoUpdate(this.id);
    }

    // ── Thumbnail ─────────────────────────────────────────────────────────

    async setThumbnail(thumbUri: string): Promise<void> {
        this.data.thumbnail = thumbUri;
        await this.store.updateVideoData(this.id, { ...this.data, thumbnail: thumbUri });
        this.store.notifyVideoUpdate(this.id);
    }

    async regenerateThumbnail(): Promise<void> {
        const thumbUri = getThumbnailUri(this.id);
        try {
            await ExpoFFmpeg.generateThumbnail(this.data.uri, thumbUri);
            const bustedUri = `${thumbUri}?t=${Date.now()}`;
            await this.setThumbnail(bustedUri);
        } catch (e) {
            console.error(`[Video] Failed to regenerate thumbnail for ${this.id}:`, e);
        }
    }

    // ── Clip ──────────────────────────────────────────────────────────────

    async clearClipSourceUri(): Promise<void> {
        this.data.clipSourceUri = undefined;
        await this.store.updateVideoData(this.id, { ...this.data, clipSourceUri: undefined });
        this.store.notifyVideoUpdate(this.id);
    }

    toJSON(): VideoData {
        return { ...this.data };
    }
}
