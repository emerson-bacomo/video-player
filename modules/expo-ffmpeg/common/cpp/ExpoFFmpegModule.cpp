#include "ExpoFFmpegCommon.h"

// Define global state here
std::string g_last_clip_error;
double g_clip_progress = 0.0;

extern "C"
JNIEXPORT jstring JNICALL
Java_expo_modules_ffmpeg_ExpoFFmpegModule_nativeGetLastClipError(
    JNIEnv *env, jobject thiz) {
    return env->NewStringUTF(g_last_clip_error.c_str());
}

extern "C"
JNIEXPORT jdouble JNICALL
Java_expo_modules_ffmpeg_ExpoFFmpegModule_nativeGetClipProgress(
    JNIEnv *env, jobject thiz) {
    LOGE("Returning progress: %.2f", g_clip_progress);
    return g_clip_progress;
}