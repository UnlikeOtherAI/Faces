# Faces — Project Rules for Claude

## Documentation Rules

- **No documentation file may exceed 1,000 lines.** If content grows beyond that, convert the file into a folder of the same name. The folder must contain:
  - `index.md` — a site map with a brief overview and links to each sub-document
  - Individual topic files covering the split-out sections
- Apply this rule recursively: sub-documents also cap at 1,000 lines.

## Code Rules

- **No source file may exceed 500 lines.** Split before you write, not after.
- Before writing any code, a **clearly defined architecture document must exist** in `docs/`. Code that has no corresponding architecture doc should not be generated.
- **No generated files in the repo.** This includes:
  - Compiled models (`.mlmodelc`, `.tflite`, built binaries)
  - Build artefacts (`build/`, `dist/`, `DerivedData/`, `Pods/`, `.gradle/`)
  - IDE metadata (`.idea/`, `.vscode/`, `*.xcuserdata`)
  - Auto-generated lock files committed without intent
- Keep `.gitignore` accurate and up to date. If a new generated file type is introduced, add it to `.gitignore` immediately.

## E2E Testing — AppReveal

All example apps must embed **[AppReveal](https://github.com/UnlikeOtherAI/AppReveal)** in their debug builds. AppReveal is an in-app MCP server that exposes 43 native-control tools (tap, type, scroll, screenshot, state inspection, network traffic) over the local network — Playwright for native apps.

### Integration

**iOS example app** — add via Swift Package Manager:

```swift
// Package.swift
.package(url: "https://github.com/UnlikeOtherAI/AppReveal.git", from: "0.2.0")
```

```swift
#if DEBUG
AppReveal.start()
#endif
```

**Android example app** — add via Gradle:

```kotlin
debugImplementation("com.appreveal:appreveal")
releaseImplementation("com.appreveal:appreveal-noop")
```

```kotlin
if (BuildConfig.DEBUG) {
    AppReveal.start(this)
}
```

### Required E2E tests

Every example app must have a full click-through E2E test suite covering both iOS and Android. Tests run against a debug build with AppReveal active, driven via MCP tools (Claude or any MCP client).

The following must be verified in every test run:

1. **Time is displayed** — the current recognition timestamp or elapsed time is visible on screen and updates correctly.
2. **Identification result is shown** — after a face is detected, the matched user's name (or "unknown") appears on screen within the target latency window.
3. **Registration flow** — a user can be registered end-to-end (3–5 photo capture → embedding saved → user appears in list).
4. **Recognition flow** — a registered user triggers a login event and the UI reflects the match.
5. **Debug metrics** — the debug example app shows similarity score, frame rate, and latency in real time.

### Element ID conventions

Follow AppReveal naming conventions so tests can address elements deterministically:

- Screen keys: `section.screen` (e.g. `registration.capture`, `recognition.live`, `debug.metrics`)
- Element IDs: `screen.element` (e.g. `recognition.timestamp`, `recognition.matched_user`, `debug.similarity_score`, `debug.fps`, `debug.latency_ms`)

All interactive and display elements in the example apps must have accessibility identifiers (iOS) or resource ID / view tag (Android) set according to this scheme.

### Test execution

Tests are MCP-driven — run by an LLM agent (Claude Code with AppReveal MCP connected) against a live simulator/emulator or real device. No separate test framework is required; the MCP tools are the test harness.

Before any release or PR merge on the example apps, the full click-through test must be executed and pass on both platforms.
