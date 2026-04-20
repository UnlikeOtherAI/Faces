import { toFloat32Array } from '../matching';
import type {
  EmbedderModule,
  FrameEmbedder,
  WorkerRequest,
  WorkerResponse,
} from '../workerProtocol';

let embedder: FrameEmbedder | null = null;
let expectedEmbeddingDimensions: number | undefined;

const workerScope = self as unknown as DedicatedWorkerGlobalScope;

workerScope.addEventListener('message', (event: MessageEvent<WorkerRequest>) => {
  void handleRequest(event.data);
});

const handleRequest = async (request: WorkerRequest) => {
  try {
    if (request.type === 'initialize') {
      const moduleUrl = resolveTrustedModuleUrl(request.config);
      const module = assertEmbedderModule(await import(moduleUrl.href));
      await embedder?.dispose?.();
      embedder = await module.createEmbedder(request.config);
      expectedEmbeddingDimensions = request.config.expectedEmbeddingDimensions;
      postResponse({ id: request.id, type: 'initialized' });
      return;
    }

    if (request.type === 'dispose') {
      await embedder?.dispose?.();
      embedder = null;
      expectedEmbeddingDimensions = undefined;
      postResponse({ id: request.id, type: 'disposed' });
      return;
    }

    if (!embedder) {
      throw new Error('Recognition worker has not been initialized.');
    }

    const embedding = await embedFrame(request);
    assertExpectedDimensions(embedding, expectedEmbeddingDimensions);
    const response = {
      id: request.id,
      type: 'embedding',
      embedding,
    } satisfies WorkerResponse;
    workerScope.postMessage(response, getEmbeddingTransferList(embedding));
  } catch (error) {
    postResponse({
      id: request.id,
      type: 'error',
      message: error instanceof Error ? error.message : String(error),
    });
  }
};

const postResponse = (response: WorkerResponse) => {
  workerScope.postMessage(response);
};

const assertEmbedderModule = (value: unknown): EmbedderModule => {
  if (!isRecord(value) || typeof value.createEmbedder !== 'function') {
    throw new Error('Model module must export createEmbedder(config).');
  }
  return value as unknown as EmbedderModule;
};

const embedFrame = async (request: WorkerRequest): Promise<Float32Array> => {
  if (request.type !== 'embedFrame' || !embedder) {
    throw new Error('Recognition worker has no frame embedder.');
  }
  try {
    return toFloat32Array(await embedder.embedFrame(request.frame));
  } finally {
    closeFrame(request.frame);
  }
};

const resolveTrustedModuleUrl = (
  config: Extract<WorkerRequest, { type: 'initialize' }>['config'],
): URL => {
  const moduleUrl = new URL(config.moduleUrl, workerScope.location.href);
  const allowedOrigins = config.allowedModuleOrigins ?? [
    workerScope.location.origin,
  ];
  if (!allowedOrigins.includes(moduleUrl.origin)) {
    throw new Error(
      `Model module origin is not allowed: ${moduleUrl.origin}.`,
    );
  }
  return moduleUrl;
};

const assertExpectedDimensions = (
  embedding: Float32Array,
  expectedDimensions: number | undefined,
) => {
  if (
    expectedDimensions !== undefined &&
    embedding.length !== expectedDimensions
  ) {
    throw new Error(
      `Embedding dimension mismatch. Expected ${expectedDimensions}, received ${embedding.length}.`,
    );
  }
};

const closeFrame = (frame: unknown) => {
  if (isRecord(frame) && typeof frame.close === 'function') {
    frame.close();
  }
};

const getEmbeddingTransferList = (embedding: Float32Array): Transferable[] =>
  embedding.buffer instanceof ArrayBuffer ? [embedding.buffer] : [];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;
