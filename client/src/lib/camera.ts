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

export type CameraSession = {
  capture: () => Promise<{
    dataUrl: string;
    width: number;
    height: number;
  }>;
  stop: () => void;
};

const waitForVideo = async (video: HTMLVideoElement) => {
  if (video.readyState >= 2) return;
  await new Promise<void>(resolve => {
    video.onloadeddata = () => resolve();
  });
};

export const openCameraPreview = async (
  video: HTMLVideoElement,
  options: CameraCaptureOptions = {}
): Promise<CameraSession> => {
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

  video.srcObject = stream;
  video.muted = true;
  video.playsInline = true;
  try {
    await video.play();
    await waitForVideo(video);
  } catch {
    stream.getTracks().forEach(track => track.stop());
    video.srcObject = null;
    throw new CameraError(
      "camera_unavailable",
      "The camera preview could not start."
    );
  }

  let stopped = false;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    stream.getTracks().forEach(track => track.stop());
    video.pause();
    video.srcObject = null;
  };
  const capture = async () => {
    if (stopped || !video.videoWidth || !video.videoHeight)
      throw new CameraError("capture_failed", "The camera frame is not ready.");
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
  };
  return { capture, stop };
};

export const captureCameraFrame = async (
  options: CameraCaptureOptions = {}
) => {
  if (typeof document === "undefined")
    throw new CameraError(
      "unsupported",
      "Camera capture is not supported in this environment."
    );
  const video = document.createElement("video");
  const session = await openCameraPreview(video, options);
  try {
    return await session.capture();
  } finally {
    session.stop();
  }
};
