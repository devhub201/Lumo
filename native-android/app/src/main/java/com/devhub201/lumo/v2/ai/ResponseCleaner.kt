package com.devhub201.lumo.v2.ai

/**
 * Qwen3 can emit its reasoning inside <think>...</think>. Users must never see
 * that. Pure Kotlin so it is unit-tested.
 */
object ResponseCleaner {
    private val closed = Regex("<think>.*?</think>", setOf(RegexOption.DOT_MATCHES_ALL, RegexOption.IGNORE_CASE))

    /** Returns the visible answer. Empty when the model produced only (possibly unfinished) reasoning. */
    fun clean(raw: String): String {
        var s = closed.replace(raw, "")
        val open = s.indexOf("<think>", ignoreCase = true)
        if (open >= 0) s = s.substring(0, open) // reasoning that never closed: drop it
        s = s.replace("</think>", "", ignoreCase = true)
        return s.trim()
    }
}
