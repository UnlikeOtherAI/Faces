import { describe, expect, test } from 'vitest';
import { createFacesWebRecognition } from './createFacesWebRecognition';
import type {
  RecognitionFrame,
  RecognitionFrameSource,
  RecognitionWorkerClient,
} from './types';

const frame = {} as RecognitionFrame;

describe('createFacesWebRecognition', () => {
  test('emits a match when a frame embedding crosses the threshold', async () => {
    const recognition = createFacesWebRecognition({
      workerClient: createStaticWorkerClient([1, 0]),
      threshold: 0.8,
      minFrameIntervalMs: 0,
    });
    recognition.replaceWorkerEmbeddings([
      {
        workerId: 'worker-id',
        workerName: 'Worker',
        embeddings: [[1, 0]],
      },
    ]);

    const matches: string[] = [];
    recognition.onFaceRecognized((match) => {
      matches.push(match.workerId);
    });

    const match = await recognition.recognizeFrame(frame);

    expect(match?.workerId).toBe('worker-id');
    expect(matches).toEqual(['worker-id']);
  });

  test('does not emit when the match is below the threshold', async () => {
    const recognition = createFacesWebRecognition({
      workerClient: createStaticWorkerClient([0, 1]),
      threshold: 0.8,
      minFrameIntervalMs: 0,
    });
    recognition.replaceWorkerEmbeddings([
      {
        workerId: 'worker-id',
        workerName: 'Worker',
        embeddings: [[1, 0]],
      },
    ]);

    const matches: string[] = [];
    recognition.onFaceRecognized((match) => {
      matches.push(match.workerId);
    });

    expect(await recognition.recognizeFrame(frame)).toBeNull();
    expect(matches).toEqual([]);
  });

  test('starts and stops a frame source', async () => {
    let onFrame: ((submission: { frame: RecognitionFrame }) => void) | null =
      null;
    let stopped = false;
    const source: RecognitionFrameSource = {
      start(nextOnFrame) {
        onFrame = nextOnFrame;
      },
      stop() {
        stopped = true;
      },
    };
    const recognition = createFacesWebRecognition({
      workerClient: createStaticWorkerClient([1, 0]),
      minFrameIntervalMs: 0,
    });
    recognition.replaceWorkerEmbeddings([
      {
        workerId: 'worker-id',
        workerName: 'Worker',
        embeddings: [[1, 0]],
      },
    ]);

    await recognition.startRecognition(source);
    expect(recognition.isRunning()).toBe(true);
    if (!onFrame) {
      throw new Error('Frame source did not register a callback.');
    }
    onFrame({ frame });
    await waitForMicrotask();
    await recognition.stopRecognition();

    expect(stopped).toBe(true);
    expect(recognition.isRunning()).toBe(false);
  });

  test('does not emit a source match after recognition stops', async () => {
    const deferred = createDeferred<Float32Array>();
    const recognition = createFacesWebRecognition({
      workerClient: {
        embedFrame: () => deferred.promise,
      },
      minFrameIntervalMs: 0,
    });
    recognition.replaceWorkerEmbeddings([
      {
        workerId: 'worker-id',
        workerName: 'Worker',
        embeddings: [[1, 0]],
      },
    ]);
    const matches: string[] = [];
    recognition.onFaceRecognized((match) => {
      matches.push(match.workerId);
    });
    let onFrame: ((submission: { frame: RecognitionFrame }) => void) | null =
      null;

    await recognition.startRecognition({
      start(nextOnFrame) {
        onFrame = nextOnFrame;
      },
      stop() {},
    });
    if (!onFrame) {
      throw new Error('Frame source did not register a callback.');
    }

    onFrame({ frame });
    await recognition.stopRecognition();
    deferred.resolve(Float32Array.from([1, 0]));
    await waitForMicrotask();

    expect(matches).toEqual([]);
  });

  test('closes dropped frames', async () => {
    const deferred = createDeferred<Float32Array>();
    const recognition = createFacesWebRecognition({
      workerClient: {
        embedFrame: () => deferred.promise,
      },
      minFrameIntervalMs: 0,
    });
    const droppedFrame = createClosableFrame();

    void recognition.recognizeFrame(frame);
    expect(await recognition.recognizeFrame(droppedFrame)).toBeNull();

    expect(droppedFrame.closeCount).toBe(1);
    deferred.resolve(Float32Array.from([1, 0]));
  });

  test('closes source frames that arrive after recognition stops', async () => {
    const recognition = createFacesWebRecognition({
      workerClient: createStaticWorkerClient([1, 0]),
      minFrameIntervalMs: 0,
    });
    let onFrame: ((submission: { frame: RecognitionFrame }) => void) | null =
      null;

    await recognition.startRecognition({
      start(nextOnFrame) {
        onFrame = nextOnFrame;
      },
      stop() {},
    });
    await recognition.stopRecognition();
    if (!onFrame) {
      throw new Error('Frame source did not register a callback.');
    }

    const lateFrame = createClosableFrame();
    onFrame({ frame: lateFrame });

    expect(lateFrame.closeCount).toBe(1);
  });

  test('emits recognition errors from frame sources', async () => {
    const recognition = createFacesWebRecognition({
      workerClient: {
        async embedFrame() {
          throw new Error('model failed');
        },
      },
      minFrameIntervalMs: 0,
    });
    const errors: string[] = [];
    recognition.onRecognitionError((error) => {
      errors.push(error.message);
    });
    let onFrame: ((submission: { frame: RecognitionFrame }) => void) | null =
      null;

    await recognition.startRecognition({
      start(nextOnFrame) {
        onFrame = nextOnFrame;
      },
      stop() {},
    });
    if (!onFrame) {
      throw new Error('Frame source did not register a callback.');
    }

    onFrame({ frame });
    await waitForMicrotask();

    expect(errors).toEqual(['model failed']);
  });
});

const createStaticWorkerClient = (
  embedding: readonly number[],
): RecognitionWorkerClient => ({
  async embedFrame() {
    return Float32Array.from(embedding);
  },
});

const waitForMicrotask = () =>
  new Promise<void>((resolve) => {
    queueMicrotask(() => resolve());
  });

const createDeferred = <Value>() => {
  let resolve: (value: Value) => void = () => {};
  let reject: (error: Error) => void = () => {};
  const promise = new Promise<Value>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, reject, resolve };
};

const createClosableFrame = (): RecognitionFrame & { closeCount: number } => {
  const closable = {
    closeCount: 0,
    close() {
      this.closeCount += 1;
    },
  };
  return closable as unknown as RecognitionFrame & { closeCount: number };
};
