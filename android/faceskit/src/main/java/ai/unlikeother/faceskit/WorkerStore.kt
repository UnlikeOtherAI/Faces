package ai.unlikeother.faceskit

import android.content.Context
import com.google.gson.*
import com.google.gson.reflect.TypeToken
import com.google.gson.stream.JsonReader
import com.google.gson.stream.JsonWriter
import java.io.File
import java.util.concurrent.locks.ReentrantReadWriteLock
import kotlin.concurrent.read
import kotlin.concurrent.write

private object FloatArrayAdapter : TypeAdapter<FloatArray>() {
    override fun write(out: JsonWriter, value: FloatArray) {
        out.beginArray()
        for (f in value) out.value(f.toDouble())
        out.endArray()
    }

    override fun read(reader: JsonReader): FloatArray {
        val list = mutableListOf<Float>()
        reader.beginArray()
        while (reader.hasNext()) list.add(reader.nextDouble().toFloat())
        reader.endArray()
        return list.toFloatArray()
    }
}

internal class WorkerStore(context: Context) {
    private val file = File(context.filesDir, "faceskit/workers.json").also {
        it.parentFile?.mkdirs()
    }
    private val gson = GsonBuilder()
        .registerTypeAdapter(FloatArray::class.java, FloatArrayAdapter)
        .create()
    private val lock = ReentrantReadWriteLock()
    private val cache: MutableMap<String, Worker> = loadFromDisk().toMutableMap()

    fun save(worker: Worker) = lock.write {
        cache[worker.id] = worker
        persist()
    }

    fun delete(workerId: String) = lock.write {
        cache.remove(workerId)
        persist()
    }

    fun all(): List<Worker> = lock.read { cache.values.toList() }

    private fun persist() {
        file.writeText(gson.toJson(cache.values.toList()))
    }

    private fun loadFromDisk(): Map<String, Worker> {
        if (!file.exists()) return emptyMap()
        val type = object : TypeToken<List<Worker>>() {}.type
        return try {
            val list: List<Worker> = gson.fromJson(file.readText(), type)
            list.associateBy { it.id }
        } catch (_: Exception) { emptyMap() }
    }
}
