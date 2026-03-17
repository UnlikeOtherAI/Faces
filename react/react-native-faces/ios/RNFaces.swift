import Foundation
import FacesKit
import UIKit

@objc(RNFaces)
class RNFaces: RCTEventEmitter {

    override func supportedEvents() -> [String]! {
        ["onFaceRecognized", "onAllScores"]
    }

    override func startObserving() {
        FacesKit.shared.onMatch = { [weak self] match in
            self?.sendEvent(withName: "onFaceRecognized", body: [
                "workerId":   match.worker.id,
                "workerName": match.worker.name,
                "score":      match.score,
                "latencyMs":  match.latencyMs,
            ])
        }
        FacesKit.shared.onAllScores = { [weak self] scores in
            let body = scores.map { match -> [String: Any] in
                [
                    "workerId":   match.worker.id,
                    "workerName": match.worker.name,
                    "score":      match.score,
                    "latencyMs":  match.latencyMs,
                ]
            }
            self?.sendEvent(withName: "onAllScores", body: body)
        }
    }

    override func stopObserving() {
        FacesKit.shared.onMatch = nil
        FacesKit.shared.onAllScores = nil
    }

    @objc func startRecognition(_ resolve: @escaping RCTPromiseResolveBlock,
                                rejecter reject: @escaping RCTPromiseRejectBlock) {
        FacesKit.shared.start()
        resolve(nil)
    }

    @objc func stopRecognition(_ resolve: @escaping RCTPromiseResolveBlock,
                               rejecter reject: @escaping RCTPromiseRejectBlock) {
        FacesKit.shared.stop()
        resolve(nil)
    }

    @objc func registerWorker(_ workerId: String,
                              name: String,
                              photos: [String],
                              resolver resolve: @escaping RCTPromiseResolveBlock,
                              rejecter reject: @escaping RCTPromiseRejectBlock) {
        let images: [CGImage] = photos.compactMap { uri in
            let path = uri.hasPrefix("file://") ? String(uri.dropFirst(7)) : uri
            return UIImage(contentsOfFile: path)?.cgImage
        }
        let photoPath: String? = photos.first.flatMap { uri -> String? in
            let src = uri.hasPrefix("file://") ? String(uri.dropFirst(7)) : uri
            let dir = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)
                .first!.appendingPathComponent("FacesKit/photos")
            try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
            let dst = dir.appendingPathComponent("\(workerId).jpg")
            try? FileManager.default.removeItem(at: dst)
            try? FileManager.default.copyItem(at: URL(fileURLWithPath: src), to: dst)
            return FileManager.default.fileExists(atPath: dst.path) ? dst.path : nil
        }
        FacesKit.shared.register(workerId: workerId, name: name, photos: images, photoPath: photoPath) { result in
            switch result {
            case .success:
                resolve(nil)
            case .failure(let error):
                reject("REGISTER_ERROR", error.localizedDescription, error)
            }
        }
    }

    @objc func deleteWorker(_ workerId: String,
                            resolver resolve: @escaping RCTPromiseResolveBlock,
                            rejecter reject: @escaping RCTPromiseRejectBlock) {
        do {
            try FacesKit.shared.delete(workerId: workerId)
            resolve(nil)
        } catch {
            reject("DELETE_ERROR", error.localizedDescription, error)
        }
    }

    @objc func persistPhoto(_ uri: String,
                            resolver resolve: @escaping RCTPromiseResolveBlock,
                            rejecter reject: @escaping RCTPromiseRejectBlock) {
        let src = uri.hasPrefix("file://") ? String(uri.dropFirst(7)) : uri
        let dir = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)
            .first!.appendingPathComponent("FacesKit/drafts")
        do {
            try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
            let dst = dir.appendingPathComponent(UUID().uuidString + ".jpg")
            try FileManager.default.copyItem(atPath: src, toPath: dst.path)
            resolve("file://" + dst.path)
        } catch {
            reject("PERSIST_ERROR", error.localizedDescription, error)
        }
    }

    @objc func clearDraftPhotos(_ resolve: @escaping RCTPromiseResolveBlock,
                                rejecter reject: @escaping RCTPromiseRejectBlock) {
        let dir = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)
            .first!.appendingPathComponent("FacesKit/drafts")
        try? FileManager.default.removeItem(at: dir)
        resolve(nil)
    }

    @objc func isModelLoaded(_ resolve: @escaping RCTPromiseResolveBlock,
                             rejecter reject: @escaping RCTPromiseRejectBlock) {
        resolve(FacesKit.shared.isModelLoaded())
    }

    @objc func getWorkers(_ resolve: @escaping RCTPromiseResolveBlock,
                          rejecter reject: @escaping RCTPromiseRejectBlock) {
        let workers = FacesKit.shared.workers().map { w -> [String: Any] in
            var dict: [String: Any] = [
                "id":          w.id,
                "name":        w.name,
                "lastUpdated": w.lastUpdated.timeIntervalSince1970 * 1000,
            ]
            if let path = w.photoPath {
                dict["photoUri"] = "file://\(path)"
            }
            return dict
        }
        resolve(workers)
    }
}
