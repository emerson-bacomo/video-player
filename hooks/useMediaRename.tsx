import { Album } from "@/types/useMedia";
import { getAllVideosDb, getVideosForAlbumDb, renameAlbumDb, renameVideoDb, saveVideosDb } from "@/utils/db";
import * as FileSystem from "expo-file-system/legacy";
import { useCallback } from "react";

export const useMediaRename = (
    setAlbums: React.Dispatch<React.SetStateAction<Album[]>>,
    compareByAlbumSort: (a: Album, b: Album) => number,
) => {
    const renameVideo = useCallback(async (videoId: string, newName: string) => {
        // 1. Rename in DB
        renameVideoDb(videoId, newName);

        // 2. Physical rename (best effort)
        const video = getAllVideosDb().find((v) => v.id === videoId);
        if (video && video.uri && video.uri.startsWith("file://")) {
            try {
                const oldPath = video.uri;
                const extension = oldPath.substring(oldPath.lastIndexOf("."));
                const parentPath = oldPath.substring(0, oldPath.lastIndexOf("/"));
                const newPath = `${parentPath}/${newName}${extension}`;

                console.log(`[Media] Physically renaming file from ${oldPath} to ${newPath}`);
                await FileSystem.moveAsync({
                    from: oldPath,
                    to: newPath,
                });
            } catch (e) {
                console.error("[Media] Physical file rename failed:", e);
            }
        }
    }, []);

    const renameAlbum = useCallback(
        async (albumId: string, newName: string) => {
            // 1. Rename in DB
            renameAlbumDb(albumId, newName);

            // 2. Physical rename (best effort)
            const albumVids = getVideosForAlbumDb(albumId);
            if (albumVids.length > 0) {
                const firstVid = albumVids[0];
                if (firstVid.uri && firstVid.uri.startsWith("file://")) {
                    try {
                        const oldPath = firstVid.uri;
                        const pathParts = oldPath.split("/");
                        pathParts.pop(); // remove filename
                        const dirPath = pathParts.join("/");
                        pathParts.pop(); // remove last dir name to get parent
                        const parentPath = pathParts.join("/");
                        const newDirPath = `${parentPath}/${newName}`;

                        if (dirPath !== newDirPath) {
                            console.log(`[Media] Physically renaming directory from ${dirPath} to ${newDirPath}`);
                            await FileSystem.moveAsync({
                                from: dirPath,
                                to: newDirPath,
                            });

                            // 3. Update all videos in this album to their new paths to maintain consistency
                            const updatedVideos = albumVids.map((v) => {
                                const filename = v.uri.split("/").pop();
                                const newVUri = `${newDirPath}/${filename}`;
                                return { ...v, uri: newVUri };
                            });

                            saveVideosDb(albumId, updatedVideos);
                        }
                    } catch (e) {
                        console.error("[Media] Physical directory rename failed:", e);
                    }
                }
            }

            setAlbums((prev) => {
                const index = prev.findIndex((a) => a.id === albumId);
                if (index === -1) return prev;
                const next = [...prev];
                next[index] = { ...next[index], title: newName };
                return next.sort((a, b) => compareByAlbumSort(a, b));
            });
        },
        [setAlbums, compareByAlbumSort],
    );

    return {
        renameVideo,
        renameAlbum,
    };
};
