import { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { X, Search, Loader2, UserPlus, Check, Star } from "lucide-react";

interface ManualBonusModalProps {
  onClose: () => void;
}

interface ClassItem {
  id: string;
  name: string;
}

interface Student {
  id: string;
  name: string;
  student_code: string;
  group_number: string;
}

const ManualBonusModal = ({ onClose }: ManualBonusModalProps) => {
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [selectedClassId, setSelectedClassId] = useState("");
  const [students, setStudents] = useState<Student[]>([]);
  const [selectedStudents, setSelectedStudents] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [weekNumber, setWeekNumber] = useState("1");
  const [bonusPoints, setBonusPoints] = useState("1");
  const [content, setContent] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingStudents, setIsLoadingStudents] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [step, setStep] = useState<"select" | "confirm">("select");

  useEffect(() => { fetchClasses(); }, []);

  useEffect(() => {
    if (selectedClassId) {
      fetchStudents();
      setSelectedStudents(new Set());
    }
  }, [selectedClassId]);

  const fetchClasses = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const { data, error } = await supabase
        .from("classes" as any)
        .select("id, name")
        .eq("created_by", session.user.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      const list = (data as any[]) || [];
      setClasses(list);
      if (list.length > 0) setSelectedClassId(list[0].id);
    } catch (e) { console.error(e); }
    finally { setIsLoading(false); }
  };

  const fetchStudents = async () => {
    setIsLoadingStudents(true);
    try {
      const { data, error } = await supabase
        .from("students" as any)
        .select("id, name, student_code, group_number")
        .eq("class_id", selectedClassId)
        .order("name");
      if (error) throw error;
      setStudents((data as any[]) || []);
    } catch (e) { console.error(e); }
    finally { setIsLoadingStudents(false); }
  };

  const filteredStudents = useMemo(() => {
    if (!searchQuery.trim()) return students;
    const q = searchQuery.toLowerCase();
    return students.filter(s =>
      s.name.toLowerCase().includes(q) || s.student_code.toLowerCase().includes(q)
    );
  }, [students, searchQuery]);

  const toggleStudent = (id: string) => {
    setSelectedStudents(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedStudents.size === filteredStudents.length) {
      setSelectedStudents(new Set());
    } else {
      setSelectedStudents(new Set(filteredStudents.map(s => s.id)));
    }
  };

  const handleConfirm = async () => {
    const week = parseInt(weekNumber);
    const points = parseInt(bonusPoints);
    if (!week || week < 1) return toast.error("Tuần không hợp lệ!");
    if (!points || points < 1) return toast.error("Số điểm không hợp lệ!");
    if (selectedStudents.size === 0) return toast.error("Chưa chọn sinh viên!");

    setIsSubmitting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return toast.error("Chưa đăng nhập!");

      const selected = students.filter(s => selectedStudents.has(s.id));
      const insertData = selected.map(s => ({
        class_id: selectedClassId,
        student_name: s.name,
        student_id: s.student_code,
        week_number: week,
        bonus_point: points,
        content: content.trim() || null,
        created_by: session.user.id,
      }));

      const { error } = await supabase
        .from("manual_bonus_history" as any)
        .insert(insertData);
      if (error) throw error;

      toast.success(`Đã cộng ${points} điểm cho ${selected.length} sinh viên!`);
      onClose();
    } catch (e) {
      console.error(e);
      toast.error("Không thể cộng điểm!");
    } finally { setIsSubmitting(false); }
  };

  const selectedList = students.filter(s => selectedStudents.has(s.id));

  return (
    <div className="modal-overlay animate-fade-in" style={{ zIndex: 60 }} onClick={onClose}>
      <div className="min-h-screen flex items-center justify-center p-4">
        <div
          className="modal-content w-full max-w-lg p-6 animate-scale-in max-h-[90vh] flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between mb-4 shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                <UserPlus className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-foreground">
                  {step === "select" ? "Chọn Sinh Viên" : "Xác Nhận Cộng Điểm"}
                </h2>
                <p className="text-sm text-muted-foreground">
                  {step === "select"
                    ? "Chọn sinh viên để cộng điểm thưởng"
                    : `${selectedStudents.size} sinh viên được chọn`}
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
          ) : step === "select" ? (
            <div className="flex flex-col flex-1 min-h-0 space-y-3">
              {/* Class selector */}
              <div className="shrink-0">
                <Label className="text-sm font-medium mb-1 block">Chọn lớp</Label>
                <select
                  value={selectedClassId}
                  onChange={(e) => setSelectedClassId(e.target.value)}
                  className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                >
                  {classes.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>

              {/* Search */}
              <div className="relative shrink-0">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Tìm theo tên hoặc mã SV..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>

              {/* Student list */}
              <div className="flex-1 min-h-0 overflow-y-auto border rounded-xl">
                {isLoadingStudents ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-6 h-6 animate-spin text-primary" />
                  </div>
                ) : filteredStudents.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8 text-sm">Không tìm thấy sinh viên</p>
                ) : (
                  <div className="divide-y">
                    <button
                      onClick={toggleAll}
                      className="w-full flex items-center gap-3 p-3 hover:bg-muted/50 transition-colors"
                    >
                      <div className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 ${
                        selectedStudents.size === filteredStudents.length && filteredStudents.length > 0
                          ? "bg-primary border-primary"
                          : "border-muted-foreground/40"
                      }`}>
                        {selectedStudents.size === filteredStudents.length && filteredStudents.length > 0 && (
                          <Check className="w-3 h-3 text-primary-foreground" />
                        )}
                      </div>
                      <span className="text-sm font-medium">Chọn tất cả ({filteredStudents.length})</span>
                    </button>

                    {filteredStudents.map(s => (
                      <button
                        key={s.id}
                        onClick={() => toggleStudent(s.id)}
                        className="w-full flex items-center gap-3 p-3 hover:bg-muted/50 transition-colors text-left"
                      >
                        <div className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 ${
                          selectedStudents.has(s.id)
                            ? "bg-primary border-primary"
                            : "border-muted-foreground/40"
                        }`}>
                          {selectedStudents.has(s.id) && (
                            <Check className="w-3 h-3 text-primary-foreground" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{s.name}</p>
                          <p className="text-xs text-muted-foreground">MSV: {s.student_code} • Nhóm {s.group_number}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <Button
                onClick={() => {
                  if (selectedStudents.size === 0) return toast.error("Chưa chọn sinh viên nào!");
                  setStep("confirm");
                }}
                className="btn-primary-gradient shrink-0"
                disabled={selectedStudents.size === 0}
              >
                Tiếp tục ({selectedStudents.size} SV)
              </Button>
            </div>
          ) : (
            <div className="space-y-4 overflow-y-auto flex-1">
              <div className="p-3 bg-muted/50 rounded-xl max-h-32 overflow-y-auto">
                <Label className="text-xs font-medium text-muted-foreground mb-2 block">
                  Sinh viên được chọn ({selectedList.length})
                </Label>
                <div className="space-y-1">
                  {selectedList.map(s => (
                    <div key={s.id} className="text-sm flex items-center gap-2">
                      <Star className="w-3 h-3 text-amber-500 shrink-0" />
                      <span className="truncate">{s.name}</span>
                      <span className="text-muted-foreground text-xs">({s.student_code})</span>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <Label className="text-sm font-medium mb-1 block">Tuần</Label>
                <Input
                  type="number"
                  value={weekNumber}
                  onChange={(e) => setWeekNumber(e.target.value)}
                  min={1}
                  max={20}
                  placeholder="Nhập số tuần"
                />
              </div>

              <div>
                <Label className="text-sm font-medium mb-1 block">Số điểm thưởng</Label>
                <Input
                  type="number"
                  value={bonusPoints}
                  onChange={(e) => setBonusPoints(e.target.value)}
                  min={1}
                  max={10}
                  placeholder="Nhập số điểm"
                />
              </div>

              <div>
                <Label className="text-sm font-medium mb-1 block">Nội dung</Label>
                <Input
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="VD: Phát biểu tích cực, hoàn thành bài tập..."
                />
              </div>

              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setStep("select")}>
                  Quay lại
                </Button>
                <Button
                  className="btn-primary-gradient flex-1"
                  onClick={handleConfirm}
                  disabled={isSubmitting}
                >
                  {isSubmitting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    "Xác nhận cộng điểm"
                  )}
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ManualBonusModal;
