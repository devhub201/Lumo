package com.devhub201.lumo.v2.ui.shell

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.devhub201.lumo.v2.LumoViewModel
import com.devhub201.lumo.v2.ModelUi
import com.devhub201.lumo.v2.ui.components.LumoBackground
import com.devhub201.lumo.v2.ui.components.Pill
import com.devhub201.lumo.v2.ui.components.iconFor
import com.devhub201.lumo.v2.ui.orb.Orb
import com.devhub201.lumo.v2.ui.screens.ChatScreen
import com.devhub201.lumo.v2.ui.screens.HomeScreen
import com.devhub201.lumo.v2.ui.screens.PlannedScreen
import com.devhub201.lumo.v2.ui.screens.SettingsScreen
import com.devhub201.lumo.v2.ui.theme.LumoColors
import com.devhub201.lumo.v2.workspace.BuildStatus
import com.devhub201.lumo.v2.workspace.Workspaces

@Composable
fun LumoShell(vm: LumoViewModel) {
    var current by rememberSaveable { mutableStateOf(Workspaces.Home.id) }
    LumoBackground {
        Row(Modifier.fillMaxSize().safeDrawingPadding().padding(8.dp)) {
            Rail(vm, current) { current = it }
            Column(Modifier.weight(1f).fillMaxHeight().padding(start = 12.dp)) {
                TopBar(vm, current)
                Box(Modifier.weight(1f).fillMaxWidth().padding(top = 8.dp)) {
                    when (current) {
                        "home" -> HomeScreen(vm) { current = it }
                        "chat" -> ChatScreen(vm) { current = "settings" }
                        "settings" -> SettingsScreen(vm)
                        else -> PlannedScreen(Workspaces.byId(current))
                    }
                }
            }
        }
    }
}

@Composable
private fun TopBar(vm: LumoViewModel, current: String) {
    val w = Workspaces.byId(current)
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        Text(w.title, color = LumoColors.Text, fontSize = 22.sp, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
        Pill("On-device · offline", LumoColors.Cyan)
        when (vm.model) {
            ModelUi.Ready -> Pill("AI ready", LumoColors.Success)
            is ModelUi.Downloading -> Pill("Downloading", LumoColors.Cyan)
            ModelUi.Verifying -> Pill("Verifying", LumoColors.Cyan)
            is ModelUi.Failed -> Pill("Model error", LumoColors.Danger)
            ModelUi.Missing -> Pill("No model", LumoColors.Muted)
        }
    }
}

@Composable
private fun Rail(vm: LumoViewModel, current: String, onSelect: (String) -> Unit) {
    val shape = RoundedCornerShape(24.dp)
    Column(
        Modifier
            .width(84.dp)
            .fillMaxHeight()
            .clip(shape)
            .background(Brush.verticalGradient(listOf(Color.White.copy(alpha = 0.10f), Color.White.copy(alpha = 0.03f))))
            .border(1.dp, Color.White.copy(alpha = 0.12f), shape)
            .verticalScroll(rememberScrollState())
            .padding(vertical = 10.dp),
        verticalArrangement = Arrangement.spacedBy(4.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Orb(vm.orb, Modifier.size(64.dp))
        Text(vm.orb.label, color = LumoColors.Muted, fontSize = 10.sp)
        for (w in Workspaces.all) {
            val selected = w.id == current
            Column(
                Modifier
                    .width(70.dp)
                    .clip(RoundedCornerShape(16.dp))
                    .background(
                        if (selected) Brush.linearGradient(listOf(LumoColors.Blue.copy(alpha = 0.55f), LumoColors.Violet.copy(alpha = 0.35f)))
                        else Brush.linearGradient(listOf(Color.Transparent, Color.Transparent)),
                    )
                    .clickable { onSelect(w.id) }
                    .padding(vertical = 7.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Icon(
                    iconFor(w.id),
                    contentDescription = w.title,
                    tint = if (selected) Color.White else if (w.status == BuildStatus.Built) LumoColors.Cyan else LumoColors.Muted,
                    modifier = Modifier.size(22.dp),
                )
                Text(w.title, color = if (selected) Color.White else LumoColors.Muted, fontSize = 10.sp, maxLines = 1)
            }
        }
    }
}
