import type {
  EnrolledWorker,
  FaceEmbedding,
  MatchResult,
  WorkerEmbeddingRecord,
} from './types';

export const defaultRecognitionThreshold = 0.7;

export const toFloat32Array = (embedding: FaceEmbedding): Float32Array =>
  embedding instanceof Float32Array
    ? embedding
    : Float32Array.from(embedding);

export const l2NormalizeEmbedding = (
  embedding: FaceEmbedding,
): Float32Array => {
  const values =
    embedding instanceof Float32Array
      ? new Float32Array(embedding)
      : Float32Array.from(embedding);
  let sum = 0;
  for (const value of values) {
    sum += value * value;
  }
  const norm = Math.sqrt(sum);
  if (norm <= 1e-10) {
    throw new Error('Cannot normalize a near-zero embedding.');
  }
  for (let index = 0; index < values.length; index += 1) {
    values[index] /= norm;
  }
  return values;
};

export const averageEmbeddings = (
  embeddings: readonly FaceEmbedding[],
): Float32Array => {
  if (embeddings.length === 0) {
    throw new Error('Cannot average an empty embedding list.');
  }

  return averageNormalizedEmbeddings(embeddings.map(l2NormalizeEmbedding));
};

const averageNormalizedEmbeddings = (
  normalizedEmbeddings: readonly Float32Array[],
): Float32Array => {
  const dimensions = normalizedEmbeddings[0]?.length ?? 0;
  if (dimensions === 0) {
    throw new Error('Cannot average zero-dimension embeddings.');
  }
  const sum = new Float32Array(dimensions);

  for (const embedding of normalizedEmbeddings) {
    assertSameDimensions(dimensions, embedding.length);
    for (let index = 0; index < dimensions; index += 1) {
      sum[index] += embedding[index];
    }
  }

  for (let index = 0; index < dimensions; index += 1) {
    sum[index] /= normalizedEmbeddings.length;
  }

  return l2NormalizeEmbedding(sum);
};

export const cosineSimilarity = (
  leftEmbedding: FaceEmbedding,
  rightEmbedding: FaceEmbedding,
): number => {
  const left = l2NormalizeEmbedding(leftEmbedding);
  const right = l2NormalizeEmbedding(rightEmbedding);
  assertSameDimensions(left.length, right.length);

  let dot = 0;
  for (let index = 0; index < left.length; index += 1) {
    dot += left[index] * right[index];
  }
  return dot;
};

export const createWorkerEmbeddingRecord = (
  worker: EnrolledWorker,
): WorkerEmbeddingRecord => {
  const embeddings = worker.embeddings.map(l2NormalizeEmbedding);
  return {
    workerId: worker.workerId,
    workerName: worker.workerName,
    embeddings,
    averageEmbedding: averageNormalizedEmbeddings(embeddings),
  };
};

export const findBestMatch = (
  embedding: FaceEmbedding,
  workers: readonly WorkerEmbeddingRecord[],
  threshold = defaultRecognitionThreshold,
  latencyMs = 0,
): MatchResult | null => {
  const normalizedEmbedding = l2NormalizeEmbedding(embedding);
  let bestWorker: WorkerEmbeddingRecord | null = null;
  let bestScore = Number.NEGATIVE_INFINITY;

  for (const worker of workers) {
    assertSameDimensions(normalizedEmbedding.length, worker.averageEmbedding.length);
    const score = dotProduct(normalizedEmbedding, worker.averageEmbedding);
    if (score > bestScore) {
      bestWorker = worker;
      bestScore = score;
    }
  }

  if (!bestWorker || bestScore < threshold) {
    return null;
  }

  return {
    workerId: bestWorker.workerId,
    workerName: bestWorker.workerName,
    score: bestScore,
    threshold,
    latencyMs,
  };
};

const dotProduct = (
  leftEmbedding: Float32Array,
  rightEmbedding: Float32Array,
): number => {
  let dot = 0;
  for (let index = 0; index < leftEmbedding.length; index += 1) {
    dot += leftEmbedding[index] * rightEmbedding[index];
  }
  return dot;
};

const assertSameDimensions = (expected: number, actual: number) => {
  if (expected !== actual) {
    throw new Error(
      `Embedding dimension mismatch. Expected ${expected}, received ${actual}.`,
    );
  }
};
