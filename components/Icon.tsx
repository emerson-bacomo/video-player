import { LucideIcon, LucideProps } from "lucide-react-native";
import { cssInterop } from "nativewind";
import React from "react";

/**
 * Utility to register a Lucide icon with NativeWind's CSS interop.
 * This allows using 'className' to set 'color', 'fill', and 'strokeWidth'.
 */
export function interopIcon(icon: LucideIcon) {
    cssInterop(icon, {
        className: {
            target: "style",
            nativeStyleToProp: {
                color: true,
                fill: true,
                strokeWidth: true,
            } as any,
        },
    });
    return icon;
}

interface IconProps extends LucideProps {
    icon: LucideIcon;
    className?: string;
}

/**
 * A wrapper component that handles the interop automatically for a given icon.
 * Note: cssInterop is a side-effect, so this component registers the icon type
 * the first time it is used.
 */
const registeredIcons = new Set<LucideIcon>();

export const Icon = ({ icon: LucideIconComponent, ...props }: IconProps) => {
    if (!registeredIcons.has(LucideIconComponent)) {
        interopIcon(LucideIconComponent);
        registeredIcons.add(LucideIconComponent);
    }

    return <LucideIconComponent {...props} />;
};
