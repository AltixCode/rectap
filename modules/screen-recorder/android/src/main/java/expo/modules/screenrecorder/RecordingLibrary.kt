package expo.modules.screenrecorder

import android.content.Context
import android.media.MediaMetadataRetriever
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * Where recordings live and how they are described.
 *
 * Kept out of the module and the service because both of them need it and neither owns it:
 * the service writes the files, the module lists and deletes them.
 */
object RecordingLibrary {
  fun directory(context: Context): File {
    val directory = File(context.filesDir, "Recordings")
    if (!directory.exists()) directory.mkdirs()
    return directory
  }

  /**
   * Sortable, unique, and free of characters that are illegal in a filename anywhere the
   * recording might later be shared. Matches the naming the iOS extension uses.
   */
  fun newRecordingName(now: Date = Date()): String {
    val formatter = SimpleDateFormat("yyyy-MM-dd-HHmmss", Locale.US)
    return "rectap-${formatter.format(now)}.mp4"
  }

  /** `id` crosses the bridge from JS, so it is only ever a single path component. */
  fun resolve(context: Context, id: String): File? {
    if (id.isEmpty() || id.contains('/') || id.contains("..")) return null
    return File(directory(context), id)
  }

  fun list(context: Context): List<Map<String, Any>> =
    directory(context)
      .listFiles { file -> file.isFile && file.name.endsWith(".mp4") }
      .orEmpty()
      .mapNotNull { describe(it) }
      .sortedByDescending { it["createdAt"] as? Double ?: 0.0 }

  /**
   * Reads the duration and dimensions back off the finished file rather than tracking them
   * while recording. A recording the system killed mid-write is the case that matters, and
   * only the file itself knows what actually survived.
   */
  fun describe(file: File): Map<String, Any>? {
    if (!file.exists() || file.length() <= 0L) return null
    val result = mutableMapOf<String, Any>(
      "id" to file.name,
      "uri" to android.net.Uri.fromFile(file).toString(),
      "sizeBytes" to file.length().toDouble(),
      "createdAt" to file.lastModified().toDouble(),
      "durationSeconds" to 0.0,
    )
    val retriever = MediaMetadataRetriever()
    try {
      retriever.setDataSource(file.absolutePath)
      retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION)
        ?.toLongOrNull()
        ?.let { result["durationSeconds"] = it / 1000.0 }
      val width = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_WIDTH)?.toIntOrNull()
      val height = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_HEIGHT)?.toIntOrNull()
      if (width != null && height != null) {
        result["width"] = width.toDouble()
        result["height"] = height.toDouble()
      }
    } catch (_: Exception) {
      // A file the encoder never finished has no readable moov atom. It is still
      // reported, with a zero duration, so the user can see and delete it rather
      // than wondering where their recording went.
    } finally {
      try {
        retriever.release()
      } catch (_: Exception) {
      }
    }
    return result
  }
}
