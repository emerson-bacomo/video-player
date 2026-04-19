export const normalizeClipDestination = (rawPath: string): string | null => {
    const input = (rawPath || "").trim();
    if (!input) return null;

    if (input.startsWith("/")) {
        return input;
    }

    if (input.startsWith("file://")) {
        return decodeURIComponent(input.replace(/^file:\/\//, ""));
    }

    if (!input.startsWith("content://")) {
        return null;
    }

    // Android SAF tree URI, e.g.:
    // content://com.android.externalstorage.documents/tree/primary%3AMovies
    const treePrefix = "content://com.android.externalstorage.documents/tree/";
    if (!input.startsWith(treePrefix)) {
        return null;
    }

    const encodedDocId = input.slice(treePrefix.length).split("/")[0];
    if (!encodedDocId) return null;

    const docId = decodeURIComponent(encodedDocId); // e.g. "primary:Movies/Sub"
    const colonIndex = docId.indexOf(":");
    if (colonIndex === -1) return null;

    const volume = docId.slice(0, colonIndex);
    const relativePath = docId.slice(colonIndex + 1).replace(/^\/+/, "");

    if (volume === "primary") {
        return relativePath ? `/storage/emulated/0/${relativePath}` : "/storage/emulated/0";
    }

    return relativePath ? `/storage/${volume}/${relativePath}` : `/storage/${volume}`;
};

