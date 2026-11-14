package com.devhub201.lumo.v2.workspace

/**
 * Every LUMO workspace and its honest build status. "Built" means real,
 * working code exists in this app; everything else says which roadmap phase
 * will build it. UI is never added for a feature that does not work yet.
 */
enum class BuildStatus { Built, Planned }

data class Workspace(
    val id: String,
    val title: String,
    val glyph: String,
    val status: BuildStatus,
    /** Roadmap phase (docs: roadmap v2) that delivers the full feature. */
    val phase: String,
    val summary: String,
    val scope: List<String>,
)

object Workspaces {
    val Home = Workspace(
        "home", "Home", "◉", BuildStatus.Built, "Phase 2",
        "Live orb and truthful system status.",
        listOf("Orb driven by real app state", "Model status", "Workspace overview"),
    )
    val Chat = Workspace(
        "chat", "Chat", "✦", BuildStatus.Built, "Phase 2",
        "Offline on-device chat. Text only for now.",
        listOf("On-device LLM", "Local chat history", "Hindi and Hinglish replies (small-model quality)"),
    )
    val Study = Workspace(
        "study", "Study", "✎", BuildStatus.Planned, "Phase 6",
        "AI tutor with explanations, quizzes, flashcards, revision and progress.",
        listOf("Tutoring", "Quizzes", "Flashcards", "Spaced revision", "Progress tracking"),
    )
    val Coding = Workspace(
        "coding", "Coding", "</>", BuildStatus.Planned, "Phase 7",
        "Editor, projects, terminal, debugging, tests and secure code execution.",
        listOf("Code editor", "Projects", "Terminal", "Debugging", "Testing", "Isolated execution"),
    )
    val Browser = Workspace(
        "browser", "Browser", "◎", BuildStatus.Planned, "Phase 8",
        "Real browsing, page interaction, research and visible task progress.",
        listOf("Real pages", "Navigation", "Interaction", "Research mode", "Live progress"),
    )
    val Working = Workspace(
        "working", "Tasks", "⚙", BuildStatus.Planned, "Phase 5",
        "Independent tasks with progress, dependencies, cancellation and approvals.",
        listOf("Parallel tasks", "Dependencies", "Cancel", "Approvals", "Background work"),
    )
    val Files = Workspace(
        "files", "Files", "▤", BuildStatus.Planned, "Phase 4",
        "Upload, read, search, organise and manage files, plus persistent memory.",
        listOf("Upload", "Read", "Search", "Organise", "Reviewable memory"),
    )
    val Vision = Workspace(
        "vision", "Vision", "◔", BuildStatus.Planned, "Phase 9",
        "Camera, capture, scene understanding, OCR and diagram analysis.",
        listOf("Camera preview", "Capture only (no auto-save)", "OCR", "Scene and object understanding", "Diagram analysis"),
    )
    val Images = Workspace(
        "images", "Images", "▣", BuildStatus.Planned, "Phase 10",
        "Image generation and an image workspace.",
        listOf("Generation", "Image library", "Variations", "Save to Files"),
    )
    val Blueprint = Workspace(
        "blueprint", "Blueprint", "⬡", BuildStatus.Planned, "Phase 11",
        "Interactive 3D models with rotation, zoom, layers and labels.",
        listOf("3D viewer", "Rotate and zoom", "Layers", "Labels", "Educational and technical diagrams"),
    )
    val Voice = Workspace(
        "voice", "Voice", "♪", BuildStatus.Planned, "Phase 3",
        "Speech recognition and natural speech, including Hindi and Hinglish.",
        listOf("Speech to text", "Text to speech", "Hindi and Hinglish test set"),
    )
    val Toolkit = Workspace(
        "toolkit", "Toolkit", "✚", BuildStatus.Planned, "Phase 12",
        "Integrations such as Spotify, GitHub and Gmail with scoped permissions.",
        listOf("Spotify", "GitHub", "Gmail", "Scoped permissions"),
    )
    val Settings = Workspace(
        "settings", "Settings", "☰", BuildStatus.Built, "Phase 2",
        "On-device model management.",
        listOf("Download, verify and delete the model", "Storage and status"),
    )

    val all: List<Workspace> = listOf(
        Home, Chat, Study, Coding, Browser, Working, Files, Vision, Images, Blueprint, Voice, Toolkit, Settings,
    )

    fun byId(id: String): Workspace = all.firstOrNull { it.id == id } ?: Home
}
