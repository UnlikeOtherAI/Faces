# @unlikeotherai/faces

Browser recognition package for Faces.

This package owns the web-side recognition loop:

```text
camera frame source -> Web Worker client -> model embedder -> embedding -> match
```

It is framework-agnostic. A consuming POS app decides when recognition runs and
what a successful match does.

## Usage

```ts
import {
  createFacesWebRecognition,
  createFacesRecognitionWorker,
  createRecognitionWorkerClient,
} from '@unlikeotherai/faces';

const worker = createFacesRecognitionWorker();
const workerClient = createRecognitionWorkerClient(worker);
await workerClient.initialize({
  moduleUrl: new URL('./modelEmbedder.ts', import.meta.url).href,
  allowedModuleOrigins: [location.origin],
  expectedEmbeddingDimensions: 128,
  wasmUrl: '/faces/model.wasm',
  modelUrl: '/faces/model.bin',
});

const recognition = createFacesWebRecognition({ workerClient });

recognition.replaceWorkerEmbeddings([
  {
    workerId: 'worker-1',
    workerName: 'Alice',
    embeddings: [new Float32Array([1, 0, 0])],
  },
]);

const unsubscribe = recognition.onFaceRecognized((match) => {
  console.log(match.workerId, match.score);
});
```

Submitted frames are owned by the recognition layer. Do not reuse a
`VideoFrame`, `ImageBitmap`, or `ImageData` after submitting it.

The model embedder module is supplied by the application or model export layer.
It must expose `createEmbedder(config)` and return an object with `embedFrame`.
Model modules default to same-origin loading; cross-origin modules must be
explicitly allowlisted.

Model weights are not included in this package.

## Build

```bash
pnpm install
pnpm run build
```

The published package serves files from `dist/`.
