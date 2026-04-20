import type { FaceEmbedding, RecognitionFrame } from './types';

export interface WorkerEmbedderConfig {
  moduleUrl: string;
  wasmUrl?: string;
  modelUrl?: string;
  allowedModuleOrigins?: readonly string[];
  expectedEmbeddingDimensions?: number;
  parameters?: Record<string, boolean | number | string>;
}

export interface FrameEmbedder {
  embedFrame(frame: RecognitionFrame): FaceEmbedding | Promise<FaceEmbedding>;
  dispose?(): Promise<void> | void;
}

export interface EmbedderModule {
  createEmbedder(
    config: WorkerEmbedderConfig,
  ): FrameEmbedder | Promise<FrameEmbedder>;
}

export type WorkerRequestBody =
  | {
      type: 'initialize';
      config: WorkerEmbedderConfig;
    }
  | {
      type: 'embedFrame';
      frame: RecognitionFrame;
    }
  | {
      type: 'dispose';
    };

export type WorkerRequest = WorkerRequestBody & {
  id: number;
};

export type WorkerResponse =
  | {
      id: number;
      type: 'initialized';
    }
  | {
      id: number;
      type: 'embedding';
      embedding: FaceEmbedding;
    }
  | {
      id: number;
      type: 'disposed';
    }
  | {
      id: number;
      type: 'error';
      message: string;
    };
