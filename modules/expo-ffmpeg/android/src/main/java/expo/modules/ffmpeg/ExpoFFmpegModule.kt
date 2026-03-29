package expo.modules.ffmpeg

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class ExpoFFmpegModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("ExpoFFmpeg")

    AsyncFunction("generateThumbnail") { videoPath: String, outPath: String ->
      val pixels = nativeGenerateThumbnail(videoPath)
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
  }

  private external fun nativeGenerateThumbnail(videoPath: String): IntArray?

  companion object {
    init {
      System.loadLibrary("expo-ffmpeg")
    }
  }
}
