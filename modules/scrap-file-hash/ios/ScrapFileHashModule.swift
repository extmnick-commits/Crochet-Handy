import CryptoKit
import ExpoModulesCore
import Foundation

public class ScrapFileHashModule: Module {
  private let hashQueue = DispatchQueue(label: "com.crochethandy.scrap-file-hash", qos: .userInitiated)
  private let cancelledLock = NSLock()
  private var cancelledIds = Set<String>()

  public func definition() -> ModuleDefinition {
    Name("ScrapFileHash")

    Events("hashProgress")

    Function("cancelHash") { (requestId: String) in
      self.markCancelled(requestId)
    }

    AsyncFunction("hashFileSha256") { (requestId: String, uri: String) -> String in
      try self.hashFile(requestId: requestId, uri: uri)
    }
    .runOnQueue(hashQueue)
  }

  private func hashFile(requestId: String, uri: String) throws -> String {
    defer { clearCancelled(requestId) }
    guard let url = URL(string: uri), url.isFileURL else {
      throw Exception(name: "HashFile", description: "The model file is not a local file.", code: "ERR_SCRAP_HASH_FILE")
    }
    guard FileManager.default.fileExists(atPath: url.path) else {
      throw Exception(name: "HashFile", description: "The model file is missing.", code: "ERR_SCRAP_HASH_FILE")
    }

    let total = (try FileManager.default.attributesOfItem(atPath: url.path)[.size] as? NSNumber)?.int64Value ?? 0
    let handle = try FileHandle(forReadingFrom: url)
    defer { try? handle.close() }

    var hasher = SHA256()
    var hashed: Int64 = 0
    var sinceReport: Int64 = 0
    let chunkSize = 1024 * 1024
    let reportEvery: Int64 = 8 * 1024 * 1024

    while true {
      if isCancelled(requestId) {
        throw Exception(name: "HashCancelled", description: "The file hash was cancelled.", code: "ERR_SCRAP_HASH_CANCELLED")
      }
      let chunk = try handle.read(upToCount: chunkSize) ?? Data()
      if chunk.isEmpty { break }
      hasher.update(data: chunk)
      hashed += Int64(chunk.count)
      sinceReport += Int64(chunk.count)
      if sinceReport >= reportEvery {
        sinceReport = 0
        emitProgress(requestId: requestId, hashed: hashed, total: total)
      }
    }

    emitProgress(requestId: requestId, hashed: hashed, total: total)
    return hasher.finalize().map { String(format: "%02hhx", $0) }.joined()
  }

  private func emitProgress(requestId: String, hashed: Int64, total: Int64) {
    sendEvent("hashProgress", [
      "requestId": requestId,
      "hashed": Double(hashed),
      "total": Double(total),
    ])
  }

  private func markCancelled(_ requestId: String) {
    cancelledLock.lock()
    cancelledIds.insert(requestId)
    cancelledLock.unlock()
  }

  private func isCancelled(_ requestId: String) -> Bool {
    cancelledLock.lock()
    let cancelled = cancelledIds.contains(requestId)
    cancelledLock.unlock()
    return cancelled
  }

  private func clearCancelled(_ requestId: String) {
    cancelledLock.lock()
    cancelledIds.remove(requestId)
    cancelledLock.unlock()
  }
}
