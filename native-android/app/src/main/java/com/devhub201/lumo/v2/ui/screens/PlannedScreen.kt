package com.devhub201.lumo.v2.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.devhub201.lumo.v2.ui.theme.LumoColors
import com.devhub201.lumo.v2.workspace.Workspace

/** Honest placeholder: states plainly that nothing here works yet. No fake controls. */
@Composable
fun PlannedScreen(w: Workspace) {
    Column(
        Modifier.fillMaxSize().verticalScroll(rememberScrollState()),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Text("${w.glyph}  ${w.title}", color = LumoColors.Text, fontSize = 24.sp, fontWeight = FontWeight.Bold)
        Panel(Modifier.fillMaxWidth()) {
            Text("Not built yet · scheduled for ${w.phase}", color = LumoColors.Cyan, fontWeight = FontWeight.SemiBold)
            Text(w.summary, color = LumoColors.Text, fontSize = 14.sp)
        }
        Panel(Modifier.fillMaxWidth()) {
            Text("What this workspace will contain", color = LumoColors.Muted, fontSize = 12.sp)
            for (item in w.scope) Text("• $item", color = LumoColors.Text, fontSize = 14.sp)
        }
    }
}
