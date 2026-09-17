import fs from "fs";
import path from "path";

// The plugin is CommonJS, loaded by `expo prebuild` rather than by the bundler.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const plugin = require("../withBroadcastExtension") as {
  APP_GROUP: string;
  TARGET_NAME: string;
  SOURCES: { from: string; to: string }[];
};

const repoRoot = path.join(__dirname, "..", "..");
const sharedSwift = fs.readFileSync(
  path.join(
    repoRoot,
    "modules",
    "screen-recorder",
    "ios",
    "RectapShared.swift",
  ),
  "utf8",
);

/**
 * The app and the broadcast extension are two processes that share exactly one thing: an
 * App Group. Its identifier is written twice — once in the config plugin, which puts it in
 * both targets' entitlements, and once in Swift, which is what actually opens the container.
 * Swift cannot import the plugin and the plugin cannot read Swift, so nothing but this test
 * makes the pair fail loudly. If they drift, the build still succeeds, the picker still
 * appears, the extension still records — into a container the app will never look in. The
 * only symptom is a recorder that produces nothing, with no error anywhere.
 */
describe("withBroadcastExtension", () => {
  it("uses the same App Group as RectapShared.swift", () => {
    const match = sharedSwift.match(/static let appGroup = "([^"]+)"/);
    expect(match).not.toBeNull();
    expect(plugin.APP_GROUP).toBe(match![1]);
  });

  it("copies every source the extension target compiles", () => {
    expect(plugin.SOURCES.length).toBeGreaterThan(0);
    for (const source of plugin.SOURCES) {
      // The plugin throws at prebuild time on a missing source, which is a failure
      // an hour into a CI build rather than a second into a test run.
      expect(fs.existsSync(path.join(repoRoot, source.from))).toBe(true);
    }
  });

  it("compiles the shared file into the extension as well as the app", () => {
    // The app gets its copy through the ScreenRecorder podspec's glob; the
    // extension only gets one because the plugin copies it in.
    expect(plugin.SOURCES.map((source) => source.to)).toContain(
      "RectapShared.swift",
    );
  });
});
