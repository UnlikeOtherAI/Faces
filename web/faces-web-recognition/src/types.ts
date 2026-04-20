export type FaceEmbedding = Float32Array | readonly number[];

export type RecognitionFrame = ImageBitmap | ImageData | VideoFrame;

export interface RecognitionFrameSubmission {
  frame: RecognitionFrame;
  transfer?: Transferable[];
}

export interface RecognitionFrameSource {
  start(
    onFrame: (submission: RecognitionFrameSubmission) => void,
  ): Promise<void> | void;
  stop(): Promise<void> | void;
}

export interface EnrolledWorker {
  workerId: string;
  workerName: string;
  embeddings: readonly FaceEmbedding[];
}

export interface WorkerEmbeddingRecord {
  workerId: string;
  workerName: string;
  embeddings: readonly Float32Array[];
  averageEmbedding: Float32Array;
}

export interface MatchResult {
  readonly workerId: string;
  readonly workerName: string;
  readonly score: number;
  readonly threshold: number;
  readonly latencyMs: number;
}

export interface RecognitionWorkerClient {
  embedFrame(
    frame: RecognitionFrame,
    transfer?: Transferable[],
  ): Promise<Float32Array>;
  dispose?(): Promise<void> | void;
}

export interface FacesWebRecognitionOptions {
  workerClient: RecognitionWorkerClient;
  threshold?: number;
  minFrameIntervalMs?: number;
}

export interface FacesWebRecognition {
  startRecognition(frameSource: RecognitionFrameSource): Promise<void>;
  stopRecognition(): Promise<void>;
  recognizeFrame(
    frame: RecognitionFrame,
    transfer?: Transferable[],
  ): Promise<MatchResult | null>;
  registerWorkerEmbeddings(worker: EnrolledWorker): void;
  replaceWorkerEmbeddings(workers: readonly EnrolledWorker[]): void;
  clearWorkerEmbeddings(): void;
  getWorkers(): readonly WorkerEmbeddingRecord[];
  onFaceRecognized(callback: (match: MatchResult) => void): () => void;
  onRecognitionError(callback: (error: Error) => void): () => void;
  isRunning(): boolean;
}
