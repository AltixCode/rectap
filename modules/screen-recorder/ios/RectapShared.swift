import Foundation

/// Everything the app and the broadcast extension both need to agree about.
///
/// The two are separate processes with separate containers, so every disagreement
/// here is a recording that is written somewhere the app will never look. This
/// file is compiled into the app by the ScreenRecorder podspec and *copied* into
/// the extension target by `plugins/withBroadcastExtension.js`, so there is one
/// source of truth in the repository and no chance of the two drifting.
enum RectapShared {
  /// Must match `APP_GROUP` in plugins/withBroadcastExtension.js and the
  /// `com.apple.security.application-groups` entitlement on both targets.
  static let appGroup = "group.com.altixcode.rectap"

  /// A Darwin notification name is a global string, not a bundle-scoped one, so
  /// it carries the bundle id to avoid colliding with any other app on device.
  static let stopNotificationName = "com.altixcode.rectap.broadcast.stop"

  enum Keys {
    static let isRecording = "rectap.isRecording"
    static let startedAt = "rectap.startedAt"
    static let heartbeatAt = "rectap.heartbeatAt"
    static let currentFile = "rectap.currentFile"
    static let lastCompletedFile = "rectap.lastCompletedFile"
    static let lastError = "rectap.lastError"
    static let stopRequestedAt = "rectap.stopRequestedAt"
    /// Written by the app before the broadcast starts; read by the extension.
    static let maxDurationSeconds = "rectap.maxDurationSeconds"
    /// The message iOS shows when the extension ends the broadcast at the free cap.
    /// The extension runs without the app's JS, so it cannot call `t()` — the app
    /// writes the already-translated string here before the broadcast starts.
    static let limitMessage = "rectap.limitMessage"
    /// Set by the extension when it stopped because the free cap was reached, so
    /// the app can explain why the recording ended rather than leaving the user
    /// to guess. Cleared by the app once it has said so.
    static let hitDurationLimit = "rectap.hitDurationLimit"
  }

  static func defaults() -> UserDefaults? {
    UserDefaults(suiteName: appGroup)
  }

  static func containerURL() -> URL? {
    FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: appGroup)
  }

  /// The shared folder finished recordings land in.
  ///
  /// Created on demand from both sides: whichever process gets there first wins
  /// and `withIntermediateDirectories` makes the loser a no-op rather than a
  /// throw.
  static func recordingsDirectory() -> URL? {
    guard let container = containerURL() else { return nil }
    let directory = container.appendingPathComponent("Recordings", isDirectory: true)
    if !FileManager.default.fileExists(atPath: directory.path) {
      try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    }
    return directory
  }

  /// Sortable, unique, and safe in a filename on every platform the file may be
  /// shared to — which rules out the colons a plain ISO-8601 timestamp has.
  static func newRecordingName() -> String {
    let formatter = DateFormatter()
    formatter.locale = Locale(identifier: "en_US_POSIX")
    formatter.dateFormat = "yyyy-MM-dd-HHmmss"
    return "rectap-\(formatter.string(from: Date())).mp4"
  }

  static func error(_ message: String) -> NSError {
    NSError(
      domain: "com.altixcode.rectap",
      code: 0,
      userInfo: [NSLocalizedDescriptionKey: message]
    )
  }
}
