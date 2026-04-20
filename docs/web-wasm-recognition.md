# Web WASM Recognition

## Purpose

This document defines the browser recognition layer for Faces.

The first consumer is a POS web application that needs to speed up staff
handoff at the till. Faces owns face enrollment, embedding extraction, matching,
and worker execution. The POS owns the business action that follows a confident
match, such as selecting the responsible worker.

This is identification, not high-assurance authentication. POS integrations must
keep a manual or PIN fallback.

## Package

Browser support lives in `web/faces-web-recognition` and is published as `@unlikeotherai/faces`.

The package is framework-agnostic TypeScript. It does not depend on React,
React Native, POS data stores, or app routing. Consumers provide camera frames
and enrolled worker embeddings, then receive match events.

## Public Flow

```
camera frame source
    -> FacesWebRecognition
    -> Worker client
    -> Web Worker
    -> model embedder module
    -> embedding
    -> cosine match
    -> onFaceRecognized(match)
```

The POS integration maps `match.workerId` to its local worker selection flow.
For the Kilomayo POS, that means calling its existing responsible-worker setter.

## Responsibilities

`web/faces-web-recognition` is responsible for:

- worker enrollment records
- average embedding calculation
- L2 normalization
- cosine similarity matching
- threshold handling
- frame throttling and in-flight frame dropping
- Web Worker message protocol
- worker-client lifecycle

Consumers are responsible for:

- camera permission UX
- deciding when recognition should run
- providing staff enrollment embeddings
- handling a successful match
- preserving manual login or PIN fallback
- deploying the model and WASM assets

## Enrollment Data

Do not use profile avatars as recognition input. Enrollment must use explicit
staff face capture with consent.

The web layer accepts already-computed embeddings:

```ts
{
  workerId: 'worker-id',
  workerName: 'Name shown by the app',
  embeddings: [Float32Array, Float32Array]
}
```

Embeddings should be produced by the same model version used by the browser
embedder. The package stores only normalized vectors in memory; persistence is
owned by the consuming application or backend.

## Worker Model Boundary

The Web Worker is model-agnostic. During initialization it receives a model
module URL and optional asset URLs. The module must export a factory that creates
an embedder:

```ts
export async function createEmbedder(config) {
  return {
    async embedFrame(frame) {
      return new Float32Array(128)
    },
    dispose() {}
  }
}
```

The model module may load an exported WASM or JavaScript runtime. Model weights
must come from the Faces training/export pipeline and must not be vendored from
third-party pretrained sources.

The model module URL is executable code. The Worker defaults to same-origin
model modules. Cross-origin modules must be explicitly allowlisted with
`allowedModuleOrigins`, and production consumers should pair that with a CSP
that restricts `script-src` and `worker-src`.

## Frame Transfer

The initial implementation uses transferable browser frame objects:

- `VideoFrame` when WebCodecs is available
- `ImageBitmap` for broad browser support
- `ImageData` when a canvas pipeline is required

The worker client transfers supported frame ownership to avoid keeping duplicate
main-thread copies alive.

Submitting a frame transfers ownership to Faces. Consumers must not reuse
`VideoFrame`, `ImageBitmap`, or `ImageData` instances after submission. If a
frame is dropped by throttling or backpressure, Faces releases closeable frame
objects.

`ImageData` is accepted for canvas pipelines, but it is the least efficient
source. Prefer `VideoFrame` or `ImageBitmap` when available because `ImageData`
can copy megabytes of RGBA pixels across the Worker boundary.

## SharedArrayBuffer

`SharedArrayBuffer` is an optimization, not a prerequisite.

It requires cross-origin isolation:

- `Cross-Origin-Opener-Policy: same-origin`
- `Cross-Origin-Embedder-Policy: require-corp`

Those headers affect the full POS deployment and any embedded third-party
resources, so they should be enabled only after the app shell and deployment
surface are verified.

The first production path should use Worker transferables. Add a shared ring
buffer only if profiling shows frame transfer or allocation is the bottleneck.

Recommended deployment headers for POS web consumers:

- `Content-Security-Policy` with strict `script-src` and `worker-src`
- `Cross-Origin-Opener-Policy: same-origin` only when shared memory is enabled
- `Cross-Origin-Embedder-Policy: require-corp` only when shared memory is enabled

## Matching

Each enrolled worker has an average normalized embedding. Each live embedding is
normalized before scoring.

```
score = dot(liveEmbedding, workerAverageEmbedding)

if score >= threshold:
    emit match
```

The default threshold is `0.70`, matching native Faces behavior. POS consumers
may choose a higher threshold and still require PIN confirmation for sensitive
operations.

## Runtime Rules

- Process only one frame at a time.
- Drop frames while embedding is in flight.
- Use a minimum frame interval to avoid starving POS UI work.
- Stop the frame source when recognition stops.
- Dispose the worker client when the app no longer needs recognition.
- Never block payment, order, or inventory paths on face recognition.
- Treat recognition errors as non-fatal and keep manual staff selection usable.

## POS Integration Contract

A POS should integrate at the staff-selection boundary:

1. Load enrolled staff embeddings for active POS workers.
2. Start recognition only when the till is ready for staff interaction.
3. On confident match, call the POS worker-selection action.
4. Keep manual worker selection and PIN entry available.
5. Stop recognition when the POS leaves staff-selection context or camera access
   is no longer needed.

Faces should not import POS code.
