import { describe, expect, test } from 'vitest';
import { createRecognitionWorkerClient } from './createRecognitionWorkerClient';
import type { RecognitionFrame } from './types';
import type { WorkerRequest, WorkerResponse } from './workerProtocol';

const frame = {} as RecognitionFrame;

describe('createRecognitionWorkerClient', () => {
  test('sends initialize messages and resolves responses', async () => {
    const worker = new FakeWorker();
    const client = createRecognitionWorkerClient(worker.asWorker());

    const promise = client.initialize({ moduleUrl: '/model.js' });
    const message = worker.lastMessage();
    expect(message.type).toBe('initialize');

    worker.respond({ id: message.id, type: 'initialized' });
    await promise;
  });

  test('rejects worker error responses', async () => {
    const worker = new FakeWorker();
    const client = createRecognitionWorkerClient(worker.asWorker());

    const promise = client.embedFrame(frame);
    const message = worker.lastMessage();
    worker.respond({ id: message.id, type: 'error', message: 'bad model' });

    await expect(promise).rejects.toThrow('bad model');
  });

  test('rejects postMessage failures and can recover', async () => {
    const worker = new FakeWorker();
    const client = createRecognitionWorkerClient(worker.asWorker());

    worker.failNextPostMessage = true;
    await expect(client.initialize({ moduleUrl: '/model.js' })).rejects.toThrow(
      'postMessage failed',
    );

    const promise = client.initialize({ moduleUrl: '/model.js' });
    const message = worker.lastMessage();
    worker.respond({ id: message.id, type: 'initialized' });
    await promise;
  });

  test('terminates worker on dispose', async () => {
    const worker = new FakeWorker();
    const client = createRecognitionWorkerClient(worker.asWorker());

    const promise = client.dispose?.();
    const message = worker.lastMessage();
    worker.respond({ id: message.id, type: 'disposed' });
    await promise;

    expect(worker.terminated).toBe(true);
  });
});

class FakeWorker {
  failNextPostMessage = false;
  messages: Array<{ message: WorkerRequest; transfer: Transferable[] }> = [];
  terminated = false;

  private errorListeners = new Set<(event: ErrorEvent) => void>();
  private messageListeners = new Set<
    (event: MessageEvent<WorkerResponse>) => void
  >();

  addEventListener(type: string, listener: EventListenerOrEventListenerObject) {
    if (type === 'message') {
      this.messageListeners.add(
        listener as (event: MessageEvent<WorkerResponse>) => void,
      );
    }
    if (type === 'error') {
      this.errorListeners.add(listener as (event: ErrorEvent) => void);
    }
  }

  removeEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject,
  ) {
    if (type === 'message') {
      this.messageListeners.delete(
        listener as (event: MessageEvent<WorkerResponse>) => void,
      );
    }
    if (type === 'error') {
      this.errorListeners.delete(listener as (event: ErrorEvent) => void);
    }
  }

  postMessage(message: WorkerRequest, transfer: Transferable[] = []) {
    if (this.failNextPostMessage) {
      this.failNextPostMessage = false;
      throw new Error('postMessage failed');
    }
    this.messages.push({ message, transfer });
  }

  respond(response: WorkerResponse) {
    const event = { data: response } as MessageEvent<WorkerResponse>;
    for (const listener of this.messageListeners) {
      listener(event);
    }
  }

  terminate() {
    this.terminated = true;
  }

  asWorker(): Worker {
    return this as unknown as Worker;
  }

  lastMessage(): WorkerRequest {
    const message = this.messages.at(-1)?.message;
    if (!message) {
      throw new Error('No worker message was posted.');
    }
    return message;
  }
}
