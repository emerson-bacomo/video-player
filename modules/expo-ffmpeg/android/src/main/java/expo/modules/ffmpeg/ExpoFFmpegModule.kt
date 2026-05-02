package expo.modules.ffmpeg

import android.provider.MediaStore
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class ExpoFFmpegModule : Module() {

    /** Resolves a content:// URI to its real filesystem path via MediaStore.
     *  Falls back to the original string for file:// URIs or unresolvable paths. */
    private fun resolveContentUri(uri: String): String {
        if (!uri.startsWith("content://")) return uri
        return try {
            val contentUri = android.net.Uri.parse(uri)
            val projection = arrayOf(MediaStore.MediaColumns.DATA)
            val cursor = appContext.reactContext?.contentResolver?.query(contentUri, projection, null, null, null)
            cursor?.use {
                if (it.moveToFirst()) {
                    val col = it.getColumnIndexOrThrow(MediaStore.MediaColumns.DATA)
                    it.getString(col) ?: uri
                } else uri
            } ?: uri
        } catch (e: Exception) {
            uri
        }
    }

  private var isProcessing = false

  override fun definition() = ModuleDefinition {
    Name("ExpoFFmpeg")
    Events("onClipProgress", "onNativeLog")

    AsyncFunction("generateThumbnail") { videoPath: String, outPath: String, promise: Promise ->
      Thread {
        try {
          val resolvedPath = resolveContentUri(videoPath)
          val pixels = nativeGenerateThumbnail(resolvedPath)
          if (pixels == null || pixels.size < 3) {
            promise.resolve(false)
            return@Thread
          }

          val width = pixels[0]
          val height = pixels[1]
          val bitmap = android.graphics.Bitmap.createBitmap(pixels, 2, width, width, height, android.graphics.Bitmap.Config.ARGB_8888)
          
          val resolvedOutPath = if (outPath.startsWith("file://")) {
            java.net.URI(outPath).path
          } else {
            outPath
          }
          val file = java.io.File(resolvedOutPath)
          val out = java.io.FileOutputStream(file)
          bitmap.compress(android.graphics.Bitmap.CompressFormat.JPEG, 90, out)
          out.close()
          promise.resolve(true)
        } catch (e: Exception) {
          e.printStackTrace()
          promise.resolve(false)
        }
      }.start()
    }

    AsyncFunction("clipVideo") { videoPath: String, outPath: String, segments: List<Map<String, Double>>, options: Map<String, Any>, promise: Promise ->
      if (isProcessing) {
        promise.resolve(false)
        return@AsyncFunction
      }
      isProcessing = true
      
      val segmentsArray = DoubleArray(segments.size * 2)
      for (i in segments.indices) {
        segmentsArray[i * 2] = segments[i]["start"] ?: 0.0
        segmentsArray[i * 2 + 1] = segments[i]["end"] ?: 0.0
      }

      // Reset progress before starting — g_clip_progress persists between runs and
      // the previous clip's 1.0 value would be emitted immediately otherwise.
      nativeResetClipProgress()

      // Start a progress reporter thread
      val isDone = java.util.concurrent.atomic.AtomicBoolean(false)
      val reporter = Thread {
        try {
          // Brief delay so the native side has time to initialize g_clip_progress = 0
          Thread.sleep(150)
          var lastSentProg = -1.0
          var lastTime = System.currentTimeMillis()
          var lastProg = 0.0
          var lastEta: Int? = null
          var ignoreCount = 0
          
          while (!isDone.get()) {
            val now = System.currentTimeMillis()
            val rawProg = nativeGetClipProgress()
            val prog = Math.round(rawProg * 100.0) / 100.0
            
            if (prog != lastSentProg) {
              val deltaP = prog - lastProg
              val deltaT = (now - lastTime) / 1000.0
              
              var nextEta: Int? = null
              if (deltaP > 0.001 && deltaT > 0.5) {
                val rate = deltaP / deltaT
                val rawEta = Math.round((1.0 - prog) / rate).toInt()
                
                if (lastEta != null && rawEta > lastEta!!) {
                  ignoreCount++
                  if (ignoreCount > 1) {
                    nextEta = rawEta
                    ignoreCount = 0
                  } else {
                    nextEta = lastEta
                  }
                } else {
                  nextEta = rawEta
                  ignoreCount = 0
                }
                
                lastProg = prog
                lastTime = now
                lastEta = nextEta
              } else {
                nextEta = lastEta
              }

              val eventData = mapOf("progress" to prog, "eta" to nextEta)
              sendEvent("onClipProgress", eventData)
              lastSentProg = prog
            }
            Thread.sleep(100)
          }
        } catch (e: Exception) {}
      }
      reporter.start()

      // Execute clipping in a dedicated worker thread
      Thread {
        try {
          val resolvedPath = resolveContentUri(videoPath)
          val resolvedOutPath = if (outPath.startsWith("file://")) {
            java.net.URI(outPath).path
          } else {
            outPath
          }
          val result = nativeClipVideo(
            resolvedPath, 
            resolvedOutPath, 
            segmentsArray,
            options["resolution"] as? String ?: "original",
            options["format"] as? String ?: "mp4",
            options["removeAudio"] as? Boolean ?: false,
            (options["crf"] as? Number)?.toInt() ?: 0,
            (options["transitionDuration"] as? Number)?.toDouble() ?: 0.0,
            options["transitionStyle"] as? String ?: "smear-left",
            options["preset"] as? String ?: "slower"
          )
          promise.resolve(result)
        } catch (e: Exception) {
          e.printStackTrace()
          promise.resolve(false)
        } finally {
          isDone.set(true)
          isProcessing = false
          val finalData = mapOf("progress" to 1.0, "eta" to 0)
          sendEvent("onClipProgress", finalData)
          reporter.interrupt()
          try { reporter.join(500) } catch (e: Exception) {}
        }
      }.start()
    }

    AsyncFunction("getLastClipError") {
      nativeGetLastClipError()
    }

    AsyncFunction("scanFile") { filePath: String, promise: Promise ->
        val context = appContext.reactContext ?: run {
            promise.resolve(null)
            return@AsyncFunction
        }
        val file = java.io.File(filePath)
        if (!file.exists()) {
            promise.resolve(null)
            return@AsyncFunction
        }

        // 1. Broadcast Intent (Immediate trigger)
        val uri = android.net.Uri.fromFile(file)
        val scanIntent = android.content.Intent(android.content.Intent.ACTION_MEDIA_SCANNER_SCAN_FILE)
        scanIntent.data = uri
        context.sendBroadcast(scanIntent)

        // 2. MediaScannerConnection (Wait for result)
        android.media.MediaScannerConnection.scanFile(
            context,
            arrayOf(file.absolutePath),
            null // Use null to let it detect by extension
        ) { path, scannedUri ->
            android.util.Log.d("ExpoFFmpeg", "Scan result: path=$path uri=$scannedUri")
            promise.resolve(scannedUri?.toString())
        }
    }

  }

  private external fun nativeGenerateThumbnail(videoPath: String): IntArray?
  private external fun nativeClipVideo(
    videoPath: String, 
    outPath: String, 
    segments: DoubleArray,
    resolution: String,
    format: String,
    removeAudio: Boolean,
    crf: Int,
    transitionDuration: Double,
    transitionStyle: String,
    preset: String
  ): Boolean
  private external fun nativeGetLastClipError(): String
  private external fun nativeGetClipProgress(): Double
  private external fun nativeResetClipProgress()

  companion object {
    init {
      System.loadLibrary("expo-ffmpeg")
    }
  }
}
