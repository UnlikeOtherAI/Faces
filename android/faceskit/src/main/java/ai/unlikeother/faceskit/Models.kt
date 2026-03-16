package ai.unlikeother.faceskit

import kotlin.math.sqrt

data class Worker(
    val id: String,
    val name: String,
    val embeddings: List<FloatArray>,
    val averageEmbedding: FloatArray,
    val lastUpdated: Long = System.currentTimeMillis()
)

data class MatchResult(
    val worker: Worker,
    val score: Float,
    val latencyMs: Long
)

fun FloatArray.l2Normalize(): FloatArray {
    val norm = sqrt(this.fold(0f) { acc, v -> acc + v * v })
    return if (norm < 1e-10f) this else FloatArray(size) { this[it] / norm }
}

fun averageEmbedding(embeddings: List<FloatArray>): FloatArray {
    if (embeddings.isEmpty()) return FloatArray(0)
    val dim = embeddings[0].size
    val sum = FloatArray(dim)
    for (e in embeddings) for (i in 0 until dim) sum[i] += e[i]
    return FloatArray(dim) { sum[it] / embeddings.size }.l2Normalize()
}
