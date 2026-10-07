export type CameraErrorCode =
  | "permission_denied"
  | "camera_unavailable"
  | "capture_failed"
  | "unsupported";
export class CameraError extends Error {
  constructor(
    public readonly code: CameraErrorCode,
    message: string
  ) {
    super(message);
    this.name = "CameraError";
  }
}
export type CameraCaptureOptions = {
  facingMode?: "user" | "environment";
  quality?: number;
  maxWidth?: number;
  maxHeight?: number;
};

export const captureCameraFrame = async (
  options: CameraCaptureOptions = {}
) => {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia)
    throw new CameraError(
      "unsupported",
      "Camera capture is not supported in this environment."
    );
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: options.facingMode ?? "environment" },
      audio: false,
    });
  } catch (error) {
    if (
      error instanceof DOMException &&
      (error.name === "NotAllowedError" || error.name === "SecurityError")
    )
      throw new CameraError(
        "permission_denied",
        "Camera permission was denied."
      );
    throw new CameraError(
      "camera_unavailable",
      "No usable camera is available."
    );
  }
  try {
    const video = document.createElement("video");
    video.srcObject = stream;
    video.muted = true;
    await video.play();
    await new Promise<void>(resolve => {
      if (video.readyState >= 2) resolve();
      else video.onloadeddata = () => resolve();
    });
    const scale = Math.min(
      1,
      (options.maxWidth ?? 1920) / video.videoWidth,
      (options.maxHeight ?? 1080) / video.videoHeight
    );
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
    canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
    const context = canvas.getContext("2d");
    if (!context)
      throw new CameraError(
        "capture_failed",
        "The camera frame could not be captured."
      );
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    return {
      dataUrl: canvas.toDataURL("image/jpeg", options.quality ?? 0.85),
      width: canvas.width,
      height: canvas.height,
    };
  } finally {
    stream.getTracks().forEach(track => track.stop());
  }
};
