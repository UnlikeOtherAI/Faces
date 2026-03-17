import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

export interface Worker {
  id: string;
  name: string;
  lastUpdated: number;
  photoUri?: string;
}

export interface MatchResult {
  workerId: string;
  workerName: string;
  score: number;
  latencyMs: number;
}

export interface Spec extends TurboModule {
  startRecognition(): Promise<void>;
  stopRecognition(): Promise<void>;
  registerWorker(workerId: string, name: string, photos: string[]): Promise<void>;
  deleteWorker(workerId: string): Promise<void>;
  getWorkers(): Promise<Worker[]>;
  addListener(eventType: string): void;
  removeListeners(count: number): void;
}

export default TurboModuleRegistry.getEnforcing<Spec>('RNFaces');
