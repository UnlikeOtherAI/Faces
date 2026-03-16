package ai.unlikeother.faceskit

import org.junit.Assert.*
import org.junit.Test
import kotlin.math.sqrt

class FacesKitTest {

    @Test fun `l2Normalize produces unit vector`() {
        val v = floatArrayOf(3f, 4f).l2Normalize()
        assertEquals(0.6f, v[0], 1e-5f)
        assertEquals(0.8f, v[1], 1e-5f)
    }

    @Test fun `averageEmbedding is normalised`() {
        val avg = averageEmbedding(listOf(floatArrayOf(1f, 0f), floatArrayOf(0f, 1f)))
        val norm = sqrt(avg.fold(0f) { a, v -> a + v * v })
        assertEquals(1.0f, norm, 1e-5f)
    }

    @Test fun `matcher returns null below threshold`() {
        val matcher = FaceMatcher()
        val worker = Worker("w1", "Alice",
            listOf(floatArrayOf(0f, 1f).l2Normalize()),
            floatArrayOf(0f, 1f).l2Normalize())
        val result = matcher.bestMatch(floatArrayOf(1f, 0f).l2Normalize(), listOf(worker), 0.70f)
        assertNull(result)
    }

    @Test fun `matcher returns match above threshold`() {
        val matcher = FaceMatcher()
        val emb = floatArrayOf(1f, 0f).l2Normalize()
        val worker = Worker("w1", "Alice", listOf(emb), emb)
        val result = matcher.bestMatch(emb, listOf(worker), 0.70f)
        assertNotNull(result)
        assertEquals(1.0f, result!!.score, 1e-5f)
    }
}
