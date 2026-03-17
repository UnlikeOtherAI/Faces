import { NativeEventEmitter, NativeModules, Platform } from 'react-native';
import type { Worker, MatchResult } from './NativeFaces';

const LINKING_ERROR =
  'react-native-faces: native module not linked. Rebuild the app after installing.';

const RNFaces =
  NativeModules.RNFaces ??
  new Proxy(
    {},
    {
      get() {
        throw new Error(LINKING_ERROR);
      },
    }
  );

const emitter = new NativeEventEmitter(RNFaces);

const FaceID = {
  startRecognition: (): Promise<void> => RNFaces.startRecognition(),

  stopRecognition: (): Promise<void> => RNFaces.stopRecognition(),

  registerWorker: (
    workerId: string,
    name: string,
    photos: string[]
  ): Promise<void> => RNFaces.registerWorker(workerId, name, photos),

  deleteWorker: (workerId: string): Promise<void> =>
    RNFaces.deleteWorker(workerId),

  persistPhoto: (uri: string): Promise<string> => RNFaces.persistPhoto(uri),
  clearDraftPhotos: (): Promise<void> => RNFaces.clearDraftPhotos(),
  isModelLoaded: (): Promise<boolean> => RNFaces.isModelLoaded(),
  getWorkers: (): Promise<Worker[]> => RNFaces.getWorkers(),

  onFaceRecognized: (callback: (match: MatchResult) => void): (() => void) => {
    const sub = emitter.addListener('onFaceRecognized', callback);
    return () => sub.remove();
  },
};

export default FaceID;
export type { Worker, MatchResult };
