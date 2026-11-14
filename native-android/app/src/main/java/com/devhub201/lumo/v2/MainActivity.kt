package com.devhub201.lumo.v2

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.lifecycle.viewmodel.compose.viewModel
import com.devhub201.lumo.v2.ui.shell.LumoShell
import com.devhub201.lumo.v2.ui.theme.LumoTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            LumoTheme {
                val vm: LumoViewModel = viewModel()
                LumoShell(vm)
            }
        }
    }
}
