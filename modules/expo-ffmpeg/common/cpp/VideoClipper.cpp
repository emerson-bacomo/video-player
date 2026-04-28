#include "ExpoFFmpegCommon.h"

extern "C"
JNIEXPORT jboolean JNICALL
Java_expo_modules_ffmpeg_ExpoFFmpegModule_nativeClipVideo(
    JNIEnv *env, jobject thiz,
    jstring video_path, jstring out_path,
    jdoubleArray segments,
    jstring quality, jstring resolution, jstring format,
    jboolean remove_audio, jint crf) {

    const char *in_filename = env->GetStringUTFChars(video_path, nullptr);
    const char *out_filename = env->GetStringUTFChars(out_path, nullptr);
    const char *q_str = env->GetStringUTFChars(quality, nullptr);
    const char *r_str = env->GetStringUTFChars(resolution, nullptr);
    const char *f_str = env->GetStringUTFChars(format, nullptr);
    jdouble *seg = env->GetDoubleArrayElements(segments, nullptr);
    jsize seg_len = env->GetArrayLength(segments);

    AVFormatContext *ifmt_ctx = nullptr, *ofmt_ctx = nullptr;
    AVCodecContext *v_dec_ctx = nullptr, *v_enc_ctx = nullptr;
    AVStream *in_v_stream = nullptr, *out_v_stream = nullptr;
    AVStream *in_a_stream = nullptr, *out_a_stream = nullptr;

    AVPacket *pkt = av_packet_alloc();
    AVFrame *frame = av_frame_alloc();
    AVPacket *enc_pkt = av_packet_alloc();

    SwsContext *sws_ctx = nullptr;
    AVFrame *yuv_frame = nullptr;

    int video_stream_idx = -1;
    int audio_stream_idx = -1;

    // Trackers to stitch multiple segments seamlessly
    int64_t video_offset = 0;
    int64_t audio_offset = 0;
    int64_t max_video_pts = 0;
    int64_t max_audio_pts = 0;

    g_clip_progress = 0.0;

    double total_clip_duration = 0;
    for (int i = 0; i < seg_len; i += 2) {
        total_clip_duration += (seg[i + 1] - seg[i]);
    }

    double accumulated_duration = 0;
    bool success = false;

    // ================= INPUT & STREAM SETUP =================
    if (avformat_open_input(&ifmt_ctx, in_filename, nullptr, nullptr) < 0) goto cleanup;
    if (avformat_find_stream_info(ifmt_ctx, nullptr) < 0) goto cleanup;

    avformat_alloc_output_context2(&ofmt_ctx, nullptr, nullptr, out_filename);
    if (!ofmt_ctx) goto cleanup;

    for (int i = 0; i < ifmt_ctx->nb_streams; i++) {
        AVStream *in_stream = ifmt_ctx->streams[i];
        AVCodecParameters *in_codecpar = in_stream->codecpar;

        if (in_codecpar->codec_type == AVMEDIA_TYPE_VIDEO && video_stream_idx < 0) {
            video_stream_idx = i;
            in_v_stream = in_stream;

            const AVCodec *v_dec = avcodec_find_decoder(in_codecpar->codec_id);
            v_dec_ctx = avcodec_alloc_context3(v_dec);
            avcodec_parameters_to_context(v_dec_ctx, in_codecpar);
            avcodec_open2(v_dec_ctx, v_dec, nullptr);

            AVCodecID codec_id = AV_CODEC_ID_H264;
            if (ofmt_ctx->oformat->video_codec == AV_CODEC_ID_GIF) {
                codec_id = AV_CODEC_ID_GIF;
            }

            const AVCodec *v_enc = avcodec_find_encoder(codec_id);
            if (!v_enc && codec_id == AV_CODEC_ID_H264) v_enc = avcodec_find_encoder_by_name("libx264");
            
            out_v_stream = avformat_new_stream(ofmt_ctx, nullptr);
            v_enc_ctx = avcodec_alloc_context3(v_enc);

            // Resolution Handling
            int target_h = v_dec_ctx->height;
            if (strcmp(r_str, "1080") == 0) target_h = 1080;
            else if (strcmp(r_str, "720") == 0) target_h = 720;
            else if (strcmp(r_str, "480") == 0) target_h = 480;

            if (target_h > v_dec_ctx->height) target_h = v_dec_ctx->height; // No upscaling

            int target_w = (v_dec_ctx->width * target_h) / v_dec_ctx->height;
            target_w &= ~1; // Ensure even
            target_h &= ~1;

            v_enc_ctx->width = target_w;
            v_enc_ctx->height = target_h;
            
            // Pixel format selection
            if (v_enc->pix_fmts) {
                v_enc_ctx->pix_fmt = v_enc->pix_fmts[0];
                for (int i = 0; v_enc->pix_fmts[i] != AV_PIX_FMT_NONE; i++) {
                    if (v_enc->pix_fmts[i] == AV_PIX_FMT_YUV420P) {
                        v_enc_ctx->pix_fmt = AV_PIX_FMT_YUV420P;
                        break;
                    }
                }
            } else {
                v_enc_ctx->pix_fmt = AV_PIX_FMT_YUV420P;
            }

            v_enc_ctx->time_base = {1, 30};
            v_enc_ctx->framerate = {30, 1};
            v_enc_ctx->gop_size = 12;

            // Quality / CRF Handling
            AVDictionary *enc_opts = nullptr;
            if (strcmp(q_str, "high") == 0) {
                av_dict_set(&enc_opts, "crf", "20", 0);
            } else if (strcmp(q_str, "balanced") == 0) {
                av_dict_set(&enc_opts, "crf", "23", 0);
            } else if (strcmp(q_str, "low") == 0) {
                av_dict_set(&enc_opts, "crf", "28", 0);
            } else if (strcmp(q_str, "custom") == 0 && crf > 0) {
                char crf_str[10];
                snprintf(crf_str, sizeof(crf_str), "%d", crf);
                av_dict_set(&enc_opts, "crf", crf_str, 0);
            } else {
                // Default fallback (Balanced)
                av_dict_set(&enc_opts, "crf", "23", 0);
            }
            av_dict_set(&enc_opts, "preset", "veryfast", 0);

            if (ofmt_ctx->oformat->flags & AVFMT_GLOBALHEADER)
                v_enc_ctx->flags |= AV_CODEC_FLAG_GLOBAL_HEADER;

            avcodec_open2(v_enc_ctx, v_enc, &enc_opts);
            avcodec_parameters_from_context(out_v_stream->codecpar, v_enc_ctx);
            out_v_stream->time_base = v_enc_ctx->time_base;
            av_dict_free(&enc_opts);
        }
        else if (in_codecpar->codec_type == AVMEDIA_TYPE_AUDIO && audio_stream_idx < 0 && !remove_audio) {
            audio_stream_idx = i;
            in_a_stream = in_stream;

            out_a_stream = avformat_new_stream(ofmt_ctx, nullptr);
            avcodec_parameters_copy(out_a_stream->codecpar, in_codecpar);
            out_a_stream->codecpar->codec_tag = 0;
        }
    }

    // ================= SWS =================
    if (v_dec_ctx) {
        sws_ctx = sws_getContext(
            v_dec_ctx->width, v_dec_ctx->height, v_dec_ctx->pix_fmt,
            v_enc_ctx->width, v_enc_ctx->height, v_enc_ctx->pix_fmt,
            SWS_BILINEAR, nullptr, nullptr, nullptr
        );

        yuv_frame = av_frame_alloc();
        yuv_frame->format = v_enc_ctx->pix_fmt;
        yuv_frame->width = v_enc_ctx->width;
        yuv_frame->height = v_enc_ctx->height;
        av_frame_get_buffer(yuv_frame, 32);
    }

    // ================= OUTPUT =================
    if (!(ofmt_ctx->oformat->flags & AVFMT_NOFILE)) {
        if (avio_open(&ofmt_ctx->pb, out_filename, AVIO_FLAG_WRITE) < 0) goto cleanup;
    }

    if (avformat_write_header(ofmt_ctx, nullptr) < 0) goto cleanup;

    // ================= SEGMENTS LOOP =================
    for (int s = 0; s < seg_len; s += 2) {

        double start_sec = seg[s];
        double end_sec = seg[s + 1];
        bool segment_done = false;

        int64_t first_vid_pts = AV_NOPTS_VALUE;
        int64_t first_aud_pts = AV_NOPTS_VALUE;

        av_seek_frame(ifmt_ctx, -1, start_sec * AV_TIME_BASE, AVSEEK_FLAG_BACKWARD);
        if (v_dec_ctx) avcodec_flush_buffers(v_dec_ctx);

        while (!segment_done && av_read_frame(ifmt_ctx, pkt) >= 0) {

            AVStream *st = ifmt_ctx->streams[pkt->stream_index];
            double pkt_sec = pkt->pts * av_q2d(st->time_base);

            // Progress tracking
            if (pkt_sec >= start_sec && pkt_sec <= end_sec && total_clip_duration > 0) {
                double prog = (accumulated_duration + (pkt_sec - start_sec)) / total_clip_duration;
                // Cap at 0.99 for actual processing, 1.0 is set after trailer
                g_clip_progress = std::min(0.99, std::max(0.0, prog));
            }

            // ================= VIDEO =================
            if (pkt->stream_index == video_stream_idx) {
                avcodec_send_packet(v_dec_ctx, pkt);

                while (avcodec_receive_frame(v_dec_ctx, frame) >= 0) {
                    double pts_sec = frame->pts * av_q2d(in_v_stream->time_base);

                    if (pts_sec < start_sec) continue;

                    if (frame->best_effort_timestamp != AV_NOPTS_VALUE) {
                        double t = frame->best_effort_timestamp * av_q2d(in_v_stream->time_base);
                        if (t >= end_sec) {
                            segment_done = true;
                            break;
                        }
                    }

                    if (first_vid_pts == AV_NOPTS_VALUE)
                        first_vid_pts = frame->pts;

                    sws_scale(
                        sws_ctx, frame->data, frame->linesize,
                        0, v_dec_ctx->height,
                        yuv_frame->data, yuv_frame->linesize
                    );

                    // 1. Zero-base the PTS, 2. Rescale, 3. Add segment offset
                    yuv_frame->pts = av_rescale_q(frame->pts - first_vid_pts, in_v_stream->time_base, v_enc_ctx->time_base) + video_offset;

                    avcodec_send_frame(v_enc_ctx, yuv_frame);

                    while (avcodec_receive_packet(v_enc_ctx, enc_pkt) >= 0) {
                        av_packet_rescale_ts(enc_pkt, v_enc_ctx->time_base, out_v_stream->time_base);
                        enc_pkt->stream_index = out_v_stream->index;

                        // Track the highest PTS written so far
                        if (enc_pkt->pts + enc_pkt->duration > max_video_pts) {
                            max_video_pts = enc_pkt->pts + enc_pkt->duration;
                        }

                        av_interleaved_write_frame(ofmt_ctx, enc_pkt);
                        av_packet_unref(enc_pkt);
                    }
                }
            }

            // ================= AUDIO =================
            else if (pkt->stream_index == audio_stream_idx) {
                if (pkt_sec < start_sec || pkt_sec > end_sec) {
                    av_packet_unref(pkt);
                    continue;
                }

                if (first_aud_pts == AV_NOPTS_VALUE)
                    first_aud_pts = pkt->pts;

                // 1. Zero-base in input timebase
                pkt->pts -= first_aud_pts;
                pkt->dts -= first_aud_pts;

                // 2. Rescale to output timebase
                av_packet_rescale_ts(pkt, in_a_stream->time_base, out_a_stream->time_base);

                // 3. Add segment offset
                pkt->pts += audio_offset;
                pkt->dts += audio_offset;
                pkt->stream_index = out_a_stream->index;

                // Track the highest PTS written so far
                if (pkt->pts + pkt->duration > max_audio_pts) {
                    max_audio_pts = pkt->pts + pkt->duration;
                }

                av_interleaved_write_frame(ofmt_ctx, pkt);
            }

            av_packet_unref(pkt);
        }

        accumulated_duration += (end_sec - start_sec);

        // Update the offsets for the next segment!
        video_offset = max_video_pts;
        audio_offset = max_audio_pts;
    }

    // ================= FINAL FLUSH (Moved outside the segment loop!) =================
    if (v_enc_ctx) {
        avcodec_send_frame(v_enc_ctx, nullptr);
        while (avcodec_receive_packet(v_enc_ctx, enc_pkt) >= 0) {
            av_packet_rescale_ts(enc_pkt, v_enc_ctx->time_base, out_v_stream->time_base);
            enc_pkt->stream_index = out_v_stream->index;
            av_interleaved_write_frame(ofmt_ctx, enc_pkt);
            av_packet_unref(enc_pkt);
        }
    }

    av_write_trailer(ofmt_ctx);
    g_clip_progress = 1.0;
    success = true;

cleanup:
    if (pkt) av_packet_free(&pkt);
    if (frame) av_frame_free(&frame);
    if (enc_pkt) av_packet_free(&enc_pkt);

    if (v_dec_ctx) avcodec_free_context(&v_dec_ctx);
    if (v_enc_ctx) avcodec_free_context(&v_enc_ctx);

    if (sws_ctx) sws_freeContext(sws_ctx);
    if (yuv_frame) av_frame_free(&yuv_frame);

    if (ifmt_ctx) avformat_close_input(&ifmt_ctx);

    if (ofmt_ctx && !(ofmt_ctx->oformat->flags & AVFMT_NOFILE))
        avio_closep(&ofmt_ctx->pb);

    if (ofmt_ctx) avformat_free_context(ofmt_ctx);

    env->ReleaseStringUTFChars(video_path, in_filename);
    env->ReleaseStringUTFChars(out_path, out_filename);
    env->ReleaseStringUTFChars(quality, q_str);
    env->ReleaseStringUTFChars(resolution, r_str);
    env->ReleaseStringUTFChars(format, f_str);
    env->ReleaseDoubleArrayElements(segments, seg, 0);

    return success;
}
