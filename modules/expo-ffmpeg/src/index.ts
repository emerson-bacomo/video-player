import { requireNativeModule } from 'expo-modules-core';

interface ExpoFFmpegModule {
  generateThumbnail(videoPath: string, outPath: string): Promise<boolean>;
}

const module = requireNativeModule<ExpoFFmpegModule>('ExpoFFmpeg');

export default module;
