package com.devhub201.lumo.v2.ai

data class ChatTurn(val role: Role, val content: String) {
    enum class Role { User, Assistant }
}

/**
 * Builds the single text prompt sent to the on-device model. The bundled Qwen3
 * template cannot handle separate system or history turns on this runtime
 * (proven in the legacy build), so context is flattened into one prompt.
 * Pure Kotlin, so it is unit-tested on the JVM.
 */
object PromptBuilder {
    const val MAX_HISTORY_MESSAGES = 16
    const val MAX_HISTORY_CHARS = 8_000
    const val MAX_USER_CHARS = 6_000

    const val SYSTEM_INSTRUCTION =
        "You are LUMO, a helpful personal assistant running entirely on this phone. " +
            "Reply in the same language as the user's latest message, including Hindi or Hinglish when they use it. " +
            "Be clear, practical, and concise. You do not have internet access or current information " +
            "unless it is included in the conversation. Do not claim to have searched the web, used tools, " +
            "or accessed files unless that actually happened."

    fun build(history: List<ChatTurn>, latest: String): String {
        val prompt = StringBuilder(SYSTEM_INSTRUCTION).append("\n\n/no_think")
        var remaining = MAX_HISTORY_CHARS
        val recentFirst = history
            .takeLast(MAX_HISTORY_MESSAGES)
            .asReversed()
            .mapNotNull { turn ->
                if (remaining <= 0) return@mapNotNull null
                val content = turn.content.trim().take(remaining)
                remaining -= content.length
                if (content.isBlank()) null else turn.copy(content = content)
            }
        if (recentFirst.isNotEmpty()) {
            prompt.append("\n\nPrevious conversation (for context only):\n")
            for (turn in recentFirst.asReversed()) {
                val speaker = if (turn.role == ChatTurn.Role.User) "User" else "Assistant"
                prompt.append(speaker).append(": ").append(turn.content).append('\n')
            }
        }
        prompt.append("\nRespond to this latest user message:\n").append(latest.trim())
        return prompt.toString()
    }
}
