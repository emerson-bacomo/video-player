#include <jni.h>
#include <string>
#include <android/log.h>
#include <vector>
#include <random>
#include <chrono>
#include <sstream>

extern "C" {
#include <libavformat/avformat.h>
#include <libavcodec/avcodec.h>
#include <libavutil/imgutils.h>
#include <libavutil/error.h>
#include <libswscale/swscale.h>
}

#define LOG_TAG "ExpoFFmpeg"
#define LOGE(...) __android_log_print(ANDROID_LOG_ERROR, LOG_TAG, __VA_ARGS__)

static std::string g_last_clip_error;

static std::string ffmpegErrorToString(int errnum) {
    char errbuf[AV_ERROR_MAX_STRING_SIZE];
    av_strerror(errnum, errbuf, sizeof(errbuf));
    return std::string(errbuf);
}

static void setLastClipError(const std::string &message) {
    g_last_clip_error = message;
    LOGE("%s", message.c_str());
}

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

#include <vector>

extern "C"
JNIEXPORT jboolean JNICALL
Java_expo_modules_ffmpeg_ExpoFFmpegModule_nativeClipVideo(
    JNIEnv *env, jobject thiz,
    jstring video_path, jstring out_path,
    jdoubleArray segments) {

    const char *in_filename = env->GetStringUTFChars(video_path, nullptr);
    const char *out_filename = env->GetStringUTFChars(out_path, nullptr);
    jdouble *seg = env->GetDoubleArrayElements(segments, nullptr);

    double start_sec = seg[0];
    double end_sec   = seg[1];

    AVFormatContext *ifmt_ctx = nullptr;
    AVFormatContext *ofmt_ctx = nullptr;
    AVPacket *pkt = av_packet_alloc();
    
    int ret = 0;
    std::vector<int> stream_mapping;
    std::vector<int64_t> start_pts;

    // ================= INPUT =================
    if (avformat_open_input(&ifmt_ctx, in_filename, nullptr, nullptr) < 0)
        goto cleanup;

    if (avformat_find_stream_info(ifmt_ctx, nullptr) < 0)
        goto cleanup;

    // ================= OUTPUT =================
    avformat_alloc_output_context2(&ofmt_ctx, nullptr, nullptr, out_filename);
    if (!ofmt_ctx) goto cleanup;

    stream_mapping.resize(ifmt_ctx->nb_streams, -1);
    start_pts.resize(ifmt_ctx->nb_streams, AV_NOPTS_VALUE);

    // Map both Audio and Video streams to the output file
    for (int i = 0; i < ifmt_ctx->nb_streams; i++) {
        AVStream *in_stream = ifmt_ctx->streams[i];
        AVCodecParameters *in_codecpar = in_stream->codecpar;

        if (in_codecpar->codec_type != AVMEDIA_TYPE_AUDIO &&
            in_codecpar->codec_type != AVMEDIA_TYPE_VIDEO) {
            continue; // Skip subtitles/data streams
        }

        AVStream *out_stream = avformat_new_stream(ofmt_ctx, nullptr);
        if (!out_stream) goto cleanup;

        // COPY the codec parameters (No decoding/encoding needed!)
        if (avcodec_parameters_copy(out_stream->codecpar, in_codecpar) < 0)
            goto cleanup;
        
        out_stream->codecpar->codec_tag = 0;
        stream_mapping[i] = out_stream->index;
    }

    if (!(ofmt_ctx->oformat->flags & AVFMT_NOFILE)) {
        if (avio_open(&ofmt_ctx->pb, out_filename, AVIO_FLAG_WRITE) < 0)
            goto cleanup;
    }

    if (avformat_write_header(ofmt_ctx, nullptr) < 0)
        goto cleanup;

// ================= SEEK =================
    // Seek to the closest keyframe before the start time
    av_seek_frame(ifmt_ctx, -1, start_sec * AV_TIME_BASE, AVSEEK_FLAG_BACKWARD);

    // ================= LOOP =================
    while (av_read_frame(ifmt_ctx, pkt) >= 0) {
        AVStream *in_stream = ifmt_ctx->streams[pkt->stream_index];
        
        // Skip unmapped streams
        if (pkt->stream_index >= ifmt_ctx->nb_streams || stream_mapping[pkt->stream_index] < 0) {
            av_packet_unref(pkt);
            continue;
        }

        double pts_sec = pkt->pts * av_q2d(in_stream->time_base);
        
        // Stop processing if we exceed the end time
        if (pts_sec > end_sec) {
            av_packet_unref(pkt);
            break; 
        }

        // Capture the very first PTS for this stream so we can zero-base the timestamps.
        // Because we removed the skip logic, this will naturally be the Keyframe's PTS!
        if (start_pts[pkt->stream_index] == AV_NOPTS_VALUE) {
            start_pts[pkt->stream_index] = pkt->pts;
        }

        // 1. Shift the timestamp so the clip starts at zero
        if (pkt->pts != AV_NOPTS_VALUE) pkt->pts -= start_pts[pkt->stream_index];
        if (pkt->dts != AV_NOPTS_VALUE) pkt->dts -= start_pts[pkt->stream_index];

        // 2. Rescale the timestamp to the new output stream's time base
        AVStream *out_stream = ofmt_ctx->streams[stream_mapping[pkt->stream_index]];
        av_packet_rescale_ts(pkt, in_stream->time_base, out_stream->time_base);
        pkt->stream_index = stream_mapping[pkt->stream_index];

        // Write the frame directly to the output container
        av_interleaved_write_frame(ofmt_ctx, pkt);
        av_packet_unref(pkt);
    }

    av_write_trailer(ofmt_ctx);

cleanup:
    if (pkt) av_packet_free(&pkt);

    if (ifmt_ctx) avformat_close_input(&ifmt_ctx);
    if (ofmt_ctx && !(ofmt_ctx->oformat->flags & AVFMT_NOFILE))
        avio_closep(&ofmt_ctx->pb);
    if (ofmt_ctx) avformat_free_context(ofmt_ctx);

    env->ReleaseStringUTFChars(video_path, in_filename);
    env->ReleaseStringUTFChars(out_path, out_filename);
    env->ReleaseDoubleArrayElements(segments, seg, 0);

    return true;
}
