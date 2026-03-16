import XCTest
@testable import FacesKit

final class FacesKitTests: XCTestCase {

    func test_l2Normalize_unit_vector() {
        var v: [Float] = [3, 4]
        l2Normalize(&v)
        XCTAssertEqual(v[0], 0.6, accuracy: 1e-5)
        XCTAssertEqual(v[1], 0.8, accuracy: 1e-5)
    }

    func test_worker_average_embedding_is_normalised() {
        let e1: [Float] = [1, 0, 0, 0]
        let e2: [Float] = [0, 1, 0, 0]
        let worker = Worker(id: "w1", name: "Alice", embeddings: [e1, e2])
        let norm = sqrt(worker.averageEmbedding.reduce(0) { $0 + $1 * $1 })
        XCTAssertEqual(norm, 1.0, accuracy: 1e-5)
    }

    func test_matcher_returns_nil_below_threshold() {
        let matcher = FaceMatcher()
        var emb: [Float] = [1, 0, 0, 0]; l2Normalize(&emb)
        let worker = Worker(id: "w1", name: "Alice", embeddings: [[0, 1, 0, 0]])
        let result = matcher.bestMatch(embedding: emb, workers: [worker], threshold: 0.70)
        XCTAssertNil(result)
    }

    func test_matcher_returns_match_above_threshold() {
        let matcher = FaceMatcher()
        var emb: [Float] = [1, 0, 0, 0]; l2Normalize(&emb)
        let worker = Worker(id: "w1", name: "Alice", embeddings: [[1, 0, 0, 0]])
        let result = matcher.bestMatch(embedding: emb, workers: [worker], threshold: 0.70)
        XCTAssertNotNil(result)
        XCTAssertEqual(result?.score ?? 0, 1.0, accuracy: 1e-5)
    }
}
