const { execSync } = require('child_process');
const path = require('path');
const os = require('os');

function run(command) {
    console.log(`> ${command}`);
    execSync(command, { stdio: 'inherit' });
}

console.log('Building APK...');
const isWin = os.platform() === 'win32';
const gradlew = isWin ? '.\\gradlew' : './gradlew';
run(`cd android && ${gradlew} assembleRelease`);

const now = new Date();
const pad = (n) => String(n).padStart(2, '0');
const dateStr = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;

console.log('Pushing to device...');
const apkPath = path.join('android', 'app', 'build', 'outputs', 'apk', 'release', 'app-release.apk');
const remotePath = `/storage/emulated/0/Test APKs/video-player-${dateStr}.apk`;

run(`adb shell "mkdir -p '/storage/emulated/0/Test APKs'"`);
run(`adb push "${apkPath}" "${remotePath}"`);
console.log('Done!');
