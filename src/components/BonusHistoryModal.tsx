import { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { X, Search, Loader2, History, Trash2, Star } from "lucide-react";

interface BonusHistoryModalProps {
  onClose: () => void;
}

interface ClassItem {
  id: string;
  name: string;
}

interface HistoryRecord {
  id: string;
  class_id: string;
  student_name: string;
  student_code: string;
  group_number: string | null;
  week_number: number;
  bonus_points: number;
  reason: string | null;
  created_at: string;
}

const BonusHistoryModal = ({ onClose }: BonusHistoryModalProps) => {
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [selectedClassId, setSelectedClassId] = useState("all");
  const [records, setRecords] = useState<HistoryRecord[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [weekFilter, setWeekFilter] = useState("all");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchClasses();
    fetchHistory();
  }, []);

  useEffect(() => {
    fetchHistory();
  }, [selectedClassId]);

  const fetchClasses = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const { data } = await supabase
        .from("classes" as any)
        .select("id, name")
        .eq("created_by", session.user.id)
        .order("created_at", { ascending: false });
      setClasses((data as any[]) || []);
    } catch (error) {
      console.error("Error:", error);
    }
  };

  const fetchHistory = async () => {
    setIsLoading(true);
    try {
      let query = supabase
        .from("bonus_points_history" as any)
        .select("*")
        .order("created_at", { ascending: false });

      if (selectedClassId !== "all") {
        query = query.eq("class_id", selectedClassId);
      }

      const { data, error } = await query;
      if (error) throw error;
      setRecords((data as any[]) || []);
    } catch (error) {
      console.error("Error:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const deleteRecord = async (id: string) => {
    try {
      const { error } = await supabase
        .from("bonus_points_history" as any)
        .delete()
        .eq("id", id);
      if (error) throw error;
      setRecords((prev) => prev.filter((r) => r.id !== id));
      toast.success("Đã xóa!");
    } catch (error) {
      console.error("Error:", error);
      toast.error("Không thể xóa!");
    }
  };

  const weeks = useMemo(() => {
    const set = new Set(records.map((r) => r.week_number));
    return Array.from(set).sort((a, b) => a - b);
  }, [records]);

  const filtered = useMemo(() => {
    let list = records;
    if (weekFilter !== "all") {
      list = list.filter((r) => r.week_number === parseInt(weekFilter));
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (r) => r.student_name.toLowerCase().includes(q) || r.student_code.toLowerCase().includes(q)
      );
    }
    return list;
  }, [records, weekFilter, searchQuery]);

  const getClassName = (classId: string) => {
    return classes.find((c) => c.id === classId)?.name || "—";
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString("vi-VN", {
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  };

  return (
    <div className="modal-overlay animate-fade-in" onClick={onClose}>
      <div className="min-h-screen flex items-center justify-center p-4">
        <div
          className="modal-content w-full max-w-2xl p-6 animate-scale-in max-h-[90vh] flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between mb-4 shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-emerald-500/10 flex items-center justify-center">
                <History className="w-5 h-5 text-emerald-500" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-foreground">Lịch Sử Điểm Cộng</h2>
                <p className="text-sm text-muted-foreground">Xem và quản lý lịch sử cộng điểm thủ công</p>
              </div>
            </div>
            <button onClick={onClose} className="w-8 h-8 rounded-full bg-muted flex items-center justify-center hover:bg-muted/80">
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Filters */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-3 shrink-0">
            <select
              value={selectedClassId}
              onChange={(e) => setSelectedClassId(e.target.value)}
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="all">Tất cả lớp</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <select
              value={weekFilter}
              onChange={(e) => setWeekFilter(e.target.value)}
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="all">Tất cả tuần</option>
              {weeks.map((w) => (
                <option key={w} value={w}>Tuần {w}</option>
              ))}
            </select>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Tìm SV..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>

          {/* Records */}
          <div className="flex-1 min-h-0 overflow-y-auto border rounded-xl">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
              </div>
            ) : filtered.length === 0 ? (
              <p className="text-center text-muted-foreground py-12 text-sm">Chưa có lịch sử cộng điểm</p>
            ) : (
              <div className="divide-y">
                {filtered.map((r) => (
                  <div key={r.id} className="flex items-start gap-3 p-3 hover:bg-muted/30 transition-colors">
                    <div className="w-9 h-9 rounded-lg bg-amber-500/10 flex items-center justify-center shrink-0 mt-0.5">
                      <Star className="w-4 h-4 text-amber-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm">{r.student_name}</span>
                        <span className="text-xs text-muted-foreground">MSV: {r.student_code}</span>
                        {r.group_number && (
                          <span className="text-xs text-muted-foreground">• Nhóm {r.group_number}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        <span className="px-1.5 py-0.5 bg-primary/10 text-primary rounded text-xs font-medium">
                          +{r.bonus_points} điểm
                        </span>
                        <span className="text-xs text-muted-foreground">Tuần {r.week_number}</span>
                        <span className="text-xs text-muted-foreground">• {getClassName(r.class_id)}</span>
                      </div>
                      {r.reason && (
                        <p className="text-xs text-muted-foreground mt-0.5 italic">"{r.reason}"</p>
                      )}
                      <p className="text-xs text-muted-foreground mt-0.5">{formatDate(r.created_at)}</p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0"
                      onClick={() => deleteRecord(r.id)}
                    >
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Summary */}
          {!isLoading && filtered.length > 0 && (
            <div className="mt-3 text-center text-xs text-muted-foreground shrink-0">
              {filtered.length} bản ghi • Tổng {filtered.reduce((s, r) => s + r.bonus_points, 0)} điểm
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default BonusHistoryModal;
