package com.devhub201.lumo.v2.ai

import org.junit.Assert.assertEquals
import org.junit.Test

class ResponseCleanerTest {
    @Test fun plainAnswerUntouched() = assertEquals("Hello", ResponseCleaner.clean("  Hello \n"))

    @Test fun removesClosedThinkBlock() =
        assertEquals("Answer", ResponseCleaner.clean("<think>\nreasoning\nmore\n</think>\n\nAnswer"))

    @Test fun emptyThinkBlockFromTemplate() =
        assertEquals("Hi", ResponseCleaner.clean("<think>\n\n</think>\n\nHi"))

    @Test fun unclosedThinkIsDropped() =
        assertEquals("", ResponseCleaner.clean("<think>\nOkay, the user wants..."))

    @Test fun keepsTextBeforeUnclosedThink() =
        assertEquals("Sure.", ResponseCleaner.clean("Sure.<think>hmm"))

    @Test fun strayCloseTagRemoved() =
        assertEquals("Answer", ResponseCleaner.clean("</think>Answer"))
}
