import { describe, expect, test } from 'vitest';
import {
  averageEmbeddings,
  cosineSimilarity,
  createWorkerEmbeddingRecord,
  findBestMatch,
  l2NormalizeEmbedding,
} from './matching';

describe('matching', () => {
  test('normalizes embeddings', () => {
    const normalized = l2NormalizeEmbedding([3, 4]);

    expect(normalized[0]).toBeCloseTo(0.6);
    expect(normalized[1]).toBeCloseTo(0.8);
  });

  test('averages and normalizes worker embeddings', () => {
    const average = averageEmbeddings([
      [1, 0],
      [0, 1],
    ]);

    expect(average[0]).toBeCloseTo(0.7071067690849304);
    expect(average[1]).toBeCloseTo(0.7071067690849304);
  });

  test('finds the best match above threshold', () => {
    const alice = createWorkerEmbeddingRecord({
      workerId: 'alice-id',
      workerName: 'Alice',
      embeddings: [[1, 0, 0]],
    });
    const bob = createWorkerEmbeddingRecord({
      workerId: 'bob-id',
      workerName: 'Bob',
      embeddings: [[0, 1, 0]],
    });

    const match = findBestMatch([0.99, 0.01, 0], [alice, bob], 0.9, 12);

    expect(match).toEqual({
      workerId: 'alice-id',
      workerName: 'Alice',
      score: cosineSimilarity([0.99, 0.01, 0], [1, 0, 0]),
      threshold: 0.9,
      latencyMs: 12,
    });
  });

  test('returns null below threshold', () => {
    const worker = createWorkerEmbeddingRecord({
      workerId: 'worker-id',
      workerName: 'Worker',
      embeddings: [[1, 0]],
    });

    expect(findBestMatch([0, 1], [worker], 0.7)).toBeNull();
  });

  test('throws on embedding dimension mismatch', () => {
    expect(() => cosineSimilarity([1, 0], [1, 0, 0])).toThrow(
      'Embedding dimension mismatch',
    );
  });

  test('throws on empty worker embeddings', () => {
    expect(() => averageEmbeddings([])).toThrow(
      'Cannot average an empty embedding list.',
    );
  });

  test('throws on near-zero embeddings', () => {
    expect(() => l2NormalizeEmbedding([0, 0])).toThrow(
      'Cannot normalize a near-zero embedding.',
    );
  });
});
