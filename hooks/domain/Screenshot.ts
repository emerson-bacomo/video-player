import type { ScreenshotData } from "@/types/useMedia";
import type { MediaStore } from "@/hooks/MediaStore";
import * as FileSystem from "expo-file-system/legacy";
import * as MediaLibrary from "expo-media-library";

export class Screenshot {
    private data: ScreenshotData;
    private store: MediaStore;

    constructor(data: ScreenshotData, store: MediaStore) {
        this.data = data;
        this.store = store;
    }

    get id(): string { return this.data.id; }
    get uri(): string { return this.data.uri; }
    get filename(): string { return this.data.filename; }
    get videoTitle(): string | undefined { return this.data.videoTitle; }
    get videoId(): string | undefined { return this.data.videoId; }
    get albumId(): string | undefined { return this.data.albumId; }
    get captureTimestamp(): number | undefined { return this.data.captureTimestamp; }
    get createdAt(): number { return this.data.createdAt; }
    get width(): number | undefined { return this.data.width; }
    get height(): number | undefined { return this.data.height; }
    get fileSize(): number | undefined { return this.data.fileSize; }
    get thumbnail(): string | undefined { return this.data.thumbnail; }

    // ── Delete ────────────────────────────────────────────────────────────

    async delete(): Promise<void> {
        try {
            await FileSystem.deleteAsync(this.uri, { idempotent: true });
        } catch (e) {
            console.error(`[Screenshot] Failed to delete file: ${this.uri}`, e);
        }
        await this.store.repo.deleteScreenshots([this.id]);
        this.store.removeScreenshots([this.id]);
    }

    static async deleteMany(ids: string[], store: MediaStore): Promise<boolean> {
        try {
            for (const id of ids) {
                const screenshot = store.getScreenshot(id);
                if (screenshot) {
                    try {
                        await FileSystem.deleteAsync(screenshot.uri, { idempotent: true });
                    } catch (e) {
                        console.error("[Screenshot.deleteMany] Failed to delete file", screenshot.uri, e);
                    }
                }
            }
            await store.removeScreenshots(ids);
            return true;
        } catch (e) {
            console.error("[Screenshot.deleteMany] Error deleting screenshots:", e);
            return false;
        }
    }

    // ── Rename ────────────────────────────────────────────────────────────

    async rename(newName: string): Promise<void> {
        const basePath = this.uri.substring(0, this.uri.lastIndexOf("/"));
        const ext = this.filename.includes(".") ? this.filename.split(".").pop() : "";
        const newUri = `${basePath}/${newName}${ext ? `.${ext}` : ""}`;
        await FileSystem.moveAsync({ from: this.uri, to: newUri });
        await this.store.repo.renameScreenshot(this.id, newName, newUri);
        this.data.filename = newName;
        this.data.uri = newUri;
        this.store.notifyScreenshotList();
    }

    // ── Smart scan (MediaLibrary, incremental via creation time) ──────────

    static async scan(store: MediaStore, force: boolean = false): Promise<void> {
        try {
            const lastScanStr = await store.repo.getSetting("screenshot_last_scan");
            const lastScan = lastScanStr ? parseInt(lastScanStr, 10) : 0;

            const options: MediaLibrary.AssetsOptions = {
                mediaType: "photo",
                first: 500,
            };
            if (!force && lastScan > 0) {
                options.createdAfter = lastScan;
            }

            const vpssAssets: MediaLibrary.Asset[] = [];
            let hasNext = true;
            while (hasNext) {
                const result = await MediaLibrary.getAssetsAsync(options);
                for (const a of result.assets) {
                    if (a.filename?.includes(".vpss")) {
                        vpssAssets.push(a);
                    }
                }
                hasNext = result.hasNextPage;
                if (hasNext) {
                    options.after = result.endCursor;
                }
            }

            if (vpssAssets.length === 0) return;

            if (force) {
                await store.clearScreenshots();
            }

            const screenshotDataList: ScreenshotData[] = await Promise.all(
                vpssAssets.map(async (a) => {
                    let fileSize: number | undefined;
                    try {
                        const info = await FileSystem.getInfoAsync(a.uri);
                        if (info.exists) {
                            fileSize = (info as any).size;
                        }
                    } catch {}
                    return {
                        id: a.id,
                        uri: a.uri,
                        filename: a.filename,
                        createdAt: (a.modificationTime || 0) * 1000,
                        width: a.width,
                        height: a.height,
                        fileSize,
                    };
                }),
            );

            await store.addScreenshots(screenshotDataList);
            await store.repo.saveSetting("screenshot_last_scan", String(Date.now()));
        } catch (e) {
            console.error("[Screenshot.scan] Failed to scan screenshots:", e);
        }
    }

    // ── JSON ──────────────────────────────────────────────────────────────

    toJSON(): ScreenshotData {
        return { ...this.data };
    }
}
