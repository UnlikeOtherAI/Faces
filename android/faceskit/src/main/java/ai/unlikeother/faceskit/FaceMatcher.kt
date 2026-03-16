package ai.unlikeother.faceskit

internal class FaceMatcher {
    data class Candidate(val worker: Worker, val score: Float)

    fun bestMatch(embedding: FloatArray, workers: List<Worker>, threshold: Float): Candidate? {
        var best: Candidate? = null
        for (worker in workers) {
            val score = dot(embedding, worker.averageEmbedding)
            if (score > threshold && score > (best?.score ?: -1f)) {
                best = Candidate(worker, score)
            }
        }
        return best
    }

    private fun dot(a: FloatArray, b: FloatArray): Float {
        var sum = 0f
        for (i in a.indices) sum += a[i] * b[i]
        return sum
    }
}
