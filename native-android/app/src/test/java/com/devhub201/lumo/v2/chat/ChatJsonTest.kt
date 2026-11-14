package com.devhub201.lumo.v2.chat

import com.devhub201.lumo.v2.ai.ChatTurn
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class ChatJsonTest {
    @Test fun roundTrip() {
        val src = listOf(
            ChatMessage(ChatTurn.Role.User, "नमस्ते \"quoted\"\nline2", 1L),
            ChatMessage(ChatTurn.Role.Assistant, "ok", 2L, failed = true),
        )
        assertEquals(src, ChatJson.decode(ChatJson.encode(src)))
    }

    @Test fun corruptJsonYieldsEmpty() {
        assertTrue(ChatJson.decode("{not json").isEmpty())
        assertTrue(ChatJson.decode("").isEmpty())
    }

    @Test fun unknownRoleSkipped() {
        val j = """{"version":1,"messages":[{"role":"Robot","text":"x","time":1},{"role":"User","text":"y","time":2}]}"""
        val out = ChatJson.decode(j)
        assertEquals(1, out.size)
        assertEquals("y", out[0].text)
    }
}
