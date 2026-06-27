#include "ExpoFFmpegCommon.h"

extern "C"
JNIEXPORT jintArray JNICALL
Java_expo_modules_ffmpeg_ExpoFFmpegModule_nativeTakeScreenshot(
    JNIEnv *env, jobject thiz, jstring video_path, jdouble timestamp) {

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

    // Seek to exact timestamp
    int64_t target_ts = static_cast<int64_t>(timestamp * AV_TIME_BASE);
    av_seek_frame(fmt, -1, target_ts, AVSEEK_FLAG_BACKWARD);
    avcodec_flush_buffers(ctx);

    // Target in stream time base
    int64_t target_pts = av_rescale_q(target_ts, AV_TIME_BASE_Q, vs->time_base);

    AVFrame *frame = av_frame_alloc();
    AVFrame *best_frame = av_frame_alloc();
    AVPacket pkt;
    jintArray result = nullptr;

    int outW = ctx->width;
    int outH = ctx->height;

    SwsContext *sws = sws_getContext(
        ctx->width, ctx->height, ctx->pix_fmt,
        outW, outH, AV_PIX_FMT_RGBA,
        SWS_BILINEAR, nullptr, nullptr, nullptr);

    uint8_t *rgbaBuf = static_cast<uint8_t*>(av_malloc(av_image_get_buffer_size(AV_PIX_FMT_RGBA, outW, outH, 1)));
    AVFrame *rgba = av_frame_alloc();
    av_image_fill_arrays(rgba->data, rgba->linesize, rgbaBuf, AV_PIX_FMT_RGBA, outW, outH, 1);

    // Walk frames to find the one closest to target timestamp
    int64_t best_diff = INT64_MAX;
    bool found = false;

    while (av_read_frame(fmt, &pkt) >= 0) {
        if (pkt.stream_index == vstream) {
            if (avcodec_send_packet(ctx, &pkt) == 0) {
                while (avcodec_receive_frame(ctx, frame) == 0) {
                    int64_t diff = llabs(frame->pts - target_pts);
                    if (diff < best_diff) {
                        best_diff = diff;
                        av_frame_unref(best_frame);
                        av_frame_ref(best_frame, frame);
                        found = true;
                    }
                    if (frame->pts >= target_pts) break;
                }
            }
        }
        av_packet_unref(&pkt);
        if (found && best_frame->pts >= target_pts) break;
    }

    if (found) {
        sws_scale(sws, best_frame->data, best_frame->linesize, 0, ctx->height, rgba->data, rgba->linesize);

        // Calculate frame number from PTS and frame rate
        double fps = av_q2d(vs->avg_frame_rate);
        if (fps <= 0) {
            fps = av_q2d(vs->r_frame_rate);
        }
        if (fps <= 0) {
            fps = 30.0;
        }
        double pts_sec = best_frame->pts * av_q2d(vs->time_base);
        int frame_number = static_cast<int>(round(pts_sec * fps));

        // Create jintArray: [width, height, frameNumber, pixel_data...]
        int pixelCount = outW * outH;
        result = env->NewIntArray(pixelCount + 3);
        jint *elements = env->GetIntArrayElements(result, nullptr);
        elements[0] = outW;
        elements[1] = outH;
        elements[2] = frame_number;

        // Copy RGBA to ARGB
        for (int i = 0; i < pixelCount; i++) {
            uint8_t r = rgbaBuf[i * 4 + 0];
            uint8_t g = rgbaBuf[i * 4 + 1];
            uint8_t b = rgbaBuf[i * 4 + 2];
            uint8_t a = rgbaBuf[i * 4 + 3];
            elements[i + 3] = (a << 24) | (r << 16) | (g << 8) | b;
        }

        env->ReleaseIntArrayElements(result, elements, 0);
    }

    avformat_close_input(&fmt);
    avcodec_free_context(&ctx);
    av_frame_free(&frame);
    av_frame_free(&best_frame);
    av_frame_free(&rgba);
    av_free(rgbaBuf);
    sws_freeContext(sws);

    env->ReleaseStringUTFChars(video_path, path);

    return result;
}
