import Foundation
import FacesKit
import UIKit

@objc(RNFaces)
class RNFaces: RCTEventEmitter {

    override func supportedEvents() -> [String]! {
        ["onFaceRecognized"]
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
    }

    override func stopObserving() {
        FacesKit.shared.onMatch = nil
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
            let path = uri.hasPrefix("file://")
                ? String(uri.dropFirst(7))
                : uri
            return UIImage(contentsOfFile: path)?.cgImage
        }
        FacesKit.shared.register(workerId: workerId, name: name, photos: images) { result in
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

    @objc func getWorkers(_ resolve: @escaping RCTPromiseResolveBlock,
                          rejecter reject: @escaping RCTPromiseRejectBlock) {
        let workers = FacesKit.shared.workers().map { w -> [String: Any] in
            [
                "id":          w.id,
                "name":        w.name,
                "lastUpdated": w.lastUpdated.timeIntervalSince1970 * 1000,
            ]
        }
        resolve(workers)
    }
}
