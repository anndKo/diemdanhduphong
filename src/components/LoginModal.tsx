import { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { X, Lock, Mail, Loader2, ShieldAlert, AlertTriangle } from "lucide-react";
import { z } from "zod";
import ForgotPasswordModal from "@/components/ForgotPasswordModal";
import AccountRequestModal from "@/components/AccountRequestModal";
import {
  generateDeviceFingerprint,
  detectBotSignals,
  checkLoginAllowed,
  logLoginAttempt,
  BehaviorTracker,
} from "@/lib/fingerprint";

const loginSchema = z.object({
  email: z.string().email("Email không hợp lệ"),
  password: z.string().min(6, "Mật khẩu phải có ít nhất 6 ký tự"),
});

const ADMIN_EMAIL = "admindiemdanh@gmail.com";
const ADMIN_PASSWORD = "Admin123@";
const MAX_ATTEMPTS = 5;
const WARN_AFTER = 3; // Show warning after this many failures

interface LoginModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

// Cache fingerprint across renders
let cachedFingerprint: { hash: string; components: Record<string, string> } | null = null;

const LoginModal = ({ onClose, onSuccess }: LoginModalProps) => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isCheckingBlock, setIsCheckingBlock] = useState(true);
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const [blockMessage, setBlockMessage] = useState<string | null>(null);
  const [remainingTime, setRemainingTime] = useState<number | null>(null);
  const [attemptsRemaining, setAttemptsRemaining] = useState<number | null>(null);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [showAccountRequest, setShowAccountRequest] = useState(false);
  const behaviorTrackerRef = useRef(new BehaviorTracker());
  const deviceHashRef = useRef("unknown");

  // Get fingerprint once (cached)
  const getFingerprint = useCallback(async () => {
    if (cachedFingerprint) {
      deviceHashRef.current = cachedFingerprint.hash;
      return cachedFingerprint;
    }
    try {
      const fp = await generateDeviceFingerprint();
      cachedFingerprint = fp;
      deviceHashRef.current = fp.hash;
      return fp;
    } catch {
      return null;
    }
  }, []);

  // Check block status on mount — persist block state across reopens
  useEffect(() => {
    let cancelled = false;
    const checkInitialBlock = async () => {
      try {
        await getFingerprint();
        const botSignals = detectBotSignals();
        const securityCheck = await checkLoginAllowed(
          deviceHashRef.current,
          "", // no email yet
          botSignals,
          { keystroke_count: 0, time_on_page_ms: 0, behavior_score: 100, request_count: 0 }
        );

        if (!cancelled && securityCheck && !securityCheck.allowed) {
          setBlockMessage(securityCheck.reason || "Thiết bị đã bị tạm khóa.");
          if (securityCheck.remaining_seconds) {
            setRemainingTime(securityCheck.remaining_seconds);
          } else if (securityCheck.remaining_minutes) {
            setRemainingTime(securityCheck.remaining_minutes * 60);
          }
        } else if (!cancelled && securityCheck) {
          // Show remaining attempts if already partially used
          const remaining = securityCheck.device_attempts_remaining;
          if (remaining !== undefined && remaining < MAX_ATTEMPTS - WARN_AFTER + 1) {
            setAttemptsRemaining(remaining);
          }
        }
      } catch {
        // Silently ignore - allow login
      } finally {
        if (!cancelled) setIsCheckingBlock(false);
      }
    };
    checkInitialBlock();
    return () => { cancelled = true; };
  }, [getFingerprint]);

  // Countdown timer for block
  useEffect(() => {
    if (remainingTime === null || remainingTime <= 0) return;
    const timer = setInterval(() => {
      setRemainingTime((prev) => {
        if (prev === null || prev <= 1) {
          setBlockMessage(null);
          setAttemptsRemaining(null);
          return null;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [remainingTime]);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return m > 0 ? `${m} phút ${s < 10 ? '0' : ''}${s} giây` : `${s} giây`;
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});

    const result = loginSchema.safeParse({ email, password });
    if (!result.success) {
      const fieldErrors: { email?: string; password?: string } = {};
      result.error.errors.forEach((err) => {
        if (err.path[0] === "email") fieldErrors.email = err.message;
        if (err.path[0] === "password") fieldErrors.password = err.message;
      });
      setErrors(fieldErrors);
      return;
    }

    setIsLoading(true);

    try {
      const normalizedEmail = email.trim().toLowerCase();
      const isAdminAccount = normalizedEmail === ADMIN_EMAIL;

      // Get fingerprint (fast - cached)
      await getFingerprint();
      const deviceHash = deviceHashRef.current;

      // Security check - device + email rate limit
      try {
        const botSignals = detectBotSignals();
        const behaviorData = behaviorTrackerRef.current.getData();

        const securityCheck = await checkLoginAllowed(
          deviceHash,
          normalizedEmail,
          botSignals,
          behaviorData
        );

        if (securityCheck && !securityCheck.allowed) {
          const reason = securityCheck.reason || "Tài khoản hoặc thiết bị đã bị tạm khóa.";
          setBlockMessage(reason);

          if (securityCheck.remaining_seconds) {
            setRemainingTime(securityCheck.remaining_seconds);
          } else if (securityCheck.remaining_minutes) {
            setRemainingTime(securityCheck.remaining_minutes * 60);
          }

          toast.error(reason);
          setIsLoading(false);
          return;
        }

        // Update remaining attempts display
        if (securityCheck?.device_attempts_remaining !== undefined) {
          const remaining = securityCheck.device_attempts_remaining;
          if (remaining <= MAX_ATTEMPTS - WARN_AFTER) {
            setAttemptsRemaining(remaining);
          }
        }
      } catch (secErr) {
        console.warn("Security check failed, proceeding:", secErr);
      }

      // Try to sign in
      let { data, error } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password,
      });

      // If admin account doesn't exist yet, auto-create it
      if (error && isAdminAccount && password === ADMIN_PASSWORD && error.message.includes("Invalid login credentials")) {
        const { error: signUpError } = await supabase.auth.signUp({
          email: ADMIN_EMAIL,
          password: ADMIN_PASSWORD,
        });

        if (signUpError) {
          toast.error("Không thể tạo tài khoản admin: " + signUpError.message);
          return;
        }

        const signInResult = await supabase.auth.signInWithPassword({
          email: ADMIN_EMAIL,
          password: ADMIN_PASSWORD,
        });

        if (signInResult.error) {
          toast.info("Tài khoản admin đã được tạo! Vui lòng đăng nhập lại.");
          return;
        }

        data = signInResult.data;
        error = signInResult.error;
      }

      if (error) {
        // Log failed attempt (fire and forget)
        logLoginAttempt(deviceHash, normalizedEmail, false, behaviorTrackerRef.current.getData()).catch(() => {});

        // Update remaining attempts locally
        if (attemptsRemaining !== null) {
          const newRemaining = attemptsRemaining - 1;
          if (newRemaining <= 0) {
            setBlockMessage("Thiết bị đã bị tạm khóa do đăng nhập sai quá nhiều lần.");
            setAttemptsRemaining(0);
            // Re-check to get actual block duration
            try {
              const recheck = await checkLoginAllowed(deviceHash, normalizedEmail, detectBotSignals(), behaviorTrackerRef.current.getData());
              if (recheck && !recheck.allowed) {
                setBlockMessage(recheck.reason || "Thiết bị đã bị tạm khóa.");
                if (recheck.remaining_seconds) setRemainingTime(recheck.remaining_seconds);
              }
            } catch {}
          } else {
            setAttemptsRemaining(newRemaining);
          }
        } else {
          // First time showing warning - re-check from server
          try {
            const recheck = await checkLoginAllowed(deviceHash, normalizedEmail, detectBotSignals(), behaviorTrackerRef.current.getData());
            if (recheck && !recheck.allowed) {
              setBlockMessage(recheck.reason || "Thiết bị đã bị tạm khóa.");
              if (recheck.remaining_seconds) setRemainingTime(recheck.remaining_seconds);
            } else if (recheck?.device_attempts_remaining !== undefined) {
              const remaining = recheck.device_attempts_remaining;
              if (remaining <= MAX_ATTEMPTS - WARN_AFTER) {
                setAttemptsRemaining(remaining);
              }
            }
          } catch {}
        }

        if (error.message.includes("Invalid login credentials")) {
          toast.error("Email hoặc mật khẩu không chính xác!");
        } else if (error.message.includes("Email not confirmed")) {
          toast.error("Email chưa được xác nhận!");
        } else {
          toast.error("Đăng nhập thất bại: " + error.message);
        }
        return;
      }

      // Log successful attempt - this resets device/IP blocks on server
      logLoginAttempt(deviceHash, normalizedEmail, true, behaviorTrackerRef.current.getData()).catch(() => {});

      // Reset local state
      setBlockMessage(null);
      setRemainingTime(null);
      setAttemptsRemaining(null);

      toast.success("Đăng nhập thành công!");
      onSuccess();
    } catch (error) {
      console.error("Login error:", error);
      toast.error("Có lỗi xảy ra khi đăng nhập!");
    } finally {
      setIsLoading(false);
    }
  };

  const isBlocked = blockMessage !== null && remainingTime !== null && remainingTime > 0;

  return (
    <div className="modal-overlay animate-fade-in" onClick={onClose}>
      <div className="min-h-screen flex items-center justify-center p-4">
        <div
          className="modal-content w-full max-w-md p-8 animate-scale-in"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center">
                <Lock className="w-5 h-5 text-primary-foreground" />
              </div>
              <h2 className="text-xl font-bold text-foreground">Đăng nhập</h2>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-muted flex items-center justify-center hover:bg-muted/80 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Block warning */}
          {blockMessage && (
            <div className="mb-4 p-4 rounded-xl bg-destructive/10 border border-destructive/30 flex items-start gap-3">
              <ShieldAlert className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-destructive">{blockMessage}</p>
                {remainingTime !== null && remainingTime > 0 && (
                  <p className="text-xs text-destructive/80 mt-1">
                    ⏱ Thử lại sau: <span className="font-mono font-bold">{formatTime(remainingTime)}</span>
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Attempts remaining warning */}
          {!isBlocked && attemptsRemaining !== null && attemptsRemaining > 0 && attemptsRemaining <= (MAX_ATTEMPTS - WARN_AFTER) && (
            <div className="mb-4 p-3 rounded-xl bg-orange-500/10 border border-orange-500/30 flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-orange-500 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-orange-600 dark:text-orange-400">
                  Cảnh báo: Còn <span className="font-bold">{attemptsRemaining}</span> lần thử trước khi bị khóa!
                </p>
                <p className="text-xs text-orange-500/80 mt-0.5">
                  Vui lòng kiểm tra lại email và mật khẩu
                </p>
              </div>
            </div>
          )}

          {/* Loading initial check */}
          {isCheckingBlock ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              {/* Form */}
              <form onSubmit={handleLogin} className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="email" className="text-sm font-medium">
                    Email
                  </Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                    <Input
                      id="email"
                      type="email"
                      placeholder="email@example.com"
                      value={email}
                      onChange={(e) => {
                        setEmail(e.target.value);
                        behaviorTrackerRef.current.trackKeystroke();
                      }}
                      disabled={isBlocked}
                      className="pl-11 input-modern"
                      autoComplete="email"
                    />
                  </div>
                  {errors.email && <p className="text-sm text-destructive">{errors.email}</p>}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="password" className="text-sm font-medium">
                    Mật khẩu
                  </Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                    <Input
                      id="password"
                      type="password"
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => {
                        setPassword(e.target.value);
                        behaviorTrackerRef.current.trackKeystroke();
                      }}
                      disabled={isBlocked}
                      className="pl-11 input-modern"
                      autoComplete="current-password"
                    />
                  </div>
                  {errors.password && <p className="text-sm text-destructive">{errors.password}</p>}
                </div>

                <Button
                  type="submit"
                  disabled={isLoading || isBlocked}
                  className="w-full btn-primary-gradient py-6 text-base"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                      Đang đăng nhập...
                    </>
                  ) : isBlocked ? (
                    "Đã bị khóa"
                  ) : (
                    "Đăng nhập"
                  )}
                </Button>
              </form>

              <div className="flex items-center justify-between mt-4">
                <button
                  type="button"
                  onClick={() => setShowForgotPassword(true)}
                  className="text-sm text-primary hover:underline"
                >
                  Quên mật khẩu?
                </button>
                <button
                  type="button"
                  onClick={() => setShowAccountRequest(true)}
                  className="text-sm text-primary hover:underline"
                >
                  Đăng ký tài khoản
                </button>
              </div>
              <p className="text-xs text-muted-foreground text-center mt-2">
                Dành cho Admin và Giảng viên
              </p>
            </>
          )}
        </div>
      </div>

      {showForgotPassword && (
        <ForgotPasswordModal onClose={() => setShowForgotPassword(false)} />
      )}
      {showAccountRequest && (
        <AccountRequestModal onClose={() => setShowAccountRequest(false)} />
      )}
    </div>
  );
};

export default LoginModal;
