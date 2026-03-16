import Foundation

public final class WorkerStore {
    private let fileURL: URL
    private var cache: [String: Worker] = [:]
    private let lock = NSLock()

    public init() {
        let dir = FileManager.default.urls(for: .applicationSupportDirectory,
                                           in: .userDomainMask).first!
        fileURL = dir.appendingPathComponent("FacesKit/workers.json")
        try? FileManager.default.createDirectory(
            at: fileURL.deletingLastPathComponent(),
            withIntermediateDirectories: true)
        load()
    }

    public func save(_ worker: Worker) throws {
        lock.lock(); defer { lock.unlock() }
        cache[worker.id] = worker
        try persist()
    }

    public func delete(workerId: String) throws {
        lock.lock(); defer { lock.unlock() }
        cache.removeValue(forKey: workerId)
        try persist()
    }

    public func all() -> [Worker] {
        lock.lock(); defer { lock.unlock() }
        return Array(cache.values)
    }

    private func load() {
        lock.lock(); defer { lock.unlock() }
        guard let data = try? Data(contentsOf: fileURL),
              let workers = try? JSONDecoder().decode([Worker].self, from: data) else { return }
        cache = Dictionary(uniqueKeysWithValues: workers.map { ($0.id, $0) })
    }

    private func persist() throws {
        let data = try JSONEncoder().encode(Array(cache.values))
        try data.write(to: fileURL, options: .atomic)
    }
}
