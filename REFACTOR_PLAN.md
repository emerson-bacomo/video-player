# useMedia Refactor Plan — Domain Model + Granular Reactivity

## Goal

Replace the monolithic 154-field `useMedia()` context with stable domain class instances + `useSyncExternalStore` subscriptions. Every entity carries its own behavior (`video.delete()`, `album.sort = ...`). React derives UI from live instances — no `useState` for domain data.

---

## Phase 1: Repository (data access layer)

One class, all persistence. Replace ad-hoc SQLite + FileSystem calls scattered across sub-hooks.

```typescript
class MediaRepository {
    getAlbums(): Promise<AlbumData[]>;
    getVideos(albumId: string): Promise<VideoData[]>;
    saveVideoProgress(videoId: string, sec: number): Promise<void>;
    updateVideoMarkers(videoId: string, markers: Marker[]): Promise<void>;
    deleteVideos(ids: string[]): Promise<void>;
    deleteAlbums(ids: string[]): Promise<void>;
    renameVideo(id: string, name: string): Promise<void>;
    renameAlbum(id: string, name: string): Promise<void>;
    setVideoHidden(id: string, hidden: boolean): Promise<void>;
    setAlbumHidden(id: string, hidden: boolean): Promise<void>;
    getPrefixOptions(albumId: string): Promise<Record<string, boolean>>;
    savePrefixOption(albumId: string, prefix: string, selected: boolean): Promise<void>;
    getSort(albumId?: string): Promise<VideoSort | null>;
    saveSort(albumId: string | null, sort: VideoSort): Promise<void>;
    // ... all other DB operations
}
```

- Extracted from `utils/db.ts` + individual sub-hook DB calls.
- Returns raw data (plain objects / interfaces), not domain classes.
- Fully mockable for tests.
- No business logic — pure persistence.

---

## Phase 2: Store (reactive entity cache)

A central in-memory store that holds live `Album` and `Video` instances, manages subscriptions, and acts as the single source of truth.

```typescript
type Listener = () => void;

class MediaStore {
    // Entity maps — stable domain class instances
    private albums = new Map<string, Album>();
    private videos = new Map<string, Video>();

    // Subscriptions — granular per entity id + wildcard
    private listeners = new Map<string, Set<Listener>>();

    // ── Subscription ──

    subscribe(entityId: string, listener: Listener): () => void;
    notify(entityId: string): void;

    // ── Reads — return stable instances ──

    getAlbum(id: string): Album | undefined;
    getVideo(id: string): Video | undefined;
    getAlbums(): Album[];
    getAlbumVideos(albumId: string): Video[];

    // ── Writes — called by domain classes & sync ──

    updateAlbumData(id: string, data: Partial<AlbumData>): void; // updates internal data + notifies
    updateVideoData(id: string, data: Partial<VideoData>): void;
    addAlbums(data: AlbumData[]): void;
    addVideos(data: VideoData[]): void;
    removeAlbums(ids: string[]): void;
    removeVideos(ids: string[]): void;

    // ── Initialization ──

    async loadFromDb(repo: MediaRepository): Promise<void>;
}
```

Key design decisions:
- The store owns the **truth** for all entity instances. Classes are instantiated once and mutated in place.
- `updateAlbumData()` modifies the internal `Album` data ref + calls `notify(id)`. The `Album` class
  delegates its setters to this method.
- Bulk operations (`addAlbums`) batch notifications to avoid cascading re-renders.

---

## Phase 3: Domain classes (behavior + observable properties)

### Album

```typescript
class Album {
    private data: AlbumData;
    private store: MediaStore;

    constructor(data: AlbumData, store: MediaStore) {
        this.data = data;
        this.store = store;
    }

    // ── Read-only state (derived from data) ──

    get id(): string { return this.data.id; }
    get title(): string { return this.data.title; }
    get videoCount(): number { return this.data.assetCount; }
    get thumbnail(): string | undefined { return this.data.thumbnail; }
    get sortScope(): SortScope { return this.data.videoSortSettingScope; }
    get hidden(): boolean { return Boolean(this.data.isHidden); }

    // ── Observable state (read by UI, written via setters) ──

    get sort(): VideoSort {
        return {
            by: this.data.videoSortType ?? "name",
            order: this.data.videoSortOrder ?? "asc",
        };
    }

    set sort(value: VideoSort) {
        this.data.videoSortType = value.by;
        this.data.videoSortOrder = value.order;
        this.store.updateAlbumData(this.id, this.data); // persist + notify later
    }

    get prefixFilters(): Record<string, boolean> {
        return this.data.selectedPrefixes ?? {};
    }

    set prefixFilters(filters: Record<string, boolean>) {
        this.data.selectedPrefixes = filters;
        this.store.updateAlbumData(this.id, this.data);
    }

    // ── Behavior ──

    rename(name: string): Promise<void>;
    hide(): Promise<void>;
    unhide(): Promise<void>;
    delete(): Promise<void>;
    regenerateThumbnail(): Promise<void>;
    setSortScope(scope: SortScope): Promise<void>;
}
```

### Video

```typescript
class Video {
    private data: VideoData;
    private store: MediaStore;

    constructor(data: VideoData, store: MediaStore) { ... }

    // Read-only
    get id(): string;
    get title(): string;
    get duration(): number;
    get uri(): string;
    get albumId(): string;
    get progress(): number;
    get lastPlayedSec(): number;
    get thumbnail(): string | undefined;

    // Observable — write triggers reactive cascade
    set progress(sec: number);
    set lastPlayedSec(time: number);

    // Behavior
    rename(name: string): Promise<void>;
    delete(): Promise<void>;
    hide(): Promise<void>;
    unhide(): Promise<void>;
    regenerateThumbnail(): Promise<void>;
    updateMarkers(markers: Marker[]): Promise<void>;
    exportAsClip(options: ExportOptions): Promise<void>;
}
```

### Reactive cascade example

When a user changes the sort on an album:

```typescript
// Consumer writes:
album.sort = { by: "name", order: "asc" };

// Album setter:
set sort(value: VideoSort) {
    this.data.videoSortType = value.by;
    this.data.videoSortOrder = value.order;
    this.store.updateAlbumData(this.id, this.data);
    // updateAlbumData internally:
    //   1. persists to MediaRepository
    //   2. calls this.regenerateThumbnail()
    //   3. calls this.store.notify(this.id)
}
```

Or if cascading should be handled declaratively in the store:

```typescript
// MediaStore.updateAlbumData:
updateAlbumData(id: string, data: Partial<AlbumData>) {
    const album = this.albums.get(id);
    if (!album) return;

    // Detect which fields changed
    if (data.videoSortType !== undefined || data.selectedPrefixes !== undefined) {
        this.regenerateAlbumThumbnails(id); // cascade
    }

    // Persist
    this.repo.saveAlbumData(id, data); // fire-and-forget

    // Notify React subscribers
    this.notify(id);
}
```

The second approach (centralized cascade) is generally cleaner — all side-effects for a given entity type live in one place rather than in every setter.

---

## Phase 4: React bridge hooks

Thin hooks that subscribe to the store and return stable instances.

```typescript
// ── Per-entity hooks ──

function useAlbum(id: string): Album | undefined {
    const store = useMediaStore();
    return useSyncExternalStore(
        (onChange) => store.subscribe(id, onChange),
        () => store.getAlbum(id),
    );
}

function useVideo(id: string): Video | undefined {
    const store = useMediaStore();
    return useSyncExternalStore(
        (onChange) => store.subscribe(id, onChange),
        () => store.getVideo(id),
    );
}

// ── List hooks ──

function useAlbums(): Album[] {
    const store = useMediaStore();
    const [, forceUpdate] = useReducer(x => x + 1, 0);

    useEffect(() => {
        // Subscribe to a special "list:albums" channel
        // that's notified when albums are added/removed/reordered
        return store.subscribe("list:albums", forceUpdate);
    }, [store]);

    return store.getAlbums();
}

function useAlbumVideos(albumId: string): Video[] {
    const store = useMediaStore();
    const [, forceUpdate] = useReducer(x => x + 1, 0);

    useEffect(() => {
        // Subscribe to each video in the album individually,
        // plus the album's video-order channel
        const unsubs: (() => void)[] = [];
        const videos = store.getAlbumVideos(albumId);
        for (const v of videos) {
            unsubs.push(store.subscribe(v.id, forceUpdate));
        }
        // Re-subscribe when album content changes
        const unsubList = store.subscribe(`videos:${albumId}`, forceUpdate);
        return () => { unsubs.forEach(fn => fn()); unsubList(); };
    }, [store, albumId]);

    return store.getAlbumVideos(albumId);
}
```

### Store context

```typescript
const MediaStoreContext = createContext<MediaStore>(null!);

function MediaStoreProvider({ repo, children }) {
    const store = useMemo(() => new MediaStore(repo), [repo]);
    return <MediaStoreContext.Provider value={store}>{children}</MediaStoreContext.Provider>;
}

function useMediaStore(): MediaStore {
    return useContext(MediaStoreContext);
}
```

---

## Migration strategy

### Step 1 — Add `MediaRepository` alongside existing DB code
- No behavioral changes. Just centralize all DB queries into one class.
- Existing sub-hooks continue to work.

### Step 2 — Add `MediaStore` + domain classes
- Instantiate from the same data the current context provides.
- Mount `MediaStoreProvider` inside existing `MediaProvider`.
- No consumers yet — prove it works with a console diff.

### Step 3 — Write bridge hooks (`useAlbum`, `useVideo`, etc.)
- Place alongside existing `useMedia()`.
- Consumers opt in one at a time.

### Step 4 — Incrementally migrate consumers
- Start with leaf components (`VideoItem`, `AlbumItem`, `Header`).
- Replace `const { selectedIds, toggleSelection } = useMedia()` with
  `const album = useAlbum(id)` + `album.title`.
- Remove fields from `MediaContextType` as they're no longer destructured.

### Step 5 — Remove `MediaProvider` once no consumers remain
- Sub-hooks like `useMediaExport` become plain service classes that
  receive `MediaRepository` directly.
- The `MediaProvider` disappears entirely.

---

## Granular subscription — re-render boundaries

| Component | Subscribes to | Re-renders when |
|---|---|---|
| `VideoItem` | `video.id` | That video's progress, title, thumbnail, etc. |
| `AlbumItem` | `album.id` | That album's sort, filter, thumbnail |
| `AlbumVideos` | `videos:{albumId}` (list) + each `video.id` | A video is added/removed, or any video's title/thumbnail changes |
| `LoadingPopup` | `loading-task` | Loading task state (unrelated to video/album) |
| `Header.SelectionMode` | `selection` | Selection mode toggled (unrelated to media entities) |

No component ever re-renders because a *different* album's sort changed, or because the sync ticked a progress on an unrelated video.

---

## File layout

```
hooks/
  MediaStore.ts        — MediaStore class
  MediaRepository.ts   — MediaRepository class
  domain/
    Album.ts           — Album domain class
    Video.ts           — Video domain class
    LoadingTask.ts     — LoadingTask service class
  bridge/
    useAlbum.ts        — useSyncExternalStore hooks
    useVideo.ts
    useAlbums.ts
    useAlbumVideos.ts
    useStore.ts        — store context + accessor
    useMediaStore.ts   — legacy adapter (return album/video from old context shape)
  legacy/
    useMedia.tsx       — stubbed to delegate to store, eventually removed
    useMedia*.ts       — migrated to plain services or deleted
```

---

## Trade-offs summary

| Concern | Current monolithic context | Domain model + granular store |
|---|---|---|
| Re-render scope | All consumers on any change | Only subscribers to the changed entity |
| Discoverability | Must know `useMedia()` fields exist | `album.` + IDE autocomplete shows everything |
| Side-effects | Implicit in sub-hook composition | Explicit in setters or centralized middleware |
| Testability | Needs React render harness | Instantiate store + repo, no React needed |
| Migration effort | Baseline | Medium — incremental per component |
| Boilerplate | Low (one big file) | Medium — more files, more structure |
