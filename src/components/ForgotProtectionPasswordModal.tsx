import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { X, Loader2, ShieldAlert, ArrowLeft, CheckCircle } from "lucide-react";
import { z } from "zod";

const requestSchema = z.object({
  email: z.string().email("Email không hợp lệ"),
  password: z.string().min(1, "Vui lòng nhập mật khẩu tài khoản"),
  phone: z.string().min(8, "Số điện thoại không hợp lệ").max(15),
});

interface ForgotProtectionPasswordModalProps {
  deviceHash: string;
  onClose: () => void;
  onBack: () => void;
}

const ForgotProtectionPasswordModal = ({ deviceHash, onClose, onBack }: ForgotProtectionPasswordModalProps) => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [emailError, setEmailError] = useState("");

  const handleSubmit = async () => {
    const result = requestSchema.safeParse({ email, password, phone });
    if (!result.success) {
      toast.error(result.error.errors[0].message);
      return;
    }

    setIsLoading(true);
    setEmailError("");
    try {
      // Verify credentials by signing in
      const { error: authError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (authError) {
        if (authError.message.includes("Invalid login credentials")) {
          setEmailError("Email hoặc mật khẩu không đúng!");
          toast.error("Email hoặc mật khẩu không đúng!");
        } else {
          toast.error(authError.message);
        }
        setIsLoading(false);
        return;
      }

      // Sign out immediately - this is just verification
      await supabase.auth.signOut();

      // Check if already has a pending request from this device
      const { data: existingRequests } = await supabase
        .from("protection_password_requests" as any)
        .select("id")
        .eq("device_hash", deviceHash)
        .eq("status", "pending");

      if (existingRequests && (existingRequests as any[]).length > 0) {
        toast.error("Thiết bị này đã có yêu cầu đang chờ xử lý!");
        setIsLoading(false);
        return;
      }

      // Submit request
      const { error } = await supabase
        .from("protection_password_requests" as any)
        .insert({
          email: email.trim(),
          phone: phone.trim(),
          device_hash: deviceHash,
          status: "pending",
        } as any);

      if (error) throw error;

      setIsSubmitted(true);
      toast.success("Yêu cầu đã được gửi cho admin!");
    } catch (error: any) {
      console.error("Submit error:", error);
      toast.error(error?.message || "Có lỗi xảy ra!");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-card rounded-2xl shadow-2xl w-full max-w-sm p-6 animate-scale-in">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <button onClick={onBack} className="w-8 h-8 rounded-full bg-muted flex items-center justify-center hover:bg-muted/80">
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div className="flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-destructive" />
              <h2 className="text-lg font-bold text-foreground">Quên mật khẩu bảo mật</h2>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-muted flex items-center justify-center hover:bg-muted/80">
            <X className="w-4 h-4" />
          </button>
        </div>

        {isSubmitted ? (
          <div className="text-center space-y-4 py-4">
            <CheckCircle className="w-16 h-16 text-green-500 mx-auto" />
            <h3 className="text-lg font-semibold">Đã gửi yêu cầu!</h3>
            <p className="text-sm text-muted-foreground">
              Yêu cầu của bạn đã được gửi đến admin. Vui lòng chờ admin xử lý.
            </p>
            <Button variant="outline" onClick={onClose} className="w-full">
              Đóng
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground text-center">
              Xác minh danh tính để gửi yêu cầu cấp lại mật khẩu bảo mật
            </p>

            <div className="space-y-3">
              <div>
                <label className="text-sm font-medium text-foreground mb-1 block">Email tài khoản</label>
                <Input
                  type="email"
                  placeholder="email@example.com"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); setEmailError(""); }}
                  className={`input-modern ${emailError ? "border-destructive" : ""}`}
                />
                {emailError && (
                  <p className="text-xs text-destructive mt-1">{emailError}</p>
                )}
              </div>
              <div>
                <label className="text-sm font-medium text-foreground mb-1 block">Mật khẩu tài khoản</label>
                <Input
                  type="password"
                  placeholder="Nhập mật khẩu"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="input-modern"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-foreground mb-1 block">Số điện thoại</label>
                <Input
                  type="tel"
                  placeholder="0912345678"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="input-modern"
                />
              </div>
            </div>

            <Button
              onClick={handleSubmit}
              disabled={isLoading || !email || !password || !phone}
              className="w-full btn-primary-gradient"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Đang xác minh...
                </>
              ) : (
                "Gửi yêu cầu"
              )}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};

export default ForgotProtectionPasswordModal;
