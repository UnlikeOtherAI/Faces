# E2E Testing with AppReveal

All example apps use [AppReveal](https://github.com/UnlikeOtherAI/AppReveal) for E2E testing. AppReveal is a debug-only in-app MCP server that exposes 43 native-control tools (tap, type, scroll, screenshot, state, network) over the local network — Playwright for native apps.

## Integration

**iOS** — Swift Package Manager:

```swift
.package(url: "https://github.com/UnlikeOtherAI/AppReveal.git", from: "0.2.0")
```

```swift
#if DEBUG
AppReveal.start()
#endif
```

**Android** — Gradle:

```kotlin
debugImplementation("com.appreveal:appreveal")
releaseImplementation("com.appreveal:appreveal-noop")
```

```kotlin
if (BuildConfig.DEBUG) {
    AppReveal.start(this)
}
```

## Required test coverage (both iOS and Android)

1. **Time displayed** — recognition timestamp is visible on screen and updates.
2. **Identification result shown** — matched user name (or "unknown") appears within the latency window after a face is detected.
3. **Registration flow** — 3–5 photo capture → embedding saved → user appears in list.
4. **Recognition flow** — registered user triggers login event, UI reflects match.
5. **Debug metrics** — similarity score, FPS, and latency are all visible in the debug example app.

## Element ID conventions

- Screen keys: `section.screen` — e.g. `registration.capture`, `recognition.live`, `debug.metrics`
- Element IDs: `screen.element` — e.g. `recognition.timestamp`, `recognition.matched_user`, `debug.similarity_score`, `debug.fps`, `debug.latency_ms`

All interactive and display elements must have accessibility identifiers (iOS) or resource ID/view tag (Android) set to these names.

## Running tests

Tests are MCP-driven — run by Claude Code with AppReveal connected against a live simulator/emulator or real device. No separate test framework is needed; the MCP tools are the harness.

Full click-through tests must pass on both platforms before any PR merge on the example apps.
