package com.devhub201.lumo.v2.ai

/**
 * A downloadable on-device model. Every model is pinned to an exact revision
 * and verified by SHA-256 before it is ever loaded. New models are added here
 * only after their hash and compatibility have been verified.
 */
data class ModelSpec(
    val id: String,
    val displayName: String,
    val filename: String,
    val sizeBytes: Long,
    val sha256: String,
    val url: String,
    val license: String,
) {
    companion object {
        /** Same pinned model the legacy app shipped; runtime compatibility already exercised there. */
        val Qwen3Small = ModelSpec(
            id = "qwen3-0.6b-litertlm-int4",
            displayName = "Qwen3 0.6B (LiteRT-LM, mixed INT4)",
            filename = "qwen3_0_6b_mixed_int4.litertlm",
            sizeBytes = 497_516_544L,
            sha256 = "7900eb4e7362d88c58782c6f9999bb7a129e03544aa98b8f338ea0cc5d8c22c1",
            url = "https://huggingface.co/litert-community/Qwen3-0.6B/resolve/" +
                "fed81d17517e6ea64362e917ecf7e5accff12492/qwen3_0_6b_mixed_int4.litertlm",
            license = "Apache-2.0",
        )
    }
}
