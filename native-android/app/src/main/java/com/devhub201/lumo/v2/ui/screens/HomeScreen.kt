package com.devhub201.lumo.v2.ui.screens

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.material3.Button
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.devhub201.lumo.v2.LumoViewModel
import com.devhub201.lumo.v2.ModelUi
import com.devhub201.lumo.v2.ui.components.GlassCard
import com.devhub201.lumo.v2.ui.components.IconBadge
import com.devhub201.lumo.v2.ui.components.Pill
import com.devhub201.lumo.v2.ui.components.iconFor
import com.devhub201.lumo.v2.ui.orb.Orb
import com.devhub201.lumo.v2.ui.theme.LumoColors
import com.devhub201.lumo.v2.workspace.BuildStatus
import com.devhub201.lumo.v2.workspace.Workspaces

@Composable
fun HomeScreen(vm: LumoViewModel, open: (String) -> Unit) {
    Row(Modifier.fillMaxSize(), horizontalArrangement = Arrangement.spacedBy(14.dp)) {
        Column(
            Modifier.weight(0.9f).fillMaxSize(),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center,
        ) {
            Orb(vm.orb, Modifier.size(230.dp))
            Spacer(Modifier.height(6.dp))
            Text("Hello, I'm LUMO", color = LumoColors.Text, fontSize = 24.sp, fontWeight = FontWeight.Bold)
            Text(
                when (vm.model) {
                    ModelUi.Ready -> "Your private AI. Runs on this phone, works offline."
                    is ModelUi.Downloading -> "Downloading the on-device model…"
                    ModelUi.Verifying -> "Verifying the model…"
                    is ModelUi.Failed -> "The model hit a problem. Open Settings."
                    ModelUi.Missing -> "Download the on-device model once to start."
                },
                color = LumoColors.Muted,
                fontSize = 13.sp,
                textAlign = TextAlign.Center,
            )
            Spacer(Modifier.height(12.dp))
            if (vm.model == ModelUi.Ready) {
                Button(onClick = { open("chat") }) { Text("Start chatting") }
            } else {
                Button(onClick = { open("settings") }) { Text("Set up AI") }
            }
        }
        LazyVerticalGrid(
            columns = GridCells.Adaptive(150.dp),
            modifier = Modifier.weight(1.1f).fillMaxSize(),
            verticalArrangement = Arrangement.spacedBy(10.dp),
            horizontalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            items(Workspaces.all.filter { it.id != "home" }) { w ->
                GlassCard(Modifier.fillMaxWidth().clickable { open(w.id) }, corner = 18.dp, accent = w.status == BuildStatus.Built) {
                    IconBadge(iconFor(w.id), 38.dp)
                    Spacer(Modifier.height(8.dp))
                    Text(w.title, color = LumoColors.Text, fontWeight = FontWeight.SemiBold, fontSize = 15.sp)
                    Spacer(Modifier.height(4.dp))
                    if (w.status == BuildStatus.Built) Pill("Working", LumoColors.Success)
                    else Pill("Planned · ${w.phase}", LumoColors.Muted)
                }
            }
        }
    }
}
