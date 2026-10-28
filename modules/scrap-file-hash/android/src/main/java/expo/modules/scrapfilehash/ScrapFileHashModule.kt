package expo.modules.scrapfilehash

import android.net.Uri
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.io.FileInputStream
import java.security.MessageDigest
import java.util.concurrent.ConcurrentHashMap
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

private const val CHUNK_BYTES = 1024 * 1024
private const val REPORT_EVERY_BYTES = 8L * 1024L * 1024L

internal class HashCancelledException :
  CodedException("ERR_SCRAP_HASH_CANCELLED", "The file hash was cancelled.", null)

internal class HashFileException(message: String) : CodedException(message)

class ScrapFileHashModule : Module() {
  private val cancelledIds = ConcurrentHashMap.newKeySet<String>()

  override fun definition() = ModuleDefinition {
    Name("ScrapFileHash")

    Events("hashProgress")

    Function("cancelHash") { requestId: String ->
      cancelledIds.add(requestId)
    }

    // RN's keyboard event may not fire for edge-to-edge windows on Android.
    // Query the actual IME inset while the helper is open instead of guessing its height.
    AsyncFunction("keyboardFrame") Coroutine { _: Boolean ->
      withContext(Dispatchers.Main) {
        val activity = appContext.currentActivity ?: return@withContext null
        val view = activity.window.decorView
        val insets = ViewCompat.getRootWindowInsets(view) ?: return@withContext null
        val visible = insets.isVisible(WindowInsetsCompat.Type.ime())
        val ime = if (visible) insets.getInsets(WindowInsetsCompat.Type.ime()).bottom else 0
        val density = activity.resources.displayMetrics.density
        val location = IntArray(2)
        view.getLocationOnScreen(location)
        mapOf("height" to ime / density, "screenY" to (location[1] + view.height - ime) / density)
      }
    }

    AsyncFunction("hashFileSha256") Coroutine { requestId: String, uri: String ->
      try {
        withContext(Dispatchers.IO) {
          hashFile(requestId, uri)
        }
      } finally {
        cancelledIds.remove(requestId)
      }
    }
  }

  private fun hashFile(requestId: String, uri: String): String {
    val file = localFile(uri)
    val total = file.length()
    val digest = MessageDigest.getInstance("SHA-256")
    var hashed = 0L
    var sinceReport = 0L
    FileInputStream(file).use { input ->
      val buffer = ByteArray(CHUNK_BYTES)
      while (true) {
        if (cancelledIds.contains(requestId)) throw HashCancelledException()
        val read = input.read(buffer)
        if (read < 0) break
        digest.update(buffer, 0, read)
        hashed += read.toLong()
        sinceReport += read.toLong()
        if (sinceReport >= REPORT_EVERY_BYTES) {
          sinceReport = 0
          emitProgress(requestId, hashed, total)
        }
      }
    }
    emitProgress(requestId, hashed, total)
    return toHex(digest.digest())
  }

  private fun localFile(uri: String): File {
    val parsed = Uri.parse(uri)
    val path = when (parsed.scheme) {
      null, "file" -> parsed.path
      else -> null
    } ?: throw HashFileException("The model file is not a local file.")
    val file = File(path)
    if (!file.isFile) throw HashFileException("The model file is missing.")
    return file
  }

  private fun emitProgress(requestId: String, hashed: Long, total: Long) {
    sendEvent(
      "hashProgress",
      mapOf(
        "requestId" to requestId,
        "hashed" to hashed.toDouble(),
        "total" to total.toDouble(),
      ),
    )
  }

  private fun toHex(bytes: ByteArray): String {
    val alphabet = "0123456789abcdef".toCharArray()
    val out = CharArray(bytes.size * 2)
    for (index in bytes.indices) {
      val value = bytes[index].toInt() and 0xff
      out[index * 2] = alphabet[value ushr 4]
      out[index * 2 + 1] = alphabet[value and 0x0f]
    }
    return String(out)
  }
}
