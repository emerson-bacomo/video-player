import type { MediaRepository } from "@/hooks/MediaRepository";
import { Album } from "@/hooks/domain/Album";
import { Screenshot } from "@/hooks/domain/Screenshot";
import { Video } from "@/hooks/domain/Video";
import type { AlbumData, ScreenshotData, VideoData } from "@/types/useMedia";

type Listener = () => void;

/**
 * In-memory reactive entity cache.
 *
 * Owns the truth for all Album, Video, and Screenshot instances.
 * - Domain classes are instantiated once and mutated in place.
 * - Granular subscriptions per entity id (plus "list:albums", "videos:{albumId}",
 *   and "list:screenshots").
 * - Writes persist through MediaRepository and notify affected listeners.
 */
export class MediaStore {
    private albums = new Map<string, Album>();
    private videos = new Map<string, Video>();
    private screenshots = new Map<string, Screenshot>();
    private listeners = new Map<string, Set<Listener>>();
    public repo: MediaRepository;

    constructor(repo: MediaRepository) {
        this.repo = repo;
    }

    // ── Subscription ──────────────────────────────────────────────────────

    subscribe(entityId: string, listener: Listener): () => void {
        if (!this.listeners.has(entityId)) {
            this.listeners.set(entityId, new Set());
        }
        this.listeners.get(entityId)!.add(listener);
        return () => {
            this.listeners.get(entityId)?.delete(listener);
        };
    }

    private notify(entityId: string): void {
        this.listeners.get(entityId)?.forEach((fn) => fn());
    }

    /** @internal Public for domain model callbacks */
    notifyVideoUpdate(videoId: string): void {
        this.notify(videoId);
    }

    // ── Reads ─────────────────────────────────────────────────────────────

    getAlbum(id: string): Album | undefined {
        return this.albums.get(id);
    }

    getVideo(id: string): Video | undefined {
        return this.videos.get(id);
    }

    getAlbums(): Album[] {
        return Array.from(this.albums.values());
    }

    getAlbumVideos(albumId: string): Video[] {
        const result: Video[] = [];
        for (const v of this.videos.values()) {
            if (v.albumId === albumId) result.push(v);
        }
        return result;
    }

    getAllVideos(): Video[] {
        return Array.from(this.videos.values());
    }

    // ── Screenshot reads ──────────────────────────────────────────────────

    getScreenshot(id: string): Screenshot | undefined {
        return this.screenshots.get(id);
    }

    getScreenshots(): Screenshot[] {
        return Array.from(this.screenshots.values());
    }

    notifyScreenshotList(): void {
        this.notify("list:screenshots");
    }

    // ── Writes — called by domain classes & sync ──────────────────────────

    async updateAlbumData(id: string, _data: AlbumData): Promise<void> {
        const album = this.albums.get(id);
        if (!album) return;
        await this.repo.upsertAlbum({ ..._data, assetCount: album.assetCount });
        this.notify(id);
    }

    async updateVideoData(id: string, data: VideoData): Promise<void> {
        const video = this.videos.get(id);
        if (!video) return;
        await this.repo.addVideos([data]);
        this.notify(id);
    }

    async setVideoHidden(id: string, isHidden: boolean): Promise<void> {
        const video = this.videos.get(id);
        if (!video) return;
        await this.repo.setVideoHidden(id, isHidden);
        if (isHidden) {
            this.videos.delete(id);
        }
        this.notify(id);
    }

    async addAlbums(dataList: AlbumData[]): Promise<void> {
        const added: string[] = [];
        for (const data of dataList) {
            if (!this.albums.has(data.id)) {
                const album = new Album(data, this);
                this.albums.set(data.id, album);
                added.push(data.id);
            }
        }
        if (added.length > 0) {
            await this.repo.saveAlbums(dataList);
            this.notify("list:albums");
        }
    }

    async addVideos(dataList: VideoData[]): Promise<void> {
        const addedIds: string[] = [];
        const albumIds = new Set<string>();
        for (const data of dataList) {
            if (!this.videos.has(data.id)) {
                const video = new Video(data, this);
                this.videos.set(data.id, video);
                addedIds.push(data.id);
                if (data.albumId) albumIds.add(data.albumId);
            }
        }
        if (addedIds.length > 0) {
            await this.repo.addVideos(dataList);
            for (const vid of addedIds) {
                this.notify(vid);
            }
            for (const aid of albumIds) {
                this.notify(`videos:${aid}`);
            }
        }
    }

    async removeAlbums(ids: string[]): Promise<void> {
        for (const id of ids) {
            this.albums.delete(id);
            for (const [vid, v] of this.videos) {
                if (v.albumId === id) this.videos.delete(vid);
            }
        }
        if (ids.length > 0) {
            await this.repo.deleteAlbums(ids);
            this.notify("list:albums");
            for (const id of ids) {
                this.notify(`videos:${id}`);
            }
        }
    }

    async removeVideos(ids: string[]): Promise<void> {
        const albumIds = new Set<string>();
        for (const id of ids) {
            const v = this.videos.get(id);
            if (v && v.albumId) albumIds.add(v.albumId);
            this.videos.delete(id);
        }
        if (ids.length > 0) {
            await this.repo.deleteVideos(ids);
            for (const id of ids) this.notify(id);
            for (const aid of albumIds) this.notify(`videos:${aid}`);
        }
    }

    async renameAlbum(id: string, name: string): Promise<void> {
        const album = this.albums.get(id);
        if (!album) return;
        await album.rename(name);
        this.notify(id);
    }

    async renameVideo(id: string, name: string): Promise<void> {
        const video = this.videos.get(id);
        if (!video) return;
        await video.rename(name);
        this.notify(id);
    }

    // ── Screenshot writes ─────────────────────────────────────────────────

    async addScreenshots(dataList: ScreenshotData[]): Promise<void> {
        const added: string[] = [];
        for (const data of dataList) {
            if (!this.screenshots.has(data.id)) {
                this.screenshots.set(data.id, new Screenshot(data, this));
                added.push(data.id);
            }
        }
        if (added.length > 0) {
            await this.repo.addScreenshots(dataList);
            this.notify("list:screenshots");
        }
    }

    async removeScreenshots(ids: string[]): Promise<void> {
        for (const id of ids) {
            this.screenshots.delete(id);
        }
        if (ids.length > 0) {
            await this.repo.deleteScreenshots(ids);
            this.notify("list:screenshots");
        }
    }

    async clearScreenshots(): Promise<void> {
        this.screenshots.clear();
        await this.repo.clearAllScreenshots();
        this.notify("list:screenshots");
    }

    // ── Initialization ────────────────────────────────────────────────────

    async loadFromDb(): Promise<void> {
        const [albumDataList, allVideos, screenshotDataList] = await Promise.all([
            this.repo.getAlbums(),
            this.repo.getVideos(),
            this.repo.getScreenshots(),
        ]);

        this.albums.clear();
        this.videos.clear();
        this.screenshots.clear();

        for (const data of albumDataList) {
            const album = new Album(data, this);
            this.albums.set(data.id, album);
        }

        for (const data of allVideos) {
            const video = new Video(data, this);
            this.videos.set(data.id, video);
        }

        for (const data of screenshotDataList) {
            this.screenshots.set(data.id, new Screenshot(data, this));
        }
    }

    // ── Cleanup ───────────────────────────────────────────────────────────

    clear(): void {
        this.albums.clear();
        this.videos.clear();
        this.screenshots.clear();
        this.listeners.clear();
    }
}
