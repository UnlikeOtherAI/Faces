package ai.unlikeother.faceskit

import android.content.Context
import kotlinx.coroutines.*

object FacesKit {
    var threshold: Float = 0.70f
    var onMatch: ((MatchResult) -> Unit)? = null

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
                    averageEmbedding = averageEmbedding(embeddings)
                )
                store.save(worker)
                withContext(Dispatchers.Main) { callback(Result.success(worker)) }
            } catch (e: Exception) {
                withContext(Dispatchers.Main) { callback(Result.failure(e)) }
            }
        }
    }

    fun delete(workerId: String) { store.delete(workerId) }
    fun workers(): List<Worker> = store.all()

    private suspend fun handleFrame(bitmap: android.graphics.Bitmap) {
        val start = System.currentTimeMillis()
        val crop = detector.detectAndCrop(bitmap) ?: return
        val emb = embedder.embed(crop).l2Normalize()
        val workers = store.all()
        val result = matcher.bestMatch(emb, workers, threshold) ?: return
        val latency = System.currentTimeMillis() - start
        val match = MatchResult(result.worker, result.score, latency)
        withContext(Dispatchers.Main) { onMatch?.invoke(match) }
    }
}
