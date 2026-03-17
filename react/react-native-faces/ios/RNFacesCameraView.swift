import UIKit
import AVFoundation
import FacesKit

class RNFacesCameraView: UIView {
    private var previewLayer: AVCaptureVideoPreviewLayer?
    private let overlayBox = CAShapeLayer()
    private let nameLabel = UILabel()

    override init(frame: CGRect) {
        super.init(frame: frame)
        setup()
    }
    required init?(coder: NSCoder) {
        super.init(coder: coder)
        setup()
    }

    private func setup() {
        clipsToBounds = true
        backgroundColor = .black

        let preview = AVCaptureVideoPreviewLayer(session: FacesKit.shared.captureSession)
        preview.videoGravity = .resizeAspectFill
        layer.addSublayer(preview)
        previewLayer = preview

        overlayBox.fillColor = UIColor.clear.cgColor
        overlayBox.strokeColor = UIColor.systemGreen.cgColor
        overlayBox.lineWidth = 2
        layer.addSublayer(overlayBox)

        nameLabel.font = .boldSystemFont(ofSize: 14)
        nameLabel.textColor = .white
        nameLabel.backgroundColor = UIColor.systemGreen.withAlphaComponent(0.7)
        nameLabel.textAlignment = .center
        nameLabel.layer.cornerRadius = 4
        nameLabel.clipsToBounds = true
        nameLabel.isHidden = true
        addSubview(nameLabel)

        FacesKit.shared.onFaceRect = { [weak self] rect, name in
            self?.updateOverlay(rect: rect, name: name)
        }
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        previewLayer?.frame = bounds
    }

    private func updateOverlay(rect: CGRect, name: String?) {
        if rect == .zero {
            overlayBox.path = nil
            nameLabel.isHidden = true
            return
        }

        // Vision rect is normalized (origin bottom-left). Front camera is mirrored.
        // Convert to view coordinates:
        let w = bounds.width
        let h = bounds.height
        let x = rect.minX * w          // already mirrored by preview layer
        let y = (1 - rect.maxY) * h    // flip Y from bottom-left to top-left
        let fw = rect.width * w
        let fh = rect.height * h

        let faceFrame = CGRect(x: x, y: y, width: fw, height: fh)
        overlayBox.path = UIBezierPath(roundedRect: faceFrame, cornerRadius: 4).cgPath

        if let name = name {
            nameLabel.isHidden = false
            nameLabel.text = "  \(name)  "
            nameLabel.sizeToFit()
            nameLabel.frame.origin = CGPoint(
                x: faceFrame.midX - nameLabel.frame.width / 2,
                y: faceFrame.minY - nameLabel.frame.height - 4
            )
        } else {
            nameLabel.isHidden = true
        }
    }

    deinit {
        FacesKit.shared.onFaceRect = nil
    }
}
