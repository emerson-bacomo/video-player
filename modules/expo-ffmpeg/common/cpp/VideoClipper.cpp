#include "ExpoFFmpegCommon.h"
#include <algorithm>
#include <vector>
#include <string>
#include <cmath>
#include <android/log.h>

extern "C" {
#include <libavutil/audio_fifo.h>
#include <libavutil/opt.h>
}

extern "C"
JNIEXPORT jboolean JNICALL
Java_expo_modules_ffmpeg_ExpoFFmpegModule_nativeClipVideo(
    JNIEnv *env, jobject thiz,
    jstring video_path, jstring out_path,
    jdoubleArray segments,
    jstring resolution, jstring format,
    jboolean remove_audio, jint crf_val,
    jdouble transition_duration, jstring transition_style,
    jstring preset_name) {

    g_clip_progress = 0.0;
    g_last_clip_error = "";

    const char *in_filename = env->GetStringUTFChars(video_path, nullptr);
    const char *out_filename = env->GetStringUTFChars(out_path, nullptr);

    const char *style_ptr = transition_style ? env->GetStringUTFChars(transition_style, nullptr) : nullptr;
    std::string style(style_ptr ? style_ptr : "crossfade");
    if (style_ptr) env->ReleaseStringUTFChars(transition_style, style_ptr);

    const char *preset_ptr = preset_name ? env->GetStringUTFChars(preset_name, nullptr) : nullptr;
    std::string preset(preset_ptr && strlen(preset_ptr) > 0 ? preset_ptr : "slower");
    if (preset_ptr) env->ReleaseStringUTFChars(preset_name, preset_ptr);

    LOGI("Starting Clip: %s -> %s (Preset: %s)", in_filename, out_filename, preset.c_str());

    jdouble *seg = env->GetDoubleArrayElements(segments, nullptr);
    jsize seg_len = env->GetArrayLength(segments);

    double total_job_duration = 0;
    for (int i = 0; i < seg_len; i += 2) {
        total_job_duration += (seg[i+1] - seg[i]);
    }
    if (transition_duration > 0 && seg_len > 2) {
        total_job_duration += (seg_len / 2 - 1) * transition_duration;
    }

    AVFormatContext *ifmt = nullptr, *ofmt = nullptr;
    AVCodecContext *vdec = nullptr, *venc = nullptr;
    AVCodecContext *adec = nullptr, *aenc = nullptr;

    AVStream *vin = nullptr, *vout = nullptr;
    AVStream *ain = nullptr, *aout = nullptr;

    SwsContext *sws = nullptr;
    SwrContext *swr = nullptr;
    AVAudioFifo *fifo = nullptr;

    AVPacket *pkt = av_packet_alloc();
    AVPacket *epkt = av_packet_alloc();
    AVFrame  *frm = av_frame_alloc();
    AVFrame  *yuv = av_frame_alloc();
    AVFrame  *pcm = av_frame_alloc();
    AVFrame  *enc_af = av_frame_alloc();
    AVFrame  *last_seg_frame = av_frame_alloc();
    AVFrame  *first_seg_frame = av_frame_alloc();
    AVFrame  *blend_yuv = av_frame_alloc();

    int v_idx = -1, a_idx = -1;

    int64_t global_v_pts = 0;
    int64_t global_a_pts = 0;
    double accumulated_sec = 0.0;
    int64_t last_v_pts = -1;
    bool last_seg_valid = false;

    auto flush_encoder = [&](AVCodecContext *enc, AVStream *st, bool is_audio) {
        avcodec_send_frame(enc, nullptr);
        while (avcodec_receive_packet(enc, epkt) >= 0) {
            av_packet_rescale_ts(epkt, enc->time_base, st->time_base);
            epkt->stream_index = st->index;
            av_interleaved_write_frame(ofmt, epkt);
            av_packet_unref(epkt);
        }
    };

    if (avformat_open_input(&ifmt, in_filename, nullptr, nullptr) < 0) goto end;
    if (avformat_find_stream_info(ifmt, nullptr) < 0) goto end;

    avformat_alloc_output_context2(&ofmt, nullptr, nullptr, out_filename);

    // ===================== STREAM SETUP =====================
    for (int i = 0; i < ifmt->nb_streams; i++) {
        AVStream *in = ifmt->streams[i];
        AVCodecParameters *cp = in->codecpar;

        if (cp->codec_type == AVMEDIA_TYPE_VIDEO && v_idx < 0) {
            v_idx = i;
            vin = in;

            const AVCodec *dec = avcodec_find_decoder(cp->codec_id);
            vdec = avcodec_alloc_context3(dec);
            avcodec_parameters_to_context(vdec, cp);
            avcodec_open2(vdec, dec, nullptr);

            const AVCodec *enc = avcodec_find_encoder_by_name("libx264");
            if (!enc) {
                LOGE("libx264 not found! Falling back to generic H264 encoder.");
                enc = avcodec_find_encoder(AV_CODEC_ID_H264);
            }
            vout = avformat_new_stream(ofmt, nullptr);
            venc = avcodec_alloc_context3(enc);

            venc->width = vdec->width & ~1;
            venc->height = vdec->height & ~1;
            venc->pix_fmt = AV_PIX_FMT_YUV420P;

            AVRational fps = av_guess_frame_rate(ifmt, vin, nullptr);
            if (fps.num <= 0 || fps.den <= 0) fps = {30, 1};

            venc->time_base = av_inv_q(fps);
            vout->time_base = venc->time_base;
            venc->framerate = fps;
            LOGI("Detected Stream FPS: %d/%d", fps.num, fps.den);
            
            venc->gop_size = std::max(1, (fps.num / fps.den) * 2);
            venc->has_b_frames = 0;

            if (ofmt->oformat->flags & AVFMT_GLOBALHEADER)
                venc->flags |= AV_CODEC_FLAG_GLOBAL_HEADER;

            LOGI("Selected Encoder: %s", enc->name);

            int final_crf = crf_val;
            if (final_crf <= 0) final_crf = 25; // Bump default CRF up to 24-26 for smaller sizes
            if (final_crf > 51) final_crf = 51; 
            
            AVDictionary *opts = nullptr;
            av_dict_set(&opts, "crf", std::to_string(final_crf).c_str(), 0);
            av_dict_set(&opts, "preset", preset.c_str(), 0);
            av_dict_set(&opts, "x264-params", "aq-mode=2:aq-strength=1.0:deblock=0,0:psy-rd=0.4,0.0", 0);
            av_dict_set(&opts, "profile", "high", 0);
            av_dict_set(&opts, "level", "4.1", 0);

            LOGI("Attempting to open libx264 with: Res=%dx%d, PixFmt=%d, TB=%d/%d, FPS=%d/%d", 
                 venc->width, venc->height, venc->pix_fmt, 
                 venc->time_base.num, venc->time_base.den,
                 venc->framerate.num, venc->framerate.den);

            if (venc->width <= 0 || venc->height <= 0) {
                LOGE("Critical Error: Dimensions are zero or negative!");
            }

            int ret = avcodec_open2(venc, enc, &opts);
            if (ret < 0) {
                char errbuf[256];
                av_strerror(ret, errbuf, sizeof(errbuf));
                LOGE("Failed to open video encoder: %s. Error: %s (%d)", enc->name, errbuf, ret);
                av_dict_free(&opts);
                goto end;
            }
            av_dict_free(&opts);
            avcodec_parameters_from_context(vout->codecpar, venc);
            vout->time_base = venc->time_base;
            
            // Copy side data (rotation, etc) - Industry standard
            av_dict_copy(&vout->metadata, vin->metadata, 0);

        } else if (cp->codec_type == AVMEDIA_TYPE_AUDIO && !remove_audio && a_idx < 0) {
            a_idx = i;
            ain = in;

            const AVCodec *dec = avcodec_find_decoder(cp->codec_id);
            adec = avcodec_alloc_context3(dec);
            avcodec_parameters_to_context(adec, cp);
            avcodec_open2(adec, dec, nullptr);

            const AVCodec *enc = avcodec_find_encoder(AV_CODEC_ID_AAC);
            aenc = avcodec_alloc_context3(enc);

            aenc->sample_rate = adec->sample_rate;
            aenc->bit_rate = 128000;
            aenc->sample_fmt = enc->sample_fmts ? enc->sample_fmts[0] : AV_SAMPLE_FMT_FLTP;
            aenc->time_base = {1, aenc->sample_rate};
            av_channel_layout_copy(&aenc->ch_layout, &adec->ch_layout);

            if (ofmt->oformat->flags & AVFMT_GLOBALHEADER)
                aenc->flags |= AV_CODEC_FLAG_GLOBAL_HEADER;

            if (avcodec_open2(aenc, enc, nullptr) < 0) {
                LOGE("Failed to open audio encoder");
                goto end;
            }

            aout = avformat_new_stream(ofmt, nullptr);
            avcodec_parameters_from_context(aout->codecpar, aenc);
            aout->time_base = aenc->time_base;

            swr = swr_alloc();
            av_opt_set_chlayout(swr, "in_chlayout", &adec->ch_layout, 0);
            av_opt_set_int(swr, "in_sample_rate", adec->sample_rate, 0);
            av_opt_set_sample_fmt(swr, "in_sample_fmt", adec->sample_fmt, 0);
            av_opt_set_chlayout(swr, "out_chlayout", &aenc->ch_layout, 0);
            av_opt_set_int(swr, "out_sample_rate", aenc->sample_rate, 0);
            av_opt_set_sample_fmt(swr, "out_sample_fmt", aenc->sample_fmt, 0);
            swr_init(swr);

            fifo = av_audio_fifo_alloc(aenc->sample_fmt, aenc->ch_layout.nb_channels, 1);

            enc_af->format = aenc->sample_fmt;
            enc_af->sample_rate = aenc->sample_rate;
            av_channel_layout_copy(&enc_af->ch_layout, &aenc->ch_layout);
            enc_af->nb_samples = aenc->frame_size ? aenc->frame_size : 1024;
            av_frame_get_buffer(enc_af, 0);
        }
    }

    if (vdec) {
        sws = sws_getContext(vdec->width, vdec->height, vdec->pix_fmt,
                             venc->width, venc->height, venc->pix_fmt,
                             SWS_SPLINE, nullptr, nullptr, nullptr);

        yuv->format = venc->pix_fmt;
        yuv->width = venc->width;
        yuv->height = venc->height;
        if (av_frame_get_buffer(yuv, 32) < 0) goto end;

        last_seg_frame->format = venc->pix_fmt;
        last_seg_frame->width = venc->width;
        last_seg_frame->height = venc->height;
        if (av_frame_get_buffer(last_seg_frame, 32) < 0) goto end;

        first_seg_frame->format = venc->pix_fmt;
        first_seg_frame->width = venc->width;
        first_seg_frame->height = venc->height;
        if (av_frame_get_buffer(first_seg_frame, 32) < 0) goto end;

        blend_yuv->format = venc->pix_fmt;
        blend_yuv->width = venc->width;
        blend_yuv->height = venc->height;
        if (av_frame_get_buffer(blend_yuv, 32) < 0) goto end;
    }

    if (!(ofmt->oformat->flags & AVFMT_NOFILE)) {
        if (avio_open(&ofmt->pb, out_filename, AVIO_FLAG_WRITE) < 0) goto end;
    }

    if (avformat_write_header(ofmt, nullptr) < 0) goto end;

    // ===================== TRUE-SYNC SEGMENT PIPELINE =====================
    for (int s = 0; s < seg_len; s += 2) {
        double start = seg[s];
        double end   = seg[s + 1];
        bool segment_has_video = false;

        av_seek_frame(ifmt, -1, start * AV_TIME_BASE, AVSEEK_FLAG_BACKWARD);
        if (vdec) avcodec_flush_buffers(vdec);
        if (adec) avcodec_flush_buffers(adec);

        while (av_read_frame(ifmt, pkt) >= 0) {
            AVStream *st = ifmt->streams[pkt->stream_index];
            double ts = 0;
            if (pkt->pts != AV_NOPTS_VALUE) ts = pkt->pts * av_q2d(st->time_base);
            else if (pkt->dts != AV_NOPTS_VALUE) ts = pkt->dts * av_q2d(st->time_base);

            if (ts > end + 0.5) { // Faster termination than 1.0s
                av_packet_unref(pkt);
                break;
            }

            if (pkt->stream_index == v_idx && vdec) {
                avcodec_send_packet(vdec, pkt);
                while (avcodec_receive_frame(vdec, frm) >= 0) {
                    int64_t pts = frm->best_effort_timestamp != AV_NOPTS_VALUE ? frm->best_effort_timestamp : frm->pts;
                    double fts = pts * av_q2d(vin->time_base);
                    
                    if (fts < start || fts > end) {
                        av_frame_unref(frm);
                        continue;
                    }

                    sws_scale(sws, frm->data, frm->linesize, 0, vdec->height, yuv->data, yuv->linesize);

                    // --- CINEMATIC FREEZE TRANSITION BURST ---
                    if (!segment_has_video) {
                        segment_has_video = true;
                        if (s > 0 && transition_duration > 0 && last_seg_valid) {
                            // Capture current frame as first_seg_frame
                            sws_scale(sws, frm->data, frm->linesize, 0, vdec->height, first_seg_frame->data, first_seg_frame->linesize);

                            bool is_known_style = (style == "crossfade" || style == "smear-left" || style == "smear-right" || style == "slide-left" || style == "slide-right");
                            if (is_known_style) {
                                int num_trans_frames = (int)llround(transition_duration * av_q2d(venc->framerate));
                                for (int f = 0; f < num_trans_frames; f++) {
                                    float alpha = (float)f / (float)num_trans_frames;
                                    // Smoothstep for organic feel
                                    alpha = alpha * alpha * (3 - 2 * alpha);

                                    if (style == "crossfade") {
                                        int int_alpha = (int)(alpha * 256.0f);
                                        for (int p = 0; p < 3; p++) {
                                            int w = (p == 0) ? venc->width : venc->width / 2;
                                            int h = (p == 0) ? venc->height : venc->height / 2;
                                            for (int y = 0; y < h; y++) {
                                                uint8_t *dst = blend_yuv->data[p] + y * blend_yuv->linesize[p];
                                                uint8_t *src1 = last_seg_frame->data[p] + y * last_seg_frame->linesize[p];
                                                uint8_t *src2 = first_seg_frame->data[p] + y * first_seg_frame->linesize[p];
                                                for (int x = 0; x < w; x++) {
                                                    dst[x] = (uint8_t)((src1[x] * (256 - int_alpha) + src2[x] * int_alpha) >> 8);
                                                }
                                            }
                                        }
                                    } else {
                                        // Horizontal Transitions: Slide & Smear
                                        bool is_left = (style == "smear-left" || style == "slide-left");
                                        bool is_smear = (style == "smear-left" || style == "smear-right");
                                        
                                        // Smear has high intensity blur + horizontal stretch
                                        float blur_intensity = is_smear ? 240.0f : 16.0f; 
                                        // Asymmetric curve: rises fast, falls slow
                                        float asymmetric_alpha = std::pow(alpha, 0.4f) * (1.0f - alpha) * 3.5f;
                                        int radius = (int)(asymmetric_alpha * (blur_intensity / 4.0f));
                                        
                                        for (int p = 0; p < 3; p++) {
                                            int w = (p == 0) ? venc->width : venc->width / 2;
                                            int h = (p == 0) ? venc->height : venc->height / 2;
                                             int shift;
                                             float current_slide_alpha = alpha;
                                             if (is_smear) {
                                                 current_slide_alpha = std::min(1.0f, alpha * 2.0f);
                                                 shift = (int)(current_slide_alpha * w);
                                             } else {
                                                 shift = (int)(current_slide_alpha * w);
                                             }
                                            int r = (p == 0) ? radius : radius / 2;
                                            
                                            // Fade out blend width as slide completes to prevent edge bleeding
                                            int max_blend_w = (p == 0) ? 80 : 40;
                                            float blend_factor = 1.0f;
                                            if (current_slide_alpha > 0.8f) {
                                                blend_factor = (1.0f - current_slide_alpha) / 0.2f;
                                            }
                                            int blend_w = (int)(max_blend_w * blend_factor);

                                            for (int y = 0; y < h; y++) {
                                                uint8_t *dst = blend_yuv->data[p] + y * blend_yuv->linesize[p];
                                                uint8_t *src1 = last_seg_frame->data[p] + y * last_seg_frame->linesize[p];
                                                uint8_t *src2 = first_seg_frame->data[p] + y * first_seg_frame->linesize[p];

                                                for (int x = 0; x < w; x++) {
                                                    auto get_pixel = [&](int cur_x) -> uint8_t {
                                                        int sx;
                                                        uint8_t *s_ptr;

                                                        if (is_left) {
                                                            int seam = w - shift;
                                                            if (cur_x < seam - blend_w) { sx = cur_x + shift; s_ptr = src1; }
                                                            else if (cur_x > seam + blend_w) { sx = cur_x - (w - shift); s_ptr = src2; }
                                                            else {
                                                                // Blend zone
                                                                float b_alpha = (float)(cur_x - (seam - blend_w)) / (float)(blend_w * 2);
                                                                int sx1 = cur_x + shift;
                                                                int sx2 = cur_x - (w - shift);
                                                                return (uint8_t)(src1[sx1] * (1.0f - b_alpha) + src2[sx2] * b_alpha);
                                                            }
                                                        } else {
                                                            int seam = shift;
                                                            if (cur_x > seam + blend_w) { sx = cur_x - shift; s_ptr = src1; }
                                                            else if (cur_x < seam - blend_w) { sx = (w - shift) + cur_x; s_ptr = src2; }
                                                            else {
                                                                // Blend zone
                                                                float b_alpha = (float)(cur_x - (seam - blend_w)) / (float)(blend_w * 2);
                                                                int sx2 = (w - shift) + cur_x;
                                                                int sx1 = cur_x - shift;
                                                                return (uint8_t)(src2[sx2] * (1.0f - b_alpha) + src1[sx1] * b_alpha);
                                                            }
                                                        }
                                                        return s_ptr[sx];
                                                    };

                                                    if (r <= 1) {
                                                        dst[x] = get_pixel(x);
                                                    } else {
                                                        int sum = 0, count = 0;
                                                        int step = std::max(1, r / 6);
                                                        int smear_dir = is_left ? 1 : -1;

                                                        for(int o = 0; o <= r; o += step) {
                                                            int nx = x + o * smear_dir;
                                                            if (nx >= 0 && nx < w) {
                                                                sum += get_pixel(nx);
                                                                count++;
                                                            }
                                                        }
                                                        dst[x] = (uint8_t)(sum / count);
                                                    }
                                                }
                                            }
                                        }
                                    }

                                    blend_yuv->pts = ++last_v_pts;
                                    avcodec_send_frame(venc, blend_yuv);
                                    while (avcodec_receive_packet(venc, epkt) >= 0) {
                                        av_packet_rescale_ts(epkt, venc->time_base, vout->time_base);
                                        epkt->stream_index = vout->index;
                                        av_interleaved_write_frame(ofmt, epkt);
                                        av_packet_unref(epkt);
                                    }
                                }

                                // Add audio silence/padding for the transition duration to maintain sync
                                if (aenc && fifo) {
                                    int samples = (int)llround(transition_duration * aenc->sample_rate);
                                    AVFrame *silence = av_frame_alloc();
                                    silence->format = aenc->sample_fmt;
                                    av_channel_layout_copy(&silence->ch_layout, &aenc->ch_layout);
                                    silence->sample_rate = aenc->sample_rate;
                                    silence->nb_samples = samples;
                                    av_frame_get_buffer(silence, 0);
                                    av_samples_set_silence(silence->extended_data, 0, samples, silence->ch_layout.nb_channels, (AVSampleFormat)silence->format);
                                    (void)av_audio_fifo_realloc(fifo, av_audio_fifo_size(fifo) + samples);
                                    av_audio_fifo_write(fifo, (void **)silence->data, samples);
                                    av_frame_free(&silence);
                                    
                                    while (av_audio_fifo_size(fifo) >= aenc->frame_size) {
                                        av_frame_make_writable(enc_af);
                                        av_audio_fifo_read(fifo, (void **)enc_af->data, aenc->frame_size);
                                        enc_af->nb_samples = aenc->frame_size;
                                        enc_af->pts = global_a_pts;
                                        global_a_pts += aenc->frame_size;
                                        avcodec_send_frame(aenc, enc_af);
                                        while (avcodec_receive_packet(aenc, epkt) >= 0) {
                                            av_packet_rescale_ts(epkt, aenc->time_base, aout->time_base);
                                            epkt->stream_index = aout->index;
                                            av_interleaved_write_frame(ofmt, epkt);
                                            av_packet_unref(epkt);
                                        }
                                    }
                                }
                                accumulated_sec += transition_duration;
                            }
                        }
                    }

                    double out_sec = fts - start + accumulated_sec;
                    
                    // Update Progress Reporting - Industry standard UI feedback
                    if (total_job_duration > 0) {
                        g_clip_progress = std::min(0.99, out_sec / total_job_duration);
                    }

                    int64_t target_v_pts = (int64_t)llround(out_sec / av_q2d(venc->time_base));
                    if (target_v_pts <= last_v_pts) target_v_pts = last_v_pts + 1;
                    last_v_pts = target_v_pts;

                    AVFrame *final_yuv = yuv;

                    final_yuv->pts = target_v_pts;
                    avcodec_send_frame(venc, final_yuv);

                    while (avcodec_receive_packet(venc, epkt) >= 0) {
                        av_packet_rescale_ts(epkt, venc->time_base, vout->time_base);
                        epkt->stream_index = vout->index;
                        av_interleaved_write_frame(ofmt, epkt);
                        av_packet_unref(epkt);
                    }

                    // Save last frame of segment for the next transition (Manual copy is safer than av_frame_copy)
                    if (transition_duration > 0 && yuv->data[0]) {
                        for (int p = 0; p < 3; p++) {
                            int h = (p == 0) ? venc->height : venc->height / 2;
                            int bpl = (p == 0) ? venc->width : venc->width / 2;
                            for (int y = 0; y < h; y++) {
                                memcpy(last_seg_frame->data[p] + y * last_seg_frame->linesize[p],
                                       yuv->data[p] + y * yuv->linesize[p],
                                       bpl);
                            }
                        }
                        last_seg_valid = true;
                    } else {
                        last_seg_valid = false;
                    }

                    av_frame_unref(frm);
                }
            } else if (pkt->stream_index == a_idx && adec && !remove_audio) {
                avcodec_send_packet(adec, pkt);
                while (avcodec_receive_frame(adec, pcm) >= 0) {
                    int64_t pts = pcm->best_effort_timestamp != AV_NOPTS_VALUE ? pcm->best_effort_timestamp : pcm->pts;
                    double ats = pts * av_q2d(ain->time_base);
                    if (ats < start || ats > end) {
                        av_frame_unref(pcm);
                        continue;
                    }

                    int64_t total_us = (int64_t)((accumulated_sec + (end - start)) * AV_TIME_BASE);
                    int64_t target_end_a_pts = av_rescale_q(total_us, {1, AV_TIME_BASE}, aenc->time_base);
                    
                    if (global_a_pts >= target_end_a_pts) {
                        av_frame_unref(pcm);
                        continue;
                    }

                    int out_samples = av_rescale_rnd(swr_get_delay(swr, adec->sample_rate) + pcm->nb_samples,
                                                     aenc->sample_rate, adec->sample_rate, AV_ROUND_UP);

                    AVFrame *tmp_af = av_frame_alloc();
                    tmp_af->format = aenc->sample_fmt;
                    av_channel_layout_copy(&tmp_af->ch_layout, &aenc->ch_layout);
                    tmp_af->sample_rate = aenc->sample_rate;
                    tmp_af->nb_samples = out_samples;
                    av_frame_get_buffer(tmp_af, 0);

                    int converted = swr_convert(swr, tmp_af->data, out_samples,
                                                (const uint8_t **)pcm->data, pcm->nb_samples);

                    if (converted > 0) {
                        // --- AUDIO TRANSITION: Linear Fade-In ---
                        if (transition_duration > 0) {
                            double seg_time = ats - start;
                            if (seg_time < transition_duration) {
                                float alpha = (float)(seg_time / transition_duration);
                                if (alpha < 0.0f) alpha = 0.0f;
                                if (alpha > 1.0f) alpha = 1.0f;

                                if (aenc->sample_fmt == AV_SAMPLE_FMT_FLTP) {
                                    for (int c = 0; c < aenc->ch_layout.nb_channels; c++) {
                                        if (tmp_af->data[c]) {
                                            float *samples = (float *)tmp_af->data[c];
                                            for (int i = 0; i < converted; i++) samples[i] *= alpha;
                                        }
                                    }
                                }
                            }
                        }

                        (void)av_audio_fifo_realloc(fifo, av_audio_fifo_size(fifo) + converted);
                        av_audio_fifo_write(fifo, (void **)tmp_af->data, converted);
                    }
                    av_frame_free(&tmp_af);

                    while (av_audio_fifo_size(fifo) >= aenc->frame_size) {
                        av_frame_make_writable(enc_af);
                        av_audio_fifo_read(fifo, (void **)enc_af->data, aenc->frame_size);
                        enc_af->nb_samples = aenc->frame_size;
                        enc_af->pts = global_a_pts;
                        global_a_pts += aenc->frame_size;

                        avcodec_send_frame(aenc, enc_af);
                        while (avcodec_receive_packet(aenc, epkt) >= 0) {
                            av_packet_rescale_ts(epkt, aenc->time_base, aout->time_base);
                            epkt->stream_index = aout->index;
                            av_interleaved_write_frame(ofmt, epkt);
                            av_packet_unref(epkt);
                        }
                    }
                    av_frame_unref(pcm);
                }
            }
            av_packet_unref(pkt);
        }

        // ================= END OF SEGMENT AUDIO PADDING =================
        if (!remove_audio && aenc && fifo) {
            int64_t total_us = (int64_t)((accumulated_sec + (end - start)) * AV_TIME_BASE);
            int64_t target_a_pts = av_rescale_q(total_us, {1, AV_TIME_BASE}, aenc->time_base);
            
            int missing = target_a_pts - global_a_pts;
            if (missing > 0) {
                AVFrame *silence = av_frame_alloc();
                silence->format = aenc->sample_fmt;
                av_channel_layout_copy(&silence->ch_layout, &aenc->ch_layout);
                silence->sample_rate = aenc->sample_rate;
                silence->nb_samples = missing;
                av_frame_get_buffer(silence, 0);
                av_samples_set_silence(silence->extended_data, 0, missing, silence->ch_layout.nb_channels, (AVSampleFormat)silence->format);
                (void)av_audio_fifo_realloc(fifo, av_audio_fifo_size(fifo) + missing);
                av_audio_fifo_write(fifo, (void **)silence->data, missing);
                av_frame_free(&silence);
            } else if (missing < 0) {
                av_audio_fifo_drain(fifo, std::min((int)av_audio_fifo_size(fifo), -missing));
            }

            while (av_audio_fifo_size(fifo) >= aenc->frame_size) {
                av_frame_make_writable(enc_af);
                av_audio_fifo_read(fifo, (void **)enc_af->data, aenc->frame_size);
                enc_af->nb_samples = aenc->frame_size;
                enc_af->pts = global_a_pts;
                global_a_pts += aenc->frame_size;

                avcodec_send_frame(aenc, enc_af);
                while (avcodec_receive_packet(aenc, epkt) >= 0) {
                    av_packet_rescale_ts(epkt, aenc->time_base, aout->time_base);
                    epkt->stream_index = aout->index;
                    av_interleaved_write_frame(ofmt, epkt);
                    av_packet_unref(epkt);
                }
            }
        }
        accumulated_sec += (end - start);
    }

    if (venc) flush_encoder(venc, vout, false);
    if (aenc) {
        if (fifo && av_audio_fifo_size(fifo) > 0) {
            int remaining = av_audio_fifo_size(fifo);
            av_frame_make_writable(enc_af);
            av_audio_fifo_read(fifo, (void **)enc_af->data, remaining);
            av_samples_set_silence(enc_af->extended_data, remaining, aenc->frame_size - remaining, aenc->ch_layout.nb_channels, (AVSampleFormat)aenc->sample_fmt);
            enc_af->nb_samples = aenc->frame_size;
            enc_af->pts = global_a_pts;
            global_a_pts += aenc->frame_size;
            avcodec_send_frame(aenc, enc_af);
            while (avcodec_receive_packet(aenc, epkt) >= 0) {
                av_packet_rescale_ts(epkt, aenc->time_base, aout->time_base);
                epkt->stream_index = aout->index;
                av_interleaved_write_frame(ofmt, epkt);
                av_packet_unref(epkt);
            }
        }
        flush_encoder(aenc, aout, true);
    }

    av_write_trailer(ofmt);
    g_clip_progress = 1.0;

end:
    if (pkt) av_packet_free(&pkt);
    if (epkt) av_packet_free(&epkt);
    if (frm) av_frame_free(&frm);
    if (yuv) av_frame_free(&yuv);
    if (pcm) av_frame_free(&pcm);
    if (enc_af) av_frame_free(&enc_af);
    if (last_seg_frame) av_frame_free(&last_seg_frame);
    if (first_seg_frame) av_frame_free(&first_seg_frame);
    if (blend_yuv) av_frame_free(&blend_yuv);
    if (sws) sws_freeContext(sws);
    if (swr) swr_free(&swr);
    if (fifo) av_audio_fifo_free(fifo);
    if (vdec) avcodec_free_context(&vdec);
    if (venc) avcodec_free_context(&venc);
    if (adec) avcodec_free_context(&adec);
    if (aenc) avcodec_free_context(&aenc);
    if (ifmt) avformat_close_input(&ifmt);
    if (ofmt) {
        if (!(ofmt->oformat->flags & AVFMT_NOFILE)) avio_closep(&ofmt->pb);
        avformat_free_context(ofmt);
    }

    env->ReleaseStringUTFChars(video_path, in_filename);
    env->ReleaseStringUTFChars(out_path, out_filename);
    env->ReleaseDoubleArrayElements(segments, seg, 0);

    return true;
}