const { withAppBuildGradle, withGradleProperties } = require("expo/config-plugins");

/**
 * Modern Config Plugin to manage Android-specific build properties (NDK, Kotlin, and ABI).
 * Renamed to .js to ensure compatibility with Node.js during the prebuild process
 * without requiring additional TypeScript transpilers for the config context.
 */
const withAndroidNativeConfig = (config) => {
    // 1. Update gradle.properties for Kotlin Version and Architecture (ABI) filters
    config = withGradleProperties(config, (config) => {
        // Remove existing definitions to ensure our specific values take precedence
        config.modResults = config.modResults.filter(
            (item) =>
                item.type !== "property" || (item.key !== "android.kotlinVersion" && item.key !== "reactNativeArchitectures"),
        );

        // Inject modern build properties
        config.modResults.push(
            { type: "property", key: "android.kotlinVersion", value: "2.0.20" },
            { type: "property", key: "reactNativeArchitectures", value: "arm64-v8a" },
        );

        return config;
    });

    // 2. Explicitly set ndkVersion in the app/build.gradle file
    config = withAppBuildGradle(config, (config) => {
        const ndkVersion = "27.1.12297006";

        if (config.modResults.contents.includes("ndkVersion")) {
            // Replace existing ndkVersion assignment
            config.modResults.contents = config.modResults.contents.replace(/ndkVersion\s+.+/, `ndkVersion "${ndkVersion}"`);
        } else {
            // Fallback: inject into the android {} block if missing
            config.modResults.contents = config.modResults.contents.replace(/android\s*\{/, `android {\n    ndkVersion "${ndkVersion}"`);
        }

        return config;
    });

    return config;
};

module.exports = withAndroidNativeConfig;
