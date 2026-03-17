import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { X, Search, Loader2, KeyRound, Check, Clock, Eye, EyeOff } from "lucide-react";

interface ResetRequest {
  id: string;
  email: string;
  phone: string | null;
  status: string;
  created_at: string;
  resolved_at: string | null;
}

interface PasswordResetRequestsModalProps {
  onClose: () => void;
}

const PasswordResetRequestsModal = ({ onClose }: PasswordResetRequestsModalProps) => {
  const [requests, setRequests] = useState<ResetRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedRequest, setSelectedRequest] = useState<ResetRequest | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isResetting, setIsResetting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const fetchRequests = async (searchQuery = "") => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
      const res = await fetch(`${SUPABASE_URL}/functions/v1/password-reset/list-requests`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ search: searchQuery }),
      });
      const result = await res.json();
      if (result.data) {
        setRequests(result.data);
      }
    } catch {
      toast.error("Không thể tải danh sách yêu cầu");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRequests();
  }, []);

  const handleSearch = () => {
    fetchRequests(search);
  };

  const handleResetPassword = async () => {
    if (!selectedRequest) return;
    if (!newPassword || newPassword.length < 6) {
      toast.error("Mật khẩu phải có ít nhất 6 ký tự");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("Mật khẩu nhập lại không khớp");
      return;
    }

    setIsResetting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
      const res = await fetch(`${SUPABASE_URL}/functions/v1/password-reset/reset-password`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          request_id: selectedRequest.id,
          email: selectedRequest.email,
          new_password: newPassword,
        }),
      });
      const result = await res.json();

      if (result.success) {
        toast.success(`Đã đặt lại mật khẩu cho ${selectedRequest.email}`);
        setSelectedRequest(null);
        setNewPassword("");
        setConfirmPassword("");
        fetchRequests(search);
      } else {
        toast.error(result.error || "Không thể đặt lại mật khẩu");
      }
    } catch {
      toast.error("Có lỗi xảy ra");
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <div className="modal-overlay animate-fade-in" onClick={onClose}>
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="modal-content w-full max-w-lg p-6 animate-scale-in max-h-[90vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center">
                <KeyRound className="w-5 h-5 text-primary-foreground" />
              </div>
              <h2 className="text-lg font-bold text-foreground">Cấp lại mật khẩu</h2>
            </div>
            <button onClick={onClose} className="w-8 h-8 rounded-full bg-muted flex items-center justify-center hover:bg-muted/80">
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Search */}
          <div className="flex gap-2 mb-4">
            <Input
              placeholder="Tìm theo email hoặc SĐT..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input-modern"
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            />
            <Button onClick={handleSearch} variant="outline" size="icon">
              <Search className="w-4 h-4" />
            </Button>
          </div>

          {/* Selected request - Reset form */}
          {selectedRequest && (
            <div className="mb-4 p-4 rounded-xl border bg-muted/30 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-sm">{selectedRequest.email}</p>
                  {selectedRequest.phone && <p className="text-xs text-muted-foreground">SĐT: {selectedRequest.phone}</p>}
                </div>
                <Button variant="ghost" size="sm" onClick={() => setSelectedRequest(null)}>
                  <X className="w-4 h-4" />
                </Button>
              </div>
              <div className="space-y-2">
                <Label className="text-xs">Mật khẩu mới</Label>
                <div className="relative">
                  <Input
                    type={showPassword ? "text" : "password"}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Nhập mật khẩu mới"
                    className="input-modern pr-10"
                    minLength={6}
                  />
                  <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-xs">Nhập lại mật khẩu</Label>
                <Input
                  type={showPassword ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Nhập lại mật khẩu"
                  className="input-modern"
                />
              </div>
              <Button onClick={handleResetPassword} disabled={isResetting} className="w-full btn-primary-gradient" size="sm">
                {isResetting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <KeyRound className="w-4 h-4 mr-2" />}
                Đặt lại mật khẩu
              </Button>
            </div>
          )}

          {/* List */}
          <div className="flex-1 overflow-y-auto space-y-2">
            {loading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
              </div>
            ) : requests.length === 0 ? (
              <p className="text-center text-muted-foreground text-sm py-8">Không có yêu cầu nào</p>
            ) : (
              requests.map((req) => (
                <div
                  key={req.id}
                  className={`p-3 rounded-xl border cursor-pointer hover:bg-muted/30 transition-colors ${
                    req.status === "resolved" ? "opacity-60" : ""
                  } ${selectedRequest?.id === req.id ? "border-primary bg-primary/5" : ""}`}
                  onClick={() => req.status === "pending" && setSelectedRequest(req)}
                >
                  <div className="flex items-center justify-between">
                    <div className="min-w-0">
                      <p className="font-medium text-sm truncate">{req.email}</p>
                      {req.phone && <p className="text-xs text-muted-foreground">SĐT: {req.phone}</p>}
                      <p className="text-xs text-muted-foreground mt-1">
                        {new Date(req.created_at).toLocaleString("vi-VN")}
                      </p>
                    </div>
                    <div className="shrink-0 ml-2">
                      {req.status === "pending" ? (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-600 bg-amber-100 dark:bg-amber-900/30 px-2 py-1 rounded-full">
                          <Clock className="w-3 h-3" /> Chờ xử lý
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-green-600 bg-green-100 dark:bg-green-900/30 px-2 py-1 rounded-full">
                          <Check className="w-3 h-3" /> Đã xử lý
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PasswordResetRequestsModal;
