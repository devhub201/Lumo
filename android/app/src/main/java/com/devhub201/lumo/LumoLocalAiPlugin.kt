package com.devhub201.lumo

import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.google.ai.edge.litertlm.Backend
import com.google.ai.edge.litertlm.ConversationConfig
import com.google.ai.edge.litertlm.Engine
import com.google.ai.edge.litertlm.EngineConfig
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean
import android.os.StatFs

@CapacitorPlugin(name = "LumoLocalAi")
class LumoLocalAiPlugin : Plugin() {
  private val executor = Executors.newSingleThreadExecutor()
  private val engineLock = Any()
  @Volatile private var engine: Engine? = null
  @Volatile private var verifiedModelSignature: String? = null
  private val downloadInProgress = AtomicBoolean(false)

  private val modelFile: File
    get() = File(File(context.filesDir, "lumo-models"), MODEL_FILENAME)
  private val modelMarkerFile: File
    get() = File(modelFile.parentFile, "$MODEL_FILENAME.verified")

  @PluginMethod
  fun getStatus(call: PluginCall) {
    call.resolve(status())
  }

  @PluginMethod
  fun downloadModel(call: PluginCall) {
    if (!downloadInProgress.compareAndSet(false, true)) {
      call.reject("The model download is already running.")
      return
    }
    call.setKeepAlive(true)
    executor.execute {
      val partial = File(modelFile.parentFile, "$MODEL_FILENAME.partial")
      try {
        if (!hasValidModelMarker()) {
          val freeBytes = StatFs(context.filesDir.absolutePath).availableBytes
          if (freeBytes < MODEL_BYTES + MIN_FREE_BYTES_AFTER_DOWNLOAD) {
            throw IllegalStateException("Please free at least 650 MB of phone storage, then try again.")
          }
          downloadTo(partial)
          val actualHash = sha256(partial)
          if (actualHash != MODEL_SHA256) {
            throw IllegalStateException("The model download failed its integrity check. Please retry on a stable Wi-Fi connection.")
          }
          if (modelMarkerFile.exists() && !modelMarkerFile.delete()) {
            throw IllegalStateException("Could not clear the old model verification marker.")
          }
          if (modelFile.exists() && !modelFile.delete()) {
            throw IllegalStateException("Could not replace the previous model file.")
          }
          if (!partial.renameTo(modelFile)) {
            throw IllegalStateException("Could not save the verified model on this phone.")
          }
          writeModelMarker()
        }
        downloadInProgress.set(false)
        call.setKeepAlive(false)
        call.resolve(status())
      } catch (error: Exception) {
        partial.delete()
        downloadInProgress.set(false)
        call.setKeepAlive(false)
        call.reject(error.message ?: "The on-device model could not be downloaded.")
      } finally {
        downloadInProgress.set(false)
      }
    }
  }

  @PluginMethod
  fun deleteModel(call: PluginCall) {
    call.setKeepAlive(true)
    executor.execute {
      try {
        synchronized(engineLock) {
          engine?.let {
            if (it.isInitialized()) it.close()
          }
          engine = null
        }
        val removed = !modelFile.exists() || modelFile.delete()
        if (!removed) throw IllegalStateException("Could not remove the model file.")
        val markerRemoved = !modelMarkerFile.exists() || modelMarkerFile.delete()
        verifiedModelSignature = null
        if (!markerRemoved) throw IllegalStateException("Could not remove the model verification marker.")
        call.setKeepAlive(false)
        call.resolve(status())
      } catch (error: Exception) {
        call.setKeepAlive(false)
        call.reject(error.message ?: "The model could not be removed.")
      }
    }
  }

  @PluginMethod
  fun generate(call: PluginCall) {
    call.setKeepAlive(true)
    val input = call.getArray("messages")
    if (input == null || input.length() == 0) {
      call.setKeepAlive(false)
      call.reject("Write a message before sending.")
      return
    }
    val parsed = try {
      parseMessages(input)
    } catch (_: Exception) {
      call.setKeepAlive(false)
      call.reject("The conversation could not be read.")
      return
    }
    if (parsed.isEmpty() || parsed.last().role != "user") {
      call.setKeepAlive(false)
      call.reject("The latest conversation message must be from you.")
      return
    }
    if (parsed.last().content.length > MAX_USER_CHARS) {
      call.setKeepAlive(false)
      call.reject("Please keep each message under 6,000 characters for this on-device model.")
      return
    }

    executor.execute {
      try {
        val activeEngine = getOrCreateEngine()
        val prompt = makePrompt(parsed.dropLast(1), parsed.last().content)
        // This model bundle's template cannot handle system/initial-message prefaces on this runtime.
        // Flatten chat context into one text turn and create a fresh one-turn conversation per request.
        val answer = activeEngine.createConversation(ConversationConfig()).use { conversation ->
          conversation.sendMessage(
            prompt,
            maxOutputToken = MAX_OUTPUT_TOKENS,
          ).toString().trim()
        }
        if (answer.isBlank()) throw IllegalStateException("The local model returned an empty answer. Try asking in a shorter way.")
        call.setKeepAlive(false)
        call.resolve(JSObject().put("text", answer))
      } catch (error: Exception) {
        call.setKeepAlive(false)
        call.reject(error.message ?: "The on-device model could not answer. Try restarting LUMO.")
      }
    }
  }

  private fun getOrCreateEngine(): Engine = synchronized(engineLock) {
    engine?.takeIf { it.isInitialized() }?.let { return@synchronized it }
    if (!hasValidModelMarker()) {
      throw IllegalStateException("Download the on-device AI model from Settings before chatting.")
    }
    val signature = modelSignature()
    if (verifiedModelSignature != signature) {
      if (sha256(modelFile) != MODEL_SHA256) {
        modelMarkerFile.delete()
        verifiedModelSignature = null
        throw IllegalStateException("The saved model failed its integrity check. Download it again from Settings.")
      }
      verifiedModelSignature = signature
    }
    val created = Engine(
      EngineConfig(
        modelPath = modelFile.absolutePath,
        backend = Backend.CPU(),
        cacheDir = context.cacheDir.absolutePath,
      )
    )
    created.initialize()
    engine = created
    created
  }

  private fun hasValidModelMarker(): Boolean {
    if (!modelFile.exists() || modelFile.length() != MODEL_BYTES || !modelMarkerFile.exists()) return false
    return try {
      modelMarkerFile.readText(Charsets.UTF_8) == modelMarkerContents()
    } catch (_: Exception) {
      false
    }
  }

  private fun writeModelMarker() {
    modelMarkerFile.parentFile?.mkdirs()
    modelMarkerFile.writeText(modelMarkerContents(), Charsets.UTF_8)
    verifiedModelSignature = modelSignature()
  }

  private fun modelSignature() = "${modelFile.length()}:${modelFile.lastModified()}"

  private fun modelMarkerContents() = "$MODEL_SHA256\n${modelFile.length()}\n${modelFile.lastModified()}\n"

  private fun parseMessages(input: JSArray): List<ChatEntry> {
    val messages = mutableListOf<ChatEntry>()
    for (index in 0 until input.length()) {
      val item = input.getJSONObject(index)
      val role = item.optString("role")
      val content = item.optString("content").trim()
      if ((role == "user" || role == "assistant") && content.isNotEmpty()) {
        messages.add(ChatEntry(role, content))
      }
    }
    return messages.takeLast(MAX_HISTORY_MESSAGES)
  }

  private fun makePrompt(entries: List<ChatEntry>, latest: String): String {
    val prompt = StringBuilder(SYSTEM_INSTRUCTION).append("\n\n/no_think")
    var remaining = MAX_HISTORY_CHARS
    val recentFirst = entries.asReversed().mapNotNull { entry ->
      if (remaining <= 0) return@mapNotNull null
      val content = entry.content.take(remaining)
      remaining -= content.length
      if (content.isBlank()) null else entry.copy(content = content)
    }
    if (recentFirst.isNotEmpty()) {
      prompt.append("\n\nPrevious conversation (for context only):\n")
      recentFirst.asReversed().forEach { entry ->
        val speaker = if (entry.role == "user") "User" else "Assistant"
        prompt.append(speaker).append(": ").append(entry.content).append('\n')
      }
    }
    prompt.append("\nRespond to this latest user message:\n").append(latest)
    return prompt.toString()
  }

  private fun downloadTo(destination: File) {
    destination.parentFile?.mkdirs()
    val connection = (URL(MODEL_URL).openConnection() as HttpURLConnection).apply {
      requestMethod = "GET"
      connectTimeout = 30_000
      readTimeout = 45_000
      instanceFollowRedirects = true
      setRequestProperty("Accept", "application/octet-stream")
      setRequestProperty("User-Agent", "LUMO-Android-OnDeviceAI/1.0")
    }
    try {
      val response = connection.responseCode
      if (response !in 200..299) throw IllegalStateException("Model download server returned HTTP $response. Try again later.")
      var received = 0L
      var lastPercent = -1
      val total = MODEL_BYTES
      connection.inputStream.use { input ->
        FileOutputStream(destination).use { output ->
          val buffer = ByteArray(1024 * 1024)
          while (true) {
            val count = input.read(buffer)
            if (count < 0) break
            output.write(buffer, 0, count)
            received += count
            val percent = ((received * 100) / total).toInt().coerceIn(0, 100)
            if (percent != lastPercent) {
              lastPercent = percent
              emitProgress(received, total, percent)
            }
          }
          output.fd.sync()
        }
      }
      if (received != MODEL_BYTES) {
        throw IllegalStateException("The model download was incomplete ($received of $MODEL_BYTES bytes). Please retry.")
      }
    } finally {
      connection.disconnect()
    }
  }

  private fun emitProgress(received: Long, total: Long, percent: Int) {
    val payload = JSObject()
      .put("receivedBytes", received)
      .put("totalBytes", total)
      .put("percent", percent)
    activity.runOnUiThread { notifyListeners("downloadProgress", payload) }
  }

  private fun sha256(file: File): String {
    val digest = MessageDigest.getInstance("SHA-256")
    FileInputStream(file).use { input ->
      val buffer = ByteArray(1024 * 1024)
      while (true) {
        val count = input.read(buffer)
        if (count < 0) break
        digest.update(buffer, 0, count)
      }
    }
    return digest.digest().joinToString("") { "%02x".format(it.toInt() and 0xff) }
  }

  private fun status(): JSObject {
    val file = modelFile
    val installed = hasValidModelMarker()
    return JSObject()
      .put("available", true)
      .put("downloaded", installed)
      .put("modelName", MODEL_NAME)
      .put("sizeBytes", MODEL_BYTES)
      .put("downloadInProgress", downloadInProgress.get())
      .put("engineInitialized", engine?.isInitialized() == true)
      .put("license", "Apache-2.0")
  }

  private data class ChatEntry(val role: String, val content: String)

  companion object {
    private const val MODEL_NAME = "Qwen3-0.6B · LiteRT-LM mixed INT4"
    private const val MODEL_FILENAME = "qwen3_0_6b_mixed_int4.litertlm"
    private const val MODEL_BYTES = 497_516_544L
    private const val MODEL_SHA256 = "7900eb4e7362d88c58782c6f9999bb7a129e03544aa98b8f338ea0cc5d8c22c1"
    private const val MODEL_URL = "https://huggingface.co/litert-community/Qwen3-0.6B/resolve/fed81d17517e6ea64362e917ecf7e5accff12492/qwen3_0_6b_mixed_int4.litertlm"
    private const val MIN_FREE_BYTES_AFTER_DOWNLOAD = 150L * 1024L * 1024L
    private const val MAX_HISTORY_MESSAGES = 16
    private const val MAX_HISTORY_CHARS = 8_000
    private const val MAX_USER_CHARS = 6_000
    private const val MAX_OUTPUT_TOKENS = 256
    private const val SYSTEM_INSTRUCTION = "You are LUMO, a helpful personal assistant running entirely on this phone. Reply in the same language as the user's latest message, including Hindi or Hinglish when they use it. Be clear, practical, and concise. You do not have internet access or current information unless it is included in the conversation. Do not claim to have searched the web, used tools, or accessed files unless that actually happened."
  }
}
