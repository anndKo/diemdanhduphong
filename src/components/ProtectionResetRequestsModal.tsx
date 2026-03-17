import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { X, Loader2, ShieldCheck, ShieldOff, Clock, Mail, Phone, Trash2, RefreshCw } from "lucide-react";

interface ProtectionRequest {
  id: string;
  email: string;
  phone: string;
  device_hash: string;
  status: string;
  created_at: string;
}

interface ProtectionResetRequestsModalProps {
  onClose: () => void;
}

const ProtectionResetRequestsModal = ({ onClose }: ProtectionResetRequestsModalProps) => {
  const [requests, setRequests] = useState<ProtectionRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);

  useEffect(() => {
    fetchRequests();
  }, []);

  const fetchRequests = async () => {
    try {
      const { data, error } = await supabase
        .from("protection_password_requests" as any)
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setRequests((data as any[]) || []);
    } catch (error) {
      console.error("Fetch error:", error);
      toast.error("Không thể tải danh sách yêu cầu!");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDisableProtection = async (request: ProtectionRequest) => {
    setProcessingId(request.id);
    try {
      // Disable protection password for the target user by email
      const { data: result, error: rpcError } = await (supabase.rpc as any)(
        "admin_disable_protection_password",
        { target_email: request.email }
      );
      if (rpcError) throw rpcError;
      if (!result) {
        toast.error("Không tìm thấy tài khoản với email này!");
        setProcessingId(null);
        return;
      }

      // Clear device block
      await supabase
        .from("protection_password_attempts" as any)
        .delete()
        .eq("device_hash", request.device_hash);

      // Also clear device_blocks if any
      await supabase
        .from("device_blocks" as any)
        .delete()
        .eq("device_hash", request.device_hash);

      // Update request status
      await supabase
        .from("protection_password_requests" as any)
        .update({ status: "resolved", processed_at: new Date().toISOString() } as any)
        .eq("id", request.id);

      toast.success("Đã tắt mật khẩu bảo vệ cho người dùng!");
      fetchRequests();
    } catch (error) {
      console.error("Disable error:", error);
      toast.error("Có lỗi xảy ra!");
    } finally {
      setProcessingId(null);
    }
  };

  const handleDeleteRequest = async (id: string) => {
    try {
      const { error } = await supabase
        .from("protection_password_requests" as any)
        .delete()
        .eq("id", id);

      if (error) throw error;
      setRequests(requests.filter(r => r.id !== id));
      toast.success("Đã xóa yêu cầu!");
    } catch (error) {
      console.error("Delete error:", error);
      toast.error("Có lỗi xảy ra!");
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString("vi-VN", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const pendingRequests = requests.filter(r => r.status === "pending");
  const resolvedRequests = requests.filter(r => r.status === "resolved");

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-card rounded-2xl shadow-2xl w-full max-w-lg p-6 animate-scale-in max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-bold text-foreground">Cấp lại mật khẩu bảo vệ</h2>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={fetchRequests} className="w-8 h-8 rounded-full bg-muted flex items-center justify-center hover:bg-muted/80">
              <RefreshCw className="w-4 h-4" />
            </button>
            <button onClick={onClose} className="w-8 h-8 rounded-full bg-muted flex items-center justify-center hover:bg-muted/80">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : requests.length === 0 ? (
          <div className="text-center py-8">
            <ShieldCheck className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
            <p className="text-muted-foreground">Không có yêu cầu nào</p>
          </div>
        ) : (
          <div className="space-y-4">
            {pendingRequests.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-2">
                  <Clock className="w-4 h-4 text-yellow-500" />
                  Đang chờ xử lý ({pendingRequests.length})
                </h3>
                <div className="space-y-3">
                  {pendingRequests.map((req) => (
                    <div key={req.id} className="p-4 rounded-xl border bg-muted/30 space-y-3">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 text-sm">
                          <Mail className="w-4 h-4 text-muted-foreground" />
                          <span className="font-medium">{req.email}</span>
                        </div>
                        <div className="flex items-center gap-2 text-sm">
                          <Phone className="w-4 h-4 text-muted-foreground" />
                          <span>{req.phone}</span>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {formatDate(req.created_at)}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => handleDisableProtection(req)}
                          disabled={processingId === req.id}
                          className="flex-1"
                        >
                          {processingId === req.id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <>
                              <ShieldOff className="w-4 h-4 mr-1" />
                              Tắt MK bảo vệ
                            </>
                          )}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleDeleteRequest(req.id)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {resolvedRequests.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-muted-foreground mb-2">
                  Đã xử lý ({resolvedRequests.length})
                </h3>
                <div className="space-y-2">
                  {resolvedRequests.map((req) => (
                    <div key={req.id} className="p-3 rounded-xl border bg-muted/20 flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium">{req.email}</p>
                        <p className="text-xs text-muted-foreground">{formatDate(req.created_at)}</p>
                      </div>
                      <Button size="sm" variant="ghost" onClick={() => handleDeleteRequest(req.id)}>
                        <Trash2 className="w-4 h-4 text-muted-foreground" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default ProtectionResetRequestsModal;
