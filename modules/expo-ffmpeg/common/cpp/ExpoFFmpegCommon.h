#pragma once

#include <jni.h>
#include <string>
#include <android/log.h>
#include <vector>
#include <algorithm>
#include <chrono>
#include <random>

extern "C" {
#include <libavformat/avformat.h>
#include <libavcodec/avcodec.h>
#include <libavutil/imgutils.h>
#include <libavutil/error.h>
#include <libswscale/swscale.h>
}

#define LOG_TAG "ExpoFFmpeg"
#define LOGE(...) __android_log_print(ANDROID_LOG_ERROR, LOG_TAG, __VA_ARGS__)

extern std::string g_last_clip_error;
extern double g_clip_progress;

inline std::string ffmpegErrorToString(int errnum) {
    char errbuf[AV_ERROR_MAX_STRING_SIZE];
    av_strerror(errnum, errbuf, sizeof(errbuf));
    return std::string(errbuf);
}

inline void setLastClipError(const std::string &message) {
    g_last_clip_error = message;
    LOGE("%s", message.c_str());
}
