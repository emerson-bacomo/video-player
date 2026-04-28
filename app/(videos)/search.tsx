import { Icon } from "@/components/Icon";
import { VideoItem } from "@/components/VideoItem";
import { VideoItemDetailsModal } from "@/components/VideoItemDetailsModal";
import { useTheme } from "@/context/ThemeContext";
import { useMedia } from "@/hooks/useMedia";
import { useSafeNavigation } from "@/hooks/useSafeNavigation";
import { VideoMedia } from "@/types/useMedia";
import { StatusBar } from "expo-status-bar";
import { ChevronLeft, Search, X } from "lucide-react-native";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { FlatList, Text, TextInput, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function SearchPage() {
    const { searchMedia } = useMedia();
    const { colors } = useTheme();
    const insets = useSafeAreaInsets();
    const inputRef = useRef<TextInput>(null);
    const { safePush, safeBack } = useSafeNavigation();

    const [query, setQuery] = useState("");
    const [debouncedQuery, setDebouncedQuery] = useState("");
    const [results, setResults] = useState<VideoMedia[]>([]);
    const [selectedVideoId, setSelectedVideoId] = useState<string | null>(null);

    const selectedVideo = useMemo(() => results.find((v) => v.id === selectedVideoId) || null, [results, selectedVideoId]);

    const displayResults = useMemo(() => {
        const result = [...results];
        if (result.length > 0 && result.length % 2 !== 0) {
            result.push({ id: "spacer", isSpacer: true } as any);
        }
        return result;
    }, [results]);

    const handlePlayVideo = (item: any) => {
        setSelectedVideoId(null);
        safePush({
            pathname: "/player",
            params: {
                videoId: item.id,
                albumId: item.albumId,
                initialTime: (item.lastPlayedSec || 0).toString(),
            },
        });
    };

    useEffect(() => {
        const timer = setTimeout(() => setDebouncedQuery(query), 300);
        return () => clearTimeout(timer);
    }, [query]);

    useEffect(() => {
        if (debouncedQuery.trim()) {
            setResults(searchMedia(debouncedQuery));
        } else {
            setResults([]);
        }
    }, [debouncedQuery, searchMedia]);

    useEffect(() => {
        const timer = setTimeout(() => {
            inputRef.current?.focus();
        }, 100);
        return () => clearTimeout(timer);
    }, []);

    return (
        <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: insets.top }}>
            <StatusBar style="light" />

            {/* Search Header */}
            <View className="flex-row items-center px-4 py-3 gap-3 border-b border-border shadow-sm">
                <TouchableOpacity onPress={safeBack} className="w-10 h-10 items-center justify-center rounded-full">
                    <Icon icon={ChevronLeft} size={24} className="text-text" />
                </TouchableOpacity>

                <View className="flex-1 flex-row items-center bg-card rounded-2xl px-4 py-2.5 border border-border">
                    <Icon icon={Search} size={18} className="text-secondary mr-2" />
                    <TextInput
                        ref={inputRef}
                        placeholder="Find videos across albums..."
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
                data={displayResults}
                key={debouncedQuery ? "results-active" : "results-empty"}
                keyExtractor={(item) => item.id}
                numColumns={2}
                renderItem={({ item }: { item: any }) => {
                    if (item.isSpacer) return <View className="flex-1 mx-2 mb-6" />;
                    return (
                        <VideoItem
                            item={item}
                            onInfoPress={(v) => setSelectedVideoId(v.id)}
                            searchQuery={debouncedQuery}
                            noEllipsis={true}
                            onPress={handlePlayVideo}
                        />
                    );
                }}
                contentContainerStyle={{ paddingHorizontal: 8, paddingTop: 20, paddingBottom: 60 }}
                ListEmptyComponent={
                    query.trim() ? (
                        <View className="items-center justify-center pt-20 px-10">
                            <Text className="text-secondary text-lg text-center opacity-70">No videos found for "{query}"</Text>
                        </View>
                    ) : (
                        <View className="items-center justify-center pt-24 px-10 opacity-70">
                            <Icon icon={Search} size={80} className="text-border mb-6" />
                            <Text className="text-secondary text-lg font-medium text-center">
                                Search for videos, episodes, or series
                            </Text>
                            <Text className="text-zinc-500 text-sm text-center mt-2 px-6">
                                Quickly find any content across all your media albums
                            </Text>
                        </View>
                    )
                }
            />

            <VideoItemDetailsModal visible={!!selectedVideoId} video={selectedVideo} onClose={() => setSelectedVideoId(null)} />
        </View>
    );
}
