import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Image,
  StyleProp,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from 'react-native';
import FacesCapture, { FacesCaptureView } from './FacesCaptureBridge';
import type { CapturePose, CaptureState } from './NativeFacesCapture';

export interface GuidedCaptureStep {
  pose: CapturePose;
  label: string;
  shortLabel: string;
  target: { left: `${number}%`; top: `${number}%` };
}

export interface GuidedFaceCaptureCardProps {
  autoStart?: boolean;
  debug?: boolean;
  holdMs?: number;
  initialPhotos?: string[];
  style?: StyleProp<ViewStyle>;
  previewStyle?: StyleProp<ViewStyle>;
  onCaptureState?: (state: CaptureState) => void;
  onComplete?: (photos: string[]) => void;
  onError?: (error: Error) => void;
  onPhotosChange?: (photos: string[]) => void;
}

const DEFAULT_HOLD_MS = 1000;
const EMPTY_PHOTOS: string[] = [];

export const GUIDED_CAPTURE_STEPS: readonly GuidedCaptureStep[] = [
  { pose: 'left_top', label: 'Look top left', shortLabel: '1', target: { left: '18%', top: '18%' } },
  { pose: 'top', label: 'Look up', shortLabel: '2', target: { left: '50%', top: '10%' } },
  { pose: 'top_right', label: 'Look top right', shortLabel: '3', target: { left: '82%', top: '18%' } },
  { pose: 'bottom_right', label: 'Look bottom right', shortLabel: '4', target: { left: '82%', top: '82%' } },
  { pose: 'bottom_left', label: 'Look bottom left', shortLabel: '5', target: { left: '18%', top: '82%' } },
  { pose: 'straight', label: 'Look straight', shortLabel: '6', target: { left: '50%', top: '50%' } },
];

export function GuidedFaceCaptureCard({
  autoStart = true,
  debug = false,
  holdMs = DEFAULT_HOLD_MS,
  initialPhotos = EMPTY_PHOTOS,
  style,
  previewStyle,
  onCaptureState,
  onComplete,
  onError,
  onPhotosChange,
}: GuidedFaceCaptureCardProps) {
  const [photos, setPhotos] = useState<string[]>(initialPhotos);
  const [captureState, setCaptureState] = useState<CaptureState | null>(null);
  const [status, setStatus] = useState('Waiting to start.');
  const activeIndex = Math.min(photos.length, GUIDED_CAPTURE_STEPS.length - 1);
  const activeStep = GUIDED_CAPTURE_STEPS[activeIndex];
  const complete = photos.length >= GUIDED_CAPTURE_STEPS.length;
  const pulse = useRef(new Animated.Value(0.86)).current;
  const captureTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const capturing = useRef(false);

  useEffect(() => {
    setPhotos(initialPhotos);
  }, [initialPhotos]);

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 620, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.86, duration: 620, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  useEffect(() => {
    const unsubscribe = FacesCapture.onCaptureState((nextState) => {
      setCaptureState(nextState);
      onCaptureState?.(nextState);
    });

    if (autoStart) {
      FacesCapture.startGuidedCapture().catch((error: Error) => {
        setStatus(error.message);
        onError?.(error);
      });
    }

    return () => {
      unsubscribe();
      if (captureTimer.current) clearTimeout(captureTimer.current);
      if (autoStart) FacesCapture.stopGuidedCapture().catch(() => {});
    };
  }, [autoStart, onCaptureState, onError]);

  useEffect(() => {
    if (!complete) {
      FacesCapture.setTargetPose(activeStep.pose).catch((error: Error) => {
        setStatus(error.message);
        onError?.(error);
      });
    }
  }, [activeStep.pose, complete, onError]);

  useEffect(() => {
    if (complete || !captureState?.canCapture || capturing.current) {
      if (captureTimer.current) clearTimeout(captureTimer.current);
      captureTimer.current = null;
      return;
    }

    captureTimer.current = setTimeout(() => {
      captureTimer.current = null;
      captureCurrentStep();
    }, holdMs);

    return () => {
      if (captureTimer.current) clearTimeout(captureTimer.current);
      captureTimer.current = null;
    };
  }, [captureState?.canCapture, complete, holdMs, activeStep.pose]);

  const debugText = useMemo(
    () => [
      `target      ${complete ? 'complete' : `${activeStep.shortLabel} ${activeStep.pose}`}`,
      `detected    ${captureState?.detectedPose ?? 'none'}`,
      `canCapture  ${captureState?.canCapture ? 'true' : 'false'}`,
      `blockReason ${captureState?.blockReason ?? 'none'}`,
    ].join('\n'),
    [activeStep.pose, activeStep.shortLabel, captureState, complete]
  );

  async function captureCurrentStep() {
    if (capturing.current || complete) return;
    capturing.current = true;
    try {
      const uri = await FacesCapture.capturePhoto(activeStep.pose);
      const nextPhotos = [...photos, uri];
      setPhotos(nextPhotos);
      onPhotosChange?.(nextPhotos);
      setStatus(nextPhotos.length >= GUIDED_CAPTURE_STEPS.length ? 'Capture sequence complete.' : `Captured ${activeStep.shortLabel}.`);
      if (nextPhotos.length >= GUIDED_CAPTURE_STEPS.length) onComplete?.(nextPhotos);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      setStatus(err.message);
      onError?.(err);
    } finally {
      capturing.current = false;
    }
  }

  return (
    <View style={[styles.root, style]}>
      <View style={[styles.preview, previewStyle]}>
        <View style={styles.cameraStage}>
          {FacesCaptureView ? <FacesCaptureView style={styles.cameraFill} /> : <View style={styles.cameraFill} />}
          {!complete && <CaptureTarget step={activeStep} pulse={pulse} />}
        </View>
        <View style={styles.thumbnailRow}>
          {GUIDED_CAPTURE_STEPS.map((step, index) => (
            <View key={step.pose} style={styles.thumbnailSlot}>
              {photos[index] && <Image source={{ uri: photos[index] }} style={styles.thumbnailImage} />}
              <Text style={styles.thumbnailBadge}>{step.shortLabel}</Text>
            </View>
          ))}
        </View>
      </View>
      <Text style={styles.status}>{complete ? 'Capture sequence complete.' : activeStep.label}</Text>
      <Text style={styles.blocker}>{status}</Text>
      {debug && <Text style={styles.debug}>{debugText}</Text>}
    </View>
  );
}

function CaptureTarget({ step, pulse }: { step: GuidedCaptureStep; pulse: Animated.Value }) {
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.target,
        {
          left: step.target.left,
          top: step.target.top,
          transform: [{ translateX: -20 }, { translateY: -20 }, { scale: pulse }],
        },
      ]}
    >
      <Text style={styles.targetText}>{step.shortLabel}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { alignItems: 'center', gap: 12 },
  preview: {
    width: '100%',
    maxWidth: 560,
    padding: 12,
    gap: 10,
    borderWidth: 1,
    borderColor: '#d9dee7',
    borderRadius: 24,
    backgroundColor: '#fff',
  },
  cameraStage: {
    aspectRatio: 1,
    overflow: 'hidden',
    borderRadius: 18,
    backgroundColor: '#fff',
  },
  cameraFill: { width: '100%', height: '100%' },
  target: {
    position: 'absolute',
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#39ff14',
    shadowColor: '#39ff14',
    shadowOpacity: 0.65,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 0 },
    elevation: 6,
  },
  targetText: { color: '#172033', fontSize: 18, fontWeight: '900' },
  thumbnailRow: { flexDirection: 'row', gap: 6, minHeight: 58 },
  thumbnailSlot: {
    flex: 1,
    aspectRatio: 4 / 3,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#d9dee7',
    borderRadius: 8,
    backgroundColor: '#f7f8fa',
  },
  thumbnailImage: { width: '100%', height: '100%' },
  thumbnailBadge: {
    position: 'absolute',
    top: 4,
    left: 4,
    width: 20,
    height: 20,
    borderRadius: 10,
    overflow: 'hidden',
    textAlign: 'center',
    lineHeight: 20,
    color: '#172033',
    backgroundColor: '#39ff14',
    fontWeight: '900',
  },
  status: { fontSize: 16, fontWeight: '700', color: '#172033', textAlign: 'center' },
  blocker: { minHeight: 20, color: '#5d687a', textAlign: 'center' },
  debug: {
    alignSelf: 'stretch',
    padding: 12,
    borderWidth: 1,
    borderColor: '#d9dee7',
    borderRadius: 8,
    color: '#5d687a',
    fontFamily: 'Menlo',
    fontSize: 12,
  },
});
