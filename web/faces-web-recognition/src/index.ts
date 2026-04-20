export { createFacesWebRecognition } from './createFacesWebRecognition';
export {
  createFacesRecognitionWorker,
  createRecognitionWorkerClient,
  type InitializableRecognitionWorkerClient,
  type RecognitionWorkerClientOptions,
} from './createRecognitionWorkerClient';
export {
  averageEmbeddings,
  cosineSimilarity,
  createWorkerEmbeddingRecord,
  defaultRecognitionThreshold,
  findBestMatch,
  l2NormalizeEmbedding,
  toFloat32Array,
} from './matching';
export type {
  EmbedderModule,
  FrameEmbedder,
  WorkerEmbedderConfig,
  WorkerRequestBody,
  WorkerRequest,
  WorkerResponse,
} from './workerProtocol';
export type {
  EnrolledWorker,
  FaceEmbedding,
  FacesWebRecognition,
  FacesWebRecognitionOptions,
  MatchResult,
  RecognitionFrame,
  RecognitionFrameSource,
  RecognitionFrameSubmission,
  RecognitionWorkerClient,
  WorkerEmbeddingRecord,
} from './types';
