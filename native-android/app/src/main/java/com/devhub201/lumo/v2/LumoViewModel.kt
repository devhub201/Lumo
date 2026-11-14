package com.devhub201.lumo.v2

import android.app.Application
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.devhub201.lumo.v2.ai.ChatTurn
import com.devhub201.lumo.v2.ai.PromptBuilder
import com.devhub201.lumo.v2.chat.ChatMessage
import com.devhub201.lumo.v2.ui.orb.OrbState
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

sealed interface ModelUi {
    data object Missing : ModelUi
    data class Downloading(val received: Long, val total: Long) : ModelUi
    data object Verifying : ModelUi
    data object Ready : ModelUi
    data class Failed(val message: String) : ModelUi
}

class LumoViewModel(app: Application) : AndroidViewModel(app) {
    private val lumo = app as LumoApp

    val messages = mutableStateListOf<ChatMessage>()
    var model by mutableStateOf<ModelUi>(ModelUi.Missing)
        private set
    var generating by mutableStateOf(false)
        private set
    var loadingEngine by mutableStateOf(false)
        private set
    var lastError by mutableStateOf<String?>(null)
        private set
    var storedBytes by mutableStateOf(0L)
        private set
    var freeBytes by mutableStateOf(0L)
        private set
    var celebrate by mutableStateOf(false)
        private set

    @Volatile private var cancelDownload = false
    private var downloadJob: Job? = null
    private var generateJob: Job? = null

    /** Orb state is derived only from real state below. */
    val orb: OrbState
        get() = when {
            generating || loadingEngine -> OrbState.Thinking
            model is ModelUi.Downloading || model is ModelUi.Verifying -> OrbState.Thinking
            lastError != null || model is ModelUi.Failed -> OrbState.Error
            celebrate -> OrbState.Success
            else -> OrbState.Idle
        }

    init {
        messages.addAll(lumo.chatStore.load())
        refreshModel()
    }

    fun refreshModel() {
        if (model is ModelUi.Downloading || model is ModelUi.Verifying) return
        model = if (lumo.models.isReady()) ModelUi.Ready else ModelUi.Missing
        storedBytes = lumo.models.storedBytes()
        freeBytes = lumo.models.freeBytes()
    }

    fun downloadModel() {
        if (downloadJob?.isActive == true) return
        cancelDownload = false
        lastError = null
        model = ModelUi.Downloading(0, lumo.models.spec.sizeBytes)
        downloadJob = viewModelScope.launch(Dispatchers.IO) {
            try {
                lumo.models.download(
                    onProgress = { r, t -> model = ModelUi.Downloading(r, t) },
                    isCancelled = { cancelDownload },
                )
                withContext(Dispatchers.Main) { model = ModelUi.Ready }
            } catch (e: Exception) {
                withContext(Dispatchers.Main) {
                    model = if (cancelDownload) ModelUi.Missing else ModelUi.Failed(e.message ?: "Download failed.")
                }
            }
            withContext(Dispatchers.Main) {
                storedBytes = lumo.models.storedBytes()
                freeBytes = lumo.models.freeBytes()
            }
        }
    }

    fun cancelModelDownload() {
        cancelDownload = true
    }

    fun deleteModel() {
        if (generating) return
        lumo.llm.unload()
        lumo.models.delete()
        model = ModelUi.Missing
        storedBytes = 0
        freeBytes = lumo.models.freeBytes()
    }

    fun send(text: String) {
        val input = text.trim().take(PromptBuilder.MAX_USER_CHARS)
        if (input.isEmpty() || generating) return
        lastError = null
        val history = messages.filter { !it.failed }.map { ChatTurn(it.role, it.text) }
        messages.add(ChatMessage(ChatTurn.Role.User, input))
        persist()
        generating = true
        loadingEngine = !lumo.llm.isLoaded()
        generateJob = viewModelScope.launch(Dispatchers.Default) {
            try {
                val answer = lumo.llm.generate(PromptBuilder.build(history, input))
                withContext(Dispatchers.Main) {
                    messages.add(ChatMessage(ChatTurn.Role.Assistant, answer))
                    persist()
                    flashSuccess()
                }
            } catch (e: Exception) {
                withContext(Dispatchers.Main) {
                    val msg = e.message ?: "The on-device model could not answer."
                    lastError = msg
                    messages.add(ChatMessage(ChatTurn.Role.Assistant, msg, failed = true))
                    persist()
                    refreshModel()
                }
            } finally {
                withContext(Dispatchers.Main) {
                    generating = false
                    loadingEngine = false
                }
            }
        }
    }

    private fun flashSuccess() {
        celebrate = true
        viewModelScope.launch {
            delay(1200)
            celebrate = false
        }
    }

    fun clearChat() {
        if (generating) return
        messages.clear()
        lumo.chatStore.clear()
        lastError = null
    }

    private fun persist() {
        val snapshot = messages.toList()
        viewModelScope.launch(Dispatchers.IO) { lumo.chatStore.save(snapshot) }
    }
}
