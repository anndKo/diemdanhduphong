/**
 * LivenessVerification — MediaPipe Face Mesh (WebGL/WASM)
 * Cực nhẹ, không lag kể cả thiết bị yếu. Không dùng face-api.
 * Phát hiện: quay trái / quay phải qua nose-tip ratio và face asymmetry.
 */
import { useState, useRef, useCallback, useEffect, memo } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Camera, Loader2, RefreshCw, CheckCircle, AlertTriangle, ArrowLeft, ArrowRight, X, Shuffle } from "lucide-react";
import { FaceLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";

/* ─────────────────────── Types ─────────────────────── */
type ActionType = "turn_left" | "turn_right";

interface Props {
  onVerified: () => void;
  onCancel: () => void;
  referencePhotoUrl?: string;
}

/* ─────────────────────── Constants ─────────────────────── */
const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);

const DETECT_INTERVAL = isMobile ? 100 : 66; // ~10fps mobile / 15fps desktop (enough, không nặng GPU)
const SUCCESS_FRAMES = 4; // số frame liên tiếp cần detect đúng
const COUNTDOWN_SECS = 7;
const WASM_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm";
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task";

const ACTION_META: Record<ActionType, { label: string; desc: string; icon: React.ReactNode }> = {
  turn_left:  { label: "Quay trái",  desc: "Quay mặt sang bên trái",  icon: <ArrowLeft  className="w-8 h-8" /> },
  turn_right: { label: "Quay phải", desc: "Quay mặt sang bên phải", icon: <ArrowRight className="w-8 h-8" /> },
};

/* ─────────────────────── Memoised UI pieces ─────────────────────── */
const FaceMeshOverlay = memo(({ canvasRef }: { canvasRef: React.RefObject<HTMLCanvasElement> }) => (
  <canvas
    ref={canvasRef}
    className="absolute inset-0 w-full h-full pointer-events-none"
    style={{ transform: "scaleX(-1)", opacity: 0.65 }}
  />
));
FaceMeshOverlay.displayName = "FaceMeshOverlay";

const CountdownBadge = memo(({ secs }: { secs: number }) => (
  <div className="absolute top-3 right-3 w-12 h-12 rounded-full bg-primary/90 flex items-center justify-center shadow-lg">
    <span className="text-2xl font-bold text-white tabular-nums">{secs}</span>
  </div>
));
CountdownBadge.displayName = "CountdownBadge";

const ProgressArc = memo(({ progress }: { progress: number }) => (
  <div className="absolute top-16 left-3 right-3">
    <div className="h-2 bg-white/30 rounded-full overflow-hidden">
      <div
        className="h-full bg-green-400 rounded-full"
        style={{ width: `${progress}%`, transition: "width 120ms linear" }}
      />
    </div>
  </div>
));
ProgressArc.displayName = "ProgressArc";

/* ─────────────────────── Component ─────────────────────── */
const LivenessVerification = ({ onVerified, onCancel, referencePhotoUrl }: Props) => {
  const [modelReady, setModelReady] = useState(false);
  const [camActive, setCamActive] = useState(false);
  const [camLoading, setCamLoading] = useState(false);
  const [action, setAction] = useState<ActionType>("turn_left");
  const [status, setStatus] = useState<"idle" | "verifying" | "success" | "failed">("idle");
  const [countdown, setCountdown] = useState(COUNTDOWN_SECS);
  const [faceVisible, setFaceVisible] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusMsg, setStatusMsg] = useState("");

  const videoRef   = useRef<HTMLVideoElement>(null);
  const canvasRef  = useRef<HTMLCanvasElement>(null);
  const streamRef  = useRef<MediaStream | null>(null);
  const landmarkerRef = useRef<FaceLandmarker | null>(null);

  // Refs to avoid closure staleness
  const mountedRef      = useRef(true);
  const loopActiveRef   = useRef(false);
  const timerId         = useRef<number>(0);
  const cdTimerId       = useRef<number>(0);
  const actionRef       = useRef<ActionType>("turn_left");
  const statusRef       = useRef<"idle" | "verifying" | "success" | "failed">("idle");
  const camRef          = useRef(false);
  const successFrames   = useRef(0);
  const progressRef     = useRef(0);
  const baselineRef     = useRef<number | null>(null); // baseline horizontal nose ratio
  const baselineFrames  = useRef(0);
  const faceVisRef      = useRef(false);
  const stableCount     = useRef(0);

  // Sync refs
  useEffect(() => { actionRef.current = action; }, [action]);
  useEffect(() => { statusRef.current = status; }, [status]);
  useEffect(() => { camRef.current = camActive; }, [camActive]);

  /* ── Load MediaPipe model ── */
  useEffect(() => {
    mountedRef.current = true;
    (async () => {
      try {
        const vision = await FilesetResolver.forVisionTasks(WASM_URL);
        const lm = await FaceLandmarker.createFromOptions(vision, {
          baseOptions: { modelAssetPath: MODEL_URL, delegate: "GPU" },
          runningMode: "VIDEO",
          numFaces: 1,
          minFaceDetectionConfidence: 0.4,
          minFacePresenceConfidence: 0.4,
          minTrackingConfidence: 0.4,
          outputFaceBlendshapes: false,
          outputFacialTransformationMatrixes: false,
        });
        landmarkerRef.current = lm;
        if (mountedRef.current) setModelReady(true);
      } catch (e) {
        console.error("MediaPipe load error:", e);
        // Fallback: mark ready so user can still try (camera-only mode)
        if (mountedRef.current) setModelReady(true);
      }
    })();

    return () => {
      mountedRef.current = false;
      stopLoop();
      stopCam();
      clearInterval(cdTimerId.current);
      landmarkerRef.current?.close();
    };
  }, []);

  /* ── Camera ── */
  const startCam = useCallback(async () => {
    setCamLoading(true);
    if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "user",
          width:  { ideal: isMobile ? 320 : 480 },
          height: { ideal: isMobile ? 240 : 360 },
          frameRate: { ideal: isMobile ? 15 : 24, max: 30 },
          ...(isIOS ? {} : {}),
        },
        audio: false,
      });
      streamRef.current = stream;
      if (!mountedRef.current) { stream.getTracks().forEach(t => t.stop()); return; }
      setCamActive(true);
    } catch (err: any) {
      // Retry with minimal constraints
      try {
        const fb = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        streamRef.current = fb;
        if (mountedRef.current) setCamActive(true);
      } catch {
        toast.error("Không thể truy cập camera. Kiểm tra quyền trình duyệt.");
      }
    } finally {
      if (mountedRef.current) setCamLoading(false);
    }
  }, []);

  const stopCam = useCallback(() => {
    stopLoop();
    if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null; }
    if (videoRef.current) videoRef.current.srcObject = null;
    setCamActive(false);
  }, []);

  // Attach stream to video when camera becomes active
  useEffect(() => {
    if (camActive && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
    }
  }, [camActive]);

  /* ── Detection loop (setTimeout, not rAF → doesn't block main thread) ── */
  const stopLoop = () => {
    loopActiveRef.current = false;
    clearTimeout(timerId.current);
  };

  const startLoop = useCallback(() => {
    if (loopActiveRef.current) return;
    loopActiveRef.current = true;
    // Resize canvas once
    if (canvasRef.current && videoRef.current) {
      canvasRef.current.width  = videoRef.current.videoWidth  || 320;
      canvasRef.current.height = videoRef.current.videoHeight || 240;
    }
    tick();
  }, []);

  const tick = useCallback(async () => {
    if (!loopActiveRef.current || !mountedRef.current) return;
    const video = videoRef.current;
    const lm    = landmarkerRef.current;
    if (!video || video.readyState < 2 || video.videoWidth === 0 || !lm) {
      timerId.current = window.setTimeout(tick, 120);
      return;
    }

    try {
      const results = lm.detectForVideo(video, performance.now());
      const landmarks = results.faceLandmarks?.[0];

      if (landmarks && landmarks.length > 0) {
        stableCount.current++;
        if (stableCount.current >= 2 && !faceVisRef.current) {
          faceVisRef.current = true;
          if (mountedRef.current) setFaceVisible(true);
        }
        drawMesh(landmarks);
        if (statusRef.current === "verifying") {
          checkAction(landmarks);
        }
      } else {
        stableCount.current = 0;
        if (faceVisRef.current) {
          faceVisRef.current = false;
          if (mountedRef.current) setFaceVisible(false);
        }
        clearCanvas();
      }
    } catch { /* silently skip failed frames */ }

    if (loopActiveRef.current) {
      timerId.current = window.setTimeout(tick, DETECT_INTERVAL);
    }
  }, []);

  /* ── Draw Face Mesh (minimal, elegant) ── */
  const drawMesh = (landmarks: { x: number; y: number; z: number }[]) => {
    const canvas = canvasRef.current;
    const video  = videoRef.current;
    if (!canvas || !video) return;
    const w = video.videoWidth, h = video.videoHeight;
    if (canvas.width !== w) { canvas.width = w; canvas.height = h; }
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, w, h);

    // Draw subtle mesh dots — only key landmarks for performance
    // Use ~70 key points instead of all 478 for speed
    const KEY_INDICES = [
      // Oval face outline
      10,338,297,332,284,251,389,356,454,323,361,288,
      397,365,379,378,400,377,152,148,176,149,150,136,
      172,58,132,93,234,127,162,21,54,103,67,109,
      // Eyes
      33,7,163,144,145,153,154,155,133,
      362,382,381,380,374,373,390,249,263,
      // Nose
      1,2,98,327,
      // Lips
      61,291,39,181,17,405,314,178,87,14,317,402
    ];

    ctx.fillStyle = "rgba(120, 200, 255, 0.85)";
    for (const idx of KEY_INDICES) {
      const p = landmarks[idx];
      if (!p) continue;
      ctx.beginPath();
      ctx.arc(p.x * w, p.y * h, 1.2, 0, Math.PI * 2);
      ctx.fill();
    }

    // Jawline connector (thin line)
    const jawIds = [10,338,297,332,284,251,389,356,454,323,361,288,397,365,379,378,400,377,152,148,176,149,150,136,172,58,132,93,234,127,162,21,54,103,67,109,10];
    ctx.strokeStyle = "rgba(120, 200, 255, 0.35)";
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    jawIds.forEach((id, i) => {
      const p = landmarks[id];
      if (!p) return;
      i === 0 ? ctx.moveTo(p.x * w, p.y * h) : ctx.lineTo(p.x * w, p.y * h);
    });
    ctx.stroke();
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    ctx?.clearRect(0, 0, canvas.width, canvas.height);
  };

  /* ── Action detection via nose-tip ratio ── */
  const checkAction = (landmarks: { x: number; y: number; z: number }[]) => {
    // Key landmark indices (MediaPipe 478-point model):
    // Nose tip: 1, Left cheek: 234, Right cheek: 454
    const noseTip   = landmarks[1];
    const leftEdge  = landmarks[234];
    const rightEdge = landmarks[454];

    if (!noseTip || !leftEdge || !rightEdge) return;

    const faceWidth = rightEdge.x - leftEdge.x;
    if (faceWidth < 0.05) return; // too small / side-on

    const noseRatio = (noseTip.x - leftEdge.x) / faceWidth; // 0.5 = centre

    // Calibrate baseline over first 3 frames
    if (baselineFrames.current < 3) {
      if (baselineRef.current === null) {
        baselineRef.current = noseRatio;
      } else {
        const n = baselineFrames.current;
        baselineRef.current = (baselineRef.current * n + noseRatio) / (n + 1);
      }
      baselineFrames.current++;
      return;
    }

    const delta = noseRatio - baselineRef.current!;
    const curAction = actionRef.current;

    let detected = false;
    if (curAction === "turn_left"  && delta >  0.07) detected = true;
    if (curAction === "turn_right" && delta < -0.07) detected = true;

    if (detected) {
      successFrames.current++;
      const newPct = Math.min(100, (successFrames.current / SUCCESS_FRAMES) * 100);
      if (newPct - progressRef.current >= 15 || newPct >= 100) {
        progressRef.current = newPct;
        if (mountedRef.current) setProgress(newPct);
      }
      if (successFrames.current >= SUCCESS_FRAMES) {
        handleSuccess();
      }
    }
  };

  /* ── Verification flow ── */
  const pickAction = useCallback(() => {
    const a: ActionType = Math.random() < 0.5 ? "turn_left" : "turn_right";
    setAction(a);
    setStatus("idle");
    setCountdown(COUNTDOWN_SECS);
    setProgress(0);
    setStatusMsg("");
    successFrames.current = 0;
    progressRef.current   = 0;
    baselineRef.current   = null;
    baselineFrames.current = 0;
  }, []);

  const swapAction = () => {
    const next: ActionType = actionRef.current === "turn_left" ? "turn_right" : "turn_left";
    setAction(next);
    resetVerifyState();
  };

  const resetVerifyState = () => {
    successFrames.current  = 0;
    progressRef.current    = 0;
    baselineRef.current    = null;
    baselineFrames.current = 0;
    setProgress(0);
    setCountdown(COUNTDOWN_SECS);
  };

  const startVerification = () => {
    resetVerifyState();
    setStatus("verifying");
    let t = COUNTDOWN_SECS;
    setCountdown(t);
    cdTimerId.current = window.setInterval(() => {
      t--;
      if (mountedRef.current) setCountdown(t);
      if (t <= 0) {
        clearInterval(cdTimerId.current);
        if (successFrames.current < SUCCESS_FRAMES) {
          setStatus("failed");
          setStatusMsg("Không nhận được hành động. Hãy quay mặt rõ ràng hơn.");
        }
      }
    }, 1000);
  };

  const handleSuccess = () => {
    clearInterval(cdTimerId.current);
    stopLoop();
    setStatus("success");
    setProgress(100);
    progressRef.current = 100;
    setTimeout(() => { if (mountedRef.current) onVerified(); }, 700);
  };

  const retry = () => {
    clearInterval(cdTimerId.current);
    pickAction();
  };

  /* ─── Render ─── */
  if (!modelReady) {
    return (
      <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center p-4" style={{ zIndex: 9999 }}>
        <div className="bg-card rounded-2xl p-8 text-center max-w-sm w-full shadow-2xl" onClick={e => e.stopPropagation()}>
          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
          <p className="text-foreground font-semibold text-lg">Đang tải Face Mesh...</p>
          <p className="text-sm text-muted-foreground mt-1">Lần đầu có thể mất vài giây</p>
          <Button variant="outline" onClick={onCancel} className="mt-5 w-full">Hủy</Button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 flex items-center justify-center p-4"
      style={{ zIndex: 9999, backgroundColor: "hsl(var(--foreground)/0.4)", backdropFilter: "blur(12px)" }}
      onClick={e => e.stopPropagation()}
    >
      <div
        className="bg-card rounded-3xl shadow-2xl w-full max-w-md overflow-hidden"
        style={{ animation: "livenessFadeIn 0.3s cubic-bezier(0.34,1.56,0.64,1) forwards" }}
        onClick={e => e.stopPropagation()}
      >
        <style>{`
          @keyframes livenessFadeIn {
            from { opacity: 0; transform: scale(0.92) translateY(12px); }
            to   { opacity: 1; transform: scale(1) translateY(0); }
          }
        `}</style>

        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Camera className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 className="font-bold text-foreground leading-tight">Xác minh danh tính</h2>
              <p className="text-xs text-muted-foreground">Face Mesh · Liveness Detection</p>
            </div>
          </div>
          <button
            onClick={onCancel}
            className="w-8 h-8 rounded-full bg-muted flex items-center justify-center hover:bg-muted/70 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Camera viewport */}
        <div className="relative bg-black mx-4 mb-3 rounded-2xl overflow-hidden" style={{ aspectRatio: "4/3" }}>
          {camActive ? (
            <>
              <video
                ref={videoRef}
                autoPlay playsInline muted
                onPlaying={startLoop}
                className="w-full h-full object-cover"
                style={{ transform: "scaleX(-1)" }}
              />
              <FaceMeshOverlay canvasRef={canvasRef as any} />

              {/* Face indicator chip */}
              <div className={`absolute top-3 left-3 px-3 py-1 rounded-full text-xs font-medium flex items-center gap-1.5 transition-all duration-300 ${
                faceVisible
                  ? "bg-green-500/90 text-white shadow-sm"
                  : "bg-black/60 text-white/70 border border-white/20"
              }`}>
                <span className={`w-1.5 h-1.5 rounded-full ${faceVisible ? "bg-white" : "bg-white/50 animate-pulse"}`} />
                {faceVisible ? "Nhận diện khuôn mặt" : "Hướng mặt vào camera"}
              </div>

              {/* Countdown + progress */}
              {status === "verifying" && (
                <>
                  <CountdownBadge secs={countdown} />
                  <ProgressArc progress={progress} />
                </>
              )}

              {/* Action overlay */}
              {camActive && status !== "success" && status !== "failed" && action && (
                <div className={`absolute bottom-0 left-0 right-0 p-4 transition-all ${
                  status === "verifying"
                    ? "bg-gradient-to-t from-primary/80 to-transparent"
                    : "bg-gradient-to-t from-black/80 to-transparent"
                }`}>
                  <div className="text-center text-white">
                    <div className="flex items-center justify-center gap-2 mb-1">
                      {ACTION_META[action].icon}
                      <span className="text-lg font-bold">{ACTION_META[action].label}</span>
                    </div>
                    <p className="text-xs opacity-80">{ACTION_META[action].desc}</p>
                  </div>
                </div>
              )}

              {/* Loading overlay */}
              {camLoading && (
                <div className="absolute inset-0 bg-black/70 flex items-center justify-center">
                  <Loader2 className="w-10 h-10 animate-spin text-white" />
                </div>
              )}

              {/* Success */}
              {status === "success" && (
                <div className="absolute inset-0 bg-green-500/85 flex items-center justify-center" style={{ animation: "livenessFadeIn 0.25s ease" }}>
                  <div className="text-center text-white">
                    <CheckCircle className="w-16 h-16 mx-auto mb-2" />
                    <p className="text-xl font-bold">Xác minh thành công!</p>
                  </div>
                </div>
              )}

              {/* Failed */}
              {status === "failed" && (
                <div className="absolute inset-0 bg-red-500/85 flex items-center justify-center px-6" style={{ animation: "livenessFadeIn 0.25s ease" }}>
                  <div className="text-center text-white">
                    <AlertTriangle className="w-14 h-14 mx-auto mb-2" />
                    <p className="text-lg font-bold">Chưa xác minh được</p>
                    <p className="text-xs mt-1 opacity-90">{statusMsg}</p>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center gap-3 text-muted-foreground">
              <Camera className="w-14 h-14 opacity-40" />
              <p className="text-sm">Nhấn nút bên dưới để mở camera</p>
            </div>
          )}
        </div>

        {/* Buttons */}
        <div className="px-4 pb-5 space-y-2.5">
          {!camActive ? (
            <>
              <Button
                onClick={startCam}
                className="w-full btn-primary-gradient py-5 text-base"
                disabled={camLoading}
              >
                {camLoading
                  ? <><Loader2 className="w-5 h-5 mr-2 animate-spin" />Đang khởi động...</>
                  : <><Camera className="w-5 h-5 mr-2" />Mở camera xác minh</>
                }
              </Button>
              <Button variant="outline" onClick={onCancel} className="w-full">Hủy</Button>
            </>
          ) : status === "failed" ? (
            <>
              <Button onClick={retry} className="w-full btn-primary-gradient py-5">
                <RefreshCw className="w-5 h-5 mr-2" />Thử lại
              </Button>
              <Button variant="outline" onClick={onCancel} className="w-full">Hủy</Button>
            </>
          ) : status === "idle" ? (
            <>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="shrink-0 h-12 w-12"
                  onClick={swapAction}
                  title="Đổi hành động"
                >
                  <Shuffle className="w-4 h-4" />
                </Button>
                <Button
                  onClick={startVerification}
                  className="flex-1 btn-primary-gradient py-3 text-base"
                  disabled={!faceVisible || camLoading}
                >
                  {faceVisible
                    ? <><CheckCircle className="w-5 h-5 mr-2" />Bắt đầu xác minh</>
                    : <><Loader2 className="w-5 h-5 mr-2 animate-spin" />Đưa mặt vào camera...</>
                  }
                </Button>
              </div>
              <Button variant="outline" onClick={onCancel} className="w-full">Hủy</Button>
            </>
          ) : status === "verifying" ? (
            <Button variant="outline" onClick={onCancel} className="w-full">Hủy</Button>
          ) : null}
        </div>
      </div>
    </div>
  );
};

export default LivenessVerification;
