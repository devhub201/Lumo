package com.devhub201.lumo.v2.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.devhub201.lumo.v2.ui.components.GlassCard
import com.devhub201.lumo.v2.ui.components.IconBadge
import com.devhub201.lumo.v2.ui.components.Pill
import com.devhub201.lumo.v2.ui.components.iconFor
import com.devhub201.lumo.v2.ui.theme.LumoColors
import com.devhub201.lumo.v2.workspace.Workspace

/** Honest placeholder: states plainly that nothing here works yet. No fake controls. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun PlannedScreen(w: Workspace) {
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        GlassCard(Modifier.fillMaxWidth(), accent = true) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                IconBadge(iconFor(w.id), 56.dp)
                Column(Modifier.weight(1f)) {
                    Text(w.summary, color = LumoColors.Text, fontSize = 15.sp, fontWeight = FontWeight.Medium)
                    Text("Nothing here works yet. It is being built in ${w.phase}.", color = LumoColors.Muted, fontSize = 12.sp)
                }
                Pill("Not built yet", LumoColors.Cyan)
            }
        }
        GlassCard(Modifier.fillMaxWidth()) {
            Text("Coming in this workspace", color = LumoColors.Muted, fontSize = 12.sp)
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.padding(top = 8.dp)) {
                for (item in w.scope) Pill(item, LumoColors.Blue)
            }
        }
    }
}
