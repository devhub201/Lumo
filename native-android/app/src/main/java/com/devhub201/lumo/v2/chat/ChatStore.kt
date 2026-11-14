package com.devhub201.lumo.v2.chat

import com.devhub201.lumo.v2.ai.ChatTurn
import org.json.JSONArray
import org.json.JSONObject
import java.io.File

data class ChatMessage(
    val role: ChatTurn.Role,
    val text: String,
    val time: Long = System.currentTimeMillis(),
    val failed: Boolean = false,
)

/** JSON (de)serialisation, kept separate from file IO so it can be unit-tested. */
object ChatJson {
    fun encode(messages: List<ChatMessage>): String {
        val arr = JSONArray()
        for (m in messages) {
            arr.put(
                JSONObject()
                    .put("role", m.role.name)
                    .put("text", m.text)
                    .put("time", m.time)
                    .put("failed", m.failed),
            )
        }
        return JSONObject().put("version", 1).put("messages", arr).toString()
    }

    fun decode(json: String): List<ChatMessage> = try {
        val arr = JSONObject(json).getJSONArray("messages")
        (0 until arr.length()).mapNotNull { i ->
            val o = arr.getJSONObject(i)
            val role = runCatching { ChatTurn.Role.valueOf(o.getString("role")) }.getOrNull()
                ?: return@mapNotNull null
            ChatMessage(role, o.getString("text"), o.optLong("time"), o.optBoolean("failed"))
        }
    } catch (_: Exception) {
        emptyList()
    }
}

/** Local-only chat history. User can clear it; nothing leaves the device. */
class ChatStore(private val file: File) {
    fun load(): List<ChatMessage> = if (file.exists()) ChatJson.decode(file.readText()) else emptyList()

    fun save(messages: List<ChatMessage>) {
        file.parentFile?.mkdirs()
        val tmp = File(file.parentFile, file.name + ".tmp")
        tmp.writeText(ChatJson.encode(messages))
        if (!tmp.renameTo(file)) {
            file.writeText(ChatJson.encode(messages))
            tmp.delete()
        }
    }

    fun clear() {
        file.delete()
    }
}
