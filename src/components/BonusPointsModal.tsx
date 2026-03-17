import { useState, useEffect, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { X, Star, Loader2, Plus, Trash2, Check, Hash, UserPlus, History } from "lucide-react";
import SelectStudentBonusModal from "./SelectStudentBonusModal";
import BonusHistoryModal from "./BonusHistoryModal";

interface BonusPointsModalProps {
  onClose: () => void;
}

interface ClassItem {
  id: string;
  name: string;
  code: string;
  bonus_points_enabled?: boolean;
}

interface BonusCode {
  id: string;
  code: string;
  status: string;
  used_by_name: string | null;
  used_by_code: string | null;
  used_by_group: string | null;
  week_number: number | null;
  created_at: string;
  used_at: string | null;
}

const BonusPointsModal = ({ onClose }: BonusPointsModalProps) => {
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<string>("");
  const [bonusEnabled, setBonusEnabled] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [codes, setCodes] = useState<BonusCode[]>([]);
  const [codeCount, setCodeCount] = useState("4");
  const [isGenerating, setIsGenerating] = useState(false);
  const [showSelectStudent, setShowSelectStudent] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    fetchClasses();
  }, []);

  useEffect(() => {
    if (selectedClassId) {
      fetchBonusStatus();
      fetchCodes();
    }
  }, [selectedClassId]);

  const fetchClasses = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const { data, error } = await supabase
        .from("classes" as any)
        .select("id, name, code, bonus_points_enabled")
        .eq("created_by", session.user.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      const classList = (data as any[]) || [];
      setClasses(classList);
      if (classList.length > 0) setSelectedClassId(classList[0].id);
    } catch (error) {
      console.error("Error fetching classes:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchBonusStatus = async () => {
    try {
      const { data, error } = await supabase
        .from("classes" as any)
        .select("bonus_points_enabled")
        .eq("id", selectedClassId)
        .single();
      if (error) throw error;
      setBonusEnabled((data as any)?.bonus_points_enabled === true);
    } catch (error) {
      console.error("Error:", error);
    }
  };

  const fetchCodes = async () => {
    try {
      const { data, error } = await supabase
        .from("bonus_codes" as any)
        .select("*")
        .eq("class_id", selectedClassId)
        .order("status", { ascending: true })
        .order("created_at", { ascending: false });
      if (error) throw error;
      setCodes((data as any[]) || []);
    } catch (error) {
      console.error("Error:", error);
    }
  };

  const toggleBonusEnabled = async (enabled: boolean) => {
    setBonusEnabled(enabled);
    try {
      const { error } = await supabase
        .from("classes" as any)
        .update({ bonus_points_enabled: enabled })
        .eq("id", selectedClassId);
      if (error) throw error;
      toast.success(enabled ? "Đã bật điểm thưởng" : "Đã tắt điểm thưởng");
    } catch (error) {
      console.error("Error:", error);
      toast.error("Không thể cập nhật!");
      setBonusEnabled(!enabled);
    }
  };

  const generateCodes = async () => {
    const count = parseInt(codeCount);
    if (!count || count < 1 || count > 100) {
      toast.error("Số lượng mã từ 1 đến 100!");
      return;
    }

    setIsGenerating(true);
    try {
      // Get existing codes for this class to avoid duplicates
      const existingCodes = new Set(codes.map(c => c.code));
      const newCodes: string[] = [];

      while (newCodes.length < count) {
        const code = String(Math.floor(1000 + Math.random() * 9000));
        if (!existingCodes.has(code) && !newCodes.includes(code)) {
          newCodes.push(code);
        }
      }

      const { data: { session } } = await supabase.auth.getSession();
      const insertData = newCodes.map(code => ({
        class_id: selectedClassId,
        code,
        status: "unused",
        created_by: session?.user?.id,
      }));

      const { error } = await supabase
        .from("bonus_codes" as any)
        .insert(insertData);
      if (error) throw error;

      toast.success(`Đã tạo ${count} mã điểm thưởng!`);
      fetchCodes();
    } catch (error) {
      console.error("Error:", error);
      toast.error("Không thể tạo mã!");
    } finally {
      setIsGenerating(false);
    }
  };

  const deleteCode = async (id: string) => {
    try {
      const { error } = await supabase
        .from("bonus_codes" as any)
        .delete()
        .eq("id", id);
      if (error) throw error;
      setCodes(prev => prev.filter(c => c.id !== id));
      toast.success("Đã xóa mã!");
    } catch (error) {
      console.error("Error:", error);
      toast.error("Không thể xóa!");
    }
  };

  // Sort: unused first, then used
  const sortedCodes = useMemo(() => {
    return [...codes].sort((a, b) => {
      if (a.status === "unused" && b.status !== "unused") return -1;
      if (a.status !== "unused" && b.status === "unused") return 1;
      return 0;
    });
  }, [codes]);

  return (
    <div className="modal-overlay animate-fade-in" onClick={onClose}>
      <div className="min-h-screen flex items-center justify-center p-4">
        <div
          className="modal-content w-full max-w-lg p-6 animate-scale-in max-h-[90vh] overflow-y-auto"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-amber-500/10 flex items-center justify-center">
                <Star className="w-5 h-5 text-amber-500" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-foreground">Điểm Thưởng</h2>
                <p className="text-sm text-muted-foreground">Tạo & quản lý mã điểm thưởng</p>
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
            <div className="space-y-4">
              {/* Class Selector */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">Chọn lớp</Label>
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

              {/* Toggle */}
              <div className="flex items-center justify-between p-4 bg-muted/50 rounded-xl">
                <Label className="text-sm font-medium flex items-center gap-2 cursor-pointer">
                  <Star className="w-4 h-4 text-amber-500" />
                  Bật điểm thưởng
                </Label>
                <Switch checked={bonusEnabled} onCheckedChange={toggleBonusEnabled} />
              </div>

              {/* Action buttons */}
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1 gap-2"
                  onClick={() => setShowSelectStudent(true)}
                >
                  <UserPlus className="w-4 h-4" />
                  Chọn sinh viên
                </Button>
                <Button
                  variant="outline"
                  className="flex-1 gap-2"
                  onClick={() => setShowHistory(true)}
                >
                  <History className="w-4 h-4" />
                  Lịch sử điểm cộng
                </Button>
              </div>

              {!bonusEnabled && (
                <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl text-center">
                  <p className="text-sm text-amber-600 font-medium">
                    Điểm thưởng đã tắt. Sinh viên không cần nhập mã khi điểm danh.
                  </p>
                </div>
              )}

              {bonusEnabled && (
                <>
                  {/* Generate codes */}
                  <div className="p-4 bg-muted/30 rounded-xl border space-y-3">
                    <Label className="text-sm font-medium">Tạo mã điểm thưởng</Label>
                    <div className="flex gap-2">
                      <Input
                        type="number"
                        placeholder="Số lượng"
                        value={codeCount}
                        onChange={(e) => setCodeCount(e.target.value)}
                        className="w-24"
                        min={1}
                        max={100}
                      />
                      <Button
                        onClick={generateCodes}
                        disabled={isGenerating}
                        className="btn-primary-gradient flex-1"
                      >
                        {isGenerating ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <>
                            <Plus className="w-4 h-4 mr-1" />
                            Tạo mã
                          </>
                        )}
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">Mỗi mã gồm 4 chữ số, không trùng nhau</p>
                  </div>

                  {/* Codes list */}
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Danh sách mã ({codes.length})</Label>
                    <div className="max-h-[300px] overflow-y-auto space-y-1 border rounded-xl p-2">
                      {sortedCodes.length === 0 ? (
                        <p className="text-center text-muted-foreground py-4 text-sm">Chưa có mã nào</p>
                      ) : (
                        sortedCodes.map((c) => (
                          <div
                            key={c.id}
                            className={`flex items-center gap-3 p-3 rounded-lg ${
                              c.status === "used"
                                ? "bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800"
                                : "bg-card border"
                            }`}
                          >
                            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                              <Hash className="w-4 h-4 text-primary" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="font-mono font-bold text-lg">{c.code}</span>
                                {c.status === "used" ? (
                                  <span className="px-2 py-0.5 bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300 rounded text-xs font-medium flex items-center gap-1">
                                    <Check className="w-3 h-3" />
                                    Đã sử dụng
                                  </span>
                                ) : (
                                  <span className="px-2 py-0.5 bg-muted text-muted-foreground rounded text-xs font-medium">
                                    Chưa sử dụng
                                  </span>
                                )}
                              </div>
                              {c.status === "used" && c.used_by_name && (
                                <p className="text-xs text-muted-foreground mt-0.5">
                                  {c.used_by_name} • MSV: {c.used_by_code} • Nhóm {c.used_by_group}
                                </p>
                              )}
                            </div>
                            {c.status === "unused" && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 shrink-0"
                                onClick={() => deleteCode(c.id)}
                              >
                                <Trash2 className="w-4 h-4 text-destructive" />
                              </Button>
                            )}
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
      {showSelectStudent && (
        <SelectStudentBonusModal onClose={() => setShowSelectStudent(false)} />
      )}
      {showHistory && (
        <BonusHistoryModal onClose={() => setShowHistory(false)} />
      )}
    </div>
  );
};

export default BonusPointsModal;
