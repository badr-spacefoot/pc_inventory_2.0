// External GUI driver for disposable CI VMs. Never loads collector code.
import AppKit
import CoreGraphics
import Foundation
import Vision

let args = CommandLine.arguments
func output(_ value: Any) throws {
    let data = try JSONSerialization.data(withJSONObject: value, options: [.sortedKeys])
    print(String(decoding: data, as: UTF8.self))
}
switch args[1] {
case "display":
    let display = CGMainDisplayID()
    let modes = CGDisplayCopyAllDisplayModes(display, nil) as? [CGDisplayMode] ?? []
    let suitable = modes.filter { $0.width >= 1280 && $0.height >= 960 }
        .sorted { $0.width * $0.height < $1.width * $1.height }
    if let mode = suitable.first {
        var configuration: CGDisplayConfigRef?
        guard CGBeginDisplayConfiguration(&configuration) == .success,
              let configuration = configuration,
              CGConfigureDisplayWithDisplayMode(configuration, display, mode, nil) == .success,
              CGCompleteDisplayConfiguration(configuration, .forSession) == .success else {
            fatalError("Cannot resize disposable VM display")
        }
        Thread.sleep(forTimeInterval: 1)
    }
    let bounds = CGDisplayBounds(display)
    try output(["width": bounds.width, "height": bounds.height,
                "availableModes": modes.map { ["width": $0.width, "height": $0.height] }])
case "permissions":
    try output(["postEvents": CGPreflightPostEventAccess(), "screenCapture": CGPreflightScreenCaptureAccess()])
case "activate":
    guard let app = NSRunningApplication(processIdentifier: Int32(args[2])!) else { fatalError("Published application process missing") }
    app.activate(options: [.activateIgnoringOtherApps])
    try output(["activated": true, "screenWidth": CGDisplayBounds(CGMainDisplayID()).width,
                "screenHeight": CGDisplayBounds(CGMainDisplayID()).height])
case "window":
    let pid = Int32(args[2])!
    let windows = CGWindowListCopyWindowInfo(.optionOnScreenOnly, kCGNullWindowID) as? [[String: Any]] ?? []
    let matches = windows.filter { ($0[kCGWindowOwnerPID as String] as? Int32) == pid && ($0[kCGWindowLayer as String] as? Int) == 0 }
    guard let window = matches.first,
          let bounds = window[kCGWindowBounds as String] as? [String: Any] else { fatalError("Published collector window missing") }
    try output(bounds)
case "click":
    guard CGPreflightPostEventAccess() else { fatalError("GUI event permission is unavailable") }
    let point = CGPoint(x: Double(args[2])!, y: Double(args[3])!)
    for kind in [CGEventType.mouseMoved, .leftMouseDown, .leftMouseUp] {
        CGEvent(mouseEventSource: nil, mouseType: kind, mouseCursorPosition: point, mouseButton: .left)!.post(tap: .cghidEventTap)
        Thread.sleep(forTimeInterval: 0.08)
    }
case "ocr":
    let image = NSImage(contentsOfFile: args[2])!
    var cgImage = image.cgImage(forProposedRect: nil, context: nil, hints: nil)!
    let bounds = CGDisplayBounds(CGMainDisplayID())
    var region = bounds
    if args.count > 3 {
        let pid = Int32(args[3])!
        let windows = CGWindowListCopyWindowInfo(.optionOnScreenOnly, kCGNullWindowID) as? [[String: Any]] ?? []
        if let window = windows.first(where: { ($0[kCGWindowOwnerPID as String] as? Int32) == pid && ($0[kCGWindowLayer as String] as? Int) == 0 }),
           let raw = window[kCGWindowBounds as String] as? [String: Any],
           let windowBounds = CGRect(dictionaryRepresentation: raw as CFDictionary) {
            region = windowBounds.intersection(bounds)
            let scaleX = Double(cgImage.width) / bounds.width
            let scaleY = Double(cgImage.height) / bounds.height
            cgImage = cgImage.cropping(to: CGRect(x: region.minX * scaleX, y: region.minY * scaleY,
                                                 width: region.width * scaleX, height: region.height * scaleY))!
        }
    }
    let request = VNRecognizeTextRequest()
    request.recognitionLevel = .accurate
    request.recognitionLanguages = ["en-US"]
    request.usesLanguageCorrection = false
    request.minimumTextHeight = 0.004
    try VNImageRequestHandler(cgImage: cgImage).perform([request])
    let lines: [[String: Any]] = (request.results ?? []).compactMap { item in
        guard let text = item.topCandidates(1).first?.string else { return nil }
        let box = item.boundingBox
        return ["text": text, "x": region.minX + box.midX * region.width,
                "y": region.minY + (1 - box.midY) * region.height]
    }
    try output(lines)
default:
    fatalError("Unknown GUI driver action")
}
