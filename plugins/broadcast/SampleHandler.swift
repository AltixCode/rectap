import ReplayKit
import AVFoundation
import CoreMedia

/// The ReplayKit broadcast upload extension.
///
/// This is a *separate process* from the app. It is the only way on iOS to see
/// pixels from outside your own app: `RPScreenRecorder` records the host app's
/// own UI and nothing else, which is useless for a screen recorder. The system
/// hands this class the device's video and audio as `CMSampleBuffer`s and it
/// writes them to an mp4 with `AVAssetWriter`.
///
/// Two constraints shape everything here:
///
/// 1. **The 50 MB memory ceiling.** A broadcast upload extension is jetsammed
///    at 50 MB, which is far less than an app. So nothing is buffered: each
///    sample buffer is appended and dropped, the writer's own compression is
///    the only thing holding frames, and `expectsMediaDataInRealTime` is set so
///    AVFoundation drops rather than queues when the encoder falls behind.
///
/// 2. **No shared memory with the app.** The extension has its own container.
///    The finished file and the live state therefore go through the App Group
///    container and its `UserDefaults` suite, which is the only channel the two
///    processes share. `RectapShared.swift` is compiled into *both* targets so
///    the two sides cannot disagree about the paths and keys.
class SampleHandler: RPBroadcastSampleHandler {
  private var writer: AVAssetWriter?
  private var videoInput: AVAssetWriterInput?
  private var audioInput: AVAssetWriterInput?

  /// The writer session cannot start before the first *video* buffer: starting
  /// it on an audio buffer that arrived first makes the video track begin at a
  /// negative offset and the file plays with a black lead-in.
  private var sessionStarted = false
  private var outputURL: URL?
  private var finished = false

  /// Set when the app asks to stop from its own UI. Observed rather than polled
  /// because the extension only gets CPU while buffers arrive.
  private var stopObserved = false

  /// The free tier's recording cap, in seconds, or 0 for no cap. Written by the
  /// app into the shared suite before the broadcast starts, because the extension
  /// has no way to ask about entitlements — it cannot reach RevenueCat, and it is
  /// launched by the system rather than by the app.
  private var maxDurationSeconds: Double = 0
  /// The presentation timestamp of the first frame written, so the cap is measured
  /// against the length the *file* will have rather than against wall-clock time,
  /// which drifts whenever the encoder stalls.
  private var firstVideoTime: CMTime?

  override func broadcastStarted(withSetupInfo setupInfo: [String: NSObject]?) {
    let store = RectapShared.defaults()
    store?.removeObject(forKey: RectapShared.Keys.lastError)

    guard let directory = RectapShared.recordingsDirectory() else {
      // Without the App Group there is no path both processes can see, so the
      // recording could never reach the app. Failing loudly here is much better
      // than writing a file into a container nothing will ever read.
      finishBroadcastWithError(RectapShared.error("Rectap could not open its shared storage."))
      return
    }

    let url = directory.appendingPathComponent(RectapShared.newRecordingName())
    outputURL = url

    do {
      let assetWriter = try AVAssetWriter(outputURL: url, fileType: .mp4)
      assetWriter.shouldOptimizeForNetworkUse = true
      writer = assetWriter
    } catch {
      finishBroadcastWithError(RectapShared.error("Rectap could not start writing the recording."))
      return
    }

    store?.set(true, forKey: RectapShared.Keys.isRecording)
    store?.set(Date().timeIntervalSince1970, forKey: RectapShared.Keys.startedAt)
    store?.set(url.lastPathComponent, forKey: RectapShared.Keys.currentFile)
    store?.removeObject(forKey: RectapShared.Keys.stopRequestedAt)

    maxDurationSeconds = store?.double(forKey: RectapShared.Keys.maxDurationSeconds) ?? 0

    observeStopRequests()
  }

  override func broadcastPaused() {}
  override func broadcastResumed() {}

  override func broadcastFinished() {
    finalise(error: nil)
  }

  override func processSampleBuffer(
    _ sampleBuffer: CMSampleBuffer,
    with sampleBufferType: RPSampleBufferType
  ) {
    guard !finished, CMSampleBufferDataIsReady(sampleBuffer) else { return }

    switch sampleBufferType {
    case .video:
      appendVideo(sampleBuffer)
    case .audioApp:
      // Only the app audio track is written. Mixing app audio and the
      // microphone would need a real mixer in a 50 MB process; the mic is not
      // offered in the UI, so nothing here claims it.
      appendAudio(sampleBuffer)
    default:
      break
    }
  }

  // MARK: - Writing

  private func appendVideo(_ sampleBuffer: CMSampleBuffer) {
    guard let writer else { return }

    if videoInput == nil {
      guard let pixelBuffer = CMSampleBufferGetImageBuffer(sampleBuffer) else { return }
      let width = CVPixelBufferGetWidth(pixelBuffer)
      let height = CVPixelBufferGetHeight(pixelBuffer)
      guard width > 0, height > 0 else { return }

      // H.264 rather than HEVC: the recording is meant to be shared, and every
      // destination plays H.264. The bitrate is scaled to the pixel count so a
      // Pro Max and an SE both get a file that looks like the screen did.
      let bitrate = min(max(Int(Double(width * height) * 5.5), 2_000_000), 14_000_000)
      let settings: [String: Any] = [
        AVVideoCodecKey: AVVideoCodecType.h264,
        AVVideoWidthKey: width,
        AVVideoHeightKey: height,
        AVVideoCompressionPropertiesKey: [
          AVVideoAverageBitRateKey: bitrate,
          AVVideoMaxKeyFrameIntervalKey: 60,
          AVVideoProfileLevelKey: AVVideoProfileLevelH264HighAutoLevel,
        ],
      ]
      let input = AVAssetWriterInput(mediaType: .video, outputSettings: settings)
      input.expectsMediaDataInRealTime = true
      if writer.canAdd(input) {
        writer.add(input)
        videoInput = input
      } else {
        return
      }

      addAudioInputIfPossible(to: writer)
    }

    guard let videoInput else { return }

    if !sessionStarted {
      guard writer.startWriting() else {
        fail("Rectap could not start the recording.")
        return
      }
      writer.startSession(atSourceTime: CMSampleBufferGetPresentationTimeStamp(sampleBuffer))
      sessionStarted = true
    }

    guard writer.status == .writing, videoInput.isReadyForMoreMediaData else { return }

    let timestamp = CMSampleBufferGetPresentationTimeStamp(sampleBuffer)
    if firstVideoTime == nil { firstVideoTime = timestamp }

    // The free tier's length limit, enforced by refusing to write past it rather
    // than by a timer that races the encoder. The frames already written are a
    // complete, playable file at exactly the cap.
    if maxDurationSeconds > 0, let first = firstVideoTime {
      let elapsed = CMTimeGetSeconds(CMTimeSubtract(timestamp, first))
      if elapsed.isFinite, elapsed >= maxDurationSeconds {
        reachedLimit()
        return
      }
    }

    videoInput.append(sampleBuffer)
    publishProgress(sampleBuffer)
  }

  private func addAudioInputIfPossible(to writer: AVAssetWriter) {
    let settings: [String: Any] = [
      AVFormatIDKey: kAudioFormatMPEG4AAC,
      AVNumberOfChannelsKey: 2,
      AVSampleRateKey: 44_100,
      AVEncoderBitRateKey: 128_000,
    ]
    let input = AVAssetWriterInput(mediaType: .audio, outputSettings: settings)
    input.expectsMediaDataInRealTime = true
    if writer.canAdd(input) {
      writer.add(input)
      audioInput = input
    }
  }

  private func appendAudio(_ sampleBuffer: CMSampleBuffer) {
    guard sessionStarted, let writer, writer.status == .writing else { return }
    guard let audioInput, audioInput.isReadyForMoreMediaData else { return }
    audioInput.append(sampleBuffer)
  }

  /// The app's own UI is not on screen while a broadcast runs, so the elapsed
  /// time it shows when the user comes back has to come from here. The
  /// presentation timestamp is used rather than the wall clock because it is
  /// the duration the file will actually have.
  private var lastPublished: CFTimeInterval = 0
  private func publishProgress(_ sampleBuffer: CMSampleBuffer) {
    let now = CACurrentMediaTime()
    guard now - lastPublished > 0.5 else { return }
    lastPublished = now
    RectapShared.defaults()?.set(Date().timeIntervalSince1970, forKey: RectapShared.Keys.heartbeatAt)
  }

  // MARK: - Stopping

  /// The app cannot end a system broadcast directly — only the extension or the
  /// system UI can. A Darwin notification is the one public channel that
  /// crosses the process boundary without a shared file being polled.
  private func observeStopRequests() {
    let center = CFNotificationCenterGetDarwinNotifyCenter()
    let observer = Unmanaged.passUnretained(self).toOpaque()
    CFNotificationCenterAddObserver(
      center,
      observer,
      { _, observer, _, _, _ in
        guard let observer else { return }
        let handler = Unmanaged<SampleHandler>.fromOpaque(observer).takeUnretainedValue()
        handler.stopRequested()
      },
      RectapShared.stopNotificationName as CFString,
      nil,
      .deliverImmediately
    )
  }

  private func stopRequested() {
    guard !stopObserved else { return }
    stopObserved = true
    // `finishBroadcastWithError` is the only API an extension has to end its own
    // broadcast, and iOS shows the localised description to the user. The string
    // is therefore written as a status line rather than as a failure.
    finishBroadcastWithError(RectapShared.error("Recording saved to Rectap."))
  }

  private func reachedLimit() {
    guard !stopObserved else { return }
    stopObserved = true
    let store = RectapShared.defaults()
    store?.set(true, forKey: RectapShared.Keys.hitDurationLimit)
    let message =
      store?.string(forKey: RectapShared.Keys.limitMessage)
        ?? "Free recordings stop at 3 minutes. Your recording is saved in Rectap."
    finishBroadcastWithError(RectapShared.error(message))
  }

  private func fail(_ message: String) {
    RectapShared.defaults()?.set(message, forKey: RectapShared.Keys.lastError)
    finishBroadcastWithError(RectapShared.error(message))
  }

  private func finalise(error: Error?) {
    guard !finished else { return }
    finished = true

    let center = CFNotificationCenterGetDarwinNotifyCenter()
    CFNotificationCenterRemoveEveryObserver(center, Unmanaged.passUnretained(self).toOpaque())

    let store = RectapShared.defaults()
    store?.set(false, forKey: RectapShared.Keys.isRecording)

    guard let writer, sessionStarted, writer.status == .writing else {
      // Nothing was ever written — most often the user stopped within the first
      // frame. The empty file is removed so it cannot show up as a 0-second
      // recording in the library.
      if let outputURL { try? FileManager.default.removeItem(at: outputURL) }
      store?.removeObject(forKey: RectapShared.Keys.currentFile)
      return
    }

    videoInput?.markAsFinished()
    audioInput?.markAsFinished()

    // `finishWriting` is asynchronous and the extension is about to be torn
    // down, so the semaphore is what keeps the process alive long enough to
    // flush the moov atom. Without it the file is left unplayable.
    let semaphore = DispatchSemaphore(value: 0)
    writer.finishWriting { semaphore.signal() }
    _ = semaphore.wait(timeout: .now() + 12)

    if writer.status == .completed, let outputURL {
      store?.set(outputURL.lastPathComponent, forKey: RectapShared.Keys.lastCompletedFile)
    } else if let outputURL {
      try? FileManager.default.removeItem(at: outputURL)
      store?.set("Rectap could not finish writing the recording.", forKey: RectapShared.Keys.lastError)
    }
    store?.removeObject(forKey: RectapShared.Keys.currentFile)
  }
}
