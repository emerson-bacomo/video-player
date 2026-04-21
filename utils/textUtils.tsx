import React from "react";
import { Text } from "react-native";

/**
 * Renders text with a highlighted query string
 */
export const renderHighlight = (
    text: string,
    query: string | undefined,
    highlightColor: string,
    noEllipsis: boolean = false
) => {
    if (!text) return null;
    if (!query || !query.trim()) {
        return (
            <Text className="text-text text-sm font-semibold mb-0.5" numberOfLines={noEllipsis ? 0 : 1}>
                {text}
            </Text>
        );
    }

    const segments = text.split(new RegExp(`(${query})`, "gi"));

    return (
        <Text className="text-text text-sm font-semibold mb-0.5" numberOfLines={noEllipsis ? 0 : 1}>
            {segments.map((part, i) =>
                part.toLowerCase() === query.toLowerCase() ? (
                    <Text key={i} style={{ color: highlightColor }}>
                        {part}
                    </Text>
                ) : (
                    part
                )
            )}
        </Text>
    );
};

/**
 * Inserts zero-width spaces after slashes to allow proper word breaking for paths
 */
export const breakPath = (path: string) => {
    if (!path) return "";
    return path.replace(/\//g, "/\u200B");
};
