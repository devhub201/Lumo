package com.devhub201.lumo.v2.ui.shell

import androidx.compose.foundation.background
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
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.devhub201.lumo.v2.LumoViewModel
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
    Row(
        Modifier
            .fillMaxSize()
            .background(LumoColors.Midnight)
            .safeDrawingPadding(),
    ) {
        Rail(vm, current) { current = it }
        Box(
            Modifier
                .weight(1f)
                .fillMaxHeight()
                .padding(8.dp),
        ) {
            when (current) {
                "home" -> HomeScreen(vm) { current = it }
                "chat" -> ChatScreen(vm) { current = "settings" }
                "settings" -> SettingsScreen(vm)
                else -> PlannedScreen(Workspaces.byId(current))
            }
        }
    }
}

@Composable
private fun Rail(vm: LumoViewModel, current: String, onSelect: (String) -> Unit) {
    Column(
        Modifier
            .width(132.dp)
            .fillMaxHeight()
            .background(LumoColors.Navy)
            .verticalScroll(rememberScrollState())
            .padding(vertical = 10.dp, horizontal = 8.dp),
        verticalArrangement = Arrangement.spacedBy(4.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Orb(vm.orb, Modifier.size(72.dp))
        Text(vm.orb.label, color = LumoColors.Muted, fontSize = 11.sp)
        Text("LUMO", color = LumoColors.Cyan, fontWeight = FontWeight.Bold, fontSize = 16.sp)
        for (w in Workspaces.all) {
            val selected = w.id == current
            Row(
                Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(10.dp))
                    .background(if (selected) LumoColors.Panel else LumoColors.Navy)
                    .clickable { onSelect(w.id) }
                    .padding(horizontal = 8.dp, vertical = 8.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                Text(w.glyph, color = if (selected) LumoColors.Cyan else LumoColors.Muted, fontSize = 14.sp)
                Text(
                    w.title,
                    color = if (selected) LumoColors.Text else LumoColors.Muted,
                    fontSize = 13.sp,
                    modifier = Modifier.weight(1f),
                )
                if (w.status == BuildStatus.Planned) Text("·", color = LumoColors.Muted, fontSize = 14.sp)
            }
        }
    }
}
