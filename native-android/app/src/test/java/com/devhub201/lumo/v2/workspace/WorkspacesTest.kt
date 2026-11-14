package com.devhub201.lumo.v2.workspace

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class WorkspacesTest {
    @Test fun allThirteenWorkspacesPresentWithUniqueIds() {
        val ids = Workspaces.all.map { it.id }
        assertEquals(13, ids.size)
        assertEquals(ids.size, ids.toSet().size)
        for (required in listOf("home", "chat", "study", "coding", "browser", "working", "files", "vision", "images", "blueprint", "voice", "toolkit", "settings")) {
            assertTrue("missing $required", required in ids)
        }
    }

    @Test fun onlyChatHomeSettingsAreBuilt() {
        val built = Workspaces.all.filter { it.status == BuildStatus.Built }.map { it.id }.toSet()
        assertEquals(setOf("home", "chat", "settings"), built)
    }

    @Test fun unknownIdFallsBackToHome() {
        assertEquals("home", Workspaces.byId("nope").id)
    }
}
