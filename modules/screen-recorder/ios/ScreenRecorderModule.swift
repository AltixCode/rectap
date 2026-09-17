import ExpoModulesCore
import ReplayKit
import AVFoundation
import UIKit

/// The app's half of the screen recorder.
///
/// It does not record anything itself — it cannot. On iOS the capture happens in the
/// broadcast upload extension (`plugins/broadcast/SampleHandler.swift`), in a separate
/// process the system owns. This module is the app's view of that: it starts the system
/// picker, reports whether a broadcast is running, asks it to stop, and moves the finished
/// file out of the shared container into the app's own Documents directory so the library
/// keeps working after the App Group is cleaned up.
public class ScreenRecorderModule: Module {
  public func definition() -> ModuleDefinition {
    Name("ScreenRecorder")

    /// True when the device can record at all. iOS 12+ has ReplayKit broadcasting, but the
    /// simulator has no broadcast infrastructure: the picker appears and nothing ever starts.
    /// The JS side uses this to say so plainly rather than leaving a dead button.
    Function("isSupported") { () -> Bool in
      #if targetEnvironment(simulator)
        return false
      #else
        return RectapShared.containerURL() != nil
      #endif
    }

    /// iOS can only start a broadcast through Apple's own picker, which is a view rather
    /// than a call. Android starts one directly. The UI draws a different control for each.
    Function("usesSystemPicker") { () -> Bool in true }

    /// Present only so both platforms expose one API. On iOS there is no way to start a
    /// system broadcast programmatically — the user must tap the picker — so this reports
    /// that rather than pretending to have started anything.
    AsyncFunction("startRecording") { (_: Double) -> String in
      "requires-picker"
    }

    Function("getStatus") { () -> [String: Any] in
      let store = RectapShared.defaults()
      let recording = store?.bool(forKey: RectapShared.Keys.isRecording) ?? false
      var result: [String: Any] = ["isRecording": recording]
      if let startedAt = store?.object(forKey: RectapShared.Keys.startedAt) as? Double {
        result["startedAt"] = startedAt * 1000
      }
      if let error = store?.string(forKey: RectapShared.Keys.lastError) {
        result["error"] = error
      }
      if store?.bool(forKey: RectapShared.Keys.hitDurationLimit) == true {
        result["lastStopReason"] = "limit"
        store?.removeObject(forKey: RectapShared.Keys.hitDurationLimit)
      }
      return result
    }

    Function("clearError") {
      RectapShared.defaults()?.removeObject(forKey: RectapShared.Keys.lastError)
    }

    /// Written before the broadcast starts so the extension knows the free-tier cap.
    /// A value of 0 means uncapped. `limitMessage` is the already-translated line iOS
    /// shows when the cap is hit — the extension has no access to the app's i18n table.
    Function("setMaxDuration") { (seconds: Double, limitMessage: String) in
      let store = RectapShared.defaults()
      store?.set(seconds, forKey: RectapShared.Keys.maxDurationSeconds)
      store?.set(limitMessage, forKey: RectapShared.Keys.limitMessage)
    }

    /// Asks the extension to finish.
    ///
    /// Only the extension itself or the system UI can end a broadcast, so this posts the
    /// Darwin notification the extension listens for. It is a request, not a command: if the
    /// extension has already been killed the notification goes nowhere, which is why the JS
    /// side reconciles against `getStatus` rather than assuming this worked.
    Function("requestStop") {
      RectapShared.defaults()?.set(Date().timeIntervalSince1970, forKey: RectapShared.Keys.stopRequestedAt)
      CFNotificationCenterPostNotification(
        CFNotificationCenterGetDarwinNotifyCenter(),
        CFNotificationName(RectapShared.stopNotificationName as CFString),
        nil,
        nil,
        true
      )
    }

    /// Moves anything the extension finished into the app's own storage, then returns the
    /// whole library, newest first.
    ///
    /// The App Group container is shared and comparatively fragile — it is also where the
    /// extension writes while running — so recordings do not live there. Returning the full
    /// library rather than only what moved keeps this identical to the Android call, where
    /// the service writes into the library directly and there is nothing to move.
    AsyncFunction("importFinishedRecordings") { () -> [[String: Any]] in
      try Self.importFinished()
      return try Self.listLibrary()
    }

    AsyncFunction("listRecordings") { () -> [[String: Any]] in
      try Self.listLibrary()
    }

    AsyncFunction("deleteRecording") { (id: String) -> Bool in
      guard let url = Self.libraryURL(for: id) else { return false }
      guard RectapShared.defaults()?.string(forKey: RectapShared.Keys.currentFile) != id else {
        return false
      }
      try? FileManager.default.removeItem(at: url)
      return !FileManager.default.fileExists(atPath: url.path)
    }

    /// Apple's own broadcast picker, rendered as a real view in the React tree.
    ///
    /// There is a widely copied trick that walks this view's subviews looking for the
    /// `UIButton` and sends it a synthetic `.touchUpInside` so the picker can be triggered
    /// from a button of your own. That is not done here: the user taps Apple's control
    /// directly. The only cosmetic change is hiding the stock icon so the app's own label,
    /// drawn underneath, is what shows.
    View(BroadcastPickerView.self) {
      Prop("preferredExtension") { (view: BroadcastPickerView, value: String) in
        view.picker.preferredExtension = value
      }
    }
  }

  // MARK: - Library

  /// Where recordings live once they belong to the app.
  private static func libraryDirectory() throws -> URL {
    let documents = try FileManager.default.url(
      for: .documentDirectory,
      in: .userDomainMask,
      appropriateFor: nil,
      create: true
    )
    let directory = documents.appendingPathComponent("Recordings", isDirectory: true)
    if !FileManager.default.fileExists(atPath: directory.path) {
      try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    }
    return directory
  }

  private static func libraryURL(for id: String) -> URL? {
    // `id` comes from JS. Anything with a path separator in it could escape the
    // library directory, so the id is only ever a single path component.
    guard !id.contains("/"), !id.contains(".."), !id.isEmpty else { return nil }
    return try? libraryDirectory().appendingPathComponent(id)
  }

  @discardableResult
  private static func importFinished() throws -> [[String: Any]] {
    guard let shared = RectapShared.recordingsDirectory() else { return [] }
    let library = try libraryDirectory()
    let store = RectapShared.defaults()
    let inFlight = store?.string(forKey: RectapShared.Keys.currentFile)

    let names = try FileManager.default.contentsOfDirectory(atPath: shared.path)
      .filter { $0.hasSuffix(".mp4") }
      // The file the extension is writing to right now must be left alone: moving
      // it out from under an open AVAssetWriter produces a truncated, unplayable
      // recording and loses whatever the user is still capturing.
      .filter { $0 != inFlight }

    var imported: [[String: Any]] = []
    for name in names {
      let source = shared.appendingPathComponent(name)
      let destination = library.appendingPathComponent(name)
      if FileManager.default.fileExists(atPath: destination.path) {
        try? FileManager.default.removeItem(at: source)
        continue
      }
      do {
        try FileManager.default.moveItem(at: source, to: destination)
      } catch {
        continue
      }
      if let info = describe(destination) {
        imported.append(info)
      }
    }
    store?.removeObject(forKey: RectapShared.Keys.lastCompletedFile)
    return imported.sorted { ($0["createdAt"] as? Double ?? 0) > ($1["createdAt"] as? Double ?? 0) }
  }

  private static func listLibrary() throws -> [[String: Any]] {
    let library = try libraryDirectory()
    let names = try FileManager.default.contentsOfDirectory(atPath: library.path)
      .filter { $0.hasSuffix(".mp4") }
    return names
      .compactMap { describe(library.appendingPathComponent($0)) }
      .sorted { ($0["createdAt"] as? Double ?? 0) > ($1["createdAt"] as? Double ?? 0) }
  }

  /// Reads the real duration and size off the file.
  ///
  /// Both are read from the asset rather than tracked while recording, because the only
  /// number worth showing is the one the finished file actually has.
  private static func describe(_ url: URL) -> [String: Any]? {
    let attributes = try? FileManager.default.attributesOfItem(atPath: url.path)
    let size = (attributes?[.size] as? NSNumber)?.doubleValue ?? 0
    guard size > 0 else { return nil }
    let created = (attributes?[.creationDate] as? Date) ?? Date()

    let asset = AVURLAsset(url: url)
    let duration = CMTimeGetSeconds(asset.duration)

    var result: [String: Any] = [
      "id": url.lastPathComponent,
      "uri": url.absoluteString,
      "sizeBytes": size,
      "createdAt": created.timeIntervalSince1970 * 1000,
      "durationSeconds": duration.isFinite && duration > 0 ? duration : 0,
    ]
    if let track = asset.tracks(withMediaType: .video).first {
      let size = track.naturalSize.applying(track.preferredTransform)
      result["width"] = abs(size.width)
      result["height"] = abs(size.height)
    }
    return result
  }
}

/// Hosts `RPSystemBroadcastPickerView` and lets it fill the space React gives it.
///
/// The stock control is a fixed-size circular button that does not resize with its frame, so
/// left alone it sits in the corner of whatever box the layout allocates. Its internal button
/// is stretched to the bounds instead, and its image hidden, so the whole of the app's own
/// button area is tappable.
final class BroadcastPickerView: ExpoView {
  let picker = RPSystemBroadcastPickerView(
    frame: CGRect(x: 0, y: 0, width: 60, height: 60)
  )

  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    picker.showsMicrophoneButton = false
    picker.translatesAutoresizingMaskIntoConstraints = false
    addSubview(picker)
    NSLayoutConstraint.activate([
      picker.leadingAnchor.constraint(equalTo: leadingAnchor),
      picker.trailingAnchor.constraint(equalTo: trailingAnchor),
      picker.topAnchor.constraint(equalTo: topAnchor),
      picker.bottomAnchor.constraint(equalTo: bottomAnchor),
    ])
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    for case let button as UIButton in picker.subviews {
      button.frame = bounds
      button.imageView?.isHidden = true
      button.setImage(nil, for: .normal)
      button.backgroundColor = .clear
    }
  }
}
