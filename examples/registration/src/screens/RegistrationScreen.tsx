import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { launchCamera } from 'react-native-image-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import FaceID from 'react-native-faces';
import FacesCapture, { FacesCaptureView } from 'react-native-faces-capture';
import Svg, { Circle, Path } from 'react-native-svg';

const DRAFT_KEY = 'registration_draft';
const LIGHTING_MESSAGE = 'We cannot continue unless you get better lighting.';
const FALLBACK_MESSAGE = 'Guided capture engine pending. Temporary manual capture fallback in use.';

const CAPTURE_STEPS = [
  { pose: 'left_top', label: 'Look to the top-left', short: 'LT' },
  { pose: 'top', label: 'Look up', short: 'T' },
  { pose: 'top_right', label: 'Look to the top-right', short: 'TR' },
  { pose: 'bottom_right', label: 'Look to the bottom-right', short: 'BR' },
  { pose: 'bottom_left', label: 'Look to the bottom-left', short: 'BL' },
  { pose: 'straight', label: 'Just look straight into the camera', short: 'C' },
] as const;

type CapturePose = (typeof CAPTURE_STEPS)[number]['pose'];

interface CaptureState {
  faceInsideGuide?: boolean;
  lightingOk?: boolean;
  sharpnessOk?: boolean;
  stable?: boolean;
  canCapture?: boolean;
  blockReason?: string;
  detectedPose?: string;
  targetPose?: string;
  yaw?: number;
  verticalRatio?: number;
}

const ARC_RADIUS = 117;
const ARC_STROKE = 16;
const ARC_SIZE = 260;
const ARC_CX = ARC_SIZE / 2;
const ARC_CY = ARC_SIZE / 2;
const ARC_SPAN_DEG = 56;

// Center angle for each segment (0° = 3 o'clock, clockwise)
// Order matches CAPTURE_STEPS: LT, T, TR, BR, BL
const ARC_CENTERS = [198, 270, 342, 54, 126];

const AnimatedPath = Animated.createAnimatedComponent(Path);

function arcPath(cx: number, cy: number, r: number, startDeg: number, endDeg: number): string {
  const rad = (d: number) => (d * Math.PI) / 180;
  const x1 = cx + r * Math.cos(rad(startDeg));
  const y1 = cy + r * Math.sin(rad(startDeg));
  const x2 = cx + r * Math.cos(rad(endDeg));
  const y2 = cy + r * Math.sin(rad(endDeg));
  return `M ${x1} ${y1} A ${r} ${r} 0 0 1 ${x2} ${y2}`;
}

interface Props { onDone: () => void }

export default function RegistrationScreen({ onDone }: Props) {
  const [name, setName]       = useState('');
  const [photos, setPhotos]   = useState<string[]>([]);
  const [status, setStatus]   = useState('');
  const [modelOk, setModelOk] = useState<boolean | null>(null);
  const [captureState, setCaptureState] = useState<CaptureState | null>(null);
  const [captureAvailable, setCaptureAvailable] = useState(false);
  const pulse = useRef(new Animated.Value(0.88)).current;
  const autoCapturing = useRef(false);

  const currentStepIndex = Math.min(photos.length, CAPTURE_STEPS.length - 1);
  const currentStep = CAPTURE_STEPS[currentStepIndex];
  const captureComplete = photos.length >= CAPTURE_STEPS.length;

  useEffect(() => {
    AsyncStorage.getItem(DRAFT_KEY).then(raw => {
      if (!raw) return;
      try {
        const { name: n, photos: p } = JSON.parse(raw);
        if (n) setName(n);
        if (Array.isArray(p) && p.length) setPhotos(p);
      } catch {}
    });
    FaceID.isModelLoaded().then(setModelOk).catch(() => setModelOk(false));
  }, []);

  useEffect(() => {
    AsyncStorage.setItem(DRAFT_KEY, JSON.stringify({ name, photos }));
  }, [name, photos]);

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.88, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  useEffect(() => {
    const unsub = FacesCapture.onCaptureState((state: CaptureState) => {
      setCaptureState(state);
      setCaptureAvailable(true);
    });

    FacesCapture.startGuidedCapture()
      .then(() => setCaptureAvailable(true))
      .catch((e: any) => setStatus(e?.message ?? 'Unable to start guided capture.'));

    return () => {
      unsub();
      FacesCapture.stopGuidedCapture().catch(() => {});
    };
  }, []);

  useEffect(() => {
    FacesCapture.setTargetPose(currentStep.pose).catch(() => {});
  }, [currentStep.pose]);

  const blockerText = getBlockerText(captureState);

  const capture = async () => {
    if (captureComplete) return;
    setStatus('');

    try {
      const uri = await FacesCapture.capturePhoto(currentStep.pose);
      if (!uri) return;
      setPhotos(p => [...p, uri]);
    } catch (e: any) {
      const message = String(e?.message ?? '');

      if (message.toLowerCase().includes('not implemented')) {
        setStatus(FALLBACK_MESSAGE);
        // Temporary fallback until the standalone capture product owns photo capture.
        const result = await launchCamera({ mediaType: 'photo', cameraType: 'front' });
        const uri = result.assets?.[0]?.uri;
        if (!uri) return;
        const persistedUri = await FaceID.persistPhoto(uri);
        setPhotos(p => [...p, persistedUri]);
        return;
      }

      setStatus(message || 'Capture failed.');
    }
  };

  const save = async () => {
    if (!name.trim() || photos.length !== CAPTURE_STEPS.length) return;
    setStatus('Saving...');
    try {
      await FaceID.registerWorker(Date.now().toString(), name.trim(), photos);
      setStatus('Saved!');
      setPhotos([]);
      setName('');
      await AsyncStorage.removeItem(DRAFT_KEY);
      await FaceID.clearDraftPhotos();
      onDone();
    } catch (e: any) {
      setStatus('Error: ' + e.message);
    }
  };

  useEffect(() => {
    if (captureState?.canCapture && !captureComplete && !autoCapturing.current) {
      autoCapturing.current = true;
      capture().finally(() => { autoCapturing.current = false; });
    }
  }, [captureState?.canCapture, captureComplete]);

  const reset = async () => {
    setPhotos([]);
    setStatus('');
    await AsyncStorage.removeItem(DRAFT_KEY);
    await FaceID.clearDraftPhotos().catch(() => {});
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={styles.titleRow}>
        <Text accessibilityLabel="registration.title" style={styles.title}>Register User</Text>
        {photos.length > 0 && (
          <TouchableOpacity accessibilityLabel="registration.cancel_button" onPress={reset}>
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
        )}
      </View>

      <TextInput
        accessibilityLabel="registration.name_input"
        style={styles.input}
        placeholder="Full name"
        value={name}
        onChangeText={setName}
      />

      <View style={styles.captureCard}>
        <View style={styles.debugRow}>
          <View />
          {captureState && !captureComplete && (
            <Text style={styles.debugDist}>
              {lookDistance(captureState).toFixed(2)}
            </Text>
          )}
        </View>
        <Text accessibilityLabel="registration.photo_count" style={styles.count}>
          {`Captured: ${photos.length} / 6`}
        </Text>

        <View accessibilityLabel="registration.capture_preview" style={styles.previewWrap}>
          <CaptureRing
            completeCount={Math.min(photos.length, 5)}
            activeIndex={captureComplete ? -1 : Math.min(currentStepIndex, 4)}
            finalStepActive={!captureComplete && currentStep.pose === 'straight'}
            pulse={pulse}
            yaw={captureState?.yaw ?? 0}
            verticalRatio={captureState?.verticalRatio ?? 0.355}
          />
          <Animated.View
            style={[
              styles.previewCircle,
              currentStep.pose === 'straight' && !captureComplete && {
                borderColor: '#f3c46f',
                transform: [{ scale: pulse }],
              },
            ]}
          >
            {FacesCaptureView
              ? <FacesCaptureView style={styles.previewFill} />
              : <View style={styles.previewFill} />}
          </Animated.View>
        </View>

        <Text accessibilityLabel="registration.capture_instruction" style={styles.instruction}>
          {captureComplete ? 'All required photos captured.' : currentStep.label}
        </Text>
        <Text accessibilityLabel="registration.capture_blocker" style={styles.blocker}>
          {status || blockerText || 'Frame your face inside the circle and follow the active target.'}
        </Text>
        {captureState?.detectedPose && !captureComplete && (
          <Text style={styles.debugPose}>
            {`Detected: ${captureState.detectedPose} → Target: ${captureState.targetPose}`}
          </Text>
        )}

        {captureComplete && (
          <Text accessibilityLabel="registration.capture_done" style={styles.captureDone}>
            All photos captured
          </Text>
        )}
      </View>

      {photos.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.thumbnailRow}>
          {photos.map((uri, i) => (
            <Image key={uri + i} source={{ uri }} style={styles.thumbnail} />
          ))}
        </ScrollView>
      )}

      <TouchableOpacity
        accessibilityLabel="registration.save_button"
        style={[styles.button, styles.save, (!name.trim() || photos.length !== CAPTURE_STEPS.length) && styles.disabled]}
        onPress={save}
        disabled={!name.trim() || photos.length !== CAPTURE_STEPS.length}
      >
        <Text style={styles.buttonText}>Save</Text>
      </TouchableOpacity>

      <Text accessibilityLabel="registration.status" style={styles.status}>{status}</Text>

      <Text style={[styles.modelStatus, modelOk === null && styles.modelUnknown,
                                        modelOk === true  && styles.modelLoaded,
                                        modelOk === false && styles.modelMissing]}>
        {modelOk === null  ? 'Model: checking…'
       : modelOk === true  ? 'Model: loaded ✓'
                           : 'Model: NOT loaded ✗'}
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fffaf1' },
  content:   { padding: 24, gap: 16, paddingBottom: 40 },
  titleRow:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title:     { fontSize: 24, fontWeight: '700', color: '#2b2418' },
  cancelText: { fontSize: 16, fontWeight: '600', color: '#d93025' },
  input:     { borderWidth: 1, borderColor: '#e0d5c2', borderRadius: 12, padding: 12, fontSize: 16, backgroundColor: '#fff' },
  captureCard: {
    backgroundColor: '#fff',
    borderRadius: 24,
    paddingVertical: 18,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: '#f3e4ca',
    alignItems: 'center',
  },
  debugRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignSelf: 'stretch',
    paddingHorizontal: 4,
    marginBottom: 2,
    minHeight: 22,
  },
  debugDist: { fontSize: 16, fontVariant: ['tabular-nums'], color: '#7a6a52' },
  count:     { fontSize: 16, color: '#7a6a52', marginBottom: 10 },
  previewWrap: { width: 260, height: 260, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  previewCircle: {
    width: 220,
    height: 220,
    borderRadius: 110,
    overflow: 'hidden',
    borderWidth: 6,
    borderColor: '#f3dfb7',
    backgroundColor: '#111',
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewFill: { width: '100%', height: '100%' },
  instruction: {
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
    color: '#2b2418',
    marginBottom: 8,
  },
  blocker: { minHeight: 40, textAlign: 'center', color: '#7a6a52', marginBottom: 12, paddingHorizontal: 16 },
  captureDone: { fontSize: 16, fontWeight: '700', color: '#34a853', textAlign: 'center', marginTop: 4 },
  debugPose: { fontSize: 12, color: '#999', textAlign: 'center', marginTop: 2 },
  button:    { backgroundColor: '#1a73e8', padding: 14, borderRadius: 8, alignItems: 'center' },
  save:      { backgroundColor: '#34a853' },
  disabled:  { opacity: 0.4 },
  buttonText:    { color: '#fff', fontWeight: '600', fontSize: 16 },
  status:        { fontSize: 14, color: '#7a6a52', textAlign: 'center' },
  modelStatus:   { fontSize: 13, textAlign: 'center', marginTop: 8 },
  modelUnknown:  { color: '#999' },
  modelLoaded:   { color: '#34a853' },
  modelMissing:  { color: '#d93025' },
  thumbnailRow:  { flexDirection: 'row', minHeight: 72 },
  thumbnail:     { width: 72, height: 72, borderRadius: 12, marginRight: 8, borderWidth: 2, borderColor: '#f3dfb7' },
});

const NEUTRAL_VR = 0.355;

function lookDistance(cs: CaptureState): number {
  const h = Math.abs(cs.yaw ?? 0) / 0.4;
  const v = Math.abs((cs.verticalRatio ?? NEUTRAL_VR) - NEUTRAL_VR) / 0.1;
  return Math.min(Math.max(h, v), 1);
}

function lookAngleDeg(yaw: number, vr: number): number {
  // dx: positive = looking right on screen, dy: positive = looking down
  const dx = -yaw;
  const dy = vr - NEUTRAL_VR;
  return (Math.atan2(dy, dx) * 180 / Math.PI + 360) % 360;
}

const DOT_RADIUS = ARC_RADIUS + ARC_STROKE / 2 + 4;

function CaptureRing({
  completeCount,
  activeIndex,
  finalStepActive,
  pulse,
  yaw,
  verticalRatio,
}: {
  completeCount: number;
  activeIndex: number;
  finalStepActive: boolean;
  pulse: Animated.Value;
  yaw: number;
  verticalRatio: number;
}) {
  const mag = Math.min(Math.max(Math.abs(yaw) / 0.4, Math.abs(verticalRatio - NEUTRAL_VR) / 0.1), 1);
  const angleDeg = lookAngleDeg(yaw, verticalRatio);
  const rad = (angleDeg * Math.PI) / 180;
  const dotX = ARC_CX + DOT_RADIUS * Math.cos(rad);
  const dotY = ARC_CY + DOT_RADIUS * Math.sin(rad);

  return (
    <Svg
      width={ARC_SIZE}
      height={ARC_SIZE}
      style={StyleSheet.absoluteFill}
      pointerEvents="none"
    >
      {ARC_CENTERS.map((center, index) => {
        const start = center - ARC_SPAN_DEG / 2;
        const end = center + ARC_SPAN_DEG / 2;
        const d = arcPath(ARC_CX, ARC_CY, ARC_RADIUS, start, end);
        const isDone = index < completeCount;
        const isActive = !finalStepActive && index === activeIndex;
        const stroke = isDone || isActive ? '#f3c46f' : '#eadfcf';

        return (
          <React.Fragment key={index}>
            {isActive && (
              <AnimatedPath
                d={d}
                fill="none"
                stroke="#f3c46f"
                strokeWidth={ARC_STROKE + 10}
                strokeLinecap="round"
                opacity={pulse.interpolate({
                  inputRange: [0.88, 1],
                  outputRange: [0.1, 0.35],
                })}
              />
            )}
            <Path
              d={d}
              fill="none"
              stroke={stroke}
              strokeWidth={ARC_STROKE}
              strokeLinecap="round"
            />
          </React.Fragment>
        );
      })}
      {mag > 0.08 && (
        <Circle cx={dotX} cy={dotY} r={7} fill="#d93025" />
      )}
    </Svg>
  );
}

function getBlockerText(captureState: CaptureState | null) {
  switch (captureState?.blockReason) {
  case 'bad_lighting':
    return LIGHTING_MESSAGE;
  case 'multiple_faces':
    return 'Only one face should be visible.';
  case 'out_of_frame':
    return 'Move your face inside the circle.';
  case 'wrong_pose':
    return 'Follow the highlighted target before taking the photo.';
  case 'too_blurry':
    return 'Hold still so the photo stays sharp.';
  case 'hold_still':
    return 'Hold still for a moment.';
  case 'not_implemented':
    return FALLBACK_MESSAGE;
  default:
    return '';
  }
}
