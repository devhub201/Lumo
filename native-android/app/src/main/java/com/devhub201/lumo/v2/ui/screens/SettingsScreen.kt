package com.devhub201.lumo.v2.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.devhub201.lumo.v2.LumoViewModel
import com.devhub201.lumo.v2.ModelUi
import com.devhub201.lumo.v2.ai.ModelSpec
import com.devhub201.lumo.v2.ui.components.GlassCard
import com.devhub201.lumo.v2.ui.theme.LumoColors

@Composable
fun SettingsScreen(vm: LumoViewModel) {
    val spec = ModelSpec.Qwen3Small
    LaunchedEffect(Unit) { vm.refreshModel() }
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        GlassCard(Modifier.fillMaxWidth(), accent = true) {
            Text("On-device model", color = LumoColors.Muted, fontSize = 12.sp)
            Text(spec.displayName, color = LumoColors.Text, fontWeight = FontWeight.SemiBold, fontSize = 16.sp)
            Text("License ${spec.license} · ${mb(spec.sizeBytes)} · SHA-256 verified before use", color = LumoColors.Muted, fontSize = 12.sp)
            Text(
                "Small, text-only model. It cannot browse, read files, see images or use tools, and its Hindi/Hinglish and accuracy are limited. Larger models are planned.",
                color = LumoColors.Muted,
                fontSize = 12.sp,
                modifier = Modifier.padding(vertical = 6.dp),
            )
            val m = vm.model
            when (m) {
                ModelUi.Ready -> {
                    Text("Ready · ${mb(vm.storedBytes)} stored", color = LumoColors.Success)
                    OutlinedButton(onClick = { vm.deleteModel() }) { Text("Delete model") }
                }
                ModelUi.Missing -> {
                    Text("Not downloaded · free space ${mb(vm.freeBytes)}", color = LumoColors.Muted)
                    Button(onClick = { vm.downloadModel() }) { Text("Download (${mb(spec.sizeBytes)})") }
                }
                is ModelUi.Downloading -> {
                    val p = if (m.total > 0) m.received.toFloat() / m.total else 0f
                    Text("Downloading ${mb(m.received)} / ${mb(m.total)}", color = LumoColors.Cyan)
                    LinearProgressIndicator(progress = { p }, modifier = Modifier.fillMaxWidth().padding(vertical = 6.dp))
                    OutlinedButton(onClick = { vm.cancelModelDownload() }) { Text("Cancel") }
                }
                ModelUi.Verifying -> Text("Verifying…", color = LumoColors.Cyan)
                is ModelUi.Failed -> {
                    Text(m.message, color = LumoColors.Danger)
                    Button(onClick = { vm.downloadModel() }) { Text("Try again") }
                }
            }
        }
        GlassCard(Modifier.fillMaxWidth()) {
            Text("Chat history", color = LumoColors.Muted, fontSize = 12.sp)
            Text("Stored only on this phone · ${vm.messages.size} messages", color = LumoColors.Text, fontSize = 14.sp, modifier = Modifier.padding(vertical = 4.dp))
            OutlinedButton(onClick = { vm.clearChat() }) { Text("Clear chat history") }
        }
    }
}
