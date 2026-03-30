import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

export type CapturePose =
  | 'left_top'
  | 'top'
  | 'top_right'
  | 'bottom_right'
  | 'bottom_left'
  | 'straight';

export type CaptureBlockReason =
  | 'none'
  | 'no_face'
  | 'multiple_faces'
  | 'out_of_frame'
  | 'wrong_pose'
  | 'bad_lighting'
  | 'too_blurry'
  | 'hold_still'
  | 'not_implemented';

export interface CaptureState {
  targetPose: CapturePose;
  detectedPose?: CapturePose;
  faceRect?: { x: number; y: number; width: number; height: number };
  faceInsideGuide: boolean;
  lightingOk: boolean;
  sharpnessOk: boolean;
  stable: boolean;
  canCapture: boolean;
  blockReason: CaptureBlockReason;
}

export interface Spec extends TurboModule {
  startGuidedCapture(): Promise<void>;
  stopGuidedCapture(): Promise<void>;
  setTargetPose(targetPose: CapturePose): Promise<void>;
  capturePhoto(targetPose: CapturePose): Promise<string>;
  addListener(eventType: string): void;
  removeListeners(count: number): void;
}

export default TurboModuleRegistry.getEnforcing<Spec>('RNFacesCapture');
