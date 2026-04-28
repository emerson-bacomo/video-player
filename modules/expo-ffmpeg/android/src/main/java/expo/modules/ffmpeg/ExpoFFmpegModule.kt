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

    AsyncFunction("generateThumbnail") { videoPath: String, outPath: String ->
      val resolvedPath = resolveContentUri(videoPath)
      val pixels = nativeGenerateThumbnail(resolvedPath)
      if (pixels == null || pixels.size < 3) return@AsyncFunction false

      val width = pixels[0]
      val height = pixels[1]
      val bitmap = android.graphics.Bitmap.createBitmap(pixels, 2, width, width, height, android.graphics.Bitmap.Config.ARGB_8888)
      
      try {
        val file = java.io.File(java.net.URI(outPath).path)
        val out = java.io.FileOutputStream(file)
        bitmap.compress(android.graphics.Bitmap.CompressFormat.JPEG, 90, out)
        out.close()
        true
      } catch (e: Exception) {
        e.printStackTrace()
        false
      }
    }

    AsyncFunction("clipVideo") { videoPath: String, outPath: String, segments: List<Map<String, Double>>, options: Map<String, Any> ->
      if (isProcessing) return@AsyncFunction false
      isProcessing = true

      val segmentsArray = DoubleArray(segments.size * 2)
      for (i in segments.indices) {
        segmentsArray[i * 2] = segments[i]["start"] ?: 0.0
        segmentsArray[i * 2 + 1] = segments[i]["end"] ?: 0.0
      }

      // Start a progress reporter thread
      val isDone = java.util.concurrent.atomic.AtomicBoolean(false)
      val reporter = Thread {
        try {
          var lastSentProg = -1.0
          while (!isDone.get()) {
            val rawProg = nativeGetClipProgress()
            val prog = Math.round(rawProg * 100.0) / 100.0
            if (!isDone.get() && prog != lastSentProg) {
              sendEvent("onClipProgress", mapOf("progress" to prog))
              lastSentProg = prog
            }
            Thread.sleep(100)
          }
        } catch (e: Exception) {}
      }
      reporter.start()

      try {
        val resolvedPath = resolveContentUri(videoPath)
        nativeClipVideo(
          resolvedPath, 
          java.net.URI(outPath).path, 
          segmentsArray,
          options["quality"] as? String ?: "original",
          options["resolution"] as? String ?: "original",
          options["format"] as? String ?: "mp4",
          options["removeAudio"] as? Boolean ?: false,
          (options["crf"] as? Number)?.toInt() ?: 0
        )
      } finally {
        isDone.set(true)
        isProcessing = false
        sendEvent("onClipProgress", mapOf("progress" to 1.0))
        reporter.interrupt() // Wake up from sleep immediately
        reporter.join(500)
      }
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
    quality: String,
    resolution: String,
    format: String,
    removeAudio: Boolean,
    crf: Int
  ): Boolean
  private external fun nativeGetLastClipError(): String
  private external fun nativeGetClipProgress(): Double

  companion object {
    init {
      System.loadLibrary("expo-ffmpeg")
    }
  }
}
