// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "FacesCaptureKit",
    platforms: [.iOS(.v16)],
    products: [
        .library(name: "FacesCaptureKit", targets: ["FacesCaptureKit"]),
    ],
    targets: [
        .target(
            name: "FacesCaptureKit",
            path: "Sources/FacesCaptureKit"
        ),
        .testTarget(
            name: "FacesCaptureKitTests",
            dependencies: ["FacesCaptureKit"],
            path: "Tests/FacesCaptureKitTests"
        ),
    ]
)
