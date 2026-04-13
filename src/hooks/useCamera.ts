import { useRef, useCallback, useState, useEffect } from "react";

const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);

interface UseCameraOptions {
  facingMode?: "user" | "environment";
  width?: number;
  height?: number;
}

export function useCamera(opts: UseCameraOptions = {}) {
  const {
    facingMode = "user",
    width = isMobile ? 480 : 640,
    height = isMobile ? 360 : 480,
  } = opts;

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [isActive, setIsActive] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const stop = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsActive(false);
  }, []);

  const start = useCallback(async () => {
    setIsLoading(true);
    stop();

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode,
          width: { ideal: width },
          height: { ideal: height },
          ...(isIOS ? { frameRate: { ideal: 24, max: 30 } } : {}),
        },
        audio: false,
      });

      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) {
        setIsLoading(false);
        return false;
      }

      video.srcObject = stream;
      video.muted = true;
      video.playsInline = true;

      await new Promise<void>((resolve, reject) => {
        video.onloadedmetadata = async () => {
          try {
            await video.play();
            resolve();
          } catch (e) {
            reject(e);
          }
        };
        video.onerror = () => reject(new Error("Video error"));
        // Timeout fallback
        setTimeout(() => reject(new Error("Camera timeout")), 8000);
      });

      setIsActive(true);
      setIsLoading(false);
      return true;
    } catch {
      setIsLoading(false);
      return false;
    }
  }, [facingMode, width, height, stop]);

  const capture = useCallback(
    (quality = isMobile ? 0.75 : 0.85): string | null => {
      const video = videoRef.current;
      if (!video || !video.videoWidth) return null;

      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;

      // Mirror front camera
      if (facingMode === "user") {
        ctx.translate(canvas.width, 0);
        ctx.scale(-1, 1);
      }
      ctx.drawImage(video, 0, 0);
      return canvas.toDataURL("image/jpeg", quality);
    },
    [facingMode]
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
    };
  }, []);

  return {
    videoRef,
    streamRef,
    isActive,
    isLoading,
    start,
    stop,
    capture,
  };
}
