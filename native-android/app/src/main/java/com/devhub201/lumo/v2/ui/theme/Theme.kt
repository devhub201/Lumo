package com.devhub201.lumo.v2.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

/** LUMO palette: midnight navy, electric blue, cyan. */
object LumoColors {
    val Midnight = Color(0xFF050B1F)
    val Navy = Color(0xFF0A1536)
    val Panel = Color(0xFF101C44)
    val Blue = Color(0xFF2F6BFF)
    val Cyan = Color(0xFF22E4FF)
    val Violet = Color(0xFF8A5CFF)
    val Text = Color(0xFFEAF2FF)
    val Muted = Color(0xFF8FA3CC)
    val Success = Color(0xFF3DFFB0)
    val Danger = Color(0xFFFF5C7A)
}

private val LumoScheme = darkColorScheme(
    primary = LumoColors.Blue,
    onPrimary = Color.White,
    secondary = LumoColors.Cyan,
    onSecondary = LumoColors.Midnight,
    background = LumoColors.Midnight,
    onBackground = LumoColors.Text,
    surface = LumoColors.Navy,
    onSurface = LumoColors.Text,
    surfaceVariant = LumoColors.Panel,
    onSurfaceVariant = LumoColors.Muted,
    error = LumoColors.Danger,
)

@Composable
fun LumoTheme(content: @Composable () -> Unit) {
    MaterialTheme(colorScheme = LumoScheme, content = content)
}
