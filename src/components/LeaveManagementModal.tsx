import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { uploadFileWithProgress } from "@/lib/uploadWithProgress";
import { toast } from "sonner";
import {
  X, Search, Loader2, Upload, Trash2, ChevronLeft,
  History, Download, Image as ImageIcon, Plus, CalendarOff,
  CheckSquare, Users
} from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import MediaViewerModal from "@/components/MediaViewerModal";

interface ClassItem {
  id: string;
  name: string;
  code: string;
}

interface Student {
  id: string;
  name: string;
  student_code: string;
  group_number: string;
}

interface LeaveRecord {
  id: string;
  student_code: string;
  student_name: string;
  content: string;
  week_number: number;
  evidence_urls: string[];
  batch_id: string | null;
  created_by: string;
  created_at: string;
}

interface LeaveManagementModalProps {
  onClose: () => void;
}

const LeaveManagementModal = ({ onClose }: LeaveManagementModalProps) => {
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<string>("");
  const [students, setStudents] = useState<Student[]>([]);
  const [search, setSearch] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  // Multi-select mode
  const [multiSelectMode, setMultiSelectMode] = useState(false);
  const [selectedStudentIds, setSelectedStudentIds] = useState<Set<string>>(new Set());

  // Single leave form state
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [leaveContent, setLeaveContent] = useState("");
  const [leaveWeek, setLeaveWeek] = useState("");
  const [evidenceFiles, setEvidenceFiles] = useState<File[]>([]);
  const [evidencePreviews, setEvidencePreviews] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadLabel, setUploadLabel] = useState("");

  // Batch form (after multi-select confirm)
  const [showBatchForm, setShowBatchForm] = useState(false);
  const [batchStudents, setBatchStudents] = useState<Student[]>([]);

  // History state
  const [showHistory, setShowHistory] = useState(false);
  const [leaveHistory, setLeaveHistory] = useState<LeaveRecord[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [historyStudentCode, setHistoryStudentCode] = useState<string | null>(null);

  // Full screen image
  const [viewImageUrl, setViewImageUrl] = useState<string | null>(null);

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fetch classes
  useEffect(() => {
    const fetchClasses = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const { data } = await supabase
        .from("classes" as any)
        .select("id, name, code")
        .eq("created_by", session.user.id)
        .order("created_at", { ascending: false });
      setClasses((data as any[]) || []);
    };
    fetchClasses();
  }, []);

  // Fetch students when class changes
  useEffect(() => {
    if (!selectedClassId) { setStudents([]); return; }
    setIsLoading(true);
    supabase
      .from("students" as any)
      .select("*")
      .eq("class_id", selectedClassId)
      .order("name")
      .then(({ data }) => {
        setStudents((data as any[]) || []);
        setIsLoading(false);
      });
  }, [selectedClassId]);

  const filteredStudents = useMemo(() => {
    if (!search.trim()) return students;
    const s = search.toLowerCase().trim();
    const sNoDiacritics = s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    return students.filter((st) => {
      const nameLower = st.name.toLowerCase();
      const nameNoDiacritics = nameLower.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      return nameLower.includes(s) ||
        nameNoDiacritics.includes(sNoDiacritics) ||
        st.student_code.toLowerCase().includes(s);
    });
  }, [students, search]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const imageFiles = files.filter(f => f.type.startsWith("image/"));
    if (imageFiles.length === 0) return;
    setEvidenceFiles(prev => [...prev, ...imageFiles]);
    const newPreviews = imageFiles.map(f => URL.createObjectURL(f));
    setEvidencePreviews(prev => [...prev, ...newPreviews]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, []);

  const removeEvidence = useCallback((index: number) => {
    URL.revokeObjectURL(evidencePreviews[index]);
    setEvidenceFiles(prev => prev.filter((_, i) => i !== index));
    setEvidencePreviews(prev => prev.filter((_, i) => i !== index));
  }, [evidencePreviews]);

  // Toggle student selection in multi-select mode
  const toggleStudentSelect = (studentId: string) => {
    setSelectedStudentIds(prev => {
      const next = new Set(prev);
      if (next.has(studentId)) next.delete(studentId);
      else next.add(studentId);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedStudentIds.size === filteredStudents.length) {
      setSelectedStudentIds(new Set());
    } else {
      setSelectedStudentIds(new Set(filteredStudents.map(s => s.id)));
    }
  };

  const confirmMultiSelect = () => {
    const selected = students.filter(s => selectedStudentIds.has(s.id));
    if (selected.length === 0) {
      toast.error("Chưa chọn sinh viên nào!");
      return;
    }
    setBatchStudents(selected);
    setShowBatchForm(true);
  };

  // Upload evidence files with progress
  const uploadEvidence = async (classId: string, studentCode: string): Promise<string[]> => {
    const uploadedUrls: string[] = [];
    const totalFiles = evidenceFiles.length;
    for (let i = 0; i < totalFiles; i++) {
      const file = evidenceFiles[i];
      setUploadLabel(`Đang tải file ${i + 1}/${totalFiles}...`);
      const fileName = `${classId}/${studentCode}/${Date.now()}_${file.name}`;
      const url = await uploadFileWithProgress("leave-evidence", fileName, file, supabaseUrl, supabaseKey, (p) => {
        const overall = totalFiles > 0 ? Math.round(((i + p / 100) / totalFiles) * 100) : p;
        setUploadProgress(overall);
      });
      uploadedUrls.push(url);
    }
    setUploadProgress(100);
    return uploadedUrls;
  };

  // Submit single leave
  const handleSubmitLeave = async () => {
    if (!selectedStudent || !leaveContent.trim() || !leaveWeek) {
      toast.error("Vui lòng điền đầy đủ thông tin!");
      return;
    }
    const weekNum = parseInt(leaveWeek);
    if (!weekNum || weekNum < 1) { toast.error("Số tuần không hợp lệ!"); return; }

    setIsSubmitting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Chưa đăng nhập");

      const uploadedUrls = await uploadEvidence(selectedClassId, selectedStudent.student_code);

      const { error } = await supabase.from("student_leaves" as any).insert({
        class_id: selectedClassId,
        student_code: selectedStudent.student_code,
        student_name: selectedStudent.name,
        group_number: selectedStudent.group_number,
        content: leaveContent.trim(),
        week_number: weekNum,
        evidence_urls: uploadedUrls,
        created_by: session.user.id,
      });
      if (error) throw error;

      toast.success(`Đã xác nhận nghỉ phép cho ${selectedStudent.name} tuần ${weekNum}!`);
      resetForm();
      setSelectedStudent(null);
    } catch (error: any) {
      console.error("Leave submit error:", error);
      toast.error(error.message || "Không thể lưu nghỉ phép!");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Submit batch leave
  const handleSubmitBatchLeave = async () => {
    if (!leaveContent.trim() || !leaveWeek) {
      toast.error("Vui lòng điền đầy đủ thông tin!");
      return;
    }
    const weekNum = parseInt(leaveWeek);
    if (!weekNum || weekNum < 1) { toast.error("Số tuần không hợp lệ!"); return; }

    setIsSubmitting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Chưa đăng nhập");

      const batchId = `batch_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

      // Upload evidence once (shared for all students in batch)
      const uploadedUrls = await uploadEvidence(selectedClassId, "batch");

      const inserts = batchStudents.map(student => ({
        class_id: selectedClassId,
        student_code: student.student_code,
        student_name: student.name,
        group_number: student.group_number,
        content: leaveContent.trim(),
        week_number: weekNum,
        evidence_urls: uploadedUrls,
        batch_id: batchId,
        created_by: session.user.id,
      }));

      const { error } = await supabase.from("student_leaves" as any).insert(inserts);
      if (error) throw error;

      toast.success(`Đã xác nhận nghỉ phép cho ${batchStudents.length} sinh viên tuần ${weekNum}!`);
      resetForm();
      setShowBatchForm(false);
      setBatchStudents([]);
      setMultiSelectMode(false);
      setSelectedStudentIds(new Set());
    } catch (error: any) {
      console.error("Batch leave error:", error);
      toast.error(error.message || "Không thể lưu nghỉ phép!");
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetForm = () => {
    setLeaveContent("");
    setLeaveWeek("");
    evidencePreviews.forEach(url => URL.revokeObjectURL(url));
    setEvidenceFiles([]);
    setEvidencePreviews([]);
    setUploadProgress(0);
    setUploadLabel("");
  };

  // Fetch all history for a class
  const fetchAllHistory = async () => {
    setIsLoadingHistory(true);
    try {
      const { data } = await supabase
        .from("student_leaves" as any)
        .select("*")
        .eq("class_id", selectedClassId)
        .order("created_at", { ascending: false });
      setLeaveHistory((data as any[]) || []);
    } catch (e) { console.error(e); }
    finally { setIsLoadingHistory(false); }
  };

  // Fetch history for single student
  const fetchStudentHistory = async (studentCode: string) => {
    setIsLoadingHistory(true);
    try {
      const { data } = await supabase
        .from("student_leaves" as any)
        .select("*")
        .eq("class_id", selectedClassId)
        .eq("student_code", studentCode)
        .order("created_at", { ascending: false });
      setLeaveHistory((data as any[]) || []);
    } catch (e) { console.error(e); }
    finally { setIsLoadingHistory(false); }
  };

  // Group history by batch_id for display
  const groupedHistory = useMemo(() => {
    const groups: { key: string; records: LeaveRecord[]; isBatch: boolean }[] = [];
    const batchMap = new Map<string, LeaveRecord[]>();
    const singles: LeaveRecord[] = [];

    for (const record of leaveHistory) {
      if (record.batch_id) {
        if (!batchMap.has(record.batch_id)) batchMap.set(record.batch_id, []);
        batchMap.get(record.batch_id)!.push(record);
      } else {
        singles.push(record);
      }
    }

    // Merge batches and singles in chronological order
    const allItems: { key: string; records: LeaveRecord[]; isBatch: boolean; sortDate: string }[] = [];

    for (const [batchId, records] of batchMap) {
      allItems.push({ key: batchId, records, isBatch: true, sortDate: records[0].created_at });
    }
    for (const record of singles) {
      allItems.push({ key: record.id, records: [record], isBatch: false, sortDate: record.created_at });
    }

    allItems.sort((a, b) => new Date(b.sortDate).getTime() - new Date(a.sortDate).getTime());
    return allItems;
  }, [leaveHistory]);

  // ============ RENDER: Leave form (single or batch) ============
  const renderLeaveForm = (isBatch: boolean) => (
    <div className="flex-1 overflow-auto p-4 md:p-5 space-y-4">
      {isBatch && (
        <div className="space-y-2">
          <label className="text-sm font-medium">Sinh viên được chọn ({batchStudents.length})</label>
          <div className="flex flex-wrap gap-1.5 max-h-24 overflow-auto">
            {batchStudents.map(s => (
              <span key={s.id} className="px-2 py-1 bg-amber-100 text-amber-700 rounded-lg text-xs font-medium">
                {s.name}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-2">
        <label className="text-sm font-medium">Nội dung nghỉ</label>
        <Textarea
          placeholder="Lý do xin nghỉ phép..."
          value={leaveContent}
          onChange={(e) => setLeaveContent(e.target.value)}
          className="min-h-[100px]"
        />
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">Số tuần nghỉ</label>
        <Input
          type="number"
          placeholder="Nhập số tuần (VD: 1, 2, 3...)"
          value={leaveWeek}
          onChange={(e) => setLeaveWeek(e.target.value)}
          min={1}
        />
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">Ảnh minh chứng</label>
        <input ref={fileInputRef} type="file" accept="image/*" multiple onChange={handleFileSelect} className="hidden" />
        <Button variant="outline" className="w-full" onClick={() => fileInputRef.current?.click()}>
          <Upload className="w-4 h-4 mr-2" />
          Tải ảnh minh chứng
        </Button>
        {evidencePreviews.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-2">
            {evidencePreviews.map((url, i) => (
              <div key={i} className="relative group">
                <img src={url} alt={`Preview ${i + 1}`} className="w-20 h-20 object-cover rounded-lg border" />
                <button
                  onClick={() => removeEvidence(i)}
                  className="absolute -top-2 -right-2 w-5 h-5 bg-destructive text-destructive-foreground rounded-full flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {isSubmitting && evidenceFiles.length > 0 && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground flex items-center gap-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> {uploadLabel}
            </span>
            <span className="font-semibold text-primary">{uploadProgress}%</span>
          </div>
          <Progress value={uploadProgress} className="h-2" />
        </div>
      )}

      <Button
        className="w-full btn-primary-gradient"
        onClick={isBatch ? handleSubmitBatchLeave : handleSubmitLeave}
        disabled={isSubmitting || (evidenceFiles.length > 0 && isSubmitting && uploadProgress < 100)}
      >
        {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Plus className="w-4 h-4 mr-2" />}
        {isBatch ? `Xác nhận nghỉ phép (${batchStudents.length} SV)` : "Xác nhận nghỉ phép"}
      </Button>
    </div>
  );

  const handleDeleteLeave = async (leaveId: string) => {
    if (!confirm("Bạn có chắc muốn xóa đơn nghỉ phép này? Sinh viên sẽ không còn được tính nghỉ phép trong tuần đó.")) return;
    try {
      const { error } = await supabase.from("student_leaves" as any).delete().eq("id", leaveId);
      if (error) throw error;
      setLeaveHistory(prev => prev.filter(r => r.id !== leaveId));
      toast.success("Đã xóa đơn nghỉ phép!");
    } catch (error) {
      console.error("Delete leave error:", error);
      toast.error("Không thể xóa đơn nghỉ phép!");
    }
  };

  // ============ RENDER: History view ============
  const renderHistory = () => (
    <ScrollArea className="flex-1 p-4 md:p-5">
      {isLoadingHistory ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
      ) : groupedHistory.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <CalendarOff className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p>Chưa có lịch sử nghỉ phép</p>
        </div>
      ) : (
        <div className="space-y-4">
          {groupedHistory.map((group) => (
            <div key={group.key} className="border rounded-xl p-4 space-y-2">
              {group.isBatch ? (
                <BatchHistoryItem group={group} onViewImage={setViewImageUrl} onDelete={handleDeleteLeave} />
              ) : (
                <SingleHistoryItem record={group.records[0]} onViewImage={setViewImageUrl} onDelete={handleDeleteLeave} />
              )}
            </div>
          ))}
        </div>
      )}
    </ScrollArea>
  );

  // ============ SINGLE STUDENT FORM / HISTORY VIEW ============
  if (selectedStudent) {
    return (
      <div className="modal-overlay animate-fade-in" onClick={onClose}>
        <div className="fixed inset-4 md:inset-y-8 md:inset-x-[20%] bg-card rounded-2xl shadow-2xl overflow-hidden flex flex-col animate-scale-in" onClick={(e) => e.stopPropagation()}>
          <div className="p-4 md:p-5 border-b flex items-center justify-between shrink-0">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="icon" onClick={() => {
                if (showHistory) { setShowHistory(false); setHistoryStudentCode(null); return; }
                setSelectedStudent(null); resetForm();
              }}>
                <ChevronLeft className="w-5 h-5" />
              </Button>
              <div>
                <h2 className="text-lg font-bold">{showHistory ? "Lịch sử nghỉ phép" : "Xin nghỉ phép"}</h2>
                <p className="text-sm text-muted-foreground">{selectedStudent.name} - {selectedStudent.student_code}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {!showHistory && (
                <Button variant="outline" size="sm" onClick={() => {
                  setShowHistory(true);
                  setHistoryStudentCode(selectedStudent.student_code);
                  fetchStudentHistory(selectedStudent.student_code);
                }}>
                  <History className="w-4 h-4 mr-1" /> Lịch sử
                </Button>
              )}
              <button onClick={onClose} className="w-9 h-9 rounded-full bg-muted flex items-center justify-center hover:bg-muted/80">
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
          {showHistory ? renderHistory() : renderLeaveForm(false)}
        </div>
        {viewImageUrl && <MediaViewerModal urls={[viewImageUrl]} onClose={() => setViewImageUrl(null)} />}
      </div>
    );
  }

  // ============ BATCH FORM VIEW ============
  if (showBatchForm) {
    return (
      <div className="modal-overlay animate-fade-in" onClick={onClose}>
        <div className="fixed inset-4 md:inset-y-8 md:inset-x-[20%] bg-card rounded-2xl shadow-2xl overflow-hidden flex flex-col animate-scale-in" onClick={(e) => e.stopPropagation()}>
          <div className="p-4 md:p-5 border-b flex items-center justify-between shrink-0">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="icon" onClick={() => { setShowBatchForm(false); resetForm(); }}>
                <ChevronLeft className="w-5 h-5" />
              </Button>
              <div>
                <h2 className="text-lg font-bold">Xin nghỉ phép hàng loạt</h2>
                <p className="text-sm text-muted-foreground">{batchStudents.length} sinh viên được chọn</p>
              </div>
            </div>
            <button onClick={onClose} className="w-9 h-9 rounded-full bg-muted flex items-center justify-center hover:bg-muted/80">
              <X className="w-4 h-4" />
            </button>
          </div>
          {renderLeaveForm(true)}
        </div>
        {viewImageUrl && <MediaViewerModal urls={[viewImageUrl]} onClose={() => setViewImageUrl(null)} />}
      </div>
    );
  }

  // ============ ALL HISTORY VIEW ============
  if (showHistory) {
    return (
      <div className="modal-overlay animate-fade-in" onClick={onClose}>
        <div className="fixed inset-4 md:inset-y-8 md:inset-x-[20%] bg-card rounded-2xl shadow-2xl overflow-hidden flex flex-col animate-scale-in" onClick={(e) => e.stopPropagation()}>
          <div className="p-4 md:p-5 border-b flex items-center justify-between shrink-0">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="icon" onClick={() => { setShowHistory(false); setLeaveHistory([]); }}>
                <ChevronLeft className="w-5 h-5" />
              </Button>
              <div>
                <h2 className="text-lg font-bold">Lịch sử nghỉ phép</h2>
                <p className="text-sm text-muted-foreground">Tất cả sinh viên trong lớp</p>
              </div>
            </div>
            <button onClick={onClose} className="w-9 h-9 rounded-full bg-muted flex items-center justify-center hover:bg-muted/80">
              <X className="w-4 h-4" />
            </button>
          </div>
          {renderHistory()}
        </div>
        {viewImageUrl && <MediaViewerModal urls={[viewImageUrl]} onClose={() => setViewImageUrl(null)} />}
      </div>
    );
  }

  // ============ MAIN VIEW: Class selection + Student list ============
  return (
    <div className="modal-overlay animate-fade-in" onClick={onClose}>
      <div className="fixed inset-4 md:inset-y-8 md:inset-x-[20%] bg-card rounded-2xl shadow-2xl overflow-hidden flex flex-col animate-scale-in" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="p-4 md:p-5 border-b flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center">
              <CalendarOff className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <h2 className="text-lg font-bold">Quản lý nghỉ phép</h2>
              <p className="text-sm text-muted-foreground">Chọn lớp và sinh viên</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {selectedClassId && (
              <Button variant="outline" size="sm" onClick={() => { setShowHistory(true); fetchAllHistory(); }}>
                <History className="w-4 h-4 mr-1" /> Lịch sử
              </Button>
            )}
            <button onClick={onClose} className="w-9 h-9 rounded-full bg-muted flex items-center justify-center hover:bg-muted/80">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Class selector */}
        <div className="px-4 md:px-5 pt-4 shrink-0">
          <Select value={selectedClassId} onValueChange={(v) => {
            setSelectedClassId(v);
            setMultiSelectMode(false);
            setSelectedStudentIds(new Set());
          }}>
            <SelectTrigger>
              <SelectValue placeholder="Chọn lớp" />
            </SelectTrigger>
            <SelectContent>
              {classes.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.name} ({c.code})</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Search + Multi-select toggle */}
        {selectedClassId && (
          <div className="px-4 md:px-5 pt-3 shrink-0 flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Tìm tên hoặc mã sinh viên..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
            </div>
            <Button
              variant={multiSelectMode ? "default" : "outline"}
              size="sm"
              className="shrink-0"
              onClick={() => {
                setMultiSelectMode(!multiSelectMode);
                setSelectedStudentIds(new Set());
              }}
            >
              <CheckSquare className="w-4 h-4 mr-1" />
              Chọn nhiều
            </Button>
          </div>
        )}

        {/* Multi-select actions bar */}
        {multiSelectMode && selectedClassId && (
          <div className="px-4 md:px-5 pt-3 shrink-0 flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={toggleSelectAll}>
              <Users className="w-4 h-4 mr-1" />
              {selectedStudentIds.size === filteredStudents.length ? "Bỏ chọn tất cả" : "Chọn tất cả"}
            </Button>
            <span className="text-sm text-muted-foreground">
              Đã chọn: {selectedStudentIds.size}/{filteredStudents.length}
            </span>
            {selectedStudentIds.size > 0 && (
              <Button size="sm" className="ml-auto btn-primary-gradient" onClick={confirmMultiSelect}>
                Xác nhận ({selectedStudentIds.size})
              </Button>
            )}
          </div>
        )}

        {/* Student list */}
        <ScrollArea className="flex-1 p-4 md:p-5">
          {!selectedClassId ? (
            <div className="text-center py-12 text-muted-foreground">
              <CalendarOff className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>Chọn lớp để xem danh sách sinh viên</p>
            </div>
          ) : isLoading ? (
            <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
          ) : filteredStudents.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <p>{search ? "Không tìm thấy sinh viên" : "Lớp chưa có sinh viên"}</p>
            </div>
          ) : (
            <div className="border rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    {multiSelectMode && <th className="w-10 p-3"></th>}
                    <th className="text-left p-3 font-medium">Tên sinh viên</th>
                    <th className="text-left p-3 font-medium">Mã SV</th>
                    <th className="text-left p-3 font-medium hidden sm:table-cell">Nhóm</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filteredStudents.map((student) => (
                    <tr
                      key={student.id}
                      className="hover:bg-amber-50 dark:hover:bg-amber-900/10 cursor-pointer transition-colors"
                      onClick={() => {
                        if (multiSelectMode) {
                          toggleStudentSelect(student.id);
                        } else {
                          setSelectedStudent(student);
                        }
                      }}
                    >
                      {multiSelectMode && (
                        <td className="p-3">
                          <Checkbox
                            checked={selectedStudentIds.has(student.id)}
                            onCheckedChange={() => toggleStudentSelect(student.id)}
                          />
                        </td>
                      )}
                      <td className="p-3 font-medium">{student.name}</td>
                      <td className="p-3 font-mono text-muted-foreground">{student.student_code}</td>
                      <td className="p-3 hidden sm:table-cell">{student.group_number}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </ScrollArea>
      </div>
    </div>
  );
};

// ============ Sub-components for history display ============

const SingleHistoryItem = ({ record, onViewImage, onDelete }: { record: LeaveRecord; onViewImage: (url: string) => void; onDelete: (id: string) => void }) => (
  <>
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <span className="px-2 py-1 bg-amber-100 text-amber-700 rounded-lg text-sm font-medium">Tuần {record.week_number}</span>
        <span className="font-medium text-sm">{record.student_name}</span>
        <span className="text-xs text-muted-foreground font-mono">{record.student_code}</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">{new Date(record.created_at).toLocaleString("vi-VN")}</span>
        <button
          onClick={() => onDelete(record.id)}
          className="w-7 h-7 rounded-full bg-destructive/10 text-destructive flex items-center justify-center hover:bg-destructive/20 transition-colors"
          title="Xóa đơn nghỉ phép"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
    <p className="text-sm">{record.content}</p>
    <EvidenceImages urls={record.evidence_urls} onViewImage={onViewImage} />
  </>
);

const BatchHistoryItem = ({ group, onViewImage, onDelete }: { group: { records: LeaveRecord[] }; onViewImage: (url: string) => void; onDelete: (id: string) => void }) => {
  const first = group.records[0];
  return (
    <Collapsible>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="px-2 py-1 bg-amber-100 text-amber-700 rounded-lg text-sm font-medium">Tuần {first.week_number}</span>
          <CollapsibleTrigger asChild>
            <button className="px-2 py-1 bg-blue-100 text-blue-700 rounded-lg text-sm font-medium hover:bg-blue-200 transition-colors">
              Nhiều thay đổi ({group.records.length} SV) ▼
            </button>
          </CollapsibleTrigger>
        </div>
        <span className="text-xs text-muted-foreground">{new Date(first.created_at).toLocaleString("vi-VN")}</span>
      </div>
      <p className="text-sm">{first.content}</p>
      <CollapsibleContent>
        <div className="mt-3 border-t pt-3 space-y-2">
          {group.records.map((r) => (
            <div key={r.id} className="flex items-center gap-2 text-sm py-1">
              <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />
              <span className="font-medium">{r.student_name}</span>
              <span className="text-muted-foreground font-mono text-xs">{r.student_code}</span>
              <button
                onClick={() => onDelete(r.id)}
                className="ml-auto w-6 h-6 rounded-full bg-destructive/10 text-destructive flex items-center justify-center hover:bg-destructive/20 transition-colors"
                title="Xóa"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      </CollapsibleContent>
      <EvidenceImages urls={first.evidence_urls} onViewImage={onViewImage} />
    </Collapsible>
  );
};

const EvidenceImages = ({ urls, onViewImage }: { urls: string[] | any; onViewImage: (url: string) => void }) => {
  const imageUrls = Array.isArray(urls) ? urls : [];
  if (imageUrls.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2 mt-2">
      {imageUrls.map((url, i) => (
        <div key={i} className="relative group">
          <img
            src={url}
            alt={`Minh chứng ${i + 1}`}
            className="w-20 h-20 object-cover rounded-lg cursor-pointer border hover:opacity-80 transition-opacity"
            onClick={() => onViewImage(url)}
          />
          <a href={url} download className="absolute bottom-1 right-1 w-6 h-6 bg-black/60 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
            <Download className="w-3 h-3 text-white" />
          </a>
        </div>
      ))}
    </div>
  );
};

export default LeaveManagementModal;
