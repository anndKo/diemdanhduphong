import { useState, useEffect, useMemo, lazy, Suspense } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  X, Star, Loader2, Plus, Hash, Trash2, Search, UserPlus,
  Check, User, Users, Calendar, Clock, Award
} from "lucide-react";

const ManualBonusModal = lazy(() => import("./ManualBonusModal"));

interface ClassBonusPointsModalProps {
  onClose: () => void;
}

interface ClassItem {
  id: string;
  name: string;
  code: string;
}

interface BonusCode {
  id: string;
  bonus_code: string;
  status: string;
  used_by_student_name: string | null;
  used_by_student_id: string | null;
  used_by_group: string | null;
  created_at: string;
  used_at: string | null;
}

interface ManualHistory {
  id: string;
  student_name: string;
  student_id: string;
  week_number: number;
  bonus_point: number;
  content: string | null;
  created_at: string;
}

const ClassBonusPointsModal = ({ onClose }: ClassBonusPointsModalProps) => {
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [selectedClassId, setSelectedClassId] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [codes, setCodes] = useState<BonusCode[]>([]);
  const [isLoadingCodes, setIsLoadingCodes] = useState(false);
  const [codeCount, setCodeCount] = useState("5");
  const [isGenerating, setIsGenerating] = useState(false);
  const [deletingCodeId, setDeletingCodeId] = useState<string | null>(null);
  const [tab, setTab] = useState<"codes" | "history">("codes");
  const [manualHistory, setManualHistory] = useState<ManualHistory[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [showManualBonus, setShowManualBonus] = useState(false);

  useEffect(() => { fetchClasses(); }, []);

  useEffect(() => {
    if (selectedClassId) {
      fetchCodes();
      if (tab === "history") fetchHistory();
    }
  }, [selectedClassId]);

  useEffect(() => {
    if (tab === "history" && selectedClassId) fetchHistory();
  }, [tab]);

  const fetchClasses = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const { data, error } = await supabase
        .from("classes" as any)
        .select("id, name, code")
        .eq("created_by", session.user.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      const list = (data as any[]) || [];
      setClasses(list);
      if (list.length > 0) setSelectedClassId(list[0].id);
    } catch (e) { console.error(e); }
    finally { setIsLoading(false); }
  };

  const fetchCodes = async () => {
    setIsLoadingCodes(true);
    try {
      const { data, error } = await supabase
        .from("class_bonus_points" as any)
        .select("*")
        .eq("class_id", selectedClassId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      setCodes((data as any[]) || []);
    } catch (e) { console.error(e); }
    finally { setIsLoadingCodes(false); }
  };

  const fetchHistory = async () => {
    setIsLoadingHistory(true);
    try {
      const { data, error } = await supabase
        .from("manual_bonus_history" as any)
        .select("*")
        .eq("class_id", selectedClassId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      setManualHistory((data as any[]) || []);
    } catch (e) { console.error(e); }
    finally { setIsLoadingHistory(false); }
  };

  const generateCodes = async () => {
    const count = parseInt(codeCount);
    if (!count || count < 1 || count > 100) {
      toast.error("Số lượng mã từ 1 đến 100!");
      return;
    }
    setIsGenerating(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      
      const existingSet = new Set(codes.map(c => c.bonus_code));
      const newCodes: string[] = [];
      while (newCodes.length < count) {
        const code = String(Math.floor(100000 + Math.random() * 900000));
        if (!existingSet.has(code) && !newCodes.includes(code)) newCodes.push(code);
      }

      const { error } = await supabase
        .from("class_bonus_points" as any)
        .insert(newCodes.map(code => ({
          class_id: selectedClassId,
          bonus_code: code,
          created_by: session.user.id,
        })));
      if (error) throw error;
      toast.success(`Đã tạo ${count} mã điểm thưởng!`);
      fetchCodes();
    } catch (e) {
      console.error(e);
      toast.error("Không thể tạo mã!");
    } finally { setIsGenerating(false); }
  };

  const deleteCode = async (codeId: string) => {
    setDeletingCodeId(codeId);
    try {
      const { error } = await supabase
        .from("class_bonus_points" as any)
        .delete()
        .eq("id", codeId);
      if (error) throw error;
      setCodes(prev => prev.filter(c => c.id !== codeId));
      toast.success("Đã xóa mã!");
    } catch (e) {
      console.error(e);
      toast.error("Không thể xóa!");
    } finally { setDeletingCodeId(null); }
  };

  const deleteHistory = async (id: string) => {
    try {
      const { error } = await supabase
        .from("manual_bonus_history" as any)
        .delete()
        .eq("id", id);
      if (error) throw error;
      setManualHistory(prev => prev.filter(h => h.id !== id));
      toast.success("Đã xóa!");
    } catch (e) {
      console.error(e);
      toast.error("Không thể xóa!");
    }
  };

  const sortedCodes = useMemo(() => {
    let list = [...codes];
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(c =>
        c.bonus_code.includes(q) ||
        c.used_by_student_name?.toLowerCase().includes(q) ||
        c.used_by_student_id?.toLowerCase().includes(q)
      );
    }
    return list.sort((a, b) => {
      if (a.status === "unused" && b.status !== "unused") return -1;
      if (a.status !== "unused" && b.status === "unused") return 1;
      return 0;
    });
  }, [codes, searchQuery]);

  const filteredHistory = useMemo(() => {
    if (!searchQuery.trim()) return manualHistory;
    const q = searchQuery.toLowerCase();
    return manualHistory.filter(h =>
      h.student_name.toLowerCase().includes(q) ||
      h.student_id.toLowerCase().includes(q)
    );
  }, [manualHistory, searchQuery]);

  const usedCount = codes.filter(c => c.status === "used").length;
  const unusedCount = codes.filter(c => c.status === "unused").length;

  return (
    <>
      <div className="modal-overlay animate-fade-in" onClick={onClose}>
        <div className="min-h-screen flex items-center justify-center p-4">
          <div
            className="modal-content w-full max-w-lg p-6 animate-scale-in max-h-[90vh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between mb-4 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-amber-500/10 flex items-center justify-center">
                  <Star className="w-5 h-5 text-amber-500" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-foreground">Điểm Thưởng Trên Lớp</h2>
                  <p className="text-sm text-muted-foreground">Quản lý mã và cộng điểm thủ công</p>
                </div>
              </div>
              <button onClick={onClose} className="w-8 h-8 rounded-full bg-muted flex items-center justify-center hover:bg-muted/80">
                <X className="w-4 h-4" />
              </button>
            </div>

            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
              </div>
            ) : classes.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">Chưa có lớp nào</p>
            ) : (
              <div className="flex flex-col flex-1 min-h-0 space-y-3">
                {/* Class selector */}
                <div className="shrink-0">
                  <Label className="text-sm font-medium mb-1 block">Chọn lớp</Label>
                  <select
                    value={selectedClassId}
                    onChange={(e) => setSelectedClassId(e.target.value)}
                    className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                  >
                    {classes.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>

                {/* Tabs + Manual bonus button */}
                <div className="flex gap-2 shrink-0">
                  <div className="flex gap-1 p-1 bg-muted rounded-lg flex-1">
                    <button
                      onClick={() => setTab("codes")}
                      className={`flex-1 text-xs py-1.5 px-2 rounded-md font-medium transition-colors ${
                        tab === "codes"
                          ? "bg-background shadow-sm text-foreground"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      Mã thưởng
                    </button>
                    <button
                      onClick={() => setTab("history")}
                      className={`flex-1 text-xs py-1.5 px-2 rounded-md font-medium transition-colors ${
                        tab === "history"
                          ? "bg-background shadow-sm text-foreground"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      Cộng thủ công
                    </button>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1 shrink-0"
                    onClick={() => setShowManualBonus(true)}
                  >
                    <UserPlus className="w-4 h-4" />
                    <span className="hidden sm:inline">Chọn SV</span>
                  </Button>
                </div>

                {/* Search */}
                <div className="relative shrink-0">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Tìm theo mã, tên, MSV..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9"
                  />
                </div>

                {tab === "codes" ? (
                  <>
                    {/* Generate codes */}
                    <div className="flex gap-2 items-end shrink-0">
                      <div className="flex-1">
                        <Label className="text-xs font-medium mb-1 block">Số lượng mã</Label>
                        <Input
                          type="number"
                          value={codeCount}
                          onChange={(e) => setCodeCount(e.target.value)}
                          min={1}
                          max={100}
                          placeholder="Số lượng"
                        />
                      </div>
                      <Button
                        onClick={generateCodes}
                        disabled={isGenerating}
                        className="btn-primary-gradient shrink-0"
                      >
                        {isGenerating ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <><Plus className="w-4 h-4 mr-1" />Tạo mã</>
                        )}
                      </Button>
                    </div>

                    {/* Stats */}
                    <div className="flex gap-2 shrink-0">
                      <div className="flex-1 p-2 bg-muted/50 rounded-lg text-center">
                        <p className="text-lg font-bold text-foreground">{codes.length}</p>
                        <p className="text-xs text-muted-foreground">Tổng mã</p>
                      </div>
                      <div className="flex-1 p-2 bg-amber-500/10 rounded-lg text-center">
                        <p className="text-lg font-bold text-amber-600">{unusedCount}</p>
                        <p className="text-xs text-muted-foreground">Chưa dùng</p>
                      </div>
                      <div className="flex-1 p-2 bg-green-500/10 rounded-lg text-center">
                        <p className="text-lg font-bold text-green-600">{usedCount}</p>
                        <p className="text-xs text-muted-foreground">Đã dùng</p>
                      </div>
                    </div>

                    {/* Codes list */}
                    {isLoadingCodes ? (
                      <div className="flex items-center justify-center py-8">
                        <Loader2 className="w-6 h-6 animate-spin text-primary" />
                      </div>
                    ) : sortedCodes.length === 0 ? (
                      <p className="text-center text-muted-foreground py-6 text-sm">
                        {codes.length === 0 ? "Chưa có mã nào. Tạo mã mới!" : "Không tìm thấy"}
                      </p>
                    ) : (
                      <div className="flex-1 min-h-0 border rounded-xl overflow-y-auto">
                        <div className="divide-y">
                          {sortedCodes.map((c) => (
                            <div
                              key={c.id}
                              className={`p-3 transition-colors ${
                                c.status === "used"
                                  ? "bg-green-500/5 hover:bg-green-500/10"
                                  : "hover:bg-muted/30"
                              }`}
                            >
                              <div className="flex items-center justify-between mb-1">
                                <div className="flex items-center gap-2">
                                  <Hash className="w-4 h-4 text-primary shrink-0" />
                                  <span className="font-mono font-bold text-lg tracking-widest">{c.bonus_code}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                                    c.status === "used"
                                      ? "bg-green-500/10 text-green-600"
                                      : "bg-amber-500/10 text-amber-600"
                                  }`}>
                                    {c.status === "used" ? (
                                      <span className="flex items-center gap-1"><Check className="w-3 h-3" />Đã dùng</span>
                                    ) : "Chưa dùng"}
                                  </span>
                                  {c.status === "unused" && (
                                    <button
                                      onClick={() => deleteCode(c.id)}
                                      disabled={deletingCodeId === c.id}
                                      className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-destructive/10 transition-colors"
                                    >
                                      {deletingCodeId === c.id ? (
                                        <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
                                      ) : (
                                        <Trash2 className="w-3.5 h-3.5 text-destructive" />
                                      )}
                                    </button>
                                  )}
                                </div>
                              </div>
                              {c.status === "used" && c.used_by_student_name && (
                                <div className="mt-2 p-2 bg-muted/50 rounded-lg space-y-0.5 text-xs text-muted-foreground">
                                  <div className="flex items-center gap-1.5">
                                    <User className="w-3 h-3" />
                                    <span>{c.used_by_student_name}</span>
                                  </div>
                                  <div className="flex items-center gap-1.5">
                                    <Hash className="w-3 h-3" />
                                    <span>MSV: {c.used_by_student_id}</span>
                                  </div>
                                  <div className="flex items-center gap-1.5">
                                    <Users className="w-3 h-3" />
                                    <span>Nhóm {c.used_by_group}</span>
                                  </div>
                                  {c.used_at && (
                                    <div className="flex items-center gap-1.5">
                                      <Clock className="w-3 h-3" />
                                      <span>{new Date(c.used_at).toLocaleString("vi-VN")}</span>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  /* Manual bonus history tab */
                  <>
                    {isLoadingHistory ? (
                      <div className="flex items-center justify-center py-8">
                        <Loader2 className="w-6 h-6 animate-spin text-primary" />
                      </div>
                    ) : filteredHistory.length === 0 ? (
                      <p className="text-center text-muted-foreground py-6 text-sm">
                        Chưa có lịch sử cộng điểm thủ công
                      </p>
                    ) : (
                      <div className="flex-1 min-h-0 border rounded-xl overflow-y-auto">
                        <div className="divide-y">
                          {filteredHistory.map((h) => (
                            <div key={h.id} className="p-3 hover:bg-muted/30 transition-colors">
                              <div className="flex items-center justify-between mb-1">
                                <div className="flex items-center gap-2">
                                  <Award className="w-4 h-4 text-amber-500" />
                                  <span className="font-medium text-sm">{h.student_name}</span>
                                  <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-amber-500/10 text-amber-600">
                                    +{h.bonus_point} điểm
                                  </span>
                                </div>
                                <button
                                  onClick={() => deleteHistory(h.id)}
                                  className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-destructive/10 transition-colors"
                                >
                                  <Trash2 className="w-3.5 h-3.5 text-destructive" />
                                </button>
                              </div>
                              <div className="text-xs text-muted-foreground space-y-0.5">
                                <div className="flex items-center gap-1.5">
                                  <Hash className="w-3 h-3" /><span>MSV: {h.student_id}</span>
                                </div>
                                <div className="flex items-center gap-1.5">
                                  <Calendar className="w-3 h-3" /><span>Tuần {h.week_number}</span>
                                </div>
                                {h.content && (
                                  <div className="flex items-center gap-1.5">
                                    <Star className="w-3 h-3" /><span>{h.content}</span>
                                  </div>
                                )}
                                <div className="flex items-center gap-1.5">
                                  <Clock className="w-3 h-3" />
                                  <span>{new Date(h.created_at).toLocaleString("vi-VN")}</span>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {!isLoadingHistory && filteredHistory.length > 0 && (
                      <p className="text-center text-xs text-muted-foreground shrink-0">
                        {filteredHistory.length} bản ghi • Tổng {filteredHistory.reduce((s, h) => s + h.bonus_point, 0)} điểm
                      </p>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {showManualBonus && (
        <Suspense fallback={null}>
          <ManualBonusModal
            onClose={() => {
              setShowManualBonus(false);
              if (tab === "history") fetchHistory();
            }}
          />
        </Suspense>
      )}
    </>
  );
};

export default ClassBonusPointsModal;
