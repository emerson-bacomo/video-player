import type { AlbumData, AlbumSortConfig, VideoSortConfig } from "@/types/useMedia";
import type { MediaStore } from "@/hooks/MediaStore";
import { Video } from "./Video";
import { deleteMultipleAlbumsDb, addLogDb } from "@/utils/db";
import * as FileSystem from "expo-file-system/legacy";
import * as MediaLibrary from "expo-media-library";

export class Album {
    static globalSortConfig: AlbumSortConfig = { by: "date", order: "desc" };

    static compareBySort(a: AlbumData, b: AlbumData, aSort?: AlbumSortConfig): number {
        const sort = aSort ?? Album.globalSortConfig;
        let comp = 0;
        if (sort.by === "date") {
            comp = (a.lastModified || 0) - (b.lastModified || 0);
        } else if (sort.by === "name") {
            comp = a.title.localeCompare(b.title);
        } else if (sort.by === "count") {
            comp = (a.assetCount || 0) - (b.assetCount || 0);
        }
        return sort.order === "asc" ? comp : -comp;
    }

    private data: AlbumData;
    private store: MediaStore;

    constructor(data: AlbumData, store: MediaStore) {
        this.data = data;
        this.store = store;
    }

    get id(): string {
        return this.data.id;
    }
    get title(): string {
        return this.data.title;
    }
    get albumName(): string {
        return this.data.albumName;
    }
    get assetCount(): number {
        return this.data.assetCount;
    }
    get uri(): string {
        return this.data.uri;
    }
    get thumbnail(): string | undefined {
        return this.data.thumbnail;
    }
    get lastModified(): number | undefined {
        return this.data.lastModified;
    }
    get isHidden(): boolean {
        return Boolean(this.data.isHidden);
    }

    get videoSortSettingScope(): "global" | "local" | undefined {
        return this.data.videoSortSettingScope;
    }

    get videoSortType(): string | undefined {
        return this.data.videoSortType;
    }

    get videoSort(): VideoSortConfig {
        if (this.data.videoSortSettingScope === "local" && this.data.videoSortType) {
            try {
                return JSON.parse(this.data.videoSortType) as VideoSortConfig;
            } catch (e) {
                console.warn("[Album] Failed to parse local sort", this.id, e);
            }
        }
        return Video.globalSortConfig;
    }

    set videoSort(value: VideoSortConfig) {
        this.data.videoSortType = JSON.stringify(value);
        this.data.videoSortSettingScope = "local";
        this.store.updateAlbumData(this.id, { ...this.data, videoSortType: JSON.stringify(value), videoSortSettingScope: "local" });
    }

    get videoSortMode(): "global" | "local" {
        return this.data.videoSortSettingScope || "global";
    }

    set videoSortMode(scope: "global" | "local") {
        if (this.videoSortMode === scope) return;
        this.data.videoSortSettingScope = scope;
        if (scope === "local" && !this.data.videoSortType) {
            this.data.videoSortType = JSON.stringify(Video.globalSortConfig);
        } else if (scope === "global") {
            this.data.videoSortType = undefined;
        }
        const update: Partial<AlbumData> = { videoSortSettingScope: scope };
        if (this.data.videoSortType !== undefined) {
            update.videoSortType = this.data.videoSortType;
        }
        this.store.updateAlbumData(this.id, { ...this.data, ...update });
    }

    get prefixOptions(): string | undefined {
        return this.data.prefixOptions;
    }
    get selectedPrefixOptions(): string | undefined {
        return this.data.selectedPrefixOptions;
    }

    // ── Hide / Unhide ─────────────────────────────────────────────────────

    async hide(): Promise<void> {
        this.data.isHidden = 1;
        await this.store.updateAlbumData(this.id, { ...this.data, isHidden: 1 });
    }

    async unhide(): Promise<void> {
        this.data.isHidden = 0;
        await this.store.updateAlbumData(this.id, { ...this.data, isHidden: 0 });
    }

    static async hideMany(items: (string | Album)[], store: MediaStore): Promise<void> {
        for (const item of items) {
            const album = typeof item === "string" ? store.getAlbum(item) : item;
            await album?.hide();
        }
    }

    static async unhideMany(items: (string | Album)[], store: MediaStore): Promise<void> {
        for (const item of items) {
            const album = typeof item === "string" ? store.getAlbum(item) : item;
            await album?.unhide();
        }
    }

    // ── Rename ────────────────────────────────────────────────────────────

    async rename(name: string): Promise<void> {
        this.data.title = name;
        await this.store.updateAlbumData(this.id, { ...this.data, title: name });

        const albumVids = this.store.getAlbumVideos(this.id);
        if (albumVids.length > 0) {
            const firstVid = albumVids[0];
            if (firstVid.uri.startsWith("file://")) {
                try {
                    const parts = firstVid.uri.split("/");
                    parts.pop();
                    const dirPath = parts.join("/");
                    parts.pop();
                    const parent = parts.join("/");
                    const newDir = `${parent}/${name}`;
                    if (dirPath !== newDir) {
                        await FileSystem.moveAsync({ from: dirPath, to: newDir });
                    }
                } catch (e) {
                    console.error("[Album] Physical directory rename failed:", e);
                }
            }
        }
    }

    // ── Delete ────────────────────────────────────────────────────────────

    async delete(): Promise<void> {
        await this.store.removeAlbums([this.id]);
    }

    static async deleteMany(albumIds: string[], store: MediaStore): Promise<boolean> {
        try {
            addLogDb("INFO", "Delete Media", `Attempting to delete ${albumIds.length} albums`);
            const success = await MediaLibrary.deleteAlbumsAsync(albumIds, true);
            if (success) {
                addLogDb("INFO", "Delete Media", `Successfully deleted ${albumIds.length} albums`);
                deleteMultipleAlbumsDb(albumIds);
                await store.loadFromDb();
                return true;
            }
        } catch (e) {
            addLogDb("ERROR", "Delete Media", "Failed to delete albums", e);
        }
        return false;
    }

    // ── Thumbnail ─────────────────────────────────────────────────────────

    async setThumbnail(thumbUri: string): Promise<void> {
        this.data.thumbnail = thumbUri;
        await this.store.updateAlbumData(this.id, { ...this.data, thumbnail: thumbUri });
    }

    toJSON(): AlbumData {
        return { ...this.data };
    }
}
