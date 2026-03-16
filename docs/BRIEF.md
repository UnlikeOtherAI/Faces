# Cross-Platform Face Identification Plugin for In-App Multi-User Authentication (iOS + Android + React Native)

---

## 1. Goal

Build a **fast face-identification system** that automatically identifies and logs in staff when they approach or interact with a device running the app.

Constraints:

* **React Native UI layer**
* Native face processing for **speed and reliability**
* Works on **iOS (iPads)** and **Android tablets**
* Must support **multiple users per device (20–100+)**
* Identification must be **< 300 ms**
* Entire system runs **locally on device** (no cloud latency)

Security is **not the primary concern** — speed and usability are.

This is **identification**, not biometric authentication.

---

## 2. Final Architecture

```
React Native App
        │
        │
React Native Native Module (Plugin)
        │
 ┌───────────────┬────────────────┐
 │               │                │
iOS Native     Android Native   Shared Logic
(Swift)        (Kotlin)         (Embedding format)
 │               │
Apple Vision     ML Kit / MediaPipe
TrueDepth        CameraX
ARKit            TFLite
```

The face recognition pipeline must run **fully native**, with React Native only handling:

* UI
* user registration
* login events

---

## 3. Core System Components

### 3.1 User Registration

A simple flow used to register users within the app.

Platform:

* React Native
* uses the plugin

Workflow:

1. User opens registration screen
2. App captures **3–5 photos**
3. Face embeddings are generated
4. Stored locally and synced to other devices

Data stored per user:

```
user_id
name
face_embeddings[]
last_updated
```

Embeddings are small vectors (~128–512 floats).

---

### 3.2 Recognition on Device

Devices continuously scan the front camera.

When a face appears:

```
detect face
extract embedding
compare with user database
if match → auto login
```

Target latency:

```
face detect: <80ms
embedding: <120ms
comparison: <20ms
total: <300ms
```

---

## 4. Face Recognition Engine

Use **modern embedding-based recognition**.

### Preferred options

Option A (best):

**MediaPipe Face + FaceNet embedding**

Option B:

**MobileFaceNet**

Option C:

**ArcFace TFLite**

Requirements:

```
embedding size: 128–512
cosine similarity matching
threshold adjustable
```

Matching algorithm:

```
cosine_similarity(embedding_live, embedding_user)

if score > threshold
    match
```

Threshold initially:

```
0.65–0.75
```

---

## 5. iOS Implementation

Language:

```
Swift
```

Libraries:

```
Vision
ARKit (optional)
CoreML
AVFoundation
```

Steps:

1. Capture frames from front camera
2. Detect face using Vision
3. Crop and normalize
4. Run embedding model (CoreML)
5. Compare with local embeddings

Optimizations:

```
use AVFoundation frame pipeline
process only every 3rd frame
run embedding on background queue
```

---

## 6. Android Implementation

Language:

```
Kotlin
```

Libraries:

```
CameraX
ML Kit Face Detection
TensorFlow Lite
MediaPipe (optional)
```

Steps:

1. CameraX frame stream
2. Face detection
3. Crop face
4. TFLite embedding model
5. Cosine similarity comparison

Optimizations:

```
use GPU delegate
frame skipping
```

---

## 7. React Native Plugin

Create a native bridge:

```
react-native-faceid
```

Structure:

```
/ios
/android
/src
/example
```

Expose JS API:

```
startRecognition()
stopRecognition()

registerUser(userId, photos[])

deleteUser(userId)

getUsers()

onFaceRecognized(callback)
```

Example:

```javascript
FaceID.startRecognition()

FaceID.onFaceRecognized((user) => {
   login(user.id)
})
```

---

## 8. User Sync

Users must sync across devices.

Options:

### Option A (simple)

Local network broadcast.

```
device receives new users
via websocket
```

### Option B

Backend API.

```
POST /users
GET /users
```

Embeddings are synced.

---

## 9. Recognition Flow

```
camera frame
↓
face detection
↓
face crop
↓
embedding generation
↓
vector comparison
↓
best match
↓
emit login event
```

---

## 10. Example Apps

Three example apps are required.

### 1. User Registration App

Features:

* take 3–5 photos
* preview
* save user

### 2. Recognition App

Features:

* live recognition
* auto login display
* user indicator

### 3. Debug Simulator

Displays:

```
detected faces
similarity scores
frame rate
latency
```

Used for tuning.

---

## 11. Testing Workflow

Testing must occur on **real devices**.

Test devices:

```
iPads
Android tablets
```

Test scenarios:

```
multiple users near device
low light
side angle faces
hats
glasses
```

Metrics collected:

```
recognition latency
false positives
false negatives
```

---

## 12. Performance Targets

```
recognition time < 300ms
works with 100 users
CPU < 40%
battery impact minimal
```

---

## 13. Optional Hardware Improvements

Possible improvements later:

```
use iPad TrueDepth
distance detection
presence detection
```

But first version should work with **standard camera**.

---

## 14. Future Enhancements

Possible features:

```
multi-face detection
continuous user tracking
session handover
face + BLE badge hybrid
```

---

## 15. Deliverables

### 1. React Native plugin

```
react-native-faceid
```

### 2. Native modules

```
Swift face engine
Kotlin face engine
```

### 3. Example apps

```
user registration
recognition app
debug app
```

### 4. Embedding models

```
MobileFaceNet / FaceNet
```

### 5. Documentation

Including:

```
setup
model conversion
testing instructions
performance tuning
```

---

## 16. Critical Design Rule

Recognition must be **instant**.

If recognition > 500ms, system is unusable.

Prefer:

```
slightly less accurate
but very fast
```
