import {
  createWorkerEmbeddingRecord,
  defaultRecognitionThreshold,
  findBestMatch,
} from './matching';
import type {
  EnrolledWorker,
  FacesWebRecognition,
  FacesWebRecognitionOptions,
  MatchResult,
  RecognitionFrame,
  RecognitionFrameSource,
  RecognitionFrameSubmission,
  WorkerEmbeddingRecord,
} from './types';

const defaultMinFrameIntervalMs = 250;

export const createFacesWebRecognition = ({
  workerClient,
  threshold = defaultRecognitionThreshold,
  minFrameIntervalMs = defaultMinFrameIntervalMs,
}: FacesWebRecognitionOptions): FacesWebRecognition => {
  let running = false;
  let frameSource: RecognitionFrameSource | null = null;
  let inFlight = false;
  let lastStartedAt = Number.NEGATIVE_INFINITY;
  let sourceRunId = 0;
  let workers: WorkerEmbeddingRecord[] = [];
  const listeners = new Set<(match: MatchResult) => void>();
  const errorListeners = new Set<(error: Error) => void>();

  const recognizeFrame = async (
    frame: RecognitionFrame,
    transfer?: Transferable[],
    expectedSourceRunId?: number,
  ): Promise<MatchResult | null> => {
    const startedAt = now();
    if (inFlight || startedAt - lastStartedAt < minFrameIntervalMs) {
      releaseFrame(frame);
      return null;
    }

    inFlight = true;
    lastStartedAt = startedAt;
    try {
      const embedding = await workerClient.embedFrame(frame, transfer);
      if (
        expectedSourceRunId !== undefined &&
        (!running || expectedSourceRunId !== sourceRunId)
      ) {
        return null;
      }
      const latencyMs = now() - startedAt;
      const match = findBestMatch(embedding, workers, threshold, latencyMs);
      if (match) {
        notify(match);
      }
      return match;
    } catch (error) {
      releaseFrame(frame);
      throw error;
    } finally {
      inFlight = false;
    }
  };

  const handleSourceFrame = (submission: RecognitionFrameSubmission) => {
    if (!running) {
      releaseFrame(submission.frame);
      return;
    }
    const runId = sourceRunId;
    void recognizeFrame(submission.frame, submission.transfer, runId).catch(
      (error: unknown) => {
        notifyError(toError(error));
      },
    );
  };

  return {
    async startRecognition(source) {
      if (running) {
        return;
      }
      running = true;
      sourceRunId += 1;
      frameSource = source;
      try {
        await source.start(handleSourceFrame);
      } catch (error) {
        running = false;
        frameSource = null;
        throw error;
      }
    },

    async stopRecognition() {
      if (!running) {
        return;
      }
      running = false;
      sourceRunId += 1;
      const source = frameSource;
      frameSource = null;
      await source?.stop();
    },

    recognizeFrame,

    registerWorkerEmbeddings(worker: EnrolledWorker) {
      const record = createWorkerEmbeddingRecord(worker);
      for (const item of workers) {
        if (item.workerId === record.workerId) {
          zeroWorkerRecord(item);
        }
      }
      workers = [
        ...workers.filter((item) => item.workerId !== record.workerId),
        record,
      ];
    },

    replaceWorkerEmbeddings(nextWorkers) {
      clearWorkerRecords(workers);
      workers = nextWorkers.map(createWorkerEmbeddingRecord);
    },

    clearWorkerEmbeddings() {
      clearWorkerRecords(workers);
      workers = [];
    },

    getWorkers() {
      return workers.slice();
    },

    onFaceRecognized(callback) {
      listeners.add(callback);
      return () => {
        listeners.delete(callback);
      };
    },

    onRecognitionError(callback) {
      errorListeners.add(callback);
      return () => {
        errorListeners.delete(callback);
      };
    },

    isRunning() {
      return running;
    },
  };

  function notify(match: MatchResult) {
    for (const listener of listeners) {
      try {
        listener(match);
      } catch (error) {
        notifyError(toError(error));
      }
    }
  }

  function notifyError(error: Error) {
    for (const listener of errorListeners) {
      try {
        listener(error);
      } catch {
        // Error listeners must not break recognition cleanup.
      }
    }
  }
};

const now = (): number => globalThis.performance?.now() ?? Date.now();

const releaseFrame = (frame: RecognitionFrame) => {
  if (isRecord(frame) && typeof frame.close === 'function') {
    try {
      frame.close();
    } catch {
      // Already-transferred or already-closed frames may reject cleanup.
    }
  }
};

const zeroEmbedding = (embedding: Float32Array) => {
  embedding.fill(0);
};

const zeroWorkerRecord = (worker: WorkerEmbeddingRecord) => {
  zeroEmbedding(worker.averageEmbedding);
  for (const embedding of worker.embeddings) {
    zeroEmbedding(embedding);
  }
};

const clearWorkerRecords = (workers: readonly WorkerEmbeddingRecord[]) => {
  for (const worker of workers) {
    zeroWorkerRecord(worker);
  }
};

const toError = (error: unknown): Error =>
  error instanceof Error ? error : new Error(String(error));

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;
