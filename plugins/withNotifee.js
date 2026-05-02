const { withDangerousMod, withProjectBuildGradle, withAndroidManifest } = require("expo/config-plugins");
const path = require("path");
const fs = require("fs");

const withNotifee = (config) => {
    // 1. Add drawable icon
    config = withDangerousMod(config, [
        "android",
        async (config) => {
            const drawableDir = path.join(config.modRequest.platformProjectRoot, "app", "src", "main", "res", "drawable");

            fs.mkdirSync(drawableDir, { recursive: true });

            const filePath = path.join(drawableDir, "ic_notification.xml");

            if (!fs.existsSync(filePath)) {
                fs.writeFileSync(
                    filePath,
                    `<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="24dp"
    android:height="24dp"
    android:viewportWidth="24"
    android:viewportHeight="24">
    <path
        android:fillColor="#FFFFFF"
        android:pathData="M12,2C6.48,2 2,6.48 2,12s4.48,10 10,10 10,-4.48 10,-10S17.52,2 12,2z" />
</vector>`,
                );
            }

            return config;
        },
    ]);

    // 2. Inject Notifee Maven repo into Gradle
    config = withProjectBuildGradle(config, (config) => {
        if (!config.modResults.contents.includes("notifee/react-native/android/libs")) {
            config.modResults.contents = config.modResults.contents.replace(
                /allprojects\s*{\s*repositories\s*{/,
                `allprojects {
    repositories {
        maven { url "$rootDir/../node_modules/@notifee/react-native/android/libs" }`,
            );
        }

        return config;
    });

    // 3. Add Notifee Foreground Service to AndroidManifest.xml
    config = withAndroidManifest(config, (config) => {
        const androidManifest = config.modResults.manifest;
        const mainApplication = androidManifest.application[0];

        // Ensure we have a service array
        if (!mainApplication.service) {
            mainApplication.service = [];
        }

        // Check if our service is already there
        const hasService = mainApplication.service.some((s) => s.$["android:name"] === "app.notifee.core.ForegroundService");

        if (!hasService) {
            mainApplication.service.push({
                $: {
                    "android:name": "app.notifee.core.ForegroundService",
                    "android:foregroundServiceType": "dataSync",
                    "android:exported": "false",
                },
            });
            console.log("[withNotifee] Added Notifee foreground service to AndroidManifest.xml");
        } else {
            // Update existing service type if it's already there
            const service = mainApplication.service.find((s) => s.$["android:name"] === "app.notifee.core.ForegroundService");
            service.$["android:foregroundServiceType"] = "dataSync";
            console.log("[withNotifee] Updated Notifee foreground service type in AndroidManifest.xml");
        }

        return config;
    });

    return config;
};

module.exports = withNotifee;
