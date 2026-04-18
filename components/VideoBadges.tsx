import React from "react";
import { Text, View } from "react-native";
import { extractEpisode, extractSeason } from "../utils/videoUtils";
import { cn } from "@/lib/utils";

export const getSeasonColor = (season: number) => {
    // Stepping through the color wheel sequentially (45 degree intervals)
    // Generating a subtle colored border tint.
    const hue = ((season - 1) * 45) % 360;
    return `hsla(${hue}, 50%, 45%, 0.7)`;
};

interface VideoBadgesProps {
    title: string;
    badgeClassName?: string;
    textClassName?: string;
}

export const VideoBadges = ({ title, badgeClassName, textClassName }: VideoBadgesProps) => {
    const episodeNum = extractEpisode(title);
    const seasonNum = extractSeason(title);

    if (seasonNum === -1 && episodeNum === -1) {
        return null;
    }

    const defaultBadgeClass = "bg-black/60 h-[18px] px-2 rounded-full justify-center items-center backdrop-blur-md border";
    const defaultTextClass = "text-white text-[9px] font-bold uppercase tracking-wider";

    return (
        <View className="flex-row gap-1.5 items-center">
            {seasonNum !== -1 && (
                <View
                    pointerEvents="none"
                    className={cn(defaultBadgeClass, badgeClassName)}
                    style={{ borderColor: getSeasonColor(seasonNum) }}
                >
                    <Text className={cn(defaultTextClass, textClassName)}>S{seasonNum}</Text>
                </View>
            )}
            {episodeNum !== -1 && (
                <View
                    pointerEvents="none"
                    className={cn(defaultBadgeClass, "border-white/20", badgeClassName)}
                >
                    <Text className={cn(defaultTextClass, textClassName)}>EP {episodeNum}</Text>
                </View>
            )}
        </View>
    );
};
