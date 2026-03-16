# react-native-faces

React Native bridge for the Faces face identification library.

## Installation

```bash
# From the Faces repo root — local path dep for the example apps:
pnpm add ../react/react-native-faces

# When published to npm:
pnpm add react-native-faces
```

## Usage

```typescript
import FaceID from 'react-native-faces';

// Start the camera + recognition pipeline
await FaceID.startRecognition();

// Listen for matches
const unsubscribe = FaceID.onFaceRecognized((match) => {
  console.log(`Identified: ${match.workerName}  score: ${match.score}`);
  login(match.workerId);
});

// Register a new user (photos as file:// URIs or absolute paths)
await FaceID.registerWorker('user-123', 'Alice', [photo1Uri, photo2Uri, photo3Uri]);

// List registered users
const workers = await FaceID.getWorkers();

// Remove a user
await FaceID.deleteWorker('user-123');

// Stop when done
await FaceID.stopRecognition();
unsubscribe();
```

## API

| Method | Description |
|--------|-------------|
| `startRecognition()` | Start camera + embedding pipeline |
| `stopRecognition()` | Stop camera |
| `registerWorker(id, name, photos[])` | Register a user from 3–5 photos |
| `deleteWorker(id)` | Remove a registered user |
| `getWorkers()` | List all registered users |
| `onFaceRecognized(callback)` | Subscribe to match events — returns unsubscribe fn |

Photos are passed as `file://` URIs or absolute file paths.
