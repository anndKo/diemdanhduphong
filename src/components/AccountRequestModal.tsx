import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { X, Mail, Phone, Loader2, UserPlus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { generateDeviceFingerprint, detectBotSignals } from "@/lib/fingerprint";
import { motion } from "framer-motion";

interface AccountRequestModalProps {
  onClose: () => void;
}

let cachedHash: string | null = null;

const MAX_REQUESTS_PER_DEVICE = 2;

const AccountRequestModal = ({ onClose }: AccountRequestModalProps) => {
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [deviceHash, setDeviceHash] = useState(cachedHash || "");

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
    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail) {
      toast.error("Vui lòng nhập email");
      return;
    }
    if (!phone.trim()) {
      toast.error("Vui lòng nhập số điện thoại liên hệ");
      return;
    }

    setIsLoading(true);
    try {
      // Check device + IP limit via edge function
      const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
      const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      const botSignals = detectBotSignals();

      const res = await fetch(`${SUPABASE_URL}/functions/v1/security-check/check-account-request`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: SUPABASE_KEY },
        body: JSON.stringify({
          device_hash: deviceHash || "unknown",
          email: trimmedEmail,
          phone: phone.trim(),
          bot_signals: botSignals,
        }),
      });
      const data = await res.json();

      if (!data.allowed) {
        toast.error(data.reason || "Không thể gửi yêu cầu");
        return;
      }

      setSent(true);
      toast.success("Yêu cầu đã được gửi! Admin sẽ xem xét sớm nhất.");
    } catch {
      toast.error("Có lỗi xảy ra, vui lòng thử lại");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[60] bg-black/50 animate-fade-in flex items-center justify-center p-4"
      onClick={(e) => { e.stopPropagation(); onClose(); }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="modal-content w-full max-w-md p-8"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center">
              <UserPlus className="w-5 h-5 text-primary-foreground" />
            </div>
            <h2 className="text-xl font-bold text-foreground">Đăng ký tài khoản</h2>
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
              <UserPlus className="w-8 h-8 text-primary" />
            </div>
            <h3 className="text-lg font-semibold mb-2 text-foreground">Đã gửi yêu cầu!</h3>
            <p className="text-sm text-muted-foreground">
              Yêu cầu đăng ký của bạn đã được gửi đến admin. Vui lòng chờ admin tạo tài khoản cho bạn.
            </p>
            <Button onClick={onClose} className="mt-6 btn-primary-gradient">
              Đóng
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            <p className="text-sm text-muted-foreground mb-4">
              Nhập email và số điện thoại liên hệ. Admin sẽ tạo tài khoản và thông báo cho bạn.
            </p>

            <div className="space-y-2">
              <Label htmlFor="req-email">
                Email <span className="text-destructive">*</span>
              </Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                <Input
                  id="req-email"
                  type="email"
                  placeholder="email@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="pl-11 input-modern"
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="req-phone">
                Số điện thoại <span className="text-destructive">*</span>
              </Label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                <Input
                  id="req-phone"
                  type="tel"
                  placeholder="0123456789"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="pl-11 input-modern"
                  required
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
                "Gửi yêu cầu đăng ký"
              )}
            </Button>

            <p className="text-xs text-muted-foreground text-center">
              Mỗi thiết bị chỉ được gửi tối đa {MAX_REQUESTS_PER_DEVICE} yêu cầu
            </p>
          </form>
        )}
      </motion.div>
    </div>
  );
};

export default AccountRequestModal;
