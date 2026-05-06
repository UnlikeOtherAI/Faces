import { NativeEventEmitter, NativeModules, requireNativeComponent } from 'react-native';
import type { CapturePose, CaptureState } from './NativeFacesCapture';

const LINKING_ERROR =
  'react-native-faces-capture: native module not linked. Rebuild the app after installing.';

const RNFacesCapture =
  NativeModules.RNFacesCapture ??
  new Proxy(
    {},
    {
      get() {
        throw new Error(LINKING_ERROR);
      },
    }
  );

const emitter = new NativeEventEmitter(RNFacesCapture);

const FacesCapture = {
  startGuidedCapture: (): Promise<void> => RNFacesCapture.startGuidedCapture(),

  stopGuidedCapture: (): Promise<void> => RNFacesCapture.stopGuidedCapture(),

  setTargetPose: (targetPose: CapturePose): Promise<void> =>
    RNFacesCapture.setTargetPose(targetPose),

  capturePhoto: (targetPose: CapturePose): Promise<string> =>
    RNFacesCapture.capturePhoto(targetPose),

  onCaptureState: (callback: (state: CaptureState) => void): (() => void) => {
    const sub = emitter.addListener('onCaptureState', callback);
    return () => sub.remove();
  },
};

let FacesCaptureView: any = null;
try {
  FacesCaptureView = requireNativeComponent('RNFacesCaptureView');
} catch (error) {
  console.warn('[FacesCapture] Native view not available:', error);
}

export { FacesCaptureView };
export default FacesCapture;
