package ai.unlikeother.facescapture

enum class CapturePose(val wireValue: String) {
    LEFT_TOP("left_top"),
    TOP("top"),
    TOP_RIGHT("top_right"),
    BOTTOM_RIGHT("bottom_right"),
    BOTTOM_LEFT("bottom_left"),
    STRAIGHT("straight"),
}

enum class CaptureBlockReason(val wireValue: String) {
    NONE("none"),
    NO_FACE("no_face"),
    MULTIPLE_FACES("multiple_faces"),
    OUT_OF_FRAME("out_of_frame"),
    WRONG_POSE("wrong_pose"),
    BAD_LIGHTING("bad_lighting"),
    TOO_BLURRY("too_blurry"),
    HOLD_STILL("hold_still"),
    NOT_IMPLEMENTED("not_implemented"),
}

data class FaceRect(
    val x: Float,
    val y: Float,
    val width: Float,
    val height: Float,
)

data class CaptureState(
    val targetPose: CapturePose,
    val detectedPose: CapturePose? = null,
    val faceRect: FaceRect? = null,
    val faceInsideGuide: Boolean = false,
    val lightingOk: Boolean = false,
    val sharpnessOk: Boolean = false,
    val stable: Boolean = false,
    val canCapture: Boolean = false,
    val blockReason: CaptureBlockReason = CaptureBlockReason.NOT_IMPLEMENTED,
)
