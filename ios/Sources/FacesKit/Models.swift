import Foundation

public struct Worker: Codable, Identifiable, Equatable {
    public let id: String
    public let name: String
    public var embeddings: [[Float]]
    public var averageEmbedding: [Float]
    public var lastUpdated: Date
    public var photoPath: String?

    public init(id: String, name: String, embeddings: [[Float]], photoPath: String? = nil) {
        self.id = id
        self.name = name
        self.embeddings = embeddings
        self.averageEmbedding = Self.average(embeddings)
        self.lastUpdated = Date()
        self.photoPath = photoPath
    }

    static func average(_ vecs: [[Float]]) -> [Float] {
        guard !vecs.isEmpty else { return [] }
        let dim = vecs[0].count
        var sum = [Float](repeating: 0, count: dim)
        for v in vecs { for i in 0..<dim { sum[i] += v[i] } }
        let n = Float(vecs.count)
        var avg = sum.map { $0 / n }
        l2Normalize(&avg)
        return avg
    }
}

public struct MatchResult {
    public let worker: Worker
    public let score: Float
    public let latencyMs: Double
}

public func l2Normalize(_ v: inout [Float]) {
    let norm = sqrt(v.reduce(0) { $0 + $1 * $1 })
    guard norm > 1e-10 else { return }
    for i in v.indices { v[i] /= norm }
}
