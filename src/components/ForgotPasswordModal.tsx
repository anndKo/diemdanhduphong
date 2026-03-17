import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { X, Mail, Phone, Loader2, KeyRound } from "lucide-react";
import { generateDeviceFingerprint } from "@/lib/fingerprint";

interface ForgotPasswordModalProps {
  onClose: () => void;
}

// Cache fingerprint
let cachedHash: string | null = null;

const ForgotPasswordModal = ({ onClose }: ForgotPasswordModalProps) => {
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [deviceHash, setDeviceHash] = useState(cachedHash || "");
  const [sent, setSent] = useState(false);

  useEffect(() => {
    if (cachedHash) {
      setDeviceHash(cachedHash);
      return;
    }
    generateDeviceFingerprint().then(({ hash }) => {
      cachedHash = hash;
      setDeviceHash(hash);
    }).catch(() => setDeviceHash("unknown"));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      toast.error("Vui lòng nhập email");
      return;
    }

    setIsLoading(true);
    try {
      const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
      const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

      const res = await fetch(`${SUPABASE_URL}/functions/v1/password-reset/submit-request`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: SUPABASE_KEY },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          phone: phone.trim() || null,
          device_hash: deviceHash || "unknown",
        }),
      });
      const data = await res.json();

      if (data.success) {
        setSent(true);
        toast.success("Yêu cầu đã được gửi! Admin sẽ xử lý sớm nhất.");
      } else {
        toast.error(data.reason || data.error || "Không thể gửi yêu cầu");
      }
    } catch {
      toast.error("Có lỗi xảy ra, vui lòng thử lại");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[60] bg-black/50 animate-fade-in flex items-center justify-center p-4"
      onClick={(e) => {
        e.stopPropagation();
        onClose();
      }}
    >
      <div
        className="modal-content w-full max-w-md p-8 animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center">
              <KeyRound className="w-5 h-5 text-primary-foreground" />
            </div>
            <h2 className="text-xl font-bold text-foreground">Quên mật khẩu</h2>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-muted flex items-center justify-center hover:bg-muted/80 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {sent ? (
          <div className="text-center py-8">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
              <Mail className="w-8 h-8 text-primary" />
            </div>
            <h3 className="text-lg font-semibold mb-2 text-foreground">Đã gửi yêu cầu!</h3>
            <p className="text-sm text-muted-foreground">
              Yêu cầu của bạn đã được gửi đến admin. Vui lòng chờ admin cấp lại mật khẩu mới.
            </p>
            <Button onClick={onClose} className="mt-6 btn-primary-gradient">
              Đóng
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            <p className="text-sm text-muted-foreground mb-4">
              Nhập email tài khoản và số điện thoại liên hệ. Yêu cầu sẽ được gửi đến admin để xử lý.
            </p>

            <div className="space-y-2">
              <Label htmlFor="forgot-email">
                Email tài khoản <span className="text-destructive">*</span>
              </Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                <Input
                  id="forgot-email"
                  type="email"
                  placeholder="email@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="pl-11 input-modern"
                  required
                  autoComplete="email"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="forgot-phone">Số điện thoại liên hệ</Label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                <Input
                  id="forgot-phone"
                  type="tel"
                  placeholder="0123456789"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="pl-11 input-modern"
                  autoComplete="tel"
                />
              </div>
            </div>

            <Button
              type="submit"
              disabled={isLoading}
              className="w-full btn-primary-gradient py-6 text-base"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                  Đang gửi...
                </>
              ) : (
                "Gửi yêu cầu"
              )}
            </Button>

            <p className="text-xs text-muted-foreground text-center">
              Mỗi thiết bị chỉ được gửi tối đa 3 yêu cầu
            </p>
          </form>
        )}
      </div>
    </div>
  );
};

export default ForgotPasswordModal;
