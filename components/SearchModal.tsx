import React, { useEffect, useMemo, useRef, useState } from "react";
import { FlatList, Modal, Text, TextInput, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { router } from "expo-router";
import { ChevronLeft, Search, X } from "lucide-react-native";

import { useTheme } from "@/context/ThemeContext";
import { useMedia, VideoMedia } from "@/hooks/useMedia";
import { Icon } from "./Icon";
import { VideoItem } from "./VideoItem";
import { VideoItemDetailsModal } from "./VideoItemDetailsModal";

export const SearchModal = () => {
    const { isSearchVisible, setIsSearchVisible, searchMedia } = useMedia();
    const { colors } = useTheme();
    const insets = useSafeAreaInsets();
    const inputRef = useRef<TextInput>(null);

    const [query, setQuery] = useState("");
    const [debouncedQuery, setDebouncedQuery] = useState("");
    const [results, setResults] = useState<VideoMedia[]>([]);
    const [selectedVideoId, setSelectedVideoId] = useState<string | null>(null);

    const selectedVideo = useMemo(() => results.find((v) => v.id === selectedVideoId), [results, selectedVideoId]);

    const handlePlayVideo = (item: any) => {
        setSelectedVideoId(null);
        setIsSearchVisible(false);
        router.push({
            pathname: "/player",
            params: {
                uri: item.uri,
                title: item.displayName,
                videoId: item.id,
                resumeMs: item.lastPlayedMs !== -1 ? item.lastPlayedMs : 0,
            },
        });
    };

    // Cleanup state when hidden
    useEffect(() => {
        if (!isSearchVisible) {
            setQuery("");
            setDebouncedQuery("");
            setResults([]);
        } else {
            // Auto focus keyboard
            setTimeout(() => {
                inputRef.current?.focus();
            }, 100);
        }
    }, [isSearchVisible]);

    useEffect(() => {
        const timer = setTimeout(() => setDebouncedQuery(query), 300);
        return () => clearTimeout(timer);
    }, [query]);

    useEffect(() => {
        if (isSearchVisible && debouncedQuery.trim()) {
            setResults(searchMedia(debouncedQuery));
        } else {
            setResults([]);
        }
    }, [debouncedQuery, isSearchVisible]);

    if (!isSearchVisible) return null;

    return (
        <Modal
            visible={isSearchVisible}
            animationType="fade"
            transparent={false}
            onRequestClose={() => setIsSearchVisible(false)}
        >
            <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: insets.top }}>
                <StatusBar style="light" />

                {/* Search Header */}
                <View className="flex-row items-center px-4 py-3 gap-3 border-b border-border shadow-sm">
                    <TouchableOpacity
                        onPress={() => setIsSearchVisible(false)}
                        className="w-10 h-10 items-center justify-center rounded-full"
                    >
                        <Icon icon={ChevronLeft} size={24} className="text-text" />
                    </TouchableOpacity>

                    <View className="flex-1 flex-row items-center bg-card rounded-2xl px-4 py-2.5 border border-border">
                        <Icon icon={Search} size={18} className="text-secondary mr-2" />
                        <TextInput
                            ref={inputRef}
                            autoFocus
                            placeholder="Find videos across folders..."
                            placeholderTextColor={colors.secondary}
                            value={query}
                            onChangeText={setQuery}
                            className="flex-1 text-text text-base p-0"
                            style={{ height: 32 }}
                        />
                        {query.length > 0 && (
                            <TouchableOpacity onPress={() => setQuery("")} className="p-1">
                                <Icon icon={X} size={18} className="text-secondary" />
                            </TouchableOpacity>
                        )}
                    </View>
                </View>

                {/* Results */}
                <FlatList
                    data={results}
                    key={debouncedQuery ? "results-active" : "results-empty"}
                    keyExtractor={(item) => item.id}
                    numColumns={2}
                    columnWrapperStyle={{ justifyContent: "space-between", paddingHorizontal: 16 }}
                    renderItem={({ item }) => (
                        <VideoItem
                            item={item}
                            setSelectedVideoId={setSelectedVideoId}
                            searchQuery={debouncedQuery}
                            noEllipsis={true}
                        />
                    )}
                    contentContainerStyle={{ paddingTop: 20, paddingBottom: 60 }}
                    ListEmptyComponent={
                        query.trim() ? (
                            <View className="items-center justify-center pt-20 px-10">
                                <Text className="text-secondary text-lg text-center opacity-70">
                                    No videos found for "{query}"
                                </Text>
                            </View>
                        ) : (
                            <View className="items-center justify-center pt-24 px-10 opacity-30">
                                <Icon icon={Search} size={80} className="text-border mb-6" />
                                <Text className="text-secondary text-lg font-medium text-center">
                                    Search for videos, episodes, or series
                                </Text>
                                <Text className="text-zinc-500 text-sm text-center mt-2 px-6">
                                    Quickly find any content across all your media folders
                                </Text>
                            </View>
                        )
                    }
                />

                <VideoItemDetailsModal
                    visible={!!selectedVideoId}
                    video={selectedVideo}
                    onClose={() => setSelectedVideoId(null)}
                    onPlay={handlePlayVideo}
                />
            </View>
        </Modal>
    );
};
