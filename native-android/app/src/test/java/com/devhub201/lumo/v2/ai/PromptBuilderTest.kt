package com.devhub201.lumo.v2.ai

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class PromptBuilderTest {
    @Test fun includesSystemAndLatest() {
        val p = PromptBuilder.build(emptyList(), "  namaste  ")
        assertTrue(p.startsWith(PromptBuilder.SYSTEM_INSTRUCTION))
        assertTrue(p.endsWith("namaste /no_think"))
        assertFalse(p.contains("Previous conversation"))
    }

    @Test fun historyKeepsOrderAndRoles() {
        val h = listOf(ChatTurn(ChatTurn.Role.User, "a"), ChatTurn(ChatTurn.Role.Assistant, "b"))
        val p = PromptBuilder.build(h, "c")
        assertTrue(p.indexOf("User: a") < p.indexOf("Assistant: b"))
    }

    @Test fun historyIsCappedByMessageCount() {
        val h = (1..40).map { ChatTurn(ChatTurn.Role.User, "m$it") }
        val p = PromptBuilder.build(h, "x")
        assertFalse(p.contains("User: m24\n"))
        assertTrue(p.contains("User: m40\n"))
        assertEquals(PromptBuilder.MAX_HISTORY_MESSAGES, Regex("User: m\\d+").findAll(p).count())
    }

    @Test fun historyIsCappedByChars() {
        val h = (1..16).map { ChatTurn(ChatTurn.Role.Assistant, "z".repeat(2_000)) }
        val p = PromptBuilder.build(h, "x")
        assertTrue(p.length < PromptBuilder.MAX_HISTORY_CHARS + 1_000)
    }

    @Test fun blankHistoryEntriesDropped() {
        val p = PromptBuilder.build(listOf(ChatTurn(ChatTurn.Role.User, "   ")), "x")
        assertFalse(p.contains("Previous conversation"))
    }
}
