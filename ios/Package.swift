// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "FacesKit",
    platforms: [.iOS(.v16)],
    products: [
        .library(name: "FacesKit", targets: ["FacesKit"]),
    ],
    targets: [
        .target(
            name: "FacesKit",
            path: "Sources/FacesKit",
            resources: [.process("Resources")]
        ),
        .testTarget(
            name: "FacesKitTests",
            dependencies: ["FacesKit"],
            path: "Tests/FacesKitTests"
        ),
    ]
)
