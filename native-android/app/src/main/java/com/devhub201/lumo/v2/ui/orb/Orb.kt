package com.devhub201.lumo.v2.ui.orb

import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.animation.core.animateFloat
import androidx.compose.foundation.Canvas
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.unit.dp
import com.devhub201.lumo.v2.ui.theme.LumoColors

/**
 * The orb only ever reflects real app state (see LumoApp.orb). It is never
 * animated to fake activity: Thinking means a generation is actually running.
 */
enum class OrbState(val core: Color, val glow: Color, val spin: Float, val label: String) {
    Idle(LumoColors.Blue, LumoColors.Cyan, 1f, "Ready"),
    Listening(LumoColors.Cyan, LumoColors.Blue, 1.6f, "Listening"),
    Thinking(LumoColors.Violet, LumoColors.Cyan, 2.6f, "Thinking"),
    Speaking(LumoColors.Cyan, LumoColors.Violet, 1.8f, "Speaking"),
    Success(LumoColors.Success, LumoColors.Cyan, 1f, "Done"),
    Error(LumoColors.Danger, LumoColors.Violet, 0.6f, "Problem"),
}

@Composable
fun Orb(state: OrbState, modifier: Modifier = Modifier) {
    val transition = rememberInfiniteTransition(label = "orb")
    val phase by transition.animateFloat(
        initialValue = 0f,
        targetValue = 1f,
        animationSpec = infiniteRepeatable(tween(5000, easing = LinearEasing)),
        label = "phase",
    )
    val pulse by transition.animateFloat(
        initialValue = 0.92f,
        targetValue = 1.08f,
        animationSpec = infiniteRepeatable(
            tween(1800, easing = FastOutSlowInEasing),
            RepeatMode.Reverse,
        ),
        label = "pulse",
    )
    val core by animateColorAsState(state.core, tween(500), label = "core")
    val glow by animateColorAsState(state.glow, tween(500), label = "glow")

    Canvas(modifier) {
        val center = Offset(size.width / 2f, size.height / 2f)
        val radius = size.minDimension / 2f

        drawCircle(
            brush = Brush.radialGradient(
                colors = listOf(glow.copy(alpha = 0.38f), Color.Transparent),
                center = center,
                radius = radius,
            ),
            radius = radius,
            center = center,
        )

        val coreRadius = radius * 0.46f * pulse
        drawCircle(
            brush = Brush.radialGradient(
                colors = listOf(Color.White.copy(alpha = 0.95f), core, core.copy(alpha = 0.25f)),
                center = center,
                radius = coreRadius,
            ),
            radius = coreRadius,
            center = center,
        )

        val angle = phase * 360f * state.spin
        for (i in 0 until 3) {
            val ringRadius = radius * (0.62f + i * 0.13f)
            val direction = if (i % 2 == 0) 1f else -1f
            rotate(degrees = angle * direction + i * 40f, pivot = center) {
                drawArc(
                    color = glow.copy(alpha = 0.8f - i * 0.2f),
                    startAngle = 0f,
                    sweepAngle = 110f + i * 45f,
                    useCenter = false,
                    topLeft = Offset(center.x - ringRadius, center.y - ringRadius),
                    size = Size(ringRadius * 2f, ringRadius * 2f),
                    style = Stroke(width = (2.5f - i * 0.4f).dp.toPx(), cap = StrokeCap.Round),
                )
            }
        }
    }
}
