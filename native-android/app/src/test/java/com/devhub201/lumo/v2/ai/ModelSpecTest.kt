package com.devhub201.lumo.v2.ai

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class ModelSpecTest {
    private val s = ModelSpec.Qwen3Small

    @Test fun hashIsLowercaseSha256() {
        assertEquals(64, s.sha256.length)
        assertTrue(s.sha256.all { it in '0'..'9' || it in 'a'..'f' })
    }

    @Test fun urlIsPinnedHttpsRevision() {
        assertTrue(s.url.startsWith("https://huggingface.co/"))
        assertTrue(Regex("/resolve/[0-9a-f]{40}/").containsMatchIn(s.url))
        assertTrue(s.url.endsWith(s.filename))
    }

    @Test fun sizeIsPlausible() {
        assertTrue(s.sizeBytes in 400_000_000L..600_000_000L)
    }
}
