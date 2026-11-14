package com.devhub201.lumo.v2.ui.components

import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.AutoAwesome
import androidx.compose.material.icons.rounded.Bolt
import androidx.compose.material.icons.rounded.CameraAlt
import androidx.compose.material.icons.rounded.Chat
import androidx.compose.material.icons.rounded.Code
import androidx.compose.material.icons.rounded.Extension
import androidx.compose.material.icons.rounded.Folder
import androidx.compose.material.icons.rounded.Home
import androidx.compose.material.icons.rounded.Image
import androidx.compose.material.icons.rounded.Mic
import androidx.compose.material.icons.rounded.Public
import androidx.compose.material.icons.rounded.School
import androidx.compose.material.icons.rounded.Settings
import androidx.compose.material.icons.rounded.ViewInAr
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.devhub201.lumo.v2.ui.theme.LumoColors
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.sin

fun iconFor(id: String): ImageVector = when (id) {
    "home" -> Icons.Rounded.Home
    "chat" -> Icons.Rounded.Chat
    "study" -> Icons.Rounded.School
    "coding" -> Icons.Rounded.Code
    "browser" -> Icons.Rounded.Public
    "working" -> Icons.Rounded.Bolt
    "files" -> Icons.Rounded.Folder
    "vision" -> Icons.Rounded.CameraAlt
    "images" -> Icons.Rounded.Image
    "blueprint" -> Icons.Rounded.ViewInAr
    "voice" -> Icons.Rounded.Mic
    "toolkit" -> Icons.Rounded.Extension
    "settings" -> Icons.Rounded.Settings
    else -> Icons.Rounded.AutoAwesome
}

val AccentBrush: Brush get() = Brush.linearGradient(listOf(LumoColors.Blue, LumoColors.Violet))
val CyanBrush: Brush get() = Brush.linearGradient(listOf(LumoColors.Cyan, LumoColors.Blue))

/** Deep gradient backdrop with a few slowly drifting stars. Cheap: one Canvas, ~36 dots. */
@Composable
fun LumoBackground(content: @Composable BoxScope.() -> Unit) {
    val t = rememberInfiniteTransition(label = "bg")
    val phase by t.animateFloat(0f, 1f, infiniteRepeatable(tween(60_000, easing = LinearEasing)), label = "p")
    Box(Modifier.fillMaxSize().background(LumoColors.Midnight)) {
        Canvas(Modifier.fillMaxSize()) {
            drawRect(
                Brush.radialGradient(
                    listOf(LumoColors.Blue.copy(alpha = 0.28f), Color.Transparent),
                    center = Offset(size.width * 0.15f, size.height * 0.1f),
                    radius = size.maxDimension * 0.6f,
                ),
            )
            drawRect(
                Brush.radialGradient(
                    listOf(LumoColors.Violet.copy(alpha = 0.22f), Color.Transparent),
                    center = Offset(size.width * 0.9f, size.height * 0.95f),
                    radius = size.maxDimension * 0.55f,
                ),
            )
            for (i in 0 until 36) {
                val seed = i * 97.0
                val x = ((sin(seed) * 0.5 + 0.5) * size.width).toFloat()
                val drift = (phase * 2 * PI + seed).let { (sin(it) * 6).toFloat() }
                val y = ((cos(seed * 1.7) * 0.5 + 0.5) * size.height).toFloat() + drift
                val a = 0.15f + 0.35f * (((i * 37) % 10) / 10f)
                drawCircle(Color.White.copy(alpha = a), radius = 1.2f + (i % 3) * 0.6f, center = Offset(x, y))
            }
        }
        content()
    }
}

@Composable
fun GlassCard(
    modifier: Modifier = Modifier,
    corner: Dp = 20.dp,
    accent: Boolean = false,
    content: @Composable ColumnScope.() -> Unit,
) {
    val shape = RoundedCornerShape(corner)
    val border = if (accent) {
        BorderStroke(1.dp, Brush.linearGradient(listOf(LumoColors.Cyan.copy(alpha = 0.7f), LumoColors.Violet.copy(alpha = 0.3f))))
    } else {
        BorderStroke(1.dp, Brush.linearGradient(listOf(Color.White.copy(alpha = 0.22f), Color.White.copy(alpha = 0.04f))))
    }
    Column(
        modifier
            .clip(shape)
            .background(Brush.linearGradient(listOf(Color.White.copy(alpha = 0.09f), Color.White.copy(alpha = 0.03f))))
            .border(border, shape)
            .padding(16.dp),
        content = content,
    )
}

@Composable
fun Pill(text: String, color: Color, modifier: Modifier = Modifier) {
    Box(
        modifier
            .clip(RoundedCornerShape(50))
            .background(color.copy(alpha = 0.16f))
            .border(1.dp, color.copy(alpha = 0.5f), RoundedCornerShape(50))
            .padding(horizontal = 10.dp, vertical = 3.dp),
    ) { Text(text, color = color, fontSize = 11.sp, fontWeight = FontWeight.SemiBold) }
}

@Composable
fun IconBadge(icon: ImageVector, size: Dp = 44.dp, tint: Color = Color.White) {
    Box(
        Modifier.size(size).clip(CircleShape).background(AccentBrush),
        contentAlignment = androidx.compose.ui.Alignment.Center,
    ) {
        androidx.compose.material3.Icon(icon, null, tint = tint, modifier = Modifier.size(size * 0.52f))
    }
}


