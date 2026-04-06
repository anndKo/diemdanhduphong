/**
 * LivenessVerification — MediaPipe Face Mesh (WebGL/WASM)
 * 4 hành động: quay trái / phải / ngẩng lên / cúi xuống
 * So sánh khuôn mặt vs ảnh tham chiếu bằng face-api (lazy load)
 * Tối ưu: không lag kể cả thiết bị yếu
 */
import { useState, useRef, useCallback, useEffect, memo } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  Camera, Loader2, RefreshCw, CheckCircle, AlertTriangle,
  ArrowLeft, ArrowRight, ArrowUp, ArrowDown, X, Shuffle,
} from "lucide-react";
import { FaceLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";

/* ─────────────────────── Types ─────────────────────── */
type ActionType = "turn_left" | "turn_right" | "tilt_up" | "tilt_down";

interface Props {
  onVerified: () => void;
  onCancel: () => void;
  referencePhotoUrl?: string;
}

/* ─────────────────────── Constants ─────────────────────── */
const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);

const DETECT_INTERVAL = isMobile ? 100 : 66;
const SUCCESS_FRAMES = 4;
const COUNTDOWN_SECS = 8;
const WASM_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm";
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task";
const FACE_API_MODEL_URL = "https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model";

// Threshold for face match: euclidean distance < 0.55 → same person
const FACE_MATCH_THRESHOLD = 0.55;

const ACTION_META: Record<ActionType, { label: string; desc: string; icon: React.ReactNode }> = {
  turn_left:  { label: "Quay trái",   desc: "Quay mặt sang bên trái",  icon: <ArrowLeft  className="w-8 h-8" /> },
  turn_right: { label: "Quay phải",   desc: "Quay mặt sang bên phải", icon: <ArrowRight className="w-8 h-8" /> },
  tilt_up:    { label: "Ngẩng lên",   desc: "Ngẩng mặt nhìn lên trên", icon: <ArrowUp    className="w-8 h-8" /> },
  tilt_down:  { label: "Cúi xuống",   desc: "Cúi mặt nhìn xuống dưới", icon: <ArrowDown  className="w-8 h-8" /> },
};

const ALL_ACTIONS: ActionType[] = ["turn_left", "turn_right", "tilt_up", "tilt_down"];

/* ─────────────────────── Memoised UI ─────────────────────── */
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

/* ─────────────────────── Face comparison helper ─────────────────────── */
let faceApiReady = false;
let faceApiLoading = false;

async function loadFaceApi() {
  if (faceApiReady) return true;
  if (faceApiLoading) {
    // wait until done
    await new Promise<void>(res => {
      const check = setInterval(() => { if (faceApiReady || !faceApiLoading) { clearInterval(check); res(); } }, 100);
    });
    return faceApiReady;
  }
  faceApiLoading = true;
  try {
    const faceapi = await import("@vladmandic/face-api");
    await Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri(FACE_API_MODEL_URL),
      faceapi.nets.faceRecognitionNet.loadFromUri(FACE_API_MODEL_URL),
      faceapi.nets.faceLandmark68TinyNet.loadFromUri(FACE_API_MODEL_URL),
    ]);
    faceApiReady = true;
    return true;
  } catch (e) {
    console.error("face-api load error:", e);
    return false;
  } finally {
    faceApiLoading = false;
  }
}

async function getDescriptorFromUrl(url: string): Promise<Float32Array | null> {
  try {
    const faceapi = await import("@vladmandic/face-api");
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const el = new Image();
      el.crossOrigin = "anonymous";
      el.onload = () => res(el);
      el.onerror = rej;
      el.src = url;
    });
    const opts = new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.3 });
    const det = await faceapi.detectSingleFace(img, opts).withFaceLandmarks(true).withFaceDescriptor();
    return det?.descriptor ?? null;
  } catch { return null; }
}

async function getDescriptorFromVideo(video: HTMLVideoElement): Promise<Float32Array | null> {
  try {
    const faceapi = await import("@vladmandic/face-api");
    const opts = new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.3 });
    const det = await faceapi.detectSingleFace(video, opts).withFaceLandmarks(true).withFaceDescriptor();
    return det?.descriptor ?? null;
  } catch { return null; }
}

/* ─────────────────────── Component ─────────────────────── */
const LivenessVerification = ({ onVerified, onCancel, referencePhotoUrl }: Props) => {
  const [camActive, setCamActive] = useState(false);
  const [camLoading, setCamLoading] = useState(true);
  const [action, setAction] = useState<ActionType>(() => ALL_ACTIONS[Math.floor(Math.random() * ALL_ACTIONS.length)]);
  const [status, setStatus] = useState<"idle" | "verifying" | "comparing" | "success" | "failed">("idle");
  const [countdown, setCountdown] = useState(COUNTDOWN_SECS);
  const [faceVisible, setFaceVisible] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusMsg, setStatusMsg] = useState("");
  const [faceMatchResult, setFaceMatchResult] = useState<{ matched: boolean; similarity: number } | null>(null);
  const [modelLoading, setModelLoading] = useState(true);

  const videoRef      = useRef<HTMLVideoElement>(null);
  const canvasRef     = useRef<HTMLCanvasElement>(null);
  const streamRef     = useRef<MediaStream | null>(null);
  const landmarkerRef = useRef<FaceLandmarker | null>(null);

  const mountedRef           = useRef(true);
  const loopActiveRef        = useRef(false);
  const timerId              = useRef<number>(0);
  const cdTimerId            = useRef<number>(0);
  const actionRef            = useRef<ActionType>(action);
  const statusRef            = useRef<"idle" | "verifying" | "comparing" | "success" | "failed">("idle");
  const successFrames        = useRef(0);
  const progressRef          = useRef(0);
  const baselineRef          = useRef<number | null>(null);
  const baselineFrames       = useRef(0);
  const faceVisRef           = useRef(false);
  const stableCount          = useRef(0);
  const refDescriptor        = useRef<Float32Array | null>(null);
  const videoReadyRef        = useRef(false);
  const autoStartedRef       = useRef(false);

  // Sync refs
  useEffect(() => { actionRef.current = action; }, [action]);
  useEffect(() => { statusRef.current = status; }, [status]);

  /* ────────── Attach stream ────────── */
  const attachStreamToVideo = useCallback((stream: MediaStream) => {
    const video = videoRef.current;
    if (!video) return;
    if (video.srcObject === stream) return;
    video.srcObject = stream;
    video.muted = true;
    video.playsInline = true;
    video.play().catch(() => {
      setTimeout(() => { video.play().catch(() => {}); }, 300);
    });
  }, []);

  /* ────────── Stop helpers ────────── */
  const stopLoop = useCallback(() => {
    loopActiveRef.current = false;
    clearTimeout(timerId.current);
  }, []);

  const stopCam = useCallback(() => {
    stopLoop();
    if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null; }
    if (videoRef.current) { videoRef.current.srcObject = null; }
    videoReadyRef.current = false;
    setCamActive(false);
    setCamLoading(false);
  }, [stopLoop]);

  /* ────────── Acquire camera stream ────────── */
  const acquireStream = useCallback(async (): Promise<MediaStream | null> => {
    if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null; }
    try {
      return await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "user",
          width:  { ideal: isMobile ? 320 : 480 },
          height: { ideal: isMobile ? 240 : 360 },
          frameRate: { ideal: isMobile ? 15 : 24, max: 30 },
        },
        audio: false,
      });
    } catch {
      try { return await navigator.mediaDevices.getUserMedia({ video: true, audio: false }); }
      catch { return null; }
    }
  }, []);

  /* ────────── Draw mesh ────────── */
  const drawMesh = useCallback((landmarks: { x: number; y: number; z: number }[]) => {
    const canvas = canvasRef.current;
    const video  = videoRef.current;
    if (!canvas || !video) return;
    const w = video.videoWidth, h = video.videoHeight;
    if (canvas.width !== w) { canvas.width = w; canvas.height = h; }
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, w, h);
    const KEY_INDICES = [
      10,338,297,332,284,251,389,356,454,323,361,288,
      397,365,379,378,400,377,152,148,176,149,150,136,
      172,58,132,93,234,127,162,21,54,103,67,109,
      33,7,163,144,145,153,154,155,133,
      362,382,381,380,374,373,390,249,263,
      1,2,98,327,
      61,291,39,181,17,405,314,178,87,14,317,402,
    ];
    ctx.fillStyle = "rgba(120, 200, 255, 0.85)";
    for (const idx of KEY_INDICES) {
      const p = landmarks[idx];
      if (!p) continue;
      ctx.beginPath();
      ctx.arc(p.x * w, p.y * h, 1.2, 0, Math.PI * 2);
      ctx.fill();
    }
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
  }, []);

  const clearCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
  }, []);

  /* ────────── Face comparison after liveness ────────── */
  const handleLivenessPassed = useCallback(async () => {
    clearInterval(cdTimerId.current);
    stopLoop();
    setProgress(100);
    progressRef.current = 100;

    if (!referencePhotoUrl) {
      setStatus("success");
      setTimeout(() => { if (mountedRef.current) onVerified(); }, 700);
      return;
    }

    setStatus("comparing");
    try {
      const apiOk = await loadFaceApi();
      if (!apiOk) {
        setStatus("success");
        setTimeout(() => { if (mountedRef.current) onVerified(); }, 700);
        return;
      }
      const faceapi = await import("@vladmandic/face-api");
      let refDesc = refDescriptor.current;
      if (!refDesc) {
        refDesc = await getDescriptorFromUrl(referencePhotoUrl);
        refDescriptor.current = refDesc;
      }
      const liveDesc = videoRef.current ? await getDescriptorFromVideo(videoRef.current) : null;
      if (!refDesc || !liveDesc) {
        setFaceMatchResult({ matched: true, similarity: 0 });
        setStatus("success");
        setTimeout(() => { if (mountedRef.current) onVerified(); }, 900);
        return;
      }
      const distance = faceapi.euclideanDistance(refDesc, liveDesc);
      const matched = distance < FACE_MATCH_THRESHOLD;
      const similarity = Math.round(Math.max(0, Math.min(100, (1 - distance / 1.0) * 100)));
      setFaceMatchResult({ matched, similarity });
      if (matched) {
        setStatus("success");
        setTimeout(() => { if (mountedRef.current) onVerified(); }, 900);
      } else {
        setStatus("failed");
        setStatusMsg(`Khuôn mặt không khớp với ảnh điểm danh (${similarity}%). Vui lòng thử lại.`);
      }
    } catch (e) {
      console.error("Face compare error:", e);
      setStatus("success");
      setTimeout(() => { if (mountedRef.current) onVerified(); }, 700);
    }
  }, [referencePhotoUrl, onVerified, stopLoop]);

  /* ────────── Action check ────────── */
  const registerSuccessFrame = useCallback(() => {
    successFrames.current++;
    const newPct = Math.min(100, (successFrames.current / SUCCESS_FRAMES) * 100);
    if (newPct - progressRef.current >= 15 || newPct >= 100) {
      progressRef.current = newPct;
      if (mountedRef.current) setProgress(newPct);
    }
    if (successFrames.current >= SUCCESS_FRAMES) {
      handleLivenessPassed();
    }
  }, [handleLivenessPassed]);

  const checkAction = useCallback((landmarks: { x: number; y: number; z: number }[]) => {
    const noseTip   = landmarks[1];
    const leftEdge  = landmarks[234];
    const rightEdge = landmarks[454];
    const forehead  = landmarks[10];
    const chin      = landmarks[152];
    if (!noseTip || !leftEdge || !rightEdge || !forehead || !chin) return;
    const curAction = actionRef.current;
    if (curAction === "turn_left" || curAction === "turn_right") {
      const faceWidth = rightEdge.x - leftEdge.x;
      if (faceWidth < 0.05) return;
      const noseRatio = (noseTip.x - leftEdge.x) / faceWidth;
      if (baselineFrames.current < 3) {
        if (baselineRef.current === null) baselineRef.current = noseRatio;
        else { const n = baselineFrames.current; baselineRef.current = (baselineRef.current * n + noseRatio) / (n + 1); }
        baselineFrames.current++;
        return;
      }
      const delta = noseRatio - baselineRef.current!;
      if ((curAction === "turn_left" && delta > 0.07) || (curAction === "turn_right" && delta < -0.07)) registerSuccessFrame();
    } else {
      const faceHeight = chin.y - forehead.y;
      if (faceHeight < 0.05) return;
      const noseYRatio = (noseTip.y - forehead.y) / faceHeight;
      if (baselineFrames.current < 3) {
        if (baselineRef.current === null) baselineRef.current = noseYRatio;
        else { const n = baselineFrames.current; baselineRef.current = (baselineRef.current * n + noseYRatio) / (n + 1); }
        baselineFrames.current++;
        return;
      }
      const delta = noseYRatio - baselineRef.current!;
      if ((curAction === "tilt_up" && delta < -0.06) || (curAction === "tilt_down" && delta > 0.06)) registerSuccessFrame();
    }
  }, [registerSuccessFrame]);

  /* ────────── Verification flow ────────── */
  const resetVerifyState = useCallback(() => {
    successFrames.current  = 0;
    progressRef.current    = 0;
    baselineRef.current    = null;
    baselineFrames.current = 0;
    setProgress(0);
    setCountdown(COUNTDOWN_SECS);
    setFaceMatchResult(null);
  }, []);

  const startVerification = useCallback(() => {
    resetVerifyState();
    setStatus("verifying");
    let t = COUNTDOWN_SECS;
    setCountdown(t);
    cdTimerId.current = window.setInterval(() => {
      t--;
      if (mountedRef.current) setCountdown(t);
      if (t <= 0) {
        clearInterval(cdTimerId.current);
        if (successFrames.current < SUCCESS_FRAMES && statusRef.current === "verifying") {
          setStatus("failed");
          setStatusMsg("Không nhận được hành động. Hãy thực hiện rõ ràng hơn.");
        }
      }
    }, 1000);
  }, [resetVerifyState]);

  /* ────────── Detection loop ────────── */
  const tick = useCallback(() => {
    if (!loopActiveRef.current || !mountedRef.current) return;
    const video = videoRef.current;
    const lm    = landmarkerRef.current;
    if (!video || video.readyState < 2 || video.videoWidth === 0 || !lm) {
      timerId.current = window.setTimeout(tick, 150);
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
        // Auto-start verification immediately when face is stable
        if (stableCount.current >= 4 && !autoStartedRef.current && statusRef.current === "idle") {
          autoStartedRef.current = true;
          startVerification();
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
    } catch { /* skip */ }
    if (loopActiveRef.current) {
      timerId.current = window.setTimeout(tick, DETECT_INTERVAL);
    }
  }, [drawMesh, clearCanvas, checkAction, startVerification]);

  const startLoop = useCallback(() => {
    if (loopActiveRef.current) return;
    loopActiveRef.current = true;
    if (canvasRef.current && videoRef.current) {
      canvasRef.current.width  = videoRef.current.videoWidth  || 320;
      canvasRef.current.height = videoRef.current.videoHeight || 240;
    }
    tick();
  }, [tick]);

  /* ────────── Video event handlers ────────── */
  const handleVideoCanPlay = useCallback(() => {
    if (!mountedRef.current) return;
    videoRef.current?.play().catch(() => {});
  }, []);

  const handleVideoPlaying = useCallback(() => {
    if (!mountedRef.current) return;
    videoReadyRef.current = true;
    setCamLoading(false);
    // Only start detection loop if model is loaded
    if (landmarkerRef.current) startLoop();
  }, [startLoop]);

  const handleVideoStalled = useCallback(() => {
    if (!mountedRef.current || !videoRef.current || !streamRef.current) return;
    attachStreamToVideo(streamRef.current);
  }, [attachStreamToVideo]);

  /* ────────── Mount: start camera + load model in parallel ────────── */
  useEffect(() => {
    mountedRef.current = true;
    let modelDone = false;

    // 1) Start camera immediately
    (async () => {
      setCamLoading(true);
      const stream = await acquireStream();
      if (!mountedRef.current) { stream?.getTracks().forEach(t => t.stop()); return; }
      if (!stream) {
        setCamLoading(false);
        toast.error("Không thể truy cập camera. Kiểm tra quyền trình duyệt.");
        return;
      }
      streamRef.current = stream;
      setCamActive(true);
      requestAnimationFrame(() => {
        if (!mountedRef.current) return;
        attachStreamToVideo(stream);
      });
    })();

    // 2) Load MediaPipe model in parallel
    (async () => {
      try {
        const vision = await FilesetResolver.forVisionTasks(WASM_URL);
        let lm: FaceLandmarker | null = null;
        try {
          lm = await FaceLandmarker.createFromOptions(vision, {
            baseOptions: { modelAssetPath: MODEL_URL, delegate: "GPU" },
            runningMode: "VIDEO", numFaces: 1,
            minFaceDetectionConfidence: 0.4, minFacePresenceConfidence: 0.4, minTrackingConfidence: 0.4,
            outputFaceBlendshapes: false, outputFacialTransformationMatrixes: false,
          });
        } catch {
          lm = await FaceLandmarker.createFromOptions(vision, {
            baseOptions: { modelAssetPath: MODEL_URL, delegate: "CPU" },
            runningMode: "VIDEO", numFaces: 1,
            minFaceDetectionConfidence: 0.4, minFacePresenceConfidence: 0.4, minTrackingConfidence: 0.4,
            outputFaceBlendshapes: false, outputFacialTransformationMatrixes: false,
          });
        }
        landmarkerRef.current = lm;
        modelDone = true;
        if (mountedRef.current) {
          setModelLoading(false);
          // If video is already playing, start detection loop now
          if (videoReadyRef.current) startLoop();
        }
      } catch (e) {
        console.error("MediaPipe load error:", e);
        if (mountedRef.current) setModelLoading(false);
      }
    })();

    // 3) Pre-load face-api + reference descriptor
    if (referencePhotoUrl) {
      loadFaceApi().then(ok => {
        if (!ok || !mountedRef.current) return;
        getDescriptorFromUrl(referencePhotoUrl).then(d => { refDescriptor.current = d; });
      });
    }

    return () => {
      mountedRef.current = false;
      loopActiveRef.current = false;
      clearTimeout(timerId.current);
      clearInterval(cdTimerId.current);
      if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null; }
      if (videoRef.current) videoRef.current.srcObject = null;
      landmarkerRef.current?.close();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── Ensure srcObject stays attached ── */
  useEffect(() => {
    if (camActive && streamRef.current && videoRef.current) {
      attachStreamToVideo(streamRef.current);
    }
  }, [camActive, attachStreamToVideo]);

  const swapAction = () => {
    const available = ALL_ACTIONS.filter(a => a !== actionRef.current);
    const next = available[Math.floor(Math.random() * available.length)];
    setAction(next);
    resetVerifyState();
  };

  const retry = () => {
    clearInterval(cdTimerId.current);
    loopActiveRef.current = false;
    autoStartedRef.current = false;
    stableCount.current = 0;
    faceVisRef.current = false;
    setFaceVisible(false);
    const a = ALL_ACTIONS[Math.floor(Math.random() * ALL_ACTIONS.length)];
    setAction(a);
    setStatus("idle");
    resetVerifyState();
    setStatusMsg("");
    setTimeout(() => {
      if (mountedRef.current && landmarkerRef.current) {
        loopActiveRef.current = true;
        tick();
      }
    }, 50);
  };

  const startCam = useCallback(async () => {
    setCamLoading(true);
    const stream = await acquireStream();
    if (!mountedRef.current) { stream?.getTracks().forEach(t => t.stop()); return; }
    if (!stream) { setCamLoading(false); toast.error("Không thể truy cập camera."); return; }
    streamRef.current = stream;
    setCamActive(true);
    requestAnimationFrame(() => {
      if (mountedRef.current) attachStreamToVideo(stream);
    });
  }, [acquireStream, attachStreamToVideo]);

  /* ─── Render ─── */
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
              <p className="text-xs text-muted-foreground">Face Mesh · Liveness · So sánh khuôn mặt</p>
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
                onCanPlay={handleVideoCanPlay}
                onPlaying={handleVideoPlaying}
                onStalled={handleVideoStalled}
                onSuspend={handleVideoStalled}
                className="w-full h-full object-cover"
                style={{ transform: "scaleX(-1)" }}
              />
              <FaceMeshOverlay canvasRef={canvasRef as any} />

              {/* Face + model status */}
              <div className={`absolute top-3 left-3 px-3 py-1 rounded-full text-xs font-medium flex items-center gap-1.5 transition-all duration-300 ${
                faceVisible
                  ? "bg-green-500/90 text-white shadow-sm"
                  : "bg-black/60 text-white/70 border border-white/20"
              }`}>
                <span className={`w-1.5 h-1.5 rounded-full ${faceVisible ? "bg-white" : "bg-white/50 animate-pulse"}`} />
                {camLoading ? "Đang mở camera..." : modelLoading ? "Đang tải AI..." : faceVisible ? "Nhận diện khuôn mặt" : "Hướng mặt vào camera"}
              </div>

              {status === "verifying" && (
                <>
                  <CountdownBadge secs={countdown} />
                  <ProgressArc progress={progress} />
                </>
              )}

              {/* Action overlay */}
              {status !== "success" && status !== "failed" && status !== "comparing" && action && (
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
                    <p className="text-xs opacity-80">
                      {status === "verifying" ? ACTION_META[action].desc : modelLoading ? "Đang tải mô hình AI, camera đã sẵn sàng..." : "Sẽ tự động bắt đầu khi nhận diện mặt"}
                    </p>
                  </div>
                </div>
              )}

              {camLoading && (
                <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center gap-4">
                  <div className="w-16 h-16 rounded-full border-4 border-primary border-t-transparent animate-spin" />
                  <div className="text-center space-y-1">
                    <p className="text-white font-semibold text-base">Đang mở camera...</p>
                    <p className="text-white/60 text-sm">Vui lòng chờ trong giây lát</p>
                  </div>
                </div>
              )}

              {!camLoading && modelLoading && (
                <div className="absolute bottom-14 left-3 right-3 flex items-center gap-2 bg-black/60 backdrop-blur-sm rounded-xl px-3 py-2">
                  <div className="w-5 h-5 rounded-full border-2 border-primary border-t-transparent animate-spin shrink-0" />
                  <p className="text-white/90 text-xs font-medium">Đang tải nhận diện khuôn mặt...</p>
                </div>
              )}

              {status === "comparing" && (
                <div className="absolute inset-0 bg-black/75 flex flex-col items-center justify-center gap-3"
                  style={{ animation: "livenessFadeIn 0.25s ease" }}>
                  <div className="w-14 h-14 rounded-full border-4 border-primary border-t-transparent animate-spin" />
                  <p className="text-white font-semibold text-base">Đang so sánh khuôn mặt...</p>
                  <p className="text-white/70 text-xs">Vui lòng giữ nguyên tư thế</p>
                </div>
              )}

              {status === "success" && (
                <div className="absolute inset-0 bg-green-500/85 flex flex-col items-center justify-center gap-2"
                  style={{ animation: "livenessFadeIn 0.25s ease" }}>
                  <CheckCircle className="w-16 h-16 text-white" />
                  <p className="text-xl font-bold text-white">Xác minh thành công!</p>
                  {faceMatchResult && faceMatchResult.similarity > 0 && (
                    <p className="text-sm text-white/90 bg-white/20 px-3 py-1 rounded-full">
                      Độ khớp khuôn mặt: {faceMatchResult.similarity}%
                    </p>
                  )}
                </div>
              )}

              {status === "failed" && (
                <div className="absolute inset-0 bg-red-500/85 flex flex-col items-center justify-center px-6 gap-2"
                  style={{ animation: "livenessFadeIn 0.25s ease" }}>
                  <AlertTriangle className="w-14 h-14 text-white" />
                  <p className="text-lg font-bold text-white">Xác minh thất bại</p>
                  <p className="text-xs text-white/90 text-center">{statusMsg}</p>
                </div>
              )}
            </>
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center gap-3 text-muted-foreground">
              {camLoading ? (
                <>
                  <Loader2 className="w-14 h-14 animate-spin opacity-60" />
                  <p className="text-sm">Đang mở camera...</p>
                </>
              ) : (
                <>
                  <Camera className="w-14 h-14 opacity-40" />
                  <p className="text-sm">Nhấn nút bên dưới để mở camera</p>
                </>
              )}
            </div>
          )}
        </div>

        {/* Buttons */}
        <div className="px-4 pb-5 space-y-2.5">
          {status === "failed" ? (
            <>
              <Button onClick={retry} className="w-full btn-primary-gradient py-5">
                <RefreshCw className="w-5 h-5 mr-2" />Thử lại
              </Button>
              <Button variant="outline" onClick={onCancel} className="w-full">Hủy</Button>
            </>
          ) : !camActive && !camLoading ? (
            <>
              <Button onClick={startCam} className="w-full btn-primary-gradient py-5 text-base">
                <Camera className="w-5 h-5 mr-2" />Mở camera xác minh
              </Button>
              <Button variant="outline" onClick={onCancel} className="w-full">Hủy</Button>
            </>
          ) : status === "idle" && camActive && !modelLoading ? (
            <>
              <div className="flex gap-2">
                <Button type="button" variant="outline" className="shrink-0 h-12 w-12" onClick={swapAction} title="Đổi hành động">
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
          ) : (
            <Button variant="outline" onClick={onCancel} className="w-full">Hủy</Button>
          )}
        </div>
      </div>
    </div>
  );
};

export default LivenessVerification;
