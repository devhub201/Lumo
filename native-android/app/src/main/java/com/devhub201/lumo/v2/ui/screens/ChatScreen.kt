package com.devhub201.lumo.v2.ui.screens

import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.Send
import androidx.compose.material3.Icon
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.devhub201.lumo.v2.LumoViewModel
import com.devhub201.lumo.v2.ModelUi
import com.devhub201.lumo.v2.ai.ChatTurn
import com.devhub201.lumo.v2.ui.components.AccentBrush
import com.devhub201.lumo.v2.ui.components.GlassCard
import com.devhub201.lumo.v2.ui.components.Pill
import com.devhub201.lumo.v2.ui.orb.Orb
import com.devhub201.lumo.v2.ui.orb.OrbState
import com.devhub201.lumo.v2.ui.theme.LumoColors

private val Suggestions = listOf(
    "Explain photosynthesis simply",
    "Mujhe ek chhota Hinglish joke sunao",
    "Write a Python function to reverse a string",
)

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun ChatScreen(vm: LumoViewModel, openSettings: () -> Unit) {
    var draft by rememberSaveable { mutableStateOf("") }
    val listState = rememberLazyListState()
    val count = vm.messages.size
    val ready = vm.model == ModelUi.Ready
    LaunchedEffect(count, vm.generating) {
        val last = count + (if (vm.generating) 1 else 0) - 1
        if (last >= 0) listState.animateScrollToItem(last)
    }
    Column(Modifier.fillMaxSize().imePadding()) {
        if (!ready) {
            GlassCard(Modifier.fillMaxWidth().padding(bottom = 8.dp), corner = 14.dp) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text("The on-device model is not ready.", color = LumoColors.Text, fontSize = 13.sp, modifier = Modifier.weight(1f))
                    TextButton(onClick = openSettings) { Text("Open Settings") }
                }
            }
        }
        Box(Modifier.weight(1f).fillMaxWidth()) {
            if (vm.messages.isEmpty()) {
                Column(Modifier.align(Alignment.Center), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Orb(OrbState.Idle, Modifier.size(90.dp))
                    Text("Ask anything. It runs on this phone, offline.", color = LumoColors.Muted, textAlign = TextAlign.Center)
                    if (ready) {
                        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp, Alignment.CenterHorizontally), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            for (s in Suggestions) {
                                Box(Modifier.clickable { vm.send(s) }) { Pill(s, LumoColors.Cyan) }
                            }
                        }
                    }
                }
            }
            LazyColumn(state = listState, verticalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.fillMaxSize()) {
                items(vm.messages) { m ->
                    val mine = m.role == ChatTurn.Role.User
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = if (mine) Arrangement.End else Arrangement.Start, verticalAlignment = Alignment.Top) {
                        if (!mine) {
                            Orb(if (m.failed) OrbState.Error else OrbState.Idle, Modifier.size(34.dp))
                            Box(Modifier.size(6.dp))
                        }
                        val shape = RoundedCornerShape(topStart = 18.dp, topEnd = 18.dp, bottomStart = if (mine) 18.dp else 4.dp, bottomEnd = if (mine) 4.dp else 18.dp)
                        Box(
                            Modifier
                                .fillMaxWidth(0.78f)
                                .clip(shape)
                                .background(
                                    when {
                                        m.failed -> Brush.linearGradient(listOf(LumoColors.Danger.copy(alpha = 0.3f), LumoColors.Danger.copy(alpha = 0.15f)))
                                        mine -> Brush.linearGradient(listOf(LumoColors.Blue.copy(alpha = 0.75f), LumoColors.Violet.copy(alpha = 0.6f)))
                                        else -> Brush.linearGradient(listOf(Color.White.copy(alpha = 0.10f), Color.White.copy(alpha = 0.04f)))
                                    },
                                )
                                .border(1.dp, Color.White.copy(alpha = if (mine) 0.0f else 0.12f), shape)
                                .padding(horizontal = 14.dp, vertical = 10.dp),
                        ) { Text(m.text, color = LumoColors.Text, fontSize = 15.sp, lineHeight = 21.sp) }
                    }
                }
                if (vm.generating) {
                    item {
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            Orb(OrbState.Thinking, Modifier.size(34.dp))
                            Dots()
                            Text(
                                if (vm.loadingEngine) "Loading the model, first reply is slower…" else "Thinking…",
                                color = LumoColors.Cyan,
                                fontSize = 12.sp,
                            )
                        }
                    }
                }
            }
        }
        Row(Modifier.fillMaxWidth().padding(top = 8.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            OutlinedTextField(
                value = draft,
                onValueChange = { draft = it },
                modifier = Modifier.weight(1f),
                shape = RoundedCornerShape(28.dp),
                placeholder = { Text("Message LUMO") },
                maxLines = 3,
                colors = OutlinedTextFieldDefaults.colors(
                    focusedBorderColor = LumoColors.Cyan,
                    unfocusedBorderColor = Color.White.copy(alpha = 0.2f),
                    focusedContainerColor = Color.White.copy(alpha = 0.06f),
                    unfocusedContainerColor = Color.White.copy(alpha = 0.04f),
                    cursorColor = LumoColors.Cyan,
                ),
            )
            val canSend = draft.isNotBlank() && !vm.generating && ready
            Box(
                Modifier
                    .size(52.dp)
                    .alpha(if (canSend) 1f else 0.35f)
                    .clip(CircleShape)
                    .background(AccentBrush)
                    .clickable(enabled = canSend) {
                        vm.send(draft)
                        draft = ""
                    },
                contentAlignment = Alignment.Center,
            ) { Icon(Icons.AutoMirrored.Rounded.Send, "Send", tint = Color.White) }
        }
    }
}

@Composable
private fun Dots() {
    val t = rememberInfiniteTransition(label = "dots")
    Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
        for (i in 0 until 3) {
            val a by t.animateFloat(
                0.25f, 1f,
                infiniteRepeatable(tween(600, delayMillis = i * 150), RepeatMode.Reverse),
                label = "d$i",
            )
            Box(Modifier.size(7.dp).alpha(a).clip(CircleShape).background(LumoColors.Cyan))
        }
    }
}
