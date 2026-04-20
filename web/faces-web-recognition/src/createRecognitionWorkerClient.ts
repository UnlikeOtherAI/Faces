import type {
  RecognitionFrame,
  RecognitionWorkerClient,
} from './types';
import type {
  WorkerEmbedderConfig,
  WorkerRequest,
  WorkerRequestBody,
  WorkerResponse,
} from './workerProtocol';
import { toFloat32Array } from './matching';

export interface InitializableRecognitionWorkerClient
  extends RecognitionWorkerClient {
  initialize(config: WorkerEmbedderConfig): Promise<void>;
}

export interface RecognitionWorkerClientOptions {
  autoTransferFrames?: boolean;
  terminateOnDispose?: boolean;
  workerName?: string;
  workerUrl?: URL;
}

export const createFacesRecognitionWorker = ({
  workerName = 'faces-web-recognition',
  workerUrl = new URL('./worker/recognitionWorker.js', import.meta.url),
}: Pick<RecognitionWorkerClientOptions, 'workerName' | 'workerUrl'> = {}): Worker =>
  new Worker(workerUrl, {
    name: workerName,
    type: 'module',
  });

export const createRecognitionWorkerClient = (
  worker: Worker,
  {
    autoTransferFrames = true,
    terminateOnDispose = true,
  }: RecognitionWorkerClientOptions = {},
): InitializableRecognitionWorkerClient => {
  let nextId = 1;
  const pending = new Map<
    number,
    {
      resolve: (response: WorkerResponse) => void;
      reject: (error: Error) => void;
    }
  >();

  const handleMessage = (event: MessageEvent<WorkerResponse>) => {
    const request = pending.get(event.data.id);
    if (!request) {
      return;
    }
    pending.delete(event.data.id);
    if (event.data.type === 'error') {
      request.reject(new Error(event.data.message));
      return;
    }
    request.resolve(event.data);
  };

  const handleError = (event: ErrorEvent) => {
    rejectAll(new Error(event.message || 'Recognition worker failed.'));
  };

  worker.addEventListener('message', handleMessage);
  worker.addEventListener('error', handleError);

  const request = async (
    message: WorkerRequestBody,
    transfer: Transferable[] = [],
  ): Promise<WorkerResponse> => {
    const id = nextId;
    nextId += 1;
    const response = new Promise<WorkerResponse>((resolve, reject) => {
      pending.set(id, { resolve, reject });
      try {
        const requestMessage = { ...message, id } as WorkerRequest;
        worker.postMessage(requestMessage, transfer);
      } catch (error) {
        pending.delete(id);
        reject(toError(error));
      }
    });
    return response;
  };

  return {
    async initialize(config) {
      await request({ type: 'initialize', config });
    },

    async embedFrame(frame, transfer) {
      const response = await request(
        { type: 'embedFrame', frame },
        transfer ?? (autoTransferFrames ? getFrameTransferList(frame) : []),
      );
      if (response.type !== 'embedding') {
        throw new Error(`Unexpected worker response: ${response.type}.`);
      }
      return toFloat32Array(response.embedding);
    },

    async dispose() {
      try {
        await request({ type: 'dispose' });
      } finally {
        worker.removeEventListener('message', handleMessage);
        worker.removeEventListener('error', handleError);
        rejectAll(new Error('Recognition worker was disposed.'));
        if (terminateOnDispose) {
          worker.terminate();
        }
      }
    },
  };

  function rejectAll(error: Error) {
    for (const [id, request] of pending) {
      pending.delete(id);
      request.reject(error);
    }
  }
};

const getFrameTransferList = (frame: RecognitionFrame): Transferable[] => {
  if (isVideoFrame(frame) || isImageBitmap(frame)) {
    return [frame];
  }
  const data = isRecord(frame) ? frame.data : undefined;
  if (isRecord(data) && data.buffer instanceof ArrayBuffer) {
    return [data.buffer];
  }
  return [];
};

const toError = (error: unknown): Error =>
  error instanceof Error ? error : new Error(String(error));

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const isVideoFrame = (frame: RecognitionFrame): frame is VideoFrame =>
  typeof VideoFrame !== 'undefined' && frame instanceof VideoFrame;

const isImageBitmap = (frame: RecognitionFrame): frame is ImageBitmap =>
  typeof ImageBitmap !== 'undefined' && frame instanceof ImageBitmap;
