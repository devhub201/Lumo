package com.devhub201.lumo.v2.ui.screens

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.height
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.devhub201.lumo.v2.LumoViewModel
import com.devhub201.lumo.v2.ModelUi
import com.devhub201.lumo.v2.ui.orb.Orb
import com.devhub201.lumo.v2.ui.theme.LumoColors
import com.devhub201.lumo.v2.workspace.BuildStatus
import com.devhub201.lumo.v2.workspace.Workspaces

@Composable
fun HomeScreen(vm: LumoViewModel, open: (String) -> Unit) {
    Row(Modifier.fillMaxSize(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        Column(
            Modifier.weight(1f).fillMaxSize(),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center,
        ) {
            Orb(vm.orb, Modifier.size(220.dp))
            Spacer(Modifier.height(8.dp))
            Text(vm.orb.label, color = LumoColors.Cyan, fontSize = 20.sp, fontWeight = FontWeight.SemiBold)
            Text(
                when (vm.model) {
                    ModelUi.Ready -> "On-device AI ready. Works offline."
                    is ModelUi.Downloading -> "Downloading the on-device model…"
                    ModelUi.Verifying -> "Verifying the model…"
                    is ModelUi.Failed -> "Model problem. See Settings."
                    ModelUi.Missing -> "Download the on-device model in Settings to start chatting."
                },
                color = LumoColors.Muted,
                fontSize = 13.sp,
            )
        }
        Column(
            Modifier.weight(1f).fillMaxSize().verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Text("Workspaces", color = LumoColors.Text, fontSize = 18.sp, fontWeight = FontWeight.Bold)
            Text(
                "Only features marked Working are real today. The rest are planned and show exactly what is coming.",
                color = LumoColors.Muted,
                fontSize = 12.sp,
            )
            for (w in Workspaces.all.filter { it.id != "home" }) {
                Panel(Modifier.fillMaxWidth().clickable { open(w.id) }) {
                    Row(horizontalArrangement = Arrangement.SpaceBetween, modifier = Modifier.fillMaxWidth()) {
                        Text("${w.glyph}  ${w.title}", color = LumoColors.Text, fontWeight = FontWeight.SemiBold)
                        if (w.status == BuildStatus.Built) {
                            Text("Working", color = LumoColors.Success, fontSize = 12.sp)
                        } else {
                            Text("Planned · ${w.phase}", color = LumoColors.Muted, fontSize = 12.sp)
                        }
                    }
                    Text(w.summary, color = LumoColors.Muted, fontSize = 12.sp)
                }
            }
        }
    }
}
