import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { X, Loader2, ShieldCheck, Eye, EyeOff, AlertTriangle, KeyRound } from "lucide-react";
import { z } from "zod";
import { generateDeviceFingerprint } from "@/lib/fingerprint";
import ForgotProtectionPasswordModal from "@/components/ForgotProtectionPasswordModal";

const pinSchema = z.string().length(6, "Mật khẩu phải có 6 chữ số").regex(/^\d+$/, "Chỉ được nhập số");

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

const MAX_ATTEMPTS = 5;

interface ProtectionPasswordModalProps {
  onClose: () => void;
  onVerified: () => void;
}

async function callProtectionAPI(action: string, body: Record<string, unknown>) {
  const response = await fetch(
    `${SUPABASE_URL}/functions/v1/protection-check/${action}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_KEY,
      },
      body: JSON.stringify(body),
    }
  );
  return response.json();
}

const ProtectionPasswordModal = ({ onClose, onVerified }: ProtectionPasswordModalProps) => {
  const [pin, setPin] = useState(["", "", "", "", "", ""]);
  const [isLoading, setIsLoading] = useState(false);
  const [showPin, setShowPin] = useState(false);
  const [deviceHash, setDeviceHash] = useState("");
  const [remainingAttempts, setRemainingAttempts] = useState(MAX_ATTEMPTS);
  const [isBlocked, setIsBlocked] = useState(false);
  const [blockTimeRemaining, setBlockTimeRemaining] = useState("");
  const [blockedUntilTimestamp, setBlockedUntilTimestamp] = useState<number | null>(null);
  const [isPermanent, setIsPermanent] = useState(false);
  const [showForgotModal, setShowForgotModal] = useState(false);

  useEffect(() => {
    initDevice();
  }, []);

  useEffect(() => {
    if (!blockedUntilTimestamp) return;
    const interval = setInterval(() => {
      const remaining = blockedUntilTimestamp - Date.now();
      if (remaining <= 0) {
        setIsBlocked(false);
        setBlockedUntilTimestamp(null);
        setRemainingAttempts(MAX_ATTEMPTS);
        clearInterval(interval);
        // Re-check status from server
        if (deviceHash) checkStatus(deviceHash);
        return;
      }
      const mins = Math.floor(remaining / 60000);
      const secs = Math.floor((remaining % 60000) / 1000);
      setBlockTimeRemaining(`${mins}:${secs.toString().padStart(2, "0")}`);
    }, 1000);
    return () => clearInterval(interval);
  }, [blockedUntilTimestamp, deviceHash]);

  const initDevice = async () => {
    try {
      const { hash } = await generateDeviceFingerprint();
      setDeviceHash(hash);
      await checkStatus(hash);
    } catch (e) {
      console.error("Fingerprint error:", e);
    }
  };

  const checkStatus = async (hash: string) => {
    try {
      const result = await callProtectionAPI("check-status", { device_hash: hash });
      if (result.blocked) {
        setIsBlocked(true);
        setIsPermanent(!!result.permanent);
        setRemainingAttempts(0);
        if (result.remaining_seconds) {
          setBlockedUntilTimestamp(Date.now() + result.remaining_seconds * 1000);
        }
      } else {
        setIsBlocked(false);
        setRemainingAttempts(result.remaining_attempts ?? MAX_ATTEMPTS);
      }
    } catch (e) {
      console.error("Check status error:", e);
    }
  };

  const handlePinChange = (index: number, value: string) => {
    if (value.length > 1) {
      const digits = value.replace(/\D/g, "").slice(0, 6).split("");
      const newPin = [...pin];
      digits.forEach((digit, i) => {
        if (index + i < 6) newPin[index + i] = digit;
      });
      setPin(newPin);
      const nextIndex = Math.min(index + digits.length, 5);
      document.getElementById(`pin-${nextIndex}`)?.focus();
      return;
    }
    if (!/^\d*$/.test(value)) return;
    const newPin = [...pin];
    newPin[index] = value;
    setPin(newPin);
    if (value && index < 5) document.getElementById(`pin-${index + 1}`)?.focus();
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === "Backspace" && !pin[index] && index > 0) {
      document.getElementById(`pin-${index - 1}`)?.focus();
    }
  };

  const handleVerify = async () => {
    if (isBlocked) return;
    const pinString = pin.join("");
    const result = pinSchema.safeParse(pinString);
    if (!result.success) {
      toast.error(result.error.errors[0].message);
      return;
    }

    setIsLoading(true);
    try {
      const response = await callProtectionAPI("verify", {
        device_hash: deviceHash,
        password: pinString,
      });

      if (response.success) {
        toast.success("Xác thực thành công!");
        onVerified();
      } else if (response.blocked) {
        setIsBlocked(true);
        setIsPermanent(!!response.permanent);
        setRemainingAttempts(0);
        if (response.remaining_seconds) {
          setBlockedUntilTimestamp(Date.now() + response.remaining_seconds * 1000);
        }
        toast.error(response.reason || "Thiết bị đã bị khóa!");
      } else {
        setRemainingAttempts(response.remaining_attempts ?? 0);
        toast.error(response.reason || "Mật khẩu không đúng!");
      }
      setPin(["", "", "", "", "", ""]);
      document.getElementById("pin-0")?.focus();
    } catch (error) {
      console.error("Verify error:", error);
      toast.error("Có lỗi xảy ra!");
    } finally {
      setIsLoading(false);
    }
  };

  if (showForgotModal) {
    return (
      <ForgotProtectionPasswordModal
        deviceHash={deviceHash}
        onClose={() => setShowForgotModal(false)}
        onBack={() => setShowForgotModal(false)}
      />
    );
  }

  const isPinComplete = pin.every((d) => d !== "");

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-card rounded-2xl shadow-2xl w-full max-w-sm p-6 animate-scale-in">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <ShieldCheck className="w-5 h-5 text-primary" />
            </div>
            <h2 className="text-lg font-bold text-foreground">Mật khẩu bảo vệ</h2>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-muted flex items-center justify-center hover:bg-muted/80"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {isBlocked ? (
          <div className="space-y-4">
            <div className="p-4 rounded-xl bg-destructive/10 border border-destructive/20">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle className="w-5 h-5 text-destructive" />
                <p className="font-semibold text-destructive">
                  {isPermanent ? "Thiết bị bị khóa vĩnh viễn" : "Thiết bị đã bị khóa"}
                </p>
              </div>
              <p className="text-sm text-muted-foreground">
                {isPermanent
                  ? "Thiết bị của bạn đã bị khóa vĩnh viễn do nhập sai mật khẩu bảo vệ quá nhiều lần. Kể cả đổi trình duyệt hay dùng ẩn danh cũng bị phát hiện."
                  : `Bạn đã nhập sai mật khẩu bảo vệ quá ${MAX_ATTEMPTS} lần. Thiết bị bị khóa nghiêm ngặt, kể cả đổi trình duyệt hay dùng ẩn danh cũng bị phát hiện qua địa chỉ mạng.`}
              </p>
              {blockTimeRemaining && !isPermanent && (
                <p className="text-lg font-bold text-destructive mt-2 text-center">
                  Còn lại: {blockTimeRemaining}
                </p>
              )}
            </div>
            <Button
              variant="outline"
              onClick={() => setShowForgotModal(true)}
              className="w-full"
            >
              <KeyRound className="w-4 h-4 mr-2" />
              Quên mật khẩu bảo mật
            </Button>
          </div>
        ) : (
          <>
            <p className="text-sm text-muted-foreground mb-4 text-center">
              Nhập mật khẩu 6 chữ số để truy cập trang quản trị
            </p>

            {remainingAttempts < MAX_ATTEMPTS && remainingAttempts > 0 && (
              <div className="p-3 rounded-xl bg-yellow-500/10 border border-yellow-500/20 mb-4">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-yellow-600" />
                  <p className="text-sm font-medium text-yellow-700 dark:text-yellow-400">
                    Còn {remainingAttempts} lượt thử. Nếu hết lượt, thiết bị sẽ bị khóa nghiêm ngặt (kể cả đổi trình duyệt/ẩn danh).
                  </p>
                </div>
              </div>
            )}

            <div className="flex justify-center gap-2 mb-4">
              {pin.map((digit, index) => (
                <input
                  key={index}
                  id={`pin-${index}`}
                  type={showPin ? "text" : "password"}
                  inputMode="numeric"
                  maxLength={6}
                  value={digit}
                  onChange={(e) => handlePinChange(index, e.target.value)}
                  onKeyDown={(e) => handleKeyDown(index, e)}
                  className="w-11 h-14 text-center text-2xl font-bold border-2 rounded-xl bg-background focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                  autoFocus={index === 0}
                />
              ))}
            </div>

            <button
              type="button"
              onClick={() => setShowPin(!showPin)}
              className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mx-auto mb-4"
            >
              {showPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              {showPin ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
            </button>

            <Button
              onClick={handleVerify}
              disabled={!isPinComplete || isLoading}
              className="w-full btn-primary-gradient mb-3"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Đang xác thực...
                </>
              ) : (
                "Xác nhận"
              )}
            </Button>

            <button
              type="button"
              onClick={() => setShowForgotModal(true)}
              className="w-full text-sm text-muted-foreground hover:text-primary transition-colors text-center"
            >
              Quên mật khẩu bảo mật?
            </button>
          </>
        )}
      </div>
    </div>
  );
};

export default ProtectionPasswordModal;
