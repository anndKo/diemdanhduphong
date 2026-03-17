import { useState, useRef, useCallback, useEffect, memo } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Camera, Loader2, RefreshCw, CheckCircle, AlertTriangle, ArrowLeft, ArrowRight, ArrowUp, ArrowDown, X, Shuffle } from "lucide-react";
import * as faceapi from "@vladmandic/face-api";

type ActionType = "turn_left" | "turn_right" | "look_up" | "look_down";

interface LivenessVerificationProps {
  onVerified: () => void;
  onCancel: () => void;
  referencePhotoUrl?: string;
}

const ACTION_LABELS: Record<ActionType, { label: string; description: string }> = {
  turn_left: { label: "Quay trái", description: "Quay mặt sang bên trái" },
  turn_right: { label: "Quay phải", description: "Quay mặt sang bên phải" },
  look_up: { label: "Ngẩng lên", description: "Ngẩng mặt lên trên" },
  look_down: { label: "Cúi xuống", description: "Cúi mặt xuống dưới" },
};

const ACTION_ICONS: Record<ActionType, React.ReactNode> = {
  turn_left: <ArrowLeft className="w-8 h-8" />,
  turn_right: <ArrowRight className="w-8 h-8" />,
  look_up: <ArrowUp className="w-8 h-8" />,
  look_down: <ArrowDown className="w-8 h-8" />,
};

const ALL_ACTIONS: ActionType[] = ["turn_left", "turn_right", "look_up", "look_down"];

const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

const DETECT_SIZE_IDLE = isMobile ? 128 : 160;
const DETECT_SIZE_VERIFY = isMobile ? 160 : 224;
const DETECT_SIZE_COMPARE = isMobile ? 224 : 320;
const DETECT_INTERVAL_IDLE = isMobile ? 350 : 250;
const DETECT_INTERVAL_VERIFY = isMobile ? 200 : 150;
const COUNTDOWN_SECONDS = 6;

// Memoized countdown display - pure CSS animation, no re-render from parent
const CountdownDisplay = memo(({ seconds, key: animKey }: { seconds: number; key: string }) => (
  <div className="absolute top-3 right-3 w-12 h-12 rounded-full bg-primary/90 flex items-center justify-center" key={animKey}>
    <span className="text-2xl font-bold text-white tabular-nums">{seconds}</span>
  </div>
));
CountdownDisplay.displayName = "CountdownDisplay";

// Memoized progress bar
const ProgressBar = memo(({ progress }: { progress: number }) => (
  <div className="absolute top-16 right-3 left-3">
    <div className="h-2 bg-white/30 rounded-full overflow-hidden">
      <div
        className="h-full bg-green-500 rounded-full"
        style={{ width: `${progress}%`, transition: "width 150ms linear" }}
      />
    </div>
  </div>
));
ProgressBar.displayName = "ProgressBar";

const LivenessVerification = ({ onVerified, onCancel, referencePhotoUrl }: LivenessVerificationProps) => {
  const [isModelLoading, setIsModelLoading] = useState(true);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [isCameraLoading, setIsCameraLoading] = useState(false);
  const [currentAction, setCurrentAction] = useState<ActionType | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [verificationStatus, setVerificationStatus] = useState<"idle" | "detecting" | "success" | "failed" | "face_mismatch">("idle");
  const [countdown, setCountdown] = useState(COUNTDOWN_SECONDS);
  const [faceDetected, setFaceDetected] = useState(false);
  const [detectionProgress, setDetectionProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState("");

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const countdownTimerRef = useRef<number | null>(null);

  const referenceDescriptorRef = useRef<Float32Array | null>(null);
  const modelsLoadedRef = useRef(false);
  const faceComparisonDoneRef = useRef(false);
  const isCameraActiveRef = useRef(false);
  const isVerifyingRef = useRef(false);
  const currentActionRef = useRef<ActionType | null>(null);
  const successCountRef = useRef(0);
  const lastDetectTimeRef = useRef(0);
  const faceDetectedRef = useRef(false);
  const stableCountRef = useRef(0);
  const baselineNoseRatioRef = useRef<{ horizontal: number; vertical: number } | null>(null);
  const baselineFrameCountRef = useRef(0);
  const detectionLoopRunningRef = useRef(false);
  const mountedRef = useRef(true);
  const detectionProgressRef = useRef(0);
  const detectTimeoutRef = useRef<number>(0);

  useEffect(() => { isCameraActiveRef.current = isCameraActive; }, [isCameraActive]);
  useEffect(() => { isVerifyingRef.current = isVerifying; }, [isVerifying]);
  useEffect(() => { currentActionRef.current = currentAction; }, [currentAction]);

  useEffect(() => {
    mountedRef.current = true;
    loadModels();
    return () => {
      mountedRef.current = false;
      stopCamera();
      if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
      clearTimeout(detectTimeoutRef.current);
    };
  }, []);

  const loadModels = async () => {
    if (modelsLoadedRef.current) {
      setIsModelLoading(false);
      return;
    }
    try {
      const MODEL_URL = "https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model";
      await Promise.all([
        faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
        faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
        faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
      ]);
      modelsLoadedRef.current = true;
      if (referencePhotoUrl) {
        await extractReferenceDescriptor(referencePhotoUrl);
      }
      if (mountedRef.current) setIsModelLoading(false);
    } catch (error) {
      console.error("Error loading face-api models:", error);
      toast.error("Không thể tải mô hình nhận diện khuôn mặt");
      if (mountedRef.current) setIsModelLoading(false);
    }
  };

  const extractReferenceDescriptor = async (photoUrl: string) => {
    try {
      const img = await faceapi.fetchImage(photoUrl);
      const detection = await faceapi
        .detectSingleFace(img, new faceapi.TinyFaceDetectorOptions({ scoreThreshold: 0.3 }))
        .withFaceLandmarks()
        .withFaceDescriptor();
      if (detection) {
        referenceDescriptorRef.current = detection.descriptor;
      } else {
        toast.error("Không tìm thấy khuôn mặt trong ảnh điểm danh. Vui lòng chụp lại.");
      }
    } catch (error) {
      console.error("Error extracting reference descriptor:", error);
    }
  };

  const startCamera = useCallback(async () => {
    setIsCameraLoading(true);
    setStatusMessage("Đang khởi động camera...");
    faceComparisonDoneRef.current = false;

    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }

    try {
      const constraints: MediaStreamConstraints = {
        video: {
          facingMode: "user",
          width: { ideal: isMobile ? 480 : 640 },
          height: { ideal: isMobile ? 360 : 480 },
          ...(isIOS ? { frameRate: { ideal: 24, max: 30 } } : {}),
        },
        audio: false,
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;
      if (mountedRef.current) {
        setIsCameraActive(true);
        setIsCameraLoading(false);
        setStatusMessage("");
        selectRandomAction();
      }
    } catch (error: any) {
      console.error("Camera error:", error);
      if (error.name === "NotAllowedError") {
        toast.error("Bạn đã từ chối quyền camera. Vui lòng cho phép trong cài đặt trình duyệt.");
      } else if (error.name === "NotFoundError") {
        toast.error("Không tìm thấy camera.");
      } else {
        try {
          const fallback = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
          streamRef.current = fallback;
          if (mountedRef.current) {
            setIsCameraActive(true);
            setStatusMessage("");
            selectRandomAction();
          }
        } catch {
          toast.error("Không thể truy cập camera.");
        }
      }
      if (mountedRef.current) setIsCameraLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isCameraActive && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
    }
  }, [isCameraActive]);

  const stopCamera = useCallback(() => {
    detectionLoopRunningRef.current = false;
    clearTimeout(detectTimeoutRef.current);
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
    setIsCameraActive(false);
  }, []);

  const selectRandomAction = () => {
    const action = ALL_ACTIONS[Math.floor(Math.random() * ALL_ACTIONS.length)];
    setCurrentAction(action);
    setVerificationStatus("idle");
    setCountdown(COUNTDOWN_SECONDS);
    successCountRef.current = 0;
    baselineNoseRatioRef.current = null;
    baselineFrameCountRef.current = 0;
    detectionProgressRef.current = 0;
    setDetectionProgress(0);
  };

  const switchAction = () => {
    const cur = currentActionRef.current;
    const other = ALL_ACTIONS.find(a => a !== cur) || ALL_ACTIONS[0];
    setCurrentAction(other);
    setCountdown(COUNTDOWN_SECONDS);
    successCountRef.current = 0;
    baselineNoseRatioRef.current = null;
    baselineFrameCountRef.current = 0;
    detectionProgressRef.current = 0;
    setDetectionProgress(0);
  };

  // Use setTimeout-based loop instead of rAF to avoid blocking UI thread
  const startDetectionLoop = useCallback(() => {
    if (detectionLoopRunningRef.current) return;
    detectionLoopRunningRef.current = true;

    const runDetection = async () => {
      if (!isCameraActiveRef.current || !mountedRef.current || !detectionLoopRunningRef.current) {
        detectionLoopRunningRef.current = false;
        return;
      }

      const video = videoRef.current;
      if (!video || video.readyState < 2 || video.videoWidth === 0) {
        detectTimeoutRef.current = window.setTimeout(runDetection, 100);
        return;
      }

      const interval = isVerifyingRef.current ? DETECT_INTERVAL_VERIFY : DETECT_INTERVAL_IDLE;

      try {
        if (isVerifyingRef.current) {
          const detection = await faceapi
            .detectSingleFace(video, new faceapi.TinyFaceDetectorOptions({ inputSize: DETECT_SIZE_VERIFY, scoreThreshold: 0.3 }))
            .withFaceLandmarks();

          if (detection) {
            if (!faceDetectedRef.current) {
              faceDetectedRef.current = true;
              setFaceDetected(true);
            }
            checkHeadTurn(detection.landmarks);
          } else {
            if (faceDetectedRef.current) {
              faceDetectedRef.current = false;
              setFaceDetected(false);
            }
          }
        } else {
          const detection = await faceapi.detectSingleFace(
            video,
            new faceapi.TinyFaceDetectorOptions({ inputSize: DETECT_SIZE_IDLE, scoreThreshold: 0.3 })
          );
          if (detection) stableCountRef.current++;
          else stableCountRef.current = 0;

          const detected = stableCountRef.current >= 2;
          if (faceDetectedRef.current !== detected) {
            faceDetectedRef.current = detected;
            setFaceDetected(detected);
          }
        }
      } catch {
        // ignore detection errors
      }

      if (detectionLoopRunningRef.current) {
        detectTimeoutRef.current = window.setTimeout(runDetection, interval);
      }
    };

    runDetection();
  }, []);

  const checkHeadTurn = (landmarks: faceapi.FaceLandmarks68) => {
    const action = currentActionRef.current;
    if (!action) return;

    const jaw = landmarks.getJawOutline();
    const nose = landmarks.getNose();
    const leftEye = landmarks.getLeftEye();
    const rightEye = landmarks.getRightEye();

    const jawLeft = jaw[0];
    const jawRight = jaw[16];
    const noseTip = nose[3];

    const faceWidth = jawRight.x - jawLeft.x;
    if (faceWidth < 20) return;

    const noseRatioH = (noseTip.x - jawLeft.x) / faceWidth;

    const eyeCenterY = (leftEye[0].y + rightEye[0].y) / 2;
    const jawBottomY = jaw[8].y;
    const faceHeight = jawBottomY - eyeCenterY;
    const noseRatioV = faceHeight > 20 ? (noseTip.y - eyeCenterY) / faceHeight : 0.5;

    const leftHalf = noseTip.x - jawLeft.x;
    const rightHalf = jawRight.x - noseTip.x;
    const asymmetry = leftHalf / (rightHalf + 0.001);

    if (baselineFrameCountRef.current < 3) {
      if (!baselineNoseRatioRef.current) {
        baselineNoseRatioRef.current = { horizontal: noseRatioH, vertical: noseRatioV };
      } else {
        const count = baselineFrameCountRef.current;
        baselineNoseRatioRef.current.horizontal =
          (baselineNoseRatioRef.current.horizontal * count + noseRatioH) / (count + 1);
        baselineNoseRatioRef.current.vertical =
          (baselineNoseRatioRef.current.vertical * count + noseRatioV) / (count + 1);
      }
      baselineFrameCountRef.current++;
      return;
    }

    const baseline = baselineNoseRatioRef.current!;
    const deltaH = noseRatioH - baseline.horizontal;
    const deltaV = noseRatioV - baseline.vertical;

    let detected = false;
    switch (action) {
      case "turn_left":
        detected = deltaH > 0.05 || asymmetry > 1.35;
        break;
      case "turn_right":
        detected = deltaH < -0.05 || asymmetry < 0.72;
        break;
      case "look_up":
        detected = deltaV < -0.06;
        break;
      case "look_down":
        detected = deltaV > 0.06;
        break;
    }

    if (detected) {
      successCountRef.current++;
      const newProgress = Math.min(100, (successCountRef.current / 3) * 100);
      // Only update state if progress changed significantly (reduce re-renders)
      if (Math.abs(newProgress - detectionProgressRef.current) >= 10) {
        detectionProgressRef.current = newProgress;
        setDetectionProgress(newProgress);
      }
    }
  };

  const startVerification = async () => {
    setIsVerifying(true);
    setVerificationStatus("detecting");
    detectionProgressRef.current = 0;
    setDetectionProgress(0);
    successCountRef.current = 0;
    baselineNoseRatioRef.current = null;
    baselineFrameCountRef.current = 0;

    let timeLeft = COUNTDOWN_SECONDS;
    setCountdown(timeLeft);

    countdownTimerRef.current = window.setInterval(() => {
      timeLeft--;
      if (mountedRef.current) setCountdown(timeLeft);
      if (timeLeft <= 0) {
        if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
        finishVerification();
      }
    }, 1000);
  };

  const finishVerification = async () => {
    if (successCountRef.current >= 3) {
      if (referenceDescriptorRef.current && videoRef.current) {
        setStatusMessage("Đang so sánh khuôn mặt...");
        try {
          const detection = await faceapi
            .detectSingleFace(videoRef.current, new faceapi.TinyFaceDetectorOptions({ inputSize: DETECT_SIZE_COMPARE, scoreThreshold: 0.3 }))
            .withFaceLandmarks()
            .withFaceDescriptor();

          if (detection) {
            const distance = faceapi.euclideanDistance(referenceDescriptorRef.current, detection.descriptor);
            if (distance < 0.55) {
              setVerificationStatus("success");
              faceComparisonDoneRef.current = true;
              setTimeout(() => onVerified(), 800);
            } else {
              setVerificationStatus("face_mismatch");
              setStatusMessage("Khuôn mặt không trùng khớp");
              setIsVerifying(false);
            }
          } else {
            setVerificationStatus("failed");
            setStatusMessage("Không phát hiện khuôn mặt khi so sánh");
            setIsVerifying(false);
          }
        } catch (error) {
          console.error("Face comparison error:", error);
          setVerificationStatus("failed");
          setStatusMessage("Lỗi khi so sánh khuôn mặt");
          setIsVerifying(false);
        }
      } else {
        setVerificationStatus("success");
        setTimeout(() => onVerified(), 800);
      }
    } else {
      setVerificationStatus("failed");
      setStatusMessage("Không nhận diện được hành động. Hãy quay đầu rõ ràng hơn.");
      setIsVerifying(false);
    }
  };

  const retryVerification = () => {
    if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
    selectRandomAction();
    setIsVerifying(false);
    setStatusMessage("");
    faceComparisonDoneRef.current = false;
  };

  if (isModelLoading) {
    return (
      <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4" style={{ zIndex: 9999 }} onClick={e => e.stopPropagation()}>
        <div className="bg-card rounded-2xl p-8 text-center max-w-sm w-full" onClick={e => e.stopPropagation()}>
          <Loader2 className="w-12 h-12 animate-spin text-primary mx-auto mb-4" />
          <p className="text-foreground font-medium">Đang tải mô hình nhận diện...</p>
          <p className="text-sm text-muted-foreground mt-2">Vui lòng chờ trong giây lát</p>
          <Button variant="outline" onClick={onCancel} className="mt-4">Hủy</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4" style={{ zIndex: 9999 }} onClick={e => e.stopPropagation()}>
      <div className="bg-card rounded-2xl shadow-2xl w-full max-w-md p-6 animate-scale-in relative" onClick={e => e.stopPropagation()}>
        <button onClick={onCancel} className="absolute top-4 right-4 w-8 h-8 rounded-full bg-muted flex items-center justify-center hover:bg-muted/80 transition-colors" style={{ zIndex: 10 }}>
          <X className="w-4 h-4" />
        </button>

        <div className="text-center mb-6">
          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
            <Camera className="w-8 h-8 text-primary" />
          </div>
          <h2 className="text-xl font-bold text-foreground">Xác minh danh tính</h2>
          <p className="text-sm text-muted-foreground mt-1">Thực hiện hành động để xác minh bạn là người thật</p>
        </div>

        <div className="relative aspect-[4/3] bg-black rounded-xl overflow-hidden mb-4">
          {isCameraActive ? (
            <>
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                onPlaying={() => startDetectionLoop()}
                className="w-full h-full object-cover"
                style={{ transform: "scaleX(-1)", willChange: "auto" }}
              />

              {/* Face detection indicator */}
              <div className={`absolute top-3 left-3 px-3 py-1.5 rounded-full text-xs font-medium flex items-center gap-1.5 ${
                faceDetected ? "bg-green-500/90 text-white" : "bg-red-500/90 text-white"
              }`}>
                <div className={`w-2 h-2 rounded-full ${faceDetected ? "bg-white" : "bg-white animate-pulse"}`} />
                {faceDetected ? "Phát hiện khuôn mặt" : "Đưa mặt vào camera"}
              </div>

              {/* Action instruction */}
              {currentAction && !isVerifying && (
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 to-transparent p-4">
                  <div className="text-center text-white">
                    <div className="flex items-center justify-center gap-3 mb-2">
                      {ACTION_ICONS[currentAction]}
                      <span className="text-lg font-bold">{ACTION_LABELS[currentAction].label}</span>
                    </div>
                    <p className="text-sm opacity-80">{ACTION_LABELS[currentAction].description}</p>
                  </div>
                </div>
              )}

              {/* Verifying overlay */}
              {isVerifying && verificationStatus === "detecting" && currentAction && (
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 to-transparent p-4">
                  <div className="text-center text-white">
                    <div className="flex items-center justify-center gap-3 mb-2">
                      {ACTION_ICONS[currentAction]}
                      <span className="text-lg font-bold">{ACTION_LABELS[currentAction].label}</span>
                    </div>
                    <p className="text-sm opacity-80">Đang xác minh... Hãy quay đầu rõ ràng!</p>
                  </div>
                </div>
              )}

              {/* Countdown + Progress */}
              {isVerifying && verificationStatus === "detecting" && (
                <>
                  <CountdownDisplay seconds={countdown} key={`cd-${countdown}`} />
                  <ProgressBar progress={detectionProgress} />
                </>
              )}

              {isCameraLoading && (
                <div className="absolute inset-0 bg-black/70 flex items-center justify-center">
                  <div className="text-center text-white">
                    <Loader2 className="w-10 h-10 animate-spin mx-auto mb-2" />
                    <p className="text-sm">{statusMessage || "Đang khởi động..."}</p>
                  </div>
                </div>
              )}

              {verificationStatus === "success" && (
                <div className="absolute inset-0 bg-green-500/80 flex items-center justify-center">
                  <div className="text-center text-white">
                    <CheckCircle className="w-16 h-16 mx-auto mb-3" />
                    <p className="text-xl font-bold">Xác minh thành công!</p>
                  </div>
                </div>
              )}

              {verificationStatus === "failed" && (
                <div className="absolute inset-0 bg-red-500/80 flex items-center justify-center">
                  <div className="text-center text-white">
                    <AlertTriangle className="w-16 h-16 mx-auto mb-3" />
                    <p className="text-xl font-bold">Xác minh thất bại</p>
                    <p className="text-sm mt-1">{statusMessage || "Vui lòng thử lại"}</p>
                  </div>
                </div>
              )}

              {verificationStatus === "face_mismatch" && (
                <div className="absolute inset-0 bg-orange-500/80 flex items-center justify-center">
                  <div className="text-center text-white px-4">
                    <AlertTriangle className="w-16 h-16 mx-auto mb-3" />
                    <p className="text-xl font-bold">Không trùng khớp!</p>
                    <p className="text-sm mt-1">{statusMessage || "Khuôn mặt không giống với ảnh điểm danh"}</p>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center text-muted-foreground">
              <Camera className="w-16 h-16 mb-3" />
              <p>Bấm nút bên dưới để bắt đầu</p>
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="space-y-3">
          {!isCameraActive ? (
            <>
              <Button onClick={startCamera} className="w-full btn-primary-gradient py-6" disabled={isCameraLoading}>
                {isCameraLoading ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : <Camera className="w-5 h-5 mr-2" />}
                Mở camera xác minh
              </Button>
              <Button variant="outline" onClick={onCancel} className="w-full">Hủy</Button>
            </>
          ) : verificationStatus === "failed" || verificationStatus === "face_mismatch" ? (
            <>
              <Button onClick={retryVerification} className="w-full btn-primary-gradient py-6">
                <RefreshCw className="w-5 h-5 mr-2" />
                Thử lại
              </Button>
              <Button variant="outline" onClick={onCancel} className="w-full">Hủy</Button>
            </>
          ) : verificationStatus === "idle" && !isVerifying ? (
            <>
              <div className="flex gap-2">
                <Button type="button" onClick={switchAction} variant="outline" className="shrink-0" disabled={isCameraLoading} title="Đổi hành động khác">
                  <Shuffle className="w-4 h-4" />
                </Button>
                <Button onClick={startVerification} className="flex-1 btn-primary-gradient py-6" disabled={!faceDetected || isCameraLoading}>
                  {isCameraLoading ? (
                    <><Loader2 className="w-5 h-5 mr-2 animate-spin" />Đang tải...</>
                  ) : faceDetected ? (
                    <><CheckCircle className="w-5 h-5 mr-2" />Bắt đầu xác minh</>
                  ) : (
                    <><Loader2 className="w-5 h-5 mr-2 animate-spin" />Đưa mặt vào camera...</>
                  )}
                </Button>
              </div>
              <Button variant="outline" onClick={onCancel} className="w-full">Hủy</Button>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
};

export default LivenessVerification;
