package expo.modules.ffmpeg

import android.provider.MediaStore
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

  override fun definition() = ModuleDefinition {
    Name("ExpoFFmpeg")

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

    AsyncFunction("clipVideo") { videoPath: String, outPath: String, segments: List<Map<String, Any>> ->
      val flatSegments = DoubleArray(segments.size * 2)
      for (i in segments.indices) {
          flatSegments[i * 2] = segments[i]["start"]?.toString()?.toDouble() ?: 0.0
          flatSegments[i * 2 + 1] = segments[i]["end"]?.toString()?.toDouble() ?: 1.0
      }
      val resolvedPath = resolveContentUri(videoPath)
      nativeClipVideo(resolvedPath, java.net.URI(outPath).path, flatSegments)
    }

    AsyncFunction("getLastClipError") {
      nativeGetLastClipError()
    }
  }

  private external fun nativeGenerateThumbnail(videoPath: String): IntArray?
  private external fun nativeClipVideo(videoPath: String, outPath: String, segments: DoubleArray): Boolean
  private external fun nativeGetLastClipError(): String

  companion object {
    init {
      System.loadLibrary("expo-ffmpeg")
    }
  }
}
