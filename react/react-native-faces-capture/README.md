# react-native-faces-capture

React Native bridge for the standalone guided face capture product in this repo.

This package owns guided enrollment capture only. It exposes the native capture
bridge plus a standalone React Native card component that runs the six-photo
sequence and returns accepted photo URIs.

```tsx
import {
  GuidedFaceCaptureCard,
  type CaptureState,
} from 'react-native-faces-capture';

export function EnrollmentCapture() {
  return (
    <GuidedFaceCaptureCard
      debug
      holdMs={1000}
      onPhotoCaptured={(event) => {
        console.log(event.direction, event.stepNumber, event.uri);
      }}
      onCaptureState={(state: CaptureState) => {
        console.log(state.targetPose, state.canCapture);
      }}
      onComplete={(photos) => {
        console.log('ready to register', photos);
      }}
      onError={(error) => {
        console.warn(error.message);
      }}
    />
  );
}
```

The component does not register workers or create embeddings. Pass the completed
photo URIs to `react-native-faces` or another enrollment backend.

`onPhotoCaptured` fires once per accepted photo. Its `direction` value is one of:

- `left_top`
- `top`
- `top_right`
- `bottom_right`
- `bottom_left`
- `straight`
