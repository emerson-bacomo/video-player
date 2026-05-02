const { withAppBuildGradle, withGradleProperties } = require("expo/config-plugins");

// --- User-Definable Configuration ---
// Easily change these values to match your local environment and build requirements
const USER_CONFIG = {
    KOTLIN_VERSION: "2.0.20",
    RN_ARCHITECTURES: "arm64-v8a",
    JAVA_HOME: "C:\\\\Program Files\\\\Eclipse Adoptium\\\\jdk-17.0.17.10-hotspot",
    NDK_VERSION: "27.1.12297006",
};
// ------------------------------------

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
            { type: "property", key: "android.kotlinVersion", value: USER_CONFIG.KOTLIN_VERSION },
            { type: "property", key: "reactNativeArchitectures", value: USER_CONFIG.RN_ARCHITECTURES },
            { type: "property", key: "org.gradle.java.home", value: USER_CONFIG.JAVA_HOME },
        );

        return config;
    });

    // 2. Explicitly set ndkVersion in the app/build.gradle file
    config = withAppBuildGradle(config, (config) => {
        const ndkVersion = USER_CONFIG.NDK_VERSION;

        if (config.modResults.contents.includes("ndkVersion")) {
            // Replace existing ndkVersion assignment
            config.modResults.contents = config.modResults.contents.replace(/ndkVersion\s+.+/, `ndkVersion "${ndkVersion}"`);
        } else {
            // Fallback: inject into the android {} block if missing
            config.modResults.contents = config.modResults.contents.replace(
                /android\s*\{/,
                `android {\n    ndkVersion "${ndkVersion}"`,
            );
        }

        // 3. Add applicationIdSuffix ".debug" and prefix for display name for debug builds
        const appName = (config.name || "App").replace(/"/g, '\\"');
        const hasDebugSuffix = config.modResults.contents.includes('applicationIdSuffix ".debug"');
        const hasDebugName = config.modResults.contents.includes('resValue "string", "app_name"');

        if (!hasDebugSuffix || !hasDebugName) {
            const debugEntries = [];
            if (!hasDebugSuffix) debugEntries.push('            applicationIdSuffix ".debug"');
            if (!hasDebugName) debugEntries.push(`            resValue "string", "app_name", "[D] ${appName}"`);

            const debugConfig = debugEntries.join("\n");

            // Use a more specific regex to target debug { inside buildTypes {
            // This avoids matching debug { inside signingConfigs {
            const buildTypesPattern = /buildTypes\s*\{[\s\S]*?debug\s*\{/;
            if (buildTypesPattern.test(config.modResults.contents)) {
                config.modResults.contents = config.modResults.contents.replace(
                    buildTypesPattern,
                    (match) => `${match}\n${debugConfig}`,
                );
            } else if (config.modResults.contents.includes("buildTypes {")) {
                // If buildTypes exists but debug { is missing inside it
                config.modResults.contents = config.modResults.contents.replace(
                    /buildTypes\s*\{/,
                    `buildTypes {\n        debug {\n${debugConfig}\n        }`,
                );
            }
        }

        return config;
    });

    return config;
};

module.exports = withAndroidNativeConfig;
