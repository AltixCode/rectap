# Rectap — the scope decision, and what was built instead

**Status: built, as option 3 below. This document is kept because its analysis
is still correct — it is why the app is shaped the way it is, and why three of
the four original paid claims were cut rather than implemented.**

> **Resolved 2026-09-17.** Option 3 was taken: a native Expo module with a real
> ReplayKit Broadcast Upload Extension on iOS (`plugins/withBroadcastExtension.js`,
> `plugins/broadcast/SampleHandler.swift`) and a real `MediaProjection`
> foreground service on Android — no `react-native-record-screen`, no
> `RPScreenRecorder`. The paid claims were reduced to the two that are true: the
> ads go, and the free tier's 3-minute recording cap goes. Watermarking, 1080p/60
> and trimming were **cut**, not implemented and not claimed. Section 3 below
> explains why, and it still stands.
>
> What the analysis got right and this build does not change: **none of this is
> verifiable on a simulator.** See `HANDOFF.md`.

Everything below is a platform constraint, not a preference.

## What the app promises

From `_shared/apps.json`:

> Tagline: *One tap records your screen. No watermark.*
> Paid: *No watermark on exports* · *1080p and 60fps capture instead of 720p* ·
> *Trim and export clips without leaving the app*

Three of those four are paid claims about **capture and video processing**. A
paid claim has to be a feature that exists, on device, and can be demonstrated.

## Why it cannot be delivered here

### 1. iOS: in-app ReplayKit records the wrong thing

`RPScreenRecorder.startRecording` — what every React Native screen-recorder
wrapper calls — records **the calling app's own content**. Pointed at Rectap, it
records Rectap's own UI. It does not and cannot record the home screen, another
app, or a game.

System-wide capture on iOS needs a **Broadcast Upload Extension**: a second,
separate app target, with its own bundle id, provisioning profile and
`RPBroadcastSampleHandler`, driven by `RPSystemBroadcastPickerView`. Expo
prebuild does not generate app extension targets. Adding one means writing a
config plugin that creates a new Xcode target and ships Swift — a native project
in its own right, and nothing the "generated from a shared template" model here
can hold.

It is also **unverifiable on the iOS Simulator**, which has no ReplayKit. There
would be no honest way to move the device row in `HANDOFF.md` off `UNKNOWN`.

### 2. Android: MediaProjection is real, but not through an available package

`MediaProjection` genuinely can capture the whole screen, behind a foreground
service and a per-session system consent dialog. The only maintained-ish
JavaScript wrapper is `react-native-record-screen`:

- last published **April 2024**
- `compileSdkVersion 34` / `targetSdkVersion 34`; this portfolio compiles and
  targets **36** (Play requires it)
- old-architecture native module; RN 0.86 here runs the New Architecture
- its Android path delegates to HBRecorder, a third-party library of its own

That is not a dependency to put under a paid feature.

### 3. The paid claims need more than capture

- **"1080p and 60fps instead of 720p"** requires real control of the encoder's
  resolution and frame rate. No available wrapper exposes either.
- **"No watermark on exports"** implies free exports *are* watermarked, which
  means compositing an overlay into the video — video processing (ffmpeg or
  platform encoders), which nothing in this stack does.
- **"Trim and export clips"** is the same problem again.

### 4. The competitor is the operating system, and it is free

Both platforms ship a system screen recorder, on every device, with no ad and no
watermark. An app charging for a worse one invites exactly the review Apple
writes: minimum functionality.

## The options as they stood (option 3 was taken)

1. **Drop the slot.** Nineteen shipped apps, no dishonest one. Nothing is lost
   but the number — no store record exists for Rectap, so nothing has to be
   withdrawn. *Recommended.*
2. **Replace the concept, keep the slot.** A different app under a different
   name and bundle id. The Rectap name and `com.altixcode.rectap` bundle id are
   registered but unused, and a replacement would want its own anyway.
3. **Build it properly, as a native project.** An Android-first real recorder:
   a Kotlin MediaProjection foreground-service module plus an Expo config
   plugin, iOS deferred until a Broadcast Upload Extension plugin exists. This
   is weeks, not days, and it is a different kind of work from the rest of the
   portfolio.

What was **not** done, on purpose: shipping a recorder that records only its own
screen, or one with the paid rows greyed out and the copy left standing. Store
enforcement is account-level — one deceptive app can take all nineteen others
with it.

## What option 3 actually cost

Not weeks in the end, because the hard part — the config plugin that creates an
app-extension target `expo prebuild` will not generate — was written once and
sits in `plugins/withBroadcastExtension.js`. What it did cost is the part this
document predicted: **there is no way to verify any of it here.** The recorder
builds, installs, launches and renders on the simulator, and records nothing,
because a simulator has no broadcast infrastructure at all. Every recording gate
in `HANDOFF.md` is `UNKNOWN` and stays that way until someone runs it on a
physical device.
