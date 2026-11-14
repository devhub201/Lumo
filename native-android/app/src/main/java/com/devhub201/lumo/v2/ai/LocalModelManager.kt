package com.devhub201.lumo.v2.ai

import android.content.Context
import android.os.StatFs
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest

/** Downloads, verifies and deletes the on-device model. Blocking calls: run off the main thread. */
class LocalModelManager(private val context: Context, val spec: ModelSpec = ModelSpec.Qwen3Small) {
    private val dir get() = File(context.filesDir, "lumo-models")
    val modelFile get() = File(dir, spec.filename)
    private val marker get() = File(dir, spec.filename + ".verified")

    fun isReady(): Boolean =
        modelFile.exists() && modelFile.length() == spec.sizeBytes &&
            marker.exists() && runCatching { marker.readText() == markerContents() }.getOrDefault(false)

    private fun markerContents() = "${spec.sha256}:${modelFile.length()}:${modelFile.lastModified()}"

    fun storedBytes(): Long = if (modelFile.exists()) modelFile.length() else 0L

    fun delete() {
        marker.delete()
        modelFile.delete()
        File(dir, spec.filename + ".partial").delete()
    }

    fun freeBytes(): Long = runCatching { StatFs(context.filesDir.absolutePath).availableBytes }.getOrDefault(0L)

    /** Throws IllegalStateException with a user-readable message on any failure. */
    fun download(onProgress: (received: Long, total: Long) -> Unit, isCancelled: () -> Boolean) {
        dir.mkdirs()
        if (freeBytes() < spec.sizeBytes + MIN_FREE_AFTER) {
            throw IllegalStateException("Not enough free storage. About ${(spec.sizeBytes + MIN_FREE_AFTER) / MB} MB is needed.")
        }
        val partial = File(dir, spec.filename + ".partial")
        partial.delete()
        val conn = (URL(spec.url).openConnection() as HttpURLConnection).apply {
            connectTimeout = 30_000
            readTimeout = 45_000
            instanceFollowRedirects = true
            setRequestProperty("User-Agent", "LUMO-Android/0.1")
        }
        try {
            val code = conn.responseCode
            if (code !in 200..299) throw IllegalStateException("Model server returned HTTP $code. Try again later.")
            var received = 0L
            var lastEmit = 0L
            conn.inputStream.use { input ->
                FileOutputStream(partial).use { out ->
                    val buf = ByteArray(1 shl 20)
                    while (true) {
                        if (isCancelled()) {
                            partial.delete()
                            throw IllegalStateException("Download cancelled.")
                        }
                        val n = input.read(buf)
                        if (n < 0) break
                        out.write(buf, 0, n)
                        received += n
                        if (received - lastEmit >= MB) {
                            lastEmit = received
                            onProgress(received, spec.sizeBytes)
                        }
                    }
                    out.fd.sync()
                }
            }
            if (received != spec.sizeBytes) {
                partial.delete()
                throw IllegalStateException("Download incomplete ($received of ${spec.sizeBytes} bytes). Please retry.")
            }
        } catch (e: IllegalStateException) {
            throw e
        } catch (e: Exception) {
            partial.delete()
            throw IllegalStateException("Download failed: ${e.message ?: e.javaClass.simpleName}")
        } finally {
            conn.disconnect()
        }
        onProgress(spec.sizeBytes, spec.sizeBytes)
        if (sha256(partial) != spec.sha256) {
            partial.delete()
            throw IllegalStateException("The downloaded file failed its integrity check and was discarded.")
        }
        modelFile.delete()
        if (!partial.renameTo(modelFile)) throw IllegalStateException("Could not save the model file.")
        marker.writeText(markerContents())
    }

    /** Re-hash the stored file; used before the first load after an app restart. */
    fun verifyIntegrity(): Boolean = modelFile.exists() && sha256(modelFile) == spec.sha256

    companion object {
        const val MB = 1024L * 1024L
        const val MIN_FREE_AFTER = 150L * MB

        fun sha256(file: File): String {
            val digest = MessageDigest.getInstance("SHA-256")
            FileInputStream(file).use { input ->
                val buf = ByteArray(1 shl 20)
                while (true) {
                    val n = input.read(buf)
                    if (n < 0) break
                    digest.update(buf, 0, n)
                }
            }
            return digest.digest().joinToString("") { "%02x".format(it.toInt() and 0xff) }
        }
    }
}
