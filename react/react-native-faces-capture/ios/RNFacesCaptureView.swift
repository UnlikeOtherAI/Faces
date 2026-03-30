import AVFoundation
import UIKit
import FacesCaptureKit

class RNFacesCaptureView: UIView {
    private var previewLayer: AVCaptureVideoPreviewLayer?
    private let dotsLayer = CALayer()

    override init(frame: CGRect) {
        super.init(frame: frame)
        setup()
    }

    required init?(coder: NSCoder) {
        super.init(coder: coder)
        setup()
    }

    private func setup() {
        backgroundColor = .black
        let preview = AVCaptureVideoPreviewLayer(session: FacesCaptureKit.shared.captureSession)
        preview.videoGravity = .resizeAspectFill
        layer.addSublayer(preview)
        previewLayer = preview

        layer.addSublayer(dotsLayer)

        FacesCaptureKit.shared.onLandmarks = { [weak self] points in
            self?.drawLandmarks(points)
        }
    }

    private func drawLandmarks(_ devicePoints: [CGPoint]) {
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        dotsLayer.sublayers?.forEach { $0.removeFromSuperlayer() }

        guard let preview = previewLayer, !devicePoints.isEmpty else {
            CATransaction.commit()
            return
        }

        // Order: leftEye, rightEye, nose, mouthLeft, mouthRight
        let colors: [CGColor] = [
            UIColor.cyan.cgColor,
            UIColor.cyan.cgColor,
            UIColor.green.cgColor,
            UIColor.yellow.cgColor,
            UIColor.yellow.cgColor,
        ]
        let dotSize: CGFloat = 10

        for (i, devicePt) in devicePoints.enumerated() {
            let viewPt = preview.layerPointConverted(fromCaptureDevicePoint: devicePt)
            let dot = CAShapeLayer()
            dot.path = UIBezierPath(ovalIn: CGRect(
                x: viewPt.x - dotSize / 2,
                y: viewPt.y - dotSize / 2,
                width: dotSize,
                height: dotSize
            )).cgPath
            dot.fillColor = i < colors.count ? colors[i] : UIColor.white.cgColor
            dotsLayer.addSublayer(dot)
        }

        CATransaction.commit()
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        previewLayer?.frame = bounds
        dotsLayer.frame = bounds
    }

    deinit {
        FacesCaptureKit.shared.onLandmarks = nil
    }
}
