package expo.modules.screenrecorder

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.media.projection.MediaProjectionManager
import android.os.Build
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * The Android recorder.
 *
 * Unlike iOS there is no separate process: `MediaProjection` gives this app the screen
 * directly, once the user has granted it through the system dialog. What it does need is a
 * foreground service to hold the capture alive after the user leaves the app, which is
 * `ScreenRecordingService`.
 *
 * The grant is a one-shot `Activity` result and cannot be cached — Android issues a fresh
 * token per recording and refuses a reused one — so every recording starts with the dialog.
 */
class ScreenRecorderModule : Module() {
  companion object {
    private const val REQUEST_CODE = 8021
  }

  private var pendingPromise: Promise? = null
  private var pendingMaxDurationMs: Long = 0

  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  override fun definition() = ModuleDefinition {
    Name("ScreenRecorder")

    /** MediaProjection is API 21+; the app's own minSdk is 24, so this is always true. */
    Function("isSupported") { true }

    /**
     * iOS has to go through Apple's system broadcast picker, which is a view rather than a
     * call. Android does not, and the UI needs to know which of the two it is drawing.
     */
    Function("usesSystemPicker") { false }

    Function("getStatus") { RecordingState.snapshot(context) }

    Function("clearError") { RecordingState.clearError(context) }

    Function("setMaxDuration") { _: Double, _: String ->
      // Android passes the cap with the start intent instead, because MediaRecorder
      // wants it before `prepare()`, and it needs no translated message: the encoder
      // simply stops and the app is running to explain why. Kept so both platforms
      // present one API.
    }

    AsyncFunction("startRecording") { maxDurationSeconds: Double, promise: Promise ->
      if (RecordingState.isRecording(context)) {
        promise.resolve("already-recording")
        return@AsyncFunction
      }
      val activity = appContext.currentActivity
      if (activity == null) {
        promise.resolve("error")
        return@AsyncFunction
      }
      if (pendingPromise != null) {
        // A second tap while the system dialog is up. Resolving rather than
        // rejecting: it is not an error, there is simply nothing new to do.
        promise.resolve("pending")
        return@AsyncFunction
      }

      pendingMaxDurationMs = if (maxDurationSeconds > 0) (maxDurationSeconds * 1000).toLong() else 0L
      pendingPromise = promise
      RecordingState.clearError(context)

      val manager =
        activity.getSystemService(Context.MEDIA_PROJECTION_SERVICE) as MediaProjectionManager
      try {
        activity.startActivityForResult(manager.createScreenCaptureIntent(), REQUEST_CODE)
      } catch (error: Exception) {
        pendingPromise = null
        promise.resolve("error")
      }
    }

    OnActivityResult { _, payload ->
      if (payload.requestCode != REQUEST_CODE) return@OnActivityResult
      val promise = pendingPromise
      pendingPromise = null
      val data = payload.data
      if (payload.resultCode != Activity.RESULT_OK || data == null) {
        promise?.resolve("denied")
        return@OnActivityResult
      }

      val intent = Intent(context, ScreenRecordingService::class.java).apply {
        action = ScreenRecordingService.ACTION_START
        putExtra(ScreenRecordingService.EXTRA_RESULT_CODE, payload.resultCode)
        putExtra(ScreenRecordingService.EXTRA_RESULT_DATA, data)
        putExtra(ScreenRecordingService.EXTRA_MAX_DURATION_MS, pendingMaxDurationMs)
      }
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        context.startForegroundService(intent)
      } else {
        context.startService(intent)
      }
      promise?.resolve("started")
    }

    Function("requestStop") {
      val intent = Intent(context, ScreenRecordingService::class.java).apply {
        action = ScreenRecordingService.ACTION_STOP
      }
      context.startService(intent)
    }

    /**
     * On Android the service writes straight into the library, so there is nothing to move.
     * The call still exists because the JS state machine treats "a recording just finished"
     * the same on both platforms, and on iOS it is a real file move out of the App Group.
     */
    AsyncFunction("importFinishedRecordings") { RecordingLibrary.list(context) }

    AsyncFunction("listRecordings") { RecordingLibrary.list(context) }

    AsyncFunction("deleteRecording") { id: String ->
      val file = RecordingLibrary.resolve(context, id) ?: return@AsyncFunction false
      if (file.name == RecordingState.currentFile(context)) return@AsyncFunction false
      file.delete()
      !file.exists()
    }
  }
}
