import { cn } from "../lib/utils";
import React from "react";
import { StyleSheet, View } from "react-native";

export const Skeleton = ({ className, style }: { className?: string; style?: any }) => (
    <View className={cn("bg-zinc-800/50 rounded-lg overflow-hidden", className)} style={style} />
);

const styles = StyleSheet.create({});
