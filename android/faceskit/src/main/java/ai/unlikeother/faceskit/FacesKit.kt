package ai.unlikeother.faceskit

import android.content.Context
import kotlinx.coroutines.*

object FacesKit {
    var threshold: Float = 0.60f
    var requiredStreak: Int = 3
    var captureUnknownFaces: Boolean = false
    var unknownFaceStreak: Int = 3
    var onMatch: ((MatchResult) -> Unit)? = null
    var onUnknownFace: ((Worker) -> Unit)? = null

    private lateinit var appContext: Context
    private val scope = CoroutineScope(Dispatchers.Default + SupervisorJob())

    private val camera by lazy { CameraEngine(appContext) }
    private val detector by lazy { FaceDetector() }
    private val embedder by lazy { FaceEmbedder(appContext) }
    private val matcher = FaceMatcher()
    internal lateinit var store: WorkerStore
        private set

    private var frameCounter = 0
    private val processEveryNthFrame = 3
    private var streakWorkerId: String? = null
    private var streakCount: Int = 0
    private var unknownStreakCount: Int = 0
    private var unknownCrops: MutableList<android.graphics.Bitmap> = mutableListOf()
    private var unknownEmbeddings: MutableList<FloatArray> = mutableListOf()
    private var unknownCooldownFrames: Int = 0

    fun start(context: Context) {
        appContext = context.applicationContext
        store = WorkerStore(appContext)
        camera.onFrame = { bitmap ->
            frameCounter++
            if (frameCounter % processEveryNthFrame == 0) {
                scope.launch { handleFrame(bitmap) }
            }
        }
        camera.start()
    }

    fun stop() { camera.stop() }

    fun register(workerId: String, name: String,
                 photos: List<android.graphics.Bitmap>,
                 photoPath: String? = null,
                 callback: (Result<Worker>) -> Unit) {
        scope.launch {
            try {
                val embeddings = photos.mapNotNull { photo ->
                    detector.detectAndCrop(photo)?.let { crop ->
                        embedder.embed(crop).l2Normalize()
                    }
                }
                require(embeddings.isNotEmpty()) { "No face detected in provided photos" }
                val worker = Worker(
                    id = workerId, name = name,
                    embeddings = embeddings,
                    averageEmbedding = averageEmbedding(embeddings),
                    photoPath = photoPath
                )
                store.save(worker)
                withContext(Dispatchers.Main) { callback(Result.success(worker)) }
            } catch (e: Exception) {
                withContext(Dispatchers.Main) { callback(Result.failure(e)) }
            }
        }
    }

    fun delete(workerId: String) {
        store.all().firstOrNull { it.id == workerId }?.photoPath?.let {
            java.io.File(it).delete()
        }
        store.delete(workerId)
    }
    fun workers(): List<Worker> = store.all()

    private suspend fun handleFrame(bitmap: android.graphics.Bitmap) {
        val start = System.currentTimeMillis()
        val crop = detector.detectAndCrop(bitmap)
        if (crop == null) { unknownStreakCount = 0; unknownCrops.clear(); unknownEmbeddings.clear(); return }
        val emb = embedder.embed(crop).l2Normalize()
        val workers = store.all()
        val result = matcher.bestMatch(emb, workers, threshold)
        if (result != null) {
            unknownStreakCount = 0; unknownCrops.clear(); unknownEmbeddings.clear()
            if (result.worker.id == streakWorkerId) streakCount++ else { streakWorkerId = result.worker.id; streakCount = 1 }
            if (streakCount < requiredStreak) return
            val latency = System.currentTimeMillis() - start
            withContext(Dispatchers.Main) { onMatch?.invoke(MatchResult(result.worker, result.score, latency)) }
        } else {
            streakWorkerId = null; streakCount = 0
            if (!captureUnknownFaces) return
            if (unknownCooldownFrames > 0) { unknownCooldownFrames--; return }
            unknownStreakCount++
            unknownCrops.add(crop)
            unknownEmbeddings.add(emb)
            if (unknownStreakCount < unknownFaceStreak) return
            val cropsToSave = unknownCrops.toList()
            val embsToSave = unknownEmbeddings.toList()
            unknownStreakCount = 0; unknownCrops.clear(); unknownEmbeddings.clear()
            unknownCooldownFrames = 50
            saveAsUnknown(cropsToSave, embsToSave)
        }
    }

    private suspend fun saveAsUnknown(crops: List<android.graphics.Bitmap>, embeddings: List<FloatArray>) {
        val id = "unknown_${System.currentTimeMillis()}"
        val dir = java.io.File(appContext.filesDir, "faceskit/unknown").also { it.mkdirs() }
        val photoFile = java.io.File(dir, "$id.jpg")
        java.io.FileOutputStream(photoFile).use { crops[0].compress(android.graphics.Bitmap.CompressFormat.JPEG, 90, it) }
        val worker = Worker(id = id, name = "Unknown", embeddings = embeddings,
            averageEmbedding = averageEmbedding(embeddings), photoPath = photoFile.absolutePath)
        store.save(worker)
        withContext(Dispatchers.Main) { onUnknownFace?.invoke(worker) }
    }
}
