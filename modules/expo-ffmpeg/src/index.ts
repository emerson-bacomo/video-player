import { requireNativeModule } from "expo-modules-core";

interface ExpoFFmpegModule {
    generateThumbnail(videoPath: string, outPath: string): Promise<boolean>;
    clipVideo(
        videoPath: string,
        outPath: string,
        segments: { start: number; end: number }[],
    options: {
        resolution?: string;
        format?: string;
        removeAudio?: boolean;
        crf?: number;
        transitionDuration?: number;
        transitionStyle?: string;
        preset?: string;
    },
  ): Promise<boolean>;
    getLastClipError(): Promise<string>;
    scanFile(filePath: string): Promise<string | null>;
}

const module = requireNativeModule<ExpoFFmpegModule>("ExpoFFmpeg");

export default module;
