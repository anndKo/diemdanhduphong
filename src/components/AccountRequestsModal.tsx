import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { X, Loader2, UserPlus, Mail, Phone, Clock, CheckCircle, XCircle } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface AccountRequestsModalProps {
  onClose: () => void;
}

interface AccountRequest {
  id: string;
  email: string;
  phone: string | null;
  device_hash: string;
  ip_address: string | null;
  status: string;
  admin_note: string | null;
  created_at: string;
  resolved_at: string | null;
}

const AccountRequestsModal = ({ onClose }: AccountRequestsModalProps) => {
  const [requests, setRequests] = useState<AccountRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchRequests();
  }, []);

  const fetchRequests = async () => {
    try {
      const { data, error } = await supabase
        .from("account_requests" as any)
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setRequests((data as any[]) || []);
    } catch (error) {
      console.error("Error fetching account requests:", error);
      toast.error("Không thể tải danh sách yêu cầu");
    } finally {
      setIsLoading(false);
    }
  };

  const handleResolve = async (id: string, status: "approved" | "rejected") => {
    try {
      const { error } = await supabase
        .from("account_requests" as any)
        .update({
          status,
          resolved_at: new Date().toISOString(),
        } as any)
        .eq("id", id);

      if (error) throw error;
      toast.success(status === "approved" ? "Đã duyệt yêu cầu" : "Đã từ chối yêu cầu");
      fetchRequests();
    } catch (error) {
      console.error("Error resolving request:", error);
      toast.error("Có lỗi xảy ra");
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });
  };

  const statusBadge = (status: string) => {
    switch (status) {
      case "pending":
        return <span className="px-2 py-0.5 text-xs rounded-full bg-orange-500/10 text-orange-500 border border-orange-500/30">Chờ xử lý</span>;
      case "approved":
        return <span className="px-2 py-0.5 text-xs rounded-full bg-green-500/10 text-green-500 border border-green-500/30">Đã duyệt</span>;
      case "rejected":
        return <span className="px-2 py-0.5 text-xs rounded-full bg-destructive/10 text-destructive border border-destructive/30">Từ chối</span>;
      default:
        return null;
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-card rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 md:p-5 border-b">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <UserPlus className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 className="font-semibold text-foreground">Yêu cầu đăng ký tài khoản</h2>
              <p className="text-xs text-muted-foreground">{requests.length} yêu cầu</p>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="w-5 h-5" />
          </Button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 md:p-5">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : requests.length === 0 ? (
            <div className="text-center py-12">
              <UserPlus className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
              <p className="text-muted-foreground">Chưa có yêu cầu nào</p>
            </div>
          ) : (
            <div className="space-y-3">
              <AnimatePresence>
                {requests.map((req) => (
                  <motion.div
                    key={req.id}
                    initial={{ opacity: 0, y: -5 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="p-4 rounded-xl bg-secondary/30 border border-border/50 space-y-2"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="space-y-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Mail className="w-4 h-4 text-muted-foreground shrink-0" />
                          <span className="text-sm font-medium truncate">{req.email}</span>
                          {statusBadge(req.status)}
                        </div>
                        {req.phone && (
                          <div className="flex items-center gap-2">
                            <Phone className="w-4 h-4 text-muted-foreground shrink-0" />
                            <span className="text-sm text-muted-foreground">{req.phone}</span>
                          </div>
                        )}
                        <div className="flex items-center gap-2">
                          <Clock className="w-4 h-4 text-muted-foreground shrink-0" />
                          <span className="text-xs text-muted-foreground">{formatDate(req.created_at)}</span>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Device: {req.device_hash?.slice(0, 12)}... | IP: {req.ip_address || "N/A"}
                        </div>
                      </div>

                      {req.status === "pending" && (
                        <div className="flex gap-1 shrink-0">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 text-green-600 border-green-600/30 hover:bg-green-500/10"
                            onClick={() => handleResolve(req.id, "approved")}
                          >
                            <CheckCircle className="w-4 h-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 text-destructive border-destructive/30 hover:bg-destructive/10"
                            onClick={() => handleResolve(req.id, "rejected")}
                          >
                            <XCircle className="w-4 h-4" />
                          </Button>
                        </div>
                      )}
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
};

export default AccountRequestsModal;
