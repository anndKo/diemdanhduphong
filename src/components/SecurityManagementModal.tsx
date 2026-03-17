import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { X, Loader2, Shield, ShieldOff, Search, Trash2, BarChart3, Monitor, AlertTriangle, Clock, User } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { motion } from "framer-motion";

type Tab = "blocks" | "reports" | "stats";

interface DeviceBlock {
  id: string;
  device_hash: string;
  block_count: number;
  blocked_until: string | null;
  is_permanent: boolean;
  reason: string | null;
  created_at: string;
  updated_at: string;
}

interface SecurityLog {
  id: string;
  device_hash: string | null;
  ip_address: string | null;
  action: string;
  details: any;
  risk_score: number | null;
  created_at: string;
}

interface SecurityManagementModalProps {
  onClose: () => void;
}

const SecurityManagementModal = ({ onClose }: SecurityManagementModalProps) => {
  const [tab, setTab] = useState<Tab>("blocks");
  const [blocks, setBlocks] = useState<DeviceBlock[]>([]);
  const [logs, setLogs] = useState<SecurityLog[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    if (tab === "blocks") fetchBlocks();
    else if (tab === "reports") fetchLogs();
    else fetchStats();
  }, [tab]);

  const fetchBlocks = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from("device_blocks" as any)
        .select("*")
        .order("updated_at", { ascending: false });
      if (error) throw error;
      setBlocks((data as any[]) || []);
    } catch (err) {
      console.error(err);
      toast.error("Không thể tải dữ liệu!");
    } finally {
      setIsLoading(false);
    }
  };

  const fetchLogs = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from("security_logs" as any)
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      setLogs((data as any[]) || []);
    } catch (err) {
      console.error(err);
      toast.error("Không thể tải dữ liệu!");
    } finally {
      setIsLoading(false);
    }
  };

  const fetchStats = async () => {
    setIsLoading(true);
    try {
      const [blocksRes, logsRes, attemptsRes, fingerprintsRes] = await Promise.all([
        supabase.from("device_blocks" as any).select("*", { count: "exact", head: true }),
        supabase.from("security_logs" as any).select("*", { count: "exact", head: true }),
        supabase.from("login_attempts" as any).select("*", { count: "exact", head: true }).eq("success", false),
        supabase.from("device_fingerprints" as any).select("*", { count: "exact", head: true }),
      ]);
      
      // Get recent high-risk logs
      const { data: highRiskLogs } = await supabase
        .from("security_logs" as any)
        .select("*")
        .gte("risk_score", 50)
        .order("created_at", { ascending: false })
        .limit(5);

      // Try to match device hashes with attendance records for student names
      const deviceHashes = (highRiskLogs as any[] || []).map(l => l.device_hash).filter(Boolean);
      let studentMap: Record<string, string> = {};
      
      if (deviceHashes.length > 0) {
        // Check bug_reports for device hashes, then cross-reference with attendance
        const { data: fingerprints } = await supabase
          .from("device_fingerprints" as any)
          .select("device_hash, user_id")
          .in("device_hash", deviceHashes);
        
        if (fingerprints && fingerprints.length > 0) {
          const userIds = (fingerprints as any[]).map(f => f.user_id);
          const { data: profiles } = await supabase
            .from("profiles" as any)
            .select("user_id, full_name, email")
            .in("user_id", userIds);
          
          if (profiles) {
            const userMap: Record<string, string> = {};
            (profiles as any[]).forEach(p => {
              userMap[p.user_id] = p.full_name || p.email || "Unknown";
            });
            (fingerprints as any[]).forEach(f => {
              if (userMap[f.user_id]) {
                studentMap[f.device_hash] = userMap[f.user_id];
              }
            });
          }
        }
      }

      setStats({
        totalBlocks: blocksRes.count || 0,
        totalLogs: logsRes.count || 0,
        totalFailedAttempts: attemptsRes.count || 0,
        totalDevices: fingerprintsRes.count || 0,
        highRiskLogs: (highRiskLogs as any[] || []).map(l => ({
          ...l,
          student_name: studentMap[l.device_hash] || null,
        })),
      });
    } catch (err) {
      console.error(err);
      toast.error("Không thể tải thống kê!");
    } finally {
      setIsLoading(false);
    }
  };

  const handleUnblock = async (deviceHash: string) => {
    if (!confirm("Bỏ chặn thiết bị này?")) return;
    try {
      const { error } = await supabase
        .from("device_blocks" as any)
        .delete()
        .eq("device_hash", deviceHash);
      if (error) throw error;
      setBlocks(prev => prev.filter(b => b.device_hash !== deviceHash));
      toast.success("Đã bỏ chặn thiết bị!");
    } catch {
      toast.error("Không thể bỏ chặn!");
    }
  };

  const filteredBlocks = blocks.filter(b =>
    b.device_hash.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (b.reason || "").toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredLogs = logs.filter(l =>
    (l.device_hash || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
    l.action.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (l.ip_address || "").toLowerCase().includes(searchQuery.toLowerCase())
  );

  const tabs: { key: Tab; label: string; icon: any }[] = [
    { key: "blocks", label: "Thiết bị chặn", icon: ShieldOff },
    { key: "reports", label: "Nhật ký bảo mật", icon: AlertTriangle },
    { key: "stats", label: "Thống kê", icon: BarChart3 },
  ];

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-card rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 md:p-5 border-b">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Shield className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 className="font-semibold text-foreground text-lg">Quản lí bảo mật</h2>
              <p className="text-xs text-muted-foreground">Quản lý thiết bị và giám sát bảo mật</p>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="w-5 h-5" />
          </Button>
        </div>

        {/* Tabs */}
        <div className="flex border-b px-4">
          {tabs.map(t => (
            <button
              key={t.key}
              onClick={() => { setTab(t.key); setSearchQuery(""); }}
              className={`flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                tab === t.key
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <t.icon className="w-4 h-4" />
              <span className="hidden sm:inline">{t.label}</span>
            </button>
          ))}
        </div>

        {/* Search */}
        {tab !== "stats" && (
          <div className="px-4 pt-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Tìm kiếm..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="pl-9 h-9"
              />
            </div>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : tab === "blocks" ? (
            filteredBlocks.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">Không có thiết bị nào bị chặn</p>
            ) : (
              <div className="space-y-2">
                {filteredBlocks.map(block => (
                  <div key={block.id} className="border rounded-xl p-3 flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <Monitor className="w-4 h-4 text-muted-foreground shrink-0" />
                        <code className="text-xs truncate">{block.device_hash.slice(0, 16)}...</code>
                        {block.is_permanent && (
                          <span className="text-xs bg-destructive/10 text-destructive px-1.5 py-0.5 rounded">Vĩnh viễn</span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">{block.reason || "Không rõ lí do"}</p>
                      <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                        <span>Lần chặn: {block.block_count}</span>
                        {block.blocked_until && !block.is_permanent && (
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {new Date(block.blocked_until).toLocaleString("vi-VN")}
                          </span>
                        )}
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleUnblock(block.device_hash)}
                      className="shrink-0"
                    >
                      <ShieldOff className="w-4 h-4 mr-1" />
                      Bỏ chặn
                    </Button>
                  </div>
                ))}
              </div>
            )
          ) : tab === "reports" ? (
            filteredLogs.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">Không có nhật ký nào</p>
            ) : (
              <div className="space-y-2">
                {filteredLogs.map(log => (
                  <div key={log.id} className="border rounded-xl p-3">
                    <div className="flex items-center justify-between mb-1">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded ${
                        (log.risk_score || 0) >= 50 
                          ? "bg-destructive/10 text-destructive" 
                          : (log.risk_score || 0) >= 20 
                            ? "bg-yellow-500/10 text-yellow-600" 
                            : "bg-green-500/10 text-green-600"
                      }`}>
                        Risk: {log.risk_score || 0}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {new Date(log.created_at).toLocaleString("vi-VN")}
                      </span>
                    </div>
                    <p className="text-sm font-medium">{log.action}</p>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                      {log.device_hash && <code>{log.device_hash.slice(0, 12)}...</code>}
                      {log.ip_address && <span>IP: {log.ip_address}</span>}
                    </div>
                    {log.details && typeof log.details === 'object' && (log.details as any).email && (
                      <p className="text-xs text-muted-foreground mt-1">Email: {(log.details as any).email}</p>
                    )}
                  </div>
                ))}
              </div>
            )
          ) : stats ? (
            <div className="space-y-4">
              {/* Stats cards */}
              <div className="grid grid-cols-2 gap-3">
                <div className="border rounded-xl p-4 text-center">
                  <ShieldOff className="w-6 h-6 mx-auto text-destructive mb-2" />
                  <p className="text-2xl font-bold">{stats.totalBlocks}</p>
                  <p className="text-xs text-muted-foreground">Thiết bị bị chặn</p>
                </div>
                <div className="border rounded-xl p-4 text-center">
                  <AlertTriangle className="w-6 h-6 mx-auto text-yellow-500 mb-2" />
                  <p className="text-2xl font-bold">{stats.totalFailedAttempts}</p>
                  <p className="text-xs text-muted-foreground">Đăng nhập thất bại</p>
                </div>
                <div className="border rounded-xl p-4 text-center">
                  <Monitor className="w-6 h-6 mx-auto text-primary mb-2" />
                  <p className="text-2xl font-bold">{stats.totalDevices}</p>
                  <p className="text-xs text-muted-foreground">Thiết bị đã đăng ký</p>
                </div>
                <div className="border rounded-xl p-4 text-center">
                  <BarChart3 className="w-6 h-6 mx-auto text-green-500 mb-2" />
                  <p className="text-2xl font-bold">{stats.totalLogs}</p>
                  <p className="text-xs text-muted-foreground">Tổng nhật ký</p>
                </div>
              </div>

              {/* High risk events */}
              {stats.highRiskLogs.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-destructive" />
                    Sự kiện nguy cơ cao gần đây
                  </h3>
                  <div className="space-y-2">
                    {stats.highRiskLogs.map((log: any) => (
                      <div key={log.id} className="border border-destructive/20 rounded-xl p-3 bg-destructive/5">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-medium text-destructive">Risk: {log.risk_score}</span>
                          <span className="text-xs text-muted-foreground">
                            {new Date(log.created_at).toLocaleString("vi-VN")}
                          </span>
                        </div>
                        <p className="text-sm font-medium">{log.action}</p>
                        {log.student_name && (
                          <p className="text-xs text-primary flex items-center gap-1 mt-1">
                            <User className="w-3 h-3" />
                            {log.student_name}
                          </p>
                        )}
                        <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                          {log.device_hash && <code>{log.device_hash.slice(0, 12)}...</code>}
                          {log.ip_address && <span>IP: {log.ip_address}</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : null}
        </div>
      </motion.div>
    </div>
  );
};

export default SecurityManagementModal;
