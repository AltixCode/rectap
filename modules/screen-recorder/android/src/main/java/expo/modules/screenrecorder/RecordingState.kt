package expo.modules.screenrecorder

import android.content.Context

/**
 * The recorder's state, shared between the service and the module.
 *
 * They are in the same process but not the same lifetime: the service can outlive the
 * React context and the React context can be recreated while the service records. Holding
 * this in `SharedPreferences` rather than in a static field means the app can be killed and
 * relaunched mid-recording and still show what is going on.
 */
object RecordingState {
  enum class StopReason { USER, LIMIT, SYSTEM, ERROR }

  private const val PREFS = "rectap.recorder"
  private const val KEY_RECORDING = "isRecording"
  private const val KEY_STARTED_AT = "startedAt"
  private const val KEY_CURRENT_FILE = "currentFile"
  private const val KEY_LAST_FILE = "lastCompletedFile"
  private const val KEY_LAST_REASON = "lastStopReason"
  private const val KEY_ERROR = "lastError"

  private fun prefs(context: Context) =
    context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

  fun markStarted(context: Context, fileName: String) {
    prefs(context).edit()
      .putBoolean(KEY_RECORDING, true)
      .putLong(KEY_STARTED_AT, System.currentTimeMillis())
      .putString(KEY_CURRENT_FILE, fileName)
      .remove(KEY_ERROR)
      .remove(KEY_LAST_FILE)
      .apply()
  }

  fun markStopped(context: Context, fileName: String?, reason: StopReason) {
    prefs(context).edit()
      .putBoolean(KEY_RECORDING, false)
      .remove(KEY_CURRENT_FILE)
      .putString(KEY_LAST_FILE, fileName)
      .putString(KEY_LAST_REASON, reason.name)
      .apply()
  }

  fun setError(context: Context, message: String) {
    prefs(context).edit().putString(KEY_ERROR, message).apply()
  }

  fun clearError(context: Context) {
    prefs(context).edit().remove(KEY_ERROR).apply()
  }

  fun isRecording(context: Context): Boolean = prefs(context).getBoolean(KEY_RECORDING, false)

  fun currentFile(context: Context): String? = prefs(context).getString(KEY_CURRENT_FILE, null)

  fun snapshot(context: Context): Map<String, Any> {
    val store = prefs(context)
    val result = mutableMapOf<String, Any>("isRecording" to store.getBoolean(KEY_RECORDING, false))
    val startedAt = store.getLong(KEY_STARTED_AT, 0L)
    if (startedAt > 0L) result["startedAt"] = startedAt.toDouble()
    store.getString(KEY_ERROR, null)?.let { result["error"] = it }
    store.getString(KEY_LAST_REASON, null)?.let { result["lastStopReason"] = it.lowercase() }
    return result
  }
}
