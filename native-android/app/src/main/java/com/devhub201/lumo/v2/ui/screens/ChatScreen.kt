package com.devhub201.lumo.v2.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.OutlinedTextField
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
import androidx.compose.ui.draw.clip
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.devhub201.lumo.v2.LumoViewModel
import com.devhub201.lumo.v2.ModelUi
import com.devhub201.lumo.v2.ai.ChatTurn
import com.devhub201.lumo.v2.ui.theme.LumoColors

@Composable
fun ChatScreen(vm: LumoViewModel, openSettings: () -> Unit) {
    var draft by rememberSaveable { mutableStateOf("") }
    val listState = rememberLazyListState()
    val count = vm.messages.size
    LaunchedEffect(count, vm.generating) {
        if (count > 0) listState.animateScrollToItem(count - 1)
    }
    Column(Modifier.fillMaxSize().imePadding()) {
        if (vm.model != ModelUi.Ready) {
            Row(
                Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(LumoColors.Panel).padding(10.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                Text("The on-device model is not ready.", color = LumoColors.Text, fontSize = 13.sp)
                TextButton(onClick = openSettings) { Text("Open Settings") }
            }
        }
        Box(Modifier.weight(1f).fillMaxWidth()) {
            if (vm.messages.isEmpty()) {
                Text(
                    "Ask anything. Everything runs on this phone, offline.",
                    color = LumoColors.Muted,
                    modifier = Modifier.align(Alignment.Center),
                )
            }
            LazyColumn(state = listState, verticalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxSize()) {
                items(vm.messages) { m ->
                    val mine = m.role == ChatTurn.Role.User
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = if (mine) Arrangement.End else Arrangement.Start) {
                        Box(
                            Modifier
                                .fillMaxWidth(0.78f)
                                .clip(RoundedCornerShape(14.dp))
                                .background(
                                    when {
                                        m.failed -> LumoColors.Danger.copy(alpha = 0.25f)
                                        mine -> LumoColors.Blue.copy(alpha = 0.45f)
                                        else -> LumoColors.Panel
                                    },
                                )
                                .padding(10.dp),
                        ) { Text(m.text, color = LumoColors.Text, fontSize = 14.sp) }
                    }
                }
                if (vm.generating) {
                    item {
                        Text(
                            if (vm.loadingEngine) "Loading the model (first reply can take a while)…" else "Thinking…",
                            color = LumoColors.Cyan,
                            fontSize = 12.sp,
                        )
                    }
                }
            }
        }
        Row(
            Modifier.fillMaxWidth().padding(top = 6.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            OutlinedTextField(
                value = draft,
                onValueChange = { draft = it },
                modifier = Modifier.weight(1f),
                placeholder = { Text("Message LUMO") },
                maxLines = 3,
            )
            Button(
                enabled = draft.isNotBlank() && !vm.generating && vm.model == ModelUi.Ready,
                onClick = {
                    vm.send(draft)
                    draft = ""
                },
            ) { Text("Send") }
        }
    }
}
