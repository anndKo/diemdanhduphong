import { useState, useEffect, lazy, Suspense } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { X, Star, Loader2, Plus, Clock, User, Hash, Users, Calendar, Trash2, History, Search, UserPlus, Award } from "lucide-react";

const SelectStudentBonusModal = lazy(() => import("./SelectStudentBonusModal"));

interface BonusManagementModalProps {
  onClose: () => void;
}

interface ClassItem {
  id: string;
  name: string;
  code: string;
}

interface RewardCode {
  id: string;
  code: string;
  is_used: boolean;
  used_by_student_name: string | null;
  used_by_student_code: string | null;
  used_by_group: string | null;
  used_week: number | null;
  used_at: string | null;
  created_at: string;
}

interface BonusAttempt {
  id: string;
  student_name: string;
  student_code: string;
  group_number: string | null;
  week_number: number | null;
  entered_code: string;
  is_valid: boolean;
  created_at: string;
}

interface BonusHistory {
  id: string;
  student_name: string;
  student_code: string;
  group_number: string | null;
  week_number: number;
  bonus_points: number;
  reason: string | null;
  created_by: string;
  created_at: string;
}

const BonusManagementModal = ({ onClose }: BonusManagementModalProps) => {
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [selectedClassId, setSelectedClassId] = useState("");
  const [isEnabled, setIsEnabled] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [codes, setCodes] = useState<RewardCode[]>([]);
  const [isLoadingCodes, setIsLoadingCodes] = useState(false);
  const [codeCount, setCodeCount] = useState("5");
  const [isGenerating, setIsGenerating] = useState(false);
  const [isTogglingEnabled, setIsTogglingEnabled] = useState(false);
  const [deletingCodeId, setDeletingCodeId] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [attempts, setAttempts] = useState<BonusAttempt[]>([]);
  const [bonusHistory, setBonusHistory] = useState<BonusHistory[]>([]);
  const [isLoadingAttempts, setIsLoadingAttempts] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [showSelectStudent, setShowSelectStudent] = useState(false);
  const [historyTab, setHistoryTab] = useState<"codes" | "manual">("codes");

  useEffect(() => { fetchClasses(); }, []);

  useEffect(() => {
    if (selectedClassId) {
      fetchBonusSettings();
      fetchCodes();
      if (showHistory) fetchHistoryData();
    }
  }, [selectedClassId]);

  useEffect(() => {
    if (showHistory && selectedClassId) fetchHistoryData();
  }, [showHistory, historyTab]);

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

  const fetchBonusSettings = async () => {
    try {
      const { data, error } = await supabase
        .from("class_bonus_settings" as any)
        .select("is_enabled")
        .eq("class_id", selectedClassId)
        .maybeSingle();
      if (error) throw error;
      setIsEnabled((data as any)?.is_enabled === true);
    } catch { setIsEnabled(false); }
  };

  const fetchCodes = async () => {
    setIsLoadingCodes(true);
    try {
      const { data, error } = await supabase
        .from("bonus_reward_codes" as any)
        .select("*")
        .eq("class_id", selectedClassId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      setCodes((data as any[]) || []);
    } catch (e) { console.error(e); }
    finally { setIsLoadingCodes(false); }
  };

  const toggleEnabled = async (val: boolean) => {
    setIsTogglingEnabled(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const { error } = await supabase
        .from("class_bonus_settings" as any)
        .upsert({ class_id: selectedClassId, is_enabled: val }, { onConflict: "class_id" });
      if (error) throw error;
      setIsEnabled(val);
      toast.success(val ? "Đã bật điểm thưởng" : "Đã tắt điểm thưởng");
    } catch (e) {
      console.error(e);
      toast.error("Không thể cập nhật!");
    } finally { setIsTogglingEnabled(false); }
  };

  const generateCodes = async () => {
    const count = parseInt(codeCount);
    if (!count || count < 1 || count > 100) { toast.error("Số lượng mã từ 1 đến 100!"); return; }
    setIsGenerating(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const { data: existingData } = await supabase
        .from("bonus_reward_codes" as any)
        .select("code")
        .eq("class_id", selectedClassId);
      const existingSet = new Set((existingData as any[] || []).map((c: any) => c.code));
      const newCodes: string[] = [];
      while (newCodes.length < count) {
        const code = String(Math.floor(1000 + Math.random() * 9000));
        if (!existingSet.has(code) && !newCodes.includes(code)) newCodes.push(code);
      }
      const { error } = await supabase
        .from("bonus_reward_codes" as any)
        .insert(newCodes.map(code => ({ class_id: selectedClassId, code, created_by: session.user.id })));
      if (error) throw error;
      toast.success(`Đã tạo ${count} mã điểm thưởng!`);
      fetchCodes();
    } catch (e) { console.error(e); toast.error("Không thể tạo mã!"); }
    finally { setIsGenerating(false); }
  };

  const deleteCode = async (codeId: string) => {
    setDeletingCodeId(codeId);
    try {
      const { error } = await supabase.from("bonus_reward_codes" as any).delete().eq("id", codeId);
      if (error) throw error;
      setCodes(prev => prev.filter(c => c.id !== codeId));
      toast.success("Đã xóa mã điểm thưởng!");
    } catch (e) { console.error(e); toast.error("Không thể xóa mã!"); }
    finally { setDeletingCodeId(null); }
  };

  const fetchHistoryData = async () => {
    setIsLoadingAttempts(true);
    try {
      if (historyTab === "codes") {
        const { data, error } = await supabase
          .from("bonus_code_attempts" as any)
          .select("*")
          .eq("class_id", selectedClassId)
          .order("created_at", { ascending: false });
        if (error) throw error;
        setAttempts((data as any[]) || []);
      } else {
        const { data, error } = await supabase
          .from("bonus_points_history" as any)
          .select("*")
          .eq("class_id", selectedClassId)
          .order("created_at", { ascending: false });
        if (error) throw error;
        setBonusHistory((data as any[]) || []);
      }
    } catch (e) { console.error(e); }
    finally { setIsLoadingAttempts(false); }
  };

  const filteredAttempts = attempts.filter(a => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return a.student_name.toLowerCase().includes(q) || a.student_code.toLowerCase().includes(q) || a.entered_code.includes(q);
  });

  const filteredHistory = bonusHistory.filter(h => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return h.student_name.toLowerCase().includes(q) || h.student_code.toLowerCase().includes(q);
  });

  return (
    <>
      <div className="modal-overlay animate-fade-in" onClick={onClose}>
        <div className="min-h-screen flex items-center justify-center p-4">
          <div className="modal-content w-full max-w-lg p-6 animate-scale-in max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className="flex items-center justify-between mb-4 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-amber-500/10 flex items-center justify-center">
                  <Star className="w-5 h-5 text-amber-500" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-foreground">
                    {showHistory ? "Lịch Sử Điểm Thưởng" : "Quản Lý Điểm Thưởng"}
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    {showHistory ? "Xem lịch sử cộng điểm thưởng" : "Tạo và quản lý mã điểm thưởng"}
                  </p>
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

                {/* Action buttons */}
                <div className="flex gap-2 shrink-0">
                  <Button
                    variant={showHistory ? "default" : "outline"}
                    className="flex-1 gap-2"
                    onClick={() => setShowHistory(!showHistory)}
                  >
                    <History className="w-4 h-4" />
                    {showHistory ? "Quản lý mã" : "Lịch sử"}
                  </Button>
                  <Button
                    variant="outline"
                    className="flex-1 gap-2"
                    onClick={() => setShowSelectStudent(true)}
                  >
                    <UserPlus className="w-4 h-4" />
                    Chọn sinh viên
                  </Button>
                </div>

                {showHistory ? (
                  /* History View */
                  <div className="flex-1 min-h-0 flex flex-col gap-2">
                    {/* History tabs */}
                    <div className="flex gap-1 p-1 bg-muted rounded-lg shrink-0">
                      <button
                        onClick={() => setHistoryTab("codes")}
                        className={`flex-1 text-xs py-1.5 px-2 rounded-md font-medium transition-colors ${historyTab === "codes" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                      >
                        Nhập mã thưởng
                      </button>
                      <button
                        onClick={() => setHistoryTab("manual")}
                        className={`flex-1 text-xs py-1.5 px-2 rounded-md font-medium transition-colors ${historyTab === "manual" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                      >
                        Cộng thủ công
                      </button>
                    </div>

                    <div className="relative shrink-0">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        placeholder="Tìm theo tên, MSV hoặc mã..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-9"
                      />
                    </div>

                    {isLoadingAttempts ? (
                      <div className="flex items-center justify-center py-8">
                        <Loader2 className="w-6 h-6 animate-spin text-primary" />
                      </div>
                    ) : historyTab === "codes" ? (
                      /* Code attempts history */
                      filteredAttempts.length === 0 ? (
                        <p className="text-center text-muted-foreground py-6 text-sm">Chưa có lịch sử</p>
                      ) : (
                        <>
                          <ScrollArea className="h-[300px] border rounded-xl">
                            <div className="divide-y">
                              {filteredAttempts.map((a) => (
                                <div key={a.id} className="p-3 hover:bg-muted/30 transition-colors">
                                  <div className="flex items-center gap-2 mb-1">
                                    <span className="font-mono font-bold text-base">{a.entered_code}</span>
                                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${a.is_valid ? "bg-green-500/10 text-green-600" : "bg-destructive/10 text-destructive"}`}>
                                      {a.is_valid ? "Hợp lệ" : "Sai mã"}
                                    </span>
                                  </div>
                                  <div className="text-xs text-muted-foreground space-y-0.5">
                                    <div className="flex items-center gap-1.5"><User className="w-3 h-3" /><span>{a.student_name} • MSV: {a.student_code}</span></div>
                                    <div className="flex items-center gap-1.5"><Users className="w-3 h-3" /><span>Nhóm {a.group_number} • Tuần {a.week_number}</span></div>
                                    <div className="flex items-center gap-1.5"><Clock className="w-3 h-3" /><span>{new Date(a.created_at).toLocaleString("vi-VN")}</span></div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </ScrollArea>
                          <p className="text-center text-xs text-muted-foreground shrink-0">
                            {filteredAttempts.length} lượt nhập • {filteredAttempts.filter(a => a.is_valid).length} hợp lệ • {filteredAttempts.filter(a => !a.is_valid).length} sai
                          </p>
                        </>
                      )
                    ) : (
                      /* Manual bonus history */
                      filteredHistory.length === 0 ? (
                        <p className="text-center text-muted-foreground py-6 text-sm">Chưa có lịch sử cộng điểm thủ công</p>
                      ) : (
                        <ScrollArea className="h-[300px] border rounded-xl">
                          <div className="divide-y">
                            {filteredHistory.map((h) => (
                              <div key={h.id} className="p-3 hover:bg-muted/30 transition-colors">
                                <div className="flex items-center gap-2 mb-1">
                                  <Award className="w-4 h-4 text-amber-500" />
                                  <span className="font-medium text-sm">{h.student_name}</span>
                                  <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-amber-500/10 text-amber-600">
                                    +{h.bonus_points} điểm
                                  </span>
                                </div>
                                <div className="text-xs text-muted-foreground space-y-0.5">
                                  <div className="flex items-center gap-1.5"><Hash className="w-3 h-3" /><span>MSV: {h.student_code} • Nhóm {h.group_number}</span></div>
                                  <div className="flex items-center gap-1.5"><Calendar className="w-3 h-3" /><span>Tuần {h.week_number}</span></div>
                                  {h.reason && (
                                    <div className="flex items-center gap-1.5"><Star className="w-3 h-3" /><span>{h.reason}</span></div>
                                  )}
                                  <div className="flex items-center gap-1.5"><Clock className="w-3 h-3" /><span>{new Date(h.created_at).toLocaleString("vi-VN")}</span></div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </ScrollArea>
                      )
                    )}
                  </div>
                ) : (
                  /* Management View */
                  <>
                    <div className="flex items-center justify-between p-3 bg-muted/50 rounded-xl shrink-0">
                      <Label className="text-sm font-medium flex items-center gap-2 cursor-pointer">
                        <Star className="w-4 h-4 text-amber-500" />
                        Bật điểm thưởng cho lớp này
                      </Label>
                      <Switch checked={isEnabled} onCheckedChange={toggleEnabled} disabled={isTogglingEnabled} />
                    </div>

                    {isEnabled && (
                      <>
                        <div className="flex gap-2 items-end shrink-0">
                          <div className="flex-1">
                            <Label className="text-sm font-medium mb-1 block">Số lượng mã muốn tạo</Label>
                            <Input type="number" value={codeCount} onChange={(e) => setCodeCount(e.target.value)} min={1} max={100} placeholder="Nhập số lượng" />
                          </div>
                          <Button onClick={generateCodes} disabled={isGenerating} className="btn-primary-gradient shrink-0">
                            {isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Plus className="w-4 h-4 mr-1" />Tạo mã</>}
                          </Button>
                        </div>

                        <div className="flex-1 min-h-0">
                          <Label className="text-sm font-medium mb-2 block">Danh sách mã ({codes.length})</Label>
                          {isLoadingCodes ? (
                            <div className="flex items-center justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
                          ) : codes.length === 0 ? (
                            <p className="text-center text-muted-foreground py-6 text-sm">Chưa có mã nào</p>
                          ) : (
                            <ScrollArea className="h-[300px] border rounded-xl">
                              <div className="divide-y">
                                {codes.map((c) => (
                                  <div key={c.id} className="p-3 hover:bg-muted/30 transition-colors">
                                    <div className="flex items-center justify-between mb-1">
                                      <span className="font-mono font-bold text-lg tracking-widest">{c.code}</span>
                                      <div className="flex items-center gap-2">
                                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${c.is_used ? "bg-green-500/10 text-green-600" : "bg-amber-500/10 text-amber-600"}`}>
                                          {c.is_used ? "Đã sử dụng" : "Chưa sử dụng"}
                                        </span>
                                        {!c.is_used && (
                                          <button onClick={() => deleteCode(c.id)} disabled={deletingCodeId === c.id} className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-destructive/10 transition-colors">
                                            {deletingCodeId === c.id ? <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" /> : <Trash2 className="w-3.5 h-3.5 text-destructive" />}
                                          </button>
                                        )}
                                      </div>
                                    </div>
                                    {c.is_used && (
                                      <div className="mt-2 p-2 bg-muted/50 rounded-lg space-y-1 text-xs text-muted-foreground">
                                        <div className="flex items-center gap-1.5"><User className="w-3 h-3" /><span>{c.used_by_student_name}</span></div>
                                        <div className="flex items-center gap-1.5"><Hash className="w-3 h-3" /><span>MSV: {c.used_by_student_code}</span></div>
                                        <div className="flex items-center gap-1.5"><Users className="w-3 h-3" /><span>Nhóm {c.used_by_group}</span></div>
                                        <div className="flex items-center gap-1.5"><Calendar className="w-3 h-3" /><span>Tuần {c.used_week}</span></div>
                                        <div className="flex items-center gap-1.5"><Clock className="w-3 h-3" /><span>{c.used_at ? new Date(c.used_at).toLocaleString("vi-VN") : ""}</span></div>
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </ScrollArea>
                          )}
                        </div>
                      </>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Select Student Modal */}
      {showSelectStudent && (
        <Suspense fallback={null}>
          <SelectStudentBonusModal onClose={() => setShowSelectStudent(false)} />
        </Suspense>
      )}
    </>
  );
};

export default BonusManagementModal;
