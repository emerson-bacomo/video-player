#include <jni.h>
#include <string>
#include <android/log.h>
#include <vector>
#include <random>
#include <chrono>

extern "C" {
#include <libavformat/avformat.h>
#include <libavcodec/avcodec.h>
#include <libavutil/imgutils.h>
#include <libswscale/swscale.h>
}

#define LOG_TAG "ExpoFFmpeg"
#define LOGE(...) __android_log_print(ANDROID_LOG_ERROR, LOG_TAG, __VA_ARGS__)

extern "C"
JNIEXPORT jintArray JNICALL
Java_expo_modules_ffmpeg_ExpoFFmpegModule_nativeGenerateThumbnail(
    JNIEnv *env, jobject thiz, jstring video_path) {

    const char *path = env->GetStringUTFChars(video_path, nullptr);

    av_log_set_level(AV_LOG_ERROR);

    AVFormatContext *fmt = nullptr;
    if (avformat_open_input(&fmt, path, nullptr, nullptr) < 0) {
        env->ReleaseStringUTFChars(video_path, path);
        return nullptr;
    }

    if (avformat_find_stream_info(fmt, nullptr) < 0) {
        avformat_close_input(&fmt);
        return nullptr;
    }

    int vstream = av_find_best_stream(fmt, AVMEDIA_TYPE_VIDEO, -1, -1, nullptr, 0);
    if (vstream < 0) {
        avformat_close_input(&fmt);
        return nullptr;
    }

    AVStream *vs = fmt->streams[vstream];
    const AVCodec *codec = avcodec_find_decoder(vs->codecpar->codec_id);
    if (!codec) {
        avformat_close_input(&fmt);
        return nullptr;
    }

    AVCodecContext *ctx = avcodec_alloc_context3(codec);
    avcodec_parameters_to_context(ctx, vs->codecpar);
    if (avcodec_open2(ctx, codec, nullptr) < 0) {
        avcodec_free_context(&ctx);
        avformat_close_input(&fmt);
        return nullptr;
    }

    // True Randomness: Combine high-res timestamp with random_device for seeding
    auto seed = std::chrono::system_clock::now().time_since_epoch().count() ^ std::random_device{}();
    std::mt19937 gen(static_cast<unsigned int>(seed));
    std::uniform_real_distribution<> dis(0.15, 0.75);
    double factor = dis(gen);
    
    double durationSec = fmt->duration / static_cast<double>(AV_TIME_BASE);
    double ts = durationSec * factor; 
    av_seek_frame(fmt, -1, ts * AV_TIME_BASE, AVSEEK_FLAG_BACKWARD);
    avcodec_flush_buffers(ctx);

    AVFrame *frame = av_frame_alloc();
    AVPacket pkt;
    jintArray result = nullptr;

    int outW = 320;
    int outH = ctx->height * outW / ctx->width;

    SwsContext *sws = sws_getContext(
        ctx->width, ctx->height, ctx->pix_fmt,
        outW, outH, AV_PIX_FMT_RGBA,
        SWS_BILINEAR, nullptr, nullptr, nullptr);

    uint8_t *rgbaBuf = static_cast<uint8_t*>(av_malloc(av_image_get_buffer_size(AV_PIX_FMT_RGBA, outW, outH, 1)));
    AVFrame *rgba = av_frame_alloc();
    av_image_fill_arrays(rgba->data, rgba->linesize, rgbaBuf, AV_PIX_FMT_RGBA, outW, outH, 1);

    while (av_read_frame(fmt, &pkt) >= 0) {
        if (pkt.stream_index == vstream) {
            if (avcodec_send_packet(ctx, &pkt) == 0) {
                if (avcodec_receive_frame(ctx, frame) == 0) {
                    sws_scale(sws, frame->data, frame->linesize, 0, ctx->height, rgba->data, rgba->linesize);

                    // Create jintArray for the pixels (ARGB_8888 for Bitmap)
                    int pixelCount = outW * outH;
                    result = env->NewIntArray(pixelCount + 2); // First two elements are width and height
                    jint *elements = env->GetIntArrayElements(result, nullptr);
                    elements[0] = outW;
                    elements[1] = outH;
                    
                    // Copy RGBA to ARGB
                    for (int i = 0; i < pixelCount; i++) {
                        uint8_t r = rgbaBuf[i * 4 + 0];
                        uint8_t g = rgbaBuf[i * 4 + 1];
                        uint8_t b = rgbaBuf[i * 4 + 2];
                        uint8_t a = rgbaBuf[i * 4 + 3];
                        elements[i + 2] = (a << 24) | (r << 16) | (g << 8) | b;
                    }

                    env->ReleaseIntArrayElements(result, elements, 0);
                    break;
                }
            }
        }
        av_packet_unref(&pkt);
    }

    avformat_close_input(&fmt);
    avcodec_free_context(&ctx);
    av_frame_free(&frame);
    av_frame_free(&rgba);
    av_free(rgbaBuf);
    sws_freeContext(sws);

    env->ReleaseStringUTFChars(video_path, path);

    return result;
}
