package com.devhub201.lumo.v2

import android.app.Application
import com.devhub201.lumo.v2.ai.LocalLlm
import com.devhub201.lumo.v2.ai.LocalModelManager
import com.devhub201.lumo.v2.chat.ChatStore
import java.io.File

/** Process-wide singletons. No DI framework: the app is small and explicit wiring is easier to verify. */
class LumoApp : Application() {
    lateinit var models: LocalModelManager
        private set
    lateinit var llm: LocalLlm
        private set
    lateinit var chatStore: ChatStore
        private set

    override fun onCreate() {
        super.onCreate()
        models = LocalModelManager(this)
        llm = LocalLlm(this, models)
        chatStore = ChatStore(File(filesDir, "lumo-data/chat.json"))
    }
}
