import Foundation

final class FaceMatcher {
    struct Candidate {
        let worker: Worker
        let score: Float
    }

    func bestMatch(embedding: [Float], workers: [Worker], threshold: Float) -> Candidate? {
        var best: Candidate?
        for worker in workers {
            let score = cosineSimilarity(embedding, worker.averageEmbedding)
            if score > threshold, score > (best?.score ?? -1) {
                best = Candidate(worker: worker, score: score)
            }
        }
        return best
    }

    private func cosineSimilarity(_ a: [Float], _ b: [Float]) -> Float {
        guard a.count == b.count, !a.isEmpty else { return 0 }
        return zip(a, b).reduce(0) { $0 + $1.0 * $1.1 }
    }
}
