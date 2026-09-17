package expo.modules.screenrecorder

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.hardware.display.DisplayManager
import android.media.MediaRecorder
import android.media.projection.MediaProjection
import android.media.projection.MediaProjectionManager
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.util.DisplayMetrics
import android.view.WindowManager
import java.io.File

/**
 * Records the screen for as long as it runs.
 *
 * MediaProjection stops the moment the process that owns it leaves the foreground, and a
 * screen recorder that dies when you leave the app is useless. A foreground service is the
 * only way Android allows the capture to continue, and since Android 14 the projection may
 * only be *acquired* once the service is already in the foreground — so the order in
 * `onStartCommand` is not stylistic, it is what stops the system throwing
 * `SecurityException: Media projections require a foreground service`.
 */
class ScreenRecordingService : Service() {
  companion object {
    const val ACTION_START = "expo.modules.screenrecorder.START"
    const val ACTION_STOP = "expo.modules.screenrecorder.STOP"
    const val EXTRA_RESULT_CODE = "resultCode"
    const val EXTRA_RESULT_DATA = "resultData"
    const val EXTRA_MAX_DURATION_MS = "maxDurationMs"

    private const val CHANNEL_ID = "rectap.recording"
    private const val NOTIFICATION_ID = 8021
  }

  private var projection: MediaProjection? = null
  private var recorder: MediaRecorder? = null
  private var virtualDisplay: android.hardware.display.VirtualDisplay? = null
  private var outputFile: File? = null

  /**
   * Registered because Android 14 requires it, and useful before that: the user can revoke
   * the projection from the system UI at any moment, and without this the recorder would go
   * on writing to a display that no longer produces frames.
   */
  private val projectionCallback = object : MediaProjection.Callback() {
    override fun onStop() {
      stopRecording(RecordingState.StopReason.SYSTEM)
    }
  }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    when (intent?.action) {
      ACTION_STOP -> {
        stopRecording(RecordingState.StopReason.USER)
        return START_NOT_STICKY
      }
      ACTION_START -> {
        startForegroundNotification()
        val resultCode = intent.getIntExtra(EXTRA_RESULT_CODE, 0)
        val data: Intent? = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
          intent.getParcelableExtra(EXTRA_RESULT_DATA, Intent::class.java)
        } else {
          @Suppress("DEPRECATION")
          intent.getParcelableExtra(EXTRA_RESULT_DATA)
        }
        if (data == null) {
          fail("Rectap did not receive screen-capture permission.")
          return START_NOT_STICKY
        }
        val maxDurationMs = intent.getLongExtra(EXTRA_MAX_DURATION_MS, 0L)
        startRecording(resultCode, data, maxDurationMs)
        return START_STICKY
      }
      else -> {
        stopSelf()
        return START_NOT_STICKY
      }
    }
  }

  override fun onDestroy() {
    stopRecording(RecordingState.StopReason.SYSTEM)
    super.onDestroy()
  }

  // MARK: - Recording

  private fun startRecording(resultCode: Int, data: Intent, maxDurationMs: Long) {
    val manager = getSystemService(Context.MEDIA_PROJECTION_SERVICE) as MediaProjectionManager
    val projection = try {
      manager.getMediaProjection(resultCode, data)
    } catch (error: Exception) {
      fail("Rectap could not start screen capture.")
      return
    }
    if (projection == null) {
      fail("Rectap could not start screen capture.")
      return
    }
    this.projection = projection
    projection.registerCallback(projectionCallback, Handler(Looper.getMainLooper()))

    val metrics = screenMetrics()
    val file = File(RecordingLibrary.directory(this), RecordingLibrary.newRecordingName())
    outputFile = file

    val recorder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      MediaRecorder(this)
    } else {
      @Suppress("DEPRECATION")
      MediaRecorder()
    }

    try {
      recorder.setVideoSource(MediaRecorder.VideoSource.SURFACE)
      recorder.setOutputFormat(MediaRecorder.OutputFormat.MPEG_4)
      recorder.setOutputFile(file.absolutePath)
      recorder.setVideoEncoder(MediaRecorder.VideoEncoder.H264)
      recorder.setVideoSize(metrics.width, metrics.height)
      recorder.setVideoFrameRate(30)
      recorder.setVideoEncodingBitRate(metrics.bitrate)
      if (maxDurationMs > 0) {
        // A real cap enforced by the encoder, not a timer racing it: the file is
        // finalised at exactly this length and is playable.
        recorder.setMaxDuration(maxDurationMs.toInt())
      }
      recorder.setOnInfoListener { _, what, _ ->
        if (what == MediaRecorder.MEDIA_RECORDER_INFO_MAX_DURATION_REACHED) {
          stopRecording(RecordingState.StopReason.LIMIT)
        }
      }
      recorder.setOnErrorListener { _, _, _ ->
        stopRecording(RecordingState.StopReason.ERROR)
      }
      recorder.prepare()
    } catch (error: Exception) {
      try {
        recorder.release()
      } catch (_: Exception) {
      }
      fail("Rectap could not prepare the recorder.")
      return
    }

    this.recorder = recorder

    virtualDisplay = projection.createVirtualDisplay(
      "rectap",
      metrics.width,
      metrics.height,
      metrics.density,
      DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR,
      recorder.surface,
      null,
      null,
    )

    try {
      recorder.start()
    } catch (error: Exception) {
      fail("Rectap could not start the recorder.")
      return
    }

    RecordingState.markStarted(this, file.name)
  }

  private fun stopRecording(reason: RecordingState.StopReason) {
    val recorder = this.recorder
    this.recorder = null
    var wrote = false

    if (recorder != null) {
      try {
        recorder.stop()
        wrote = true
      } catch (_: Exception) {
        // `stop` throws when the encoder never received a single frame — a
        // recording stopped within a few hundred milliseconds. The part-written
        // file has no moov atom and will not play, so it is deleted below rather
        // than left in the library as a broken entry.
      }
      try {
        recorder.reset()
        recorder.release()
      } catch (_: Exception) {
      }
    }

    try {
      virtualDisplay?.release()
    } catch (_: Exception) {
    }
    virtualDisplay = null

    projection?.let {
      try {
        it.unregisterCallback(projectionCallback)
        it.stop()
      } catch (_: Exception) {
      }
    }
    projection = null

    val file = outputFile
    outputFile = null
    if (file != null && (!wrote || file.length() <= 0L)) {
      file.delete()
      RecordingState.markStopped(this, null, reason)
    } else {
      RecordingState.markStopped(this, file?.name, reason)
    }

    stopForegroundCompat()
    stopSelf()
  }

  private fun fail(message: String) {
    RecordingState.setError(this, message)
    RecordingState.markStopped(this, null, RecordingState.StopReason.ERROR)
    stopForegroundCompat()
    stopSelf()
  }

  // MARK: - Screen size

  private data class Metrics(val width: Int, val height: Int, val density: Int, val bitrate: Int)

  /**
   * The capture size.
   *
   * The display's own pixel size is not always encodable: most devices refuse an H.264
   * surface above roughly 1080p at 30fps, and every AVC encoder requires even dimensions.
   * The long edge is therefore capped and both edges rounded down to even numbers — done
   * here rather than left to MediaRecorder, whose failure mode is `prepare()` succeeding and
   * `start()` throwing an opaque `RuntimeException`.
   */
  private fun screenMetrics(): Metrics {
    val windowManager = getSystemService(Context.WINDOW_SERVICE) as WindowManager
    var width: Int
    var height: Int
    val density: Int

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
      val bounds = windowManager.currentWindowMetrics.bounds
      width = bounds.width()
      height = bounds.height()
      density = resources.displayMetrics.densityDpi
    } else {
      val metrics = DisplayMetrics()
      @Suppress("DEPRECATION")
      windowManager.defaultDisplay.getRealMetrics(metrics)
      width = metrics.widthPixels
      height = metrics.heightPixels
      density = metrics.densityDpi
    }

    val longEdge = maxOf(width, height)
    val maxLongEdge = 1920
    if (longEdge > maxLongEdge) {
      val scale = maxLongEdge.toDouble() / longEdge
      width = (width * scale).toInt()
      height = (height * scale).toInt()
    }
    width -= width % 2
    height -= height % 2

    val bitrate = (width.toLong() * height.toLong() * 5).toInt().coerceIn(2_000_000, 14_000_000)
    return Metrics(width.coerceAtLeast(2), height.coerceAtLeast(2), density, bitrate)
  }

  // MARK: - Notification

  private fun startForegroundNotification() {
    val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val channel = NotificationChannel(
        CHANNEL_ID,
        "Screen recording",
        NotificationManager.IMPORTANCE_LOW,
      )
      channel.setShowBadge(false)
      manager.createNotificationChannel(channel)
    }

    val launch = packageManager.getLaunchIntentForPackage(packageName)
    val pending = launch?.let {
      PendingIntent.getActivity(
        this,
        0,
        it,
        PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
      )
    }

    val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      Notification.Builder(this, CHANNEL_ID)
    } else {
      @Suppress("DEPRECATION")
      Notification.Builder(this)
    }

    // The label is deliberately plain English and lives here rather than in the
    // app's i18n table: this string is rendered by the system while the app's JS
    // is not necessarily running, so there is nothing to translate it with.
    val notification = builder
      .setContentTitle("Rectap is recording your screen")
      .setContentText("Tap to return to Rectap.")
      .setSmallIcon(android.R.drawable.ic_menu_camera)
      .setOngoing(true)
      .also { if (pending != null) it.setContentIntent(pending) }
      .build()

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      startForeground(
        NOTIFICATION_ID,
        notification,
        ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION,
      )
    } else {
      startForeground(NOTIFICATION_ID, notification)
    }
  }

  private fun stopForegroundCompat() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
      stopForeground(STOP_FOREGROUND_REMOVE)
    } else {
      @Suppress("DEPRECATION")
      stopForeground(true)
    }
  }
}
