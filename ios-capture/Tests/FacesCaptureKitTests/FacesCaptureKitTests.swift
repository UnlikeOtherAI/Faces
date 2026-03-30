import XCTest
@testable import FacesCaptureKit

final class FacesCaptureKitTests: XCTestCase {
    func testPoseCount() {
        XCTAssertEqual(CapturePose.allCases.count, 6)
    }

    func testStartEmitsInitialState() {
        let exp = expectation(description: "capture state emitted")
        FacesCaptureKit.shared.onCaptureState = { state in
            XCTAssertEqual(state.targetPose, .leftTop)
            exp.fulfill()
        }
        FacesCaptureKit.shared.startGuidedCapture()
        waitForExpectations(timeout: 1)
    }
}
