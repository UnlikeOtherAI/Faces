import AVFoundation
import CoreVideo

@available(macOS 10.15, *)
final class CameraEngine: NSObject {
    var onFrame: ((CVPixelBuffer) -> Void)?

    private let session = AVCaptureSession()
    private let queue = DispatchQueue(label: "faceskit.camera", qos: .userInteractive)

    func start() {
        queue.async { [self] in
            guard !session.isRunning else { return }
            session.beginConfiguration()
            session.sessionPreset = .vga640x480
            guard
                let device = AVCaptureDevice.default(.builtInWideAngleCamera,
                                                     for: .video, position: .front),
                let input = try? AVCaptureDeviceInput(device: device),
                session.canAddInput(input)
            else { session.commitConfiguration(); return }
            session.addInput(input)
            let output = AVCaptureVideoDataOutput()
            output.videoSettings = [
                kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA
            ]
            output.alwaysDiscardsLateVideoFrames = true
            output.setSampleBufferDelegate(self, queue: queue)
            guard session.canAddOutput(output) else { session.commitConfiguration(); return }
            session.addOutput(output)
            session.commitConfiguration()
            session.startRunning()
        }
    }

    func stop() {
        queue.async { [self] in
            if session.isRunning { session.stopRunning() }
        }
    }
}

@available(macOS 10.15, *)
extension CameraEngine: AVCaptureVideoDataOutputSampleBufferDelegate {
    func captureOutput(_ output: AVCaptureOutput,
                       didOutput sampleBuffer: CMSampleBuffer,
                       from connection: AVCaptureConnection) {
        guard let buffer = CMSampleBufferGetImageBuffer(sampleBuffer) else { return }
        onFrame?(buffer)
    }
}
