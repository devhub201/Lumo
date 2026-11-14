package com.devhub201.lumo.v2.ai

import android.content.Context
import com.google.ai.edge.litertlm.Backend
import com.google.ai.edge.litertlm.ConversationConfig
import com.google.ai.edge.litertlm.Engine
import com.google.ai.edge.litertlm.EngineConfig

/**
 * Thin wrapper over LiteRT-LM using exactly the calls proven in the legacy build:
 * CPU backend, one fresh single-turn conversation per request, flattened prompt.
 */
class LocalLlm(private val context: Context, private val models: LocalModelManager) {
    private val lock = Any()
    @Volatile private var engine: Engine? = null
    @Volatile private var verified = false

    fun isLoaded(): Boolean = engine != null

    /** Blocking. Call from a background dispatcher. */
    fun generate(prompt: String, maxTokens: Int = MAX_OUTPUT_TOKENS): String {
        val e = getOrCreateEngine()
        val answer = e.createConversation(ConversationConfig()).use { conversation ->
            conversation.sendMessage(prompt, maxOutputToken = maxTokens).toString().trim()
        }
        if (answer.isBlank()) throw IllegalStateException("The model returned an empty answer. Try rephrasing.")
        return answer
    }

    private fun getOrCreateEngine(): Engine = synchronized(lock) {
        engine?.takeIf { it.isInitialized() }?.let { return it }
        if (!models.isReady()) throw IllegalStateException("Download the on-device model in Settings first.")
        if (!verified) {
            if (!models.verifyIntegrity()) {
                models.delete()
                throw IllegalStateException("The saved model failed its integrity check. Download it again in Settings.")
            }
            verified = true
        }
        val created = Engine(
            EngineConfig(
                modelPath = models.modelFile.absolutePath,
                backend = Backend.CPU(),
                cacheDir = context.cacheDir.absolutePath,
            ),
        )
        created.initialize()
        engine = created
        created
    }

    fun unload() = synchronized(lock) {
        engine = null
        verified = false
    }

    companion object {
        const val MAX_OUTPUT_TOKENS = 256
    }
}
