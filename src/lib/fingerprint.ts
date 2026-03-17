// Device Fingerprint Generator - Multi-signal approach
// Uses Canvas, WebGL, Audio, Screen, Hardware, and more

async function getCanvasFingerprint(): Promise<string> {
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 200;
    canvas.height = 50;
    const ctx = canvas.getContext("2d");
    if (!ctx) return "no-canvas";

    ctx.textBaseline = "top";
    ctx.font = "14px 'Arial'";
    ctx.fillStyle = "#f60";
    ctx.fillRect(125, 1, 62, 20);
    ctx.fillStyle = "#069";
    ctx.fillText("FaceAI-FP", 2, 15);
    ctx.fillStyle = "rgba(102, 204, 0, 0.7)";
    ctx.fillText("FaceAI-FP", 4, 17);

    return canvas.toDataURL();
  } catch {
    return "canvas-error";
  }
}

function getWebGLFingerprint(): string {
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl") || canvas.getContext("experimental-webgl");
    if (!gl) return "no-webgl";
    const glCtx = gl as WebGLRenderingContext;

    const debugInfo = glCtx.getExtension("WEBGL_debug_renderer_info");
    const vendor = debugInfo
      ? glCtx.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL)
      : "unknown";
    const renderer = debugInfo
      ? glCtx.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL)
      : "unknown";

    return `${vendor}~${renderer}`;
  } catch {
    return "webgl-error";
  }
}

async function getAudioFingerprint(): Promise<string> {
  try {
    const AudioContext =
      window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContext) return "no-audio";

    const context = new AudioContext();
    const oscillator = context.createOscillator();
    const analyser = context.createAnalyser();
    const gain = context.createGain();
    const processor = context.createScriptProcessor(4096, 1, 1);

    oscillator.type = "triangle";
    oscillator.frequency.setValueAtTime(10000, context.currentTime);
    gain.gain.setValueAtTime(0, context.currentTime);

    oscillator.connect(analyser);
    analyser.connect(processor);
    processor.connect(gain);
    gain.connect(context.destination);

    oscillator.start(0);

    // Add timeout to prevent hanging
    const fingerprint = await Promise.race([
      new Promise<string>((resolve) => {
        processor.onaudioprocess = (event) => {
          const data = event.inputBuffer.getChannelData(0);
          let sum = 0;
          for (let i = 0; i < data.length; i++) {
            sum += Math.abs(data[i]);
          }
          resolve(sum.toString());
        };
      }),
      new Promise<string>((resolve) => setTimeout(() => resolve("audio-timeout"), 500)),
    ]);

    try {
      oscillator.stop();
      processor.disconnect();
      context.close();
    } catch { /* cleanup */ }

    return fingerprint;
  } catch {
    return "audio-error";
  }
}

function getScreenFingerprint(): string {
  return [
    screen.width,
    screen.height,
    screen.colorDepth,
    screen.pixelDepth,
    window.devicePixelRatio,
  ].join("x");
}

function getHardwareFingerprint(): string {
  return [
    navigator.hardwareConcurrency || "unknown",
    (navigator as any).deviceMemory || "unknown",
    navigator.maxTouchPoints || 0,
  ].join("-");
}

function getTimezoneFingerprint(): string {
  return [
    Intl.DateTimeFormat().resolvedOptions().timeZone,
    new Date().getTimezoneOffset(),
    navigator.language,
    navigator.languages?.join(",") || "",
  ].join("|");
}

function getPlatformFingerprint(): string {
  return [
    navigator.userAgent,
    navigator.platform || "",
    (navigator as any).oscpu || "",
  ].join("||");
}

// Bot detection signals
export function detectBotSignals(): {
  isBot: boolean;
  hasWebdriver: boolean;
  missingFeatures: string[];
  details: Record<string, unknown>;
} {
  const missingFeatures: string[] = [];
  const details: Record<string, unknown> = {};

  const hasWebdriver = !!(navigator as any).webdriver;
  details.webdriver = hasWebdriver;

  const hasChrome = !!(window as any).chrome;
  const hasNotification = "Notification" in window;
  const hasPermissions = "permissions" in navigator;

  if (!hasChrome && /Chrome/.test(navigator.userAgent)) {
    missingFeatures.push("chrome-object");
  }
  if (!hasNotification) missingFeatures.push("notification-api");
  if (!hasPermissions) missingFeatures.push("permissions-api");

  const automationKeys = [
    "__webdriver_evaluate",
    "__selenium_evaluate",
    "__fxdriver_evaluate",
    "__driver_evaluate",
    "__webdriver_unwrapped",
    "__selenium_unwrapped",
    "__fxdriver_unwrapped",
    "_phantom",
    "__nightmare",
    "_selenium",
    "callPhantom",
    "callSelenium",
    "__phantomas",
    "Buffer",
    "emit",
    "spawn",
  ];

  const detectedAutomation = automationKeys.filter(
    (key) => key in window || key in document
  );
  if (detectedAutomation.length > 0) {
    missingFeatures.push(...detectedAutomation);
    details.automation_detected = detectedAutomation;
  }

  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl");
    if (gl) {
      const debugInfo = gl.getExtension("WEBGL_debug_renderer_info");
      if (debugInfo) {
        const renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
        if (/swiftshader|mesa|llvmpipe/i.test(renderer)) {
          missingFeatures.push("software-renderer");
          details.webgl_renderer = renderer;
        }
      }
    }
  } catch { /* Ignore */ }

  details.plugin_count = navigator.plugins?.length || 0;
  if (navigator.plugins?.length === 0 && !/Mobile|Android/i.test(navigator.userAgent)) {
    missingFeatures.push("no-plugins");
  }

  const isBot = hasWebdriver || missingFeatures.length >= 3;
  return { isBot, hasWebdriver, missingFeatures, details };
}

// Behavior tracking
export class BehaviorTracker {
  private keyTimestamps: number[] = [];
  private pageLoadTimestamp = Date.now();
  private requestTimestamps: number[] = [];

  trackKeystroke() {
    this.keyTimestamps.push(Date.now());
  }

  trackRequest() {
    this.requestTimestamps.push(Date.now());
  }

  getScore(): number {
    let score = 100;

    if (this.keyTimestamps.length >= 3) {
      const intervals: number[] = [];
      for (let i = 1; i < this.keyTimestamps.length; i++) {
        intervals.push(this.keyTimestamps[i] - this.keyTimestamps[i - 1]);
      }
      const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
      if (avgInterval < 30) score -= 40;
      const stdDev = Math.sqrt(
        intervals.reduce((sum, v) => sum + Math.pow(v - avgInterval, 2), 0) / intervals.length
      );
      if (stdDev < 5 && intervals.length > 5) score -= 30;
    } else if (this.keyTimestamps.length === 0) {
      score -= 20;
    }

    const timeOnPage = Date.now() - this.pageLoadTimestamp;
    if (timeOnPage < 2000) score -= 30;
    if (timeOnPage < 1000) score -= 20;

    if (this.requestTimestamps.length > 3) {
      const recentRequests = this.requestTimestamps.filter((t) => Date.now() - t < 60000);
      if (recentRequests.length > 5) score -= 30;
    }

    return Math.max(0, score);
  }

  getData() {
    return {
      keystroke_count: this.keyTimestamps.length,
      time_on_page_ms: Date.now() - this.pageLoadTimestamp,
      behavior_score: this.getScore(),
      request_count: this.requestTimestamps.length,
    };
  }
}

// SHA-256 hash
async function sha256(message: string): Promise<string> {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest("SHA-256", msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

const FP_CACHE_KEY = "fp_cache_v1";

// Main function: generate device fingerprint hash (with sessionStorage cache)
export async function generateDeviceFingerprint(): Promise<{
  hash: string;
  components: Record<string, string>;
}> {
  // Check cache first
  try {
    const cached = sessionStorage.getItem(FP_CACHE_KEY);
    if (cached) {
      const parsed = JSON.parse(cached);
      if (parsed.hash && parsed.components) return parsed;
    }
  } catch { /* ignore */ }

  const [canvasFP, audioFP] = await Promise.all([
    getCanvasFingerprint(),
    getAudioFingerprint(),
  ]);

  const components = {
    canvas: canvasFP,
    webgl: getWebGLFingerprint(),
    audio: audioFP,
    screen: getScreenFingerprint(),
    hardware: getHardwareFingerprint(),
    timezone: getTimezoneFingerprint(),
    platform: getPlatformFingerprint(),
  };

  const combined = Object.values(components).join("|||");
  const hash = await sha256(combined);

  const result = { hash, components };

  // Cache for session
  try {
    sessionStorage.setItem(FP_CACHE_KEY, JSON.stringify(result));
  } catch { /* ignore */ }

  return result;
}

// Security check API calls
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

async function callSecurityEndpoint(
  action: string,
  body: Record<string, unknown>
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  
  try {
    const response = await fetch(
      `${SUPABASE_URL}/functions/v1/security-check/${action}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: SUPABASE_KEY,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      }
    );
    return response.json();
  } finally {
    clearTimeout(timeout);
  }
}

export async function checkRegisterAllowed(
  deviceHash: string,
  botSignals: ReturnType<typeof detectBotSignals>,
  components: Record<string, string>
) {
  return callSecurityEndpoint("check-register", {
    device_hash: deviceHash,
    bot_signals: botSignals,
    user_agent: navigator.userAgent,
    fingerprint_components: components,
  });
}

export async function registerDevice(
  deviceHash: string,
  userId: string,
  components: Record<string, string>
) {
  return callSecurityEndpoint("register-device", {
    device_hash: deviceHash,
    user_id: userId,
    user_agent: navigator.userAgent,
    fingerprint_components: components,
  });
}

export async function checkLoginAllowed(
  deviceHash: string,
  email: string,
  botSignals: ReturnType<typeof detectBotSignals>,
  behaviorData: Record<string, unknown>
) {
  return callSecurityEndpoint("check-login", {
    device_hash: deviceHash,
    email,
    bot_signals: botSignals,
    behavior_data: behaviorData,
    user_agent: navigator.userAgent,
  });
}

export async function logLoginAttempt(
  deviceHash: string,
  email: string,
  success: boolean,
  behaviorData: Record<string, unknown>
) {
  return callSecurityEndpoint("log-attempt", {
    device_hash: deviceHash,
    email,
    success,
    behavior_data: behaviorData,
    user_agent: navigator.userAgent,
  });
}
