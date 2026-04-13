import { useState, useEffect, useRef, useMemo, useCallback, memo, startTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { 
  X, Upload, Users, CheckCircle, Image as ImageIcon, Loader2,
  FileSpreadsheet, Trash2, Copy, Download, Check, XCircle,
  FolderOpen, Star, Calendar, Search, ChevronDown, ChevronUp,
  AlertTriangle, UserX, History, RotateCcw
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import PhotoViewModal from "@/components/PhotoViewModal";
import PhotoStorageModal from "@/components/PhotoStorageModal";
import UnmatchedStudentsModal from "@/components/UnmatchedStudentsModal";
import WarningStudentsModal from "@/components/WarningStudentsModal";
import * as XLSX from "xlsx";
import { normalizeName, sortByLastName } from "@/lib/nameUtils";

interface ClassInfo {
  id: string;
  name: string;
  code: string;
  weeks_count: number;
}

interface Student {
  id: string;
  name: string;
  student_code: string;
  group_number: string;
}

interface AttendanceRecord {
  id: string;
  name: string;
  student_code: string;
  group_number: string;
  photo_url: string;
  created_at: string;
  week_number: number;
  bonus_points?: number;
}

interface ClassDetailModalProps {
  classInfo: ClassInfo;
  onClose: () => void;
}

interface LeaveRecord {
  id: string;
  student_code: string;
  week_number: number;
}

// ─── Pagination config ───
const PAGE_SIZE = 50;

// ─── Memoized Student Row ───
const StudentRow = memo(({ 
  student, index, attended, hasLeave, bonusPoints, currentWeek, onDelete 
}: {
  student: Student;
  index: number;
  attended: boolean;
  hasLeave: boolean;
  bonusPoints: number;
  currentWeek: number;
  onDelete: (id: string) => void;
}) => (
  <tr className="hover:bg-muted/30 transition-colors">
    <td className="p-2 md:p-3 text-muted-foreground">{index + 1}</td>
    <td className="p-2 md:p-3 font-medium">
      <div>{student.name}</div>
      <div className="text-xs text-muted-foreground sm:hidden">{student.student_code}</div>
    </td>
    <td className="p-2 md:p-3 font-mono hidden sm:table-cell">{student.student_code}</td>
    <td className="p-2 md:p-3 hidden md:table-cell">{student.group_number}</td>
    <td className="p-2 md:p-3 text-center">
      {attended ? (
        <Check className="w-5 h-5 text-green-600 mx-auto" />
      ) : hasLeave ? (
        <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-amber-100 text-amber-600 font-bold text-sm mx-auto">+</span>
      ) : (
        <XCircle className="w-5 h-5 text-red-500 mx-auto" />
      )}
    </td>
    <td className="p-2 md:p-3 text-center">
      {bonusPoints > 0 && (
        <span className="px-2 py-0.5 bg-yellow-100 text-yellow-700 rounded text-xs font-medium">
          +{bonusPoints}
        </span>
      )}
    </td>
    <td className="p-2 md:p-3 text-right">
      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onDelete(student.id)}>
        <Trash2 className="w-4 h-4 text-destructive" />
      </Button>
    </td>
  </tr>
));
StudentRow.displayName = "StudentRow";

// ─── Memoized Attendance Row ───
const AttendanceRow = memo(({ 
  record, index, showWeek, onViewPhoto, onDelete 
}: {
  record: AttendanceRecord;
  index: number;
  showWeek: boolean;
  onViewPhoto: (record: AttendanceRecord) => void;
  onDelete: (id: string) => void;
}) => (
  <tr className="hover:bg-muted/30 transition-colors">
    <td className="p-3 text-sm text-muted-foreground">{index + 1}</td>
    <td className="p-3 text-sm text-muted-foreground whitespace-nowrap">
      {new Date(record.created_at).toLocaleString("vi-VN")}
    </td>
    <td className="p-3 font-medium">{record.name}</td>
    <td className="p-3 text-sm font-mono">{record.student_code}</td>
    <td className="p-3 text-sm">{record.group_number}</td>
    {showWeek && (
      <td className="p-3 text-center">
        <span className="px-2 py-1 bg-primary/10 text-primary rounded-lg text-sm font-medium">
          {record.week_number}
        </span>
      </td>
    )}
    <td className="p-3 text-center">
      {record.bonus_points && record.bonus_points > 0 && (
        <span className="px-2 py-1 bg-yellow-100 text-yellow-700 rounded-lg text-sm font-medium">
          +{record.bonus_points}
        </span>
      )}
    </td>
    <td className="p-3 text-center">
      {record.photo_url && (
        <Button variant="ghost" size="sm" onClick={() => onViewPhoto(record)} className="text-primary hover:text-primary">
          <ImageIcon className="w-4 h-4 mr-1" />
          Xem
        </Button>
      )}
    </td>
    <td className="p-3 text-right">
      <Button variant="ghost" size="icon" onClick={() => onDelete(record.id)}>
        <Trash2 className="w-4 h-4 text-destructive" />
      </Button>
    </td>
  </tr>
));
AttendanceRow.displayName = "AttendanceRow";

const ClassDetailModal = ({ classInfo, onClose }: ClassDetailModalProps) => {
  const [students, setStudents] = useState<Student[]>([]);
  const [attendanceRecords, setAttendanceRecords] = useState<AttendanceRecord[]>([]);
  const [leaveRecords, setLeaveRecords] = useState<LeaveRecord[]>([]);
  const [manualBonusRecords, setManualBonusRecords] = useState<{student_code: string; week_number: number; bonus_points: number}[]>([]);
  const [manualBonusHistoryRecords, setManualBonusHistoryRecords] = useState<{student_id: string; week_number: number; bonus_point: number}[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [excelInput, setExcelInput] = useState("");
  const [isImporting, setIsImporting] = useState(false);
  const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null);
  const [selectedPhotoRecord, setSelectedPhotoRecord] = useState<AttendanceRecord | null>(null);
  const [currentWeek, setCurrentWeek] = useState(1);
  const [attendanceWeekFilter, setAttendanceWeekFilter] = useState<number | null>(null);
  const [showPhotoStorage, setShowPhotoStorage] = useState(false);
  const [showUnmatched, setShowUnmatched] = useState(false);
  const [showWarnings, setShowWarnings] = useState(false);
  const [attendanceSearch, setAttendanceSearch] = useState("");
  const [studentSearch, setStudentSearch] = useState("");
  const [showImportSection, setShowImportSection] = useState(false);
  const [showDuplicates, setShowDuplicates] = useState(false);
  const [showDeleteHistory, setShowDeleteHistory] = useState(false);
  const [deletedRecords, setDeletedRecords] = useState<any[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [restoreId, setRestoreId] = useState<string | null>(null);
  const [deleteStudentId, setDeleteStudentId] = useState<string | null>(null);
  const [deleteAttendanceId, setDeleteAttendanceId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Pagination
  const [studentPage, setStudentPage] = useState(1);
  const [attendancePage, setAttendancePage] = useState(1);

  // ─── Lookup Maps (O(1) instead of O(n) per check) ───
  const attendanceLookup = useMemo(() => {
    const map = new Map<string, Set<number>>();
    attendanceRecords.forEach(r => {
      const key = r.student_code.toLowerCase();
      if (!map.has(key)) map.set(key, new Set());
      map.get(key)!.add(r.week_number);
    });
    return map;
  }, [attendanceRecords]);

  const leaveLookup = useMemo(() => {
    const map = new Map<string, Set<number>>();
    leaveRecords.forEach(r => {
      const key = r.student_code.toLowerCase();
      if (!map.has(key)) map.set(key, new Set());
      map.get(key)!.add(r.week_number);
    });
    return map;
  }, [leaveRecords]);

  const bonusLookup = useMemo(() => {
    const map = new Map<string, number>();
    attendanceRecords.forEach(r => {
      const key = r.student_code.toLowerCase();
      map.set(key, (map.get(key) || 0) + (r.bonus_points || 0));
    });
    manualBonusRecords.forEach(r => {
      const key = r.student_code.toLowerCase();
      map.set(key, (map.get(key) || 0) + (r.bonus_points || 0));
    });
    manualBonusHistoryRecords.forEach(r => {
      const key = r.student_id.toLowerCase();
      map.set(key, (map.get(key) || 0) + (r.bonus_point || 0));
    });
    return map;
  }, [attendanceRecords, manualBonusRecords, manualBonusHistoryRecords]);

  // ─── Filtered & sorted students ───
  const sortedStudents = useMemo(() => sortByLastName(students), [students]);

  const filteredStudents = useMemo(() => {
    if (!studentSearch.trim()) return sortedStudents;
    const searchLower = studentSearch.toLowerCase().trim();
    const searchNoDiacritics = searchLower.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    return sortedStudents.filter(s => {
      const nameLower = s.name.toLowerCase();
      const nameNoDiacritics = nameLower.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      return nameLower.includes(searchLower) ||
        nameNoDiacritics.includes(searchNoDiacritics) ||
        s.student_code.toLowerCase().includes(searchLower);
    });
  }, [sortedStudents, studentSearch]);

  // Paginated students
  const paginatedStudents = useMemo(() => {
    return filteredStudents.slice(0, studentPage * PAGE_SIZE);
  }, [filteredStudents, studentPage]);

  const hasMoreStudents = paginatedStudents.length < filteredStudents.length;

  // ─── Duplicate records ───
  const duplicateRecords = useMemo(() => {
    const countMap = new Map<string, AttendanceRecord[]>();
    attendanceRecords.forEach(r => {
      const key = `${r.student_code.toLowerCase()}_week${r.week_number}`;
      if (!countMap.has(key)) countMap.set(key, []);
      countMap.get(key)!.push(r);
    });
    const duplicates: AttendanceRecord[] = [];
    countMap.forEach(records => {
      if (records.length >= 2) duplicates.push(...records);
    });
    return duplicates.sort((a, b) => a.week_number - b.week_number);
  }, [attendanceRecords]);

  // ─── Filtered attendance ───
  const filteredAttendanceRecords = useMemo(() => {
    if (showDuplicates) return duplicateRecords;
    if (!attendanceSearch.trim()) {
      if (attendanceWeekFilter === null) return attendanceRecords;
      return attendanceRecords.filter(r => r.week_number === attendanceWeekFilter);
    }
    const searchLower = attendanceSearch.toLowerCase().trim();
    return attendanceRecords.filter(r =>
      r.name.toLowerCase().includes(searchLower) ||
      r.student_code.toLowerCase().includes(searchLower)
    );
  }, [attendanceRecords, attendanceWeekFilter, attendanceSearch, showDuplicates, duplicateRecords]);

  // Paginated attendance
  const paginatedAttendance = useMemo(() => {
    return filteredAttendanceRecords.slice(0, attendancePage * PAGE_SIZE);
  }, [filteredAttendanceRecords, attendancePage]);

  const hasMoreAttendance = paginatedAttendance.length < filteredAttendanceRecords.length;

  // ─── Data fetching ───
  useEffect(() => {
    fetchData();
    const cleanup = subscribeToAttendance();
    return cleanup;
  }, [classInfo.id]);

  // Reset pagination on filter change
  useEffect(() => { setStudentPage(1); }, [studentSearch, currentWeek]);
  useEffect(() => { setAttendancePage(1); }, [attendanceSearch, attendanceWeekFilter, showDuplicates]);

  const fetchData = async () => {
    try {
      const [studentsRes, attendanceRes, leavesRes, bonusHistoryRes, manualBonusRes] = await Promise.all([
        supabase.from("students" as any).select("*").eq("class_id", classInfo.id).order("name"),
        supabase.from("attendance_records" as any).select("*").eq("class_id", classInfo.id).order("created_at", { ascending: false }),
        supabase.from("student_leaves" as any).select("id, student_code, week_number").eq("class_id", classInfo.id),
        supabase.from("bonus_points_history" as any).select("student_code, week_number, bonus_points").eq("class_id", classInfo.id),
        supabase.from("manual_bonus_history" as any).select("student_id, week_number, bonus_point").eq("class_id", classInfo.id),
      ]);

      if (studentsRes.error) throw studentsRes.error;
      if (attendanceRes.error) throw attendanceRes.error;

      setStudents((studentsRes.data as any[]) || []);
      setAttendanceRecords((attendanceRes.data as any[]) || []);
      setLeaveRecords((leavesRes.data as any[]) || []);
      setManualBonusRecords((bonusHistoryRes.data as any[]) || []);
      setManualBonusHistoryRecords((manualBonusRes.data as any[]) || []);
    } catch (error) {
      console.error("Error fetching data:", error);
      toast.error("Không thể tải dữ liệu!");
    } finally {
      setIsLoading(false);
    }
  };

  const subscribeToAttendance = () => {
    const channel = supabase
      .channel(`attendance-${classInfo.id}`)
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "attendance_records",
        filter: `class_id=eq.${classInfo.id}`,
      }, (payload) => {
        setAttendanceRecords((prev) => [payload.new as AttendanceRecord, ...prev]);
        toast.success(`${(payload.new as AttendanceRecord).name} vừa điểm danh!`);
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  };

  // ─── Import/Export ───
  const parseExcelInput = (text: string) => {
    const lines = text.trim().split("\n");
    const result: { name: string; student_code: string; group_number: string }[] = [];
    for (const line of lines) {
      const parts = line.split(/\t|,/).map((p) => p.trim());
      if (parts.length >= 3 && parts[0] && parts[1] && parts[2]) {
        result.push({ name: normalizeName(parts[0]), student_code: parts[1].trim(), group_number: parts[2].trim() });
      }
    }
    return result;
  };

  const handleImportExcel = useCallback(async () => {
    if (!excelInput.trim()) { toast.error("Vui lòng nhập dữ liệu!"); return; }
    const parsedStudents = parseExcelInput(excelInput);
    if (parsedStudents.length === 0) { toast.error("Không tìm thấy dữ liệu hợp lệ!"); return; }

    setIsImporting(true);
    try {
      const { data, error } = await supabase.from("students" as any)
        .insert(parsedStudents.map(s => ({ ...s, class_id: classInfo.id }))).select();
      if (error) throw error;
      setStudents(prev => [...prev, ...((data as any[]) || [])]);
      setExcelInput("");
      toast.success(`Đã thêm ${parsedStudents.length} sinh viên!`);
    } catch (error) { console.error("Import error:", error); toast.error("Có lỗi xảy ra khi import!"); }
    finally { setIsImporting(false); }
  }, [excelInput, classInfo.id]);

  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsImporting(true);
    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData = XLSX.utils.sheet_to_json<Record<string, string>>(worksheet, { header: 1 });

      const parsedStudents: { name: string; student_code: string; group_number: string }[] = [];
      for (let i = 0; i < jsonData.length; i++) {
        const row = jsonData[i] as unknown as string[];
        if (row && row.length >= 3 && row[0] && row[1] && row[2]) {
          const firstCell = String(row[0]).toLowerCase();
          if (firstCell.includes('tên') || firstCell.includes('name') || firstCell === 'stt') continue;
          parsedStudents.push({ name: normalizeName(String(row[0])), student_code: String(row[1]).trim(), group_number: String(row[2]).trim() });
        }
      }

      if (parsedStudents.length === 0) { toast.error("Không tìm thấy dữ liệu hợp lệ trong file!"); return; }

      const { data: insertedData, error } = await supabase.from("students" as any)
        .insert(parsedStudents.map(s => ({ ...s, class_id: classInfo.id }))).select();
      if (error) throw error;
      setStudents(prev => [...prev, ...((insertedData as any[]) || [])]);
      toast.success(`Đã thêm ${parsedStudents.length} sinh viên từ file!`);
    } catch (error) { console.error("File upload error:", error); toast.error("Có lỗi xảy ra khi đọc file!"); }
    finally { setIsImporting(false); if (fileInputRef.current) fileInputRef.current.value = ""; }
  }, [classInfo.id]);

  const handleDeleteStudent = useCallback(async (studentId: string) => {
    try {
      const { error } = await supabase.from("students" as any).delete().eq("id", studentId);
      if (error) throw error;
      setStudents(prev => prev.filter(s => s.id !== studentId));
      toast.success("Đã xóa sinh viên!");
    } catch { toast.error("Không thể xóa sinh viên!"); }
  }, []);

  const handleDeleteAttendance = useCallback(async (recordId: string) => {
    try {
      const record = attendanceRecords.find(r => r.id === recordId);
      if (record) {
        await supabase.from("deleted_attendance_records" as any).insert({
          original_id: record.id, class_id: classInfo.id,
          student_code: record.student_code, name: record.name,
          group_number: record.group_number, week_number: record.week_number,
          photo_url: record.photo_url, bonus_points: record.bonus_points || 0,
          original_created_at: record.created_at,
          deleted_by: (await supabase.auth.getUser()).data.user?.id,
        });
      }
      const { error } = await supabase.from("attendance_records" as any).delete().eq("id", recordId);
      if (error) throw error;
      setAttendanceRecords(prev => prev.filter(r => r.id !== recordId));
      toast.success("Đã xóa bản ghi điểm danh!");
    } catch { toast.error("Không thể xóa!"); }
  }, [attendanceRecords, classInfo.id]);

  const fetchDeleteHistory = useCallback(async () => {
    setIsLoadingHistory(true);
    try {
      const { data, error } = await supabase.from("deleted_attendance_records" as any)
        .select("*").eq("class_id", classInfo.id).order("deleted_at", { ascending: false });
      if (error) throw error;
      setDeletedRecords(data || []);
    } catch { toast.error("Không thể tải lịch sử xóa!"); }
    finally { setIsLoadingHistory(false); }
  }, [classInfo.id]);

  const handleRestore = useCallback(async (deletedRecord: any) => {
    try {
      const { error: insertError } = await supabase.from("attendance_records" as any).insert({
        id: deletedRecord.original_id, class_id: deletedRecord.class_id,
        student_code: deletedRecord.student_code, name: deletedRecord.name,
        group_number: deletedRecord.group_number, week_number: deletedRecord.week_number,
        photo_url: deletedRecord.photo_url, bonus_points: deletedRecord.bonus_points,
        created_at: deletedRecord.original_created_at,
      });
      if (insertError) throw insertError;
      await supabase.from("deleted_attendance_records" as any).delete().eq("id", deletedRecord.id);
      setDeletedRecords(prev => prev.filter(r => r.id !== deletedRecord.id));
      setAttendanceRecords(prev => [{
        id: deletedRecord.original_id, class_id: deletedRecord.class_id,
        student_code: deletedRecord.student_code, name: deletedRecord.name,
        group_number: deletedRecord.group_number, week_number: deletedRecord.week_number,
        photo_url: deletedRecord.photo_url, bonus_points: deletedRecord.bonus_points,
        created_at: deletedRecord.original_created_at,
      } as AttendanceRecord, ...prev]);
      toast.success("Đã khôi phục điểm danh thành công!");
      setRestoreId(null);
    } catch { toast.error("Không thể khôi phục!"); }
  }, []);

  const copyCode = useCallback(() => {
    navigator.clipboard.writeText(classInfo.code);
    toast.success("Đã sao chép mã!");
  }, [classInfo.code]);

  const didAttendInWeek = useCallback((studentCode: string, week: number) => {
    return attendanceLookup.get(studentCode.toLowerCase())?.has(week) || false;
  }, [attendanceLookup]);

  const hasLeaveInWeek = useCallback((studentCode: string, week: number) => {
    return leaveLookup.get(studentCode.toLowerCase())?.has(week) || false;
  }, [leaveLookup]);

  const getTotalBonusPoints = useCallback((studentCode: string) => {
    return bonusLookup.get(studentCode.toLowerCase()) || 0;
  }, [bonusLookup]);

  const handleExportExcel = useCallback(() => {
    const exportData = sortedStudents.map(student => {
      const weekData: Record<string, string> = {};
      let totalAttended = 0;
      for (let w = 1; w <= classInfo.weeks_count; w++) {
        const attended = didAttendInWeek(student.student_code, w);
        const leave = hasLeaveInWeek(student.student_code, w);
        weekData[`Tuần ${w}`] = attended ? "✓" : leave ? "P" : "✗";
        if (attended || leave) totalAttended++;
      }
      return {
        "Tên sinh viên": student.name, "Mã sinh viên": student.student_code,
        "Nhóm": student.group_number, ...weekData,
        "Tổng điểm danh": `${totalAttended}/${classInfo.weeks_count}`,
        "Điểm cộng": getTotalBonusPoints(student.student_code),
      };
    });
    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Điểm danh");
    XLSX.writeFile(wb, `diem-danh-${classInfo.name}.xlsx`);
    toast.success("Đã xuất file Excel!");
  }, [sortedStudents, classInfo, didAttendInWeek, hasLeaveInWeek, getTotalBonusPoints]);

  const handleViewPhoto = useCallback((record: AttendanceRecord) => {
    setSelectedPhoto(record.photo_url);
    setSelectedPhotoRecord(record);
  }, []);

  const handleSetDeleteStudent = useCallback((id: string) => setDeleteStudentId(id), []);
  const handleSetDeleteAttendance = useCallback((id: string) => setDeleteAttendanceId(id), []);

  // ─── Week buttons for student tab (memoized) ───
  const weekButtons = useMemo(() => {
    return Array.from({ length: classInfo.weeks_count }, (_, i) => i + 1);
  }, [classInfo.weeks_count]);

  return (
    <div className="modal-overlay animate-fade-in" onClick={onClose}>
      <div
        className="fixed inset-4 md:inset-8 bg-card rounded-2xl shadow-2xl overflow-hidden flex flex-col animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 md:p-6 border-b bg-card flex items-center justify-between shrink-0">
          <div>
            <h2 className="text-xl md:text-2xl font-bold text-foreground">{classInfo.name}</h2>
            <div className="flex items-center gap-3 mt-1">
              <span className="text-sm text-muted-foreground">Mã điểm danh:</span>
              <button onClick={copyCode} className="flex items-center gap-2 px-3 py-1 bg-primary/10 rounded-lg hover:bg-primary/20 transition-colors">
                <span className="font-mono font-bold text-primary text-lg">{classInfo.code}</span>
                <Copy className="w-4 h-4 text-primary" />
              </button>
              <span className="text-sm text-muted-foreground">|</span>
              <span className="text-sm text-muted-foreground">{classInfo.weeks_count} tuần</span>
            </div>
          </div>
          <button onClick={onClose} className="w-10 h-10 rounded-full bg-muted flex items-center justify-center hover:bg-muted/80 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden flex flex-col min-h-0">
          <Tabs defaultValue="students" className="flex-1 flex flex-col min-h-0">
            <div className="mx-4 md:mx-6 mt-3 shrink-0 flex items-center justify-between flex-wrap gap-2">
              <TabsList>
                <TabsTrigger value="students" className="flex items-center gap-2">
                  <Users className="w-4 h-4" />
                  Danh sách SV ({students.length})
                </TabsTrigger>
                <TabsTrigger value="attendance" className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4" />
                  Điểm danh ({attendanceRecords.length})
                </TabsTrigger>
              </TabsList>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => setShowUnmatched(true)}
                  className="flex items-center gap-2 border-destructive/30 text-destructive hover:bg-destructive/10">
                  <UserX className="w-4 h-4" />
                  <span className="hidden sm:inline">Quét SV ngoài DS</span>
                  <span className="sm:hidden">Quét</span>
                </Button>
                <Button variant="outline" size="sm" onClick={() => setShowWarnings(true)}
                  className="flex items-center gap-2 border-yellow-400 text-yellow-600 hover:bg-yellow-50 dark:hover:bg-yellow-900/20">
                  <AlertTriangle className="w-4 h-4" />
                  <span className="hidden sm:inline">SV cảnh báo</span>
                  <span className="sm:hidden">Cảnh báo</span>
                </Button>
                <Button variant="outline" onClick={() => setShowPhotoStorage(true)} className="flex items-center gap-2">
                  <FolderOpen className="w-4 h-4" />
                  Kho lưu trữ
                </Button>
              </div>
            </div>

            {/* ═══ STUDENTS TAB ═══ */}
            <TabsContent value="students" className="flex-1 flex flex-col min-h-0 mt-2 px-4 md:px-6 pb-4 md:pb-6 data-[state=inactive]:hidden">
              {/* Collapsible Excel Import */}
              <Collapsible open={showImportSection} onOpenChange={setShowImportSection} className="mb-3 shrink-0">
                <CollapsibleTrigger asChild>
                  <Button variant="outline" className="w-full justify-between">
                    <span className="flex items-center gap-2">
                      <FileSpreadsheet className="w-4 h-4" />
                      Import / Export Excel
                    </span>
                    {showImportSection ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="mt-2">
                  <div className="p-4 bg-muted/50 rounded-xl">
                    <p className="text-xs text-muted-foreground mb-3">
                      Tải file Excel hoặc copy dữ liệu theo định dạng: Tên sinh viên, Mã SV, Số nhóm
                    </p>
                    <div className="flex flex-wrap gap-2 mb-3">
                      <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleFileUpload} className="hidden" />
                      <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={isImporting}>
                        <Upload className="w-4 h-4 mr-2" />Tải file
                      </Button>
                      <Button variant="outline" size="sm" onClick={handleExportExcel} disabled={students.length === 0}>
                        <Download className="w-4 h-4 mr-2" />Xuất Excel
                      </Button>
                    </div>
                    <div className="flex flex-col sm:flex-row gap-2">
                      <textarea placeholder="Nguyễn Văn A, SV001, 1&#10;Trần Thị B, SV002, 2"
                        value={excelInput} onChange={(e) => setExcelInput(e.target.value)}
                        className="flex-1 min-h-[60px] p-3 border rounded-lg text-sm resize-none bg-background" />
                      <Button onClick={handleImportExcel} disabled={isImporting} className="btn-primary-gradient sm:self-end">
                        {isImporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Upload className="w-4 h-4 mr-2" />Import</>}
                      </Button>
                    </div>
                  </div>
                </CollapsibleContent>
              </Collapsible>

              {/* Search and Week selector */}
              <div className="mb-2 flex flex-col sm:flex-row gap-2 shrink-0">
                <div className="relative flex-1 max-w-xs">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input placeholder="Tìm tên hoặc mã SV..." value={studentSearch}
                    onChange={(e) => { startTransition(() => setStudentSearch(e.target.value)); }}
                    className="pl-10 h-9" />
                </div>
                <div className="flex items-center gap-1 overflow-x-auto pb-1">
                  <span className="text-sm text-muted-foreground whitespace-nowrap mr-1">Tuần:</span>
                  {weekButtons.map(week => (
                    <Button key={week} size="sm" variant={currentWeek === week ? "default" : "outline"}
                      onClick={() => setCurrentWeek(week)} className="min-w-[36px] h-8 px-2">
                      {week}
                    </Button>
                  ))}
                </div>
              </div>

              {studentSearch && (
                <p className="text-xs text-muted-foreground mb-2 shrink-0">
                  Tìm thấy {filteredStudents.length} sinh viên
                </p>
              )}

              {/* Students List */}
              <div className="flex-1 min-h-0 overflow-hidden">
                {isLoading ? (
                  <div className="flex items-center justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
                ) : students.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <Users className="w-12 h-12 mx-auto mb-3 opacity-50" />
                    <p>Chưa có sinh viên. Hãy import từ Excel!</p>
                  </div>
                ) : (
                  <div className="border rounded-xl overflow-hidden h-full flex flex-col">
                    <div className="overflow-auto flex-1">
                      <table className="w-full text-sm">
                        <thead className="sticky top-0 z-10" style={{ background: "hsl(var(--primary) / 0.08)" }}>
                          <tr>
                            <th className="text-left p-2 md:p-3 font-bold text-foreground text-xs uppercase tracking-wider">#</th>
                            <th className="text-left p-2 md:p-3 font-bold text-foreground text-xs uppercase tracking-wider">Tên sinh viên</th>
                            <th className="text-left p-2 md:p-3 font-bold text-foreground text-xs uppercase tracking-wider hidden sm:table-cell">Mã SV</th>
                            <th className="text-left p-2 md:p-3 font-bold text-foreground text-xs uppercase tracking-wider hidden md:table-cell">Nhóm</th>
                            <th className="text-center p-2 md:p-3 font-bold text-foreground text-xs uppercase tracking-wider">T{currentWeek}</th>
                            <th className="text-center p-2 md:p-3 font-bold text-foreground text-xs uppercase tracking-wider"><Star className="w-4 h-4 inline text-yellow-500" /></th>
                            <th className="text-right p-2 md:p-3 font-bold text-foreground text-xs uppercase tracking-wider">Xóa</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {paginatedStudents.map((student, index) => (
                            <StudentRow
                              key={student.id}
                              student={student}
                              index={index}
                              attended={didAttendInWeek(student.student_code, currentWeek)}
                              hasLeave={hasLeaveInWeek(student.student_code, currentWeek)}
                              bonusPoints={getTotalBonusPoints(student.student_code)}
                              currentWeek={currentWeek}
                              onDelete={handleSetDeleteStudent}
                            />
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {hasMoreStudents && (
                      <div className="p-2 border-t text-center shrink-0">
                        <Button variant="ghost" size="sm" onClick={() => setStudentPage(p => p + 1)}>
                          Xem thêm ({filteredStudents.length - paginatedStudents.length} còn lại)
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </TabsContent>

            {/* ═══ ATTENDANCE TAB ═══ */}
            <TabsContent value="attendance" className="flex-1 flex flex-col min-h-0 mt-2 px-4 md:px-6 pb-4 md:pb-6 data-[state=inactive]:hidden">
              {/* Search & buttons */}
              <div className="flex flex-col sm:flex-row gap-2 shrink-0">
                <div className="relative flex-1 max-w-xs">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input placeholder="Tìm tên hoặc mã SV..." value={attendanceSearch}
                    onChange={(e) => { startTransition(() => { setAttendanceSearch(e.target.value); setShowDuplicates(false); }); }}
                    className="pl-10 h-9" />
                </div>
                <Button size="sm" variant={showDuplicates ? "default" : "outline"}
                  onClick={() => { setShowDuplicates(!showDuplicates); setShowDeleteHistory(false); setAttendanceSearch(""); }}
                  className="flex items-center gap-2 h-9">
                  <AlertTriangle className="w-4 h-4" />
                  Kiểm tra lặp {duplicateRecords.length > 0 && `(${duplicateRecords.length})`}
                </Button>
                <Button size="sm" variant={showDeleteHistory ? "default" : "outline"}
                  onClick={() => {
                    const newState = !showDeleteHistory;
                    setShowDeleteHistory(newState);
                    setShowDuplicates(false); setAttendanceSearch("");
                    if (newState) fetchDeleteHistory();
                  }}
                  className="flex items-center gap-2 h-9">
                  <History className="w-4 h-4" />
                  Lịch sử {deletedRecords.length > 0 && `(${deletedRecords.length})`}
                </Button>
              </div>

              {attendanceSearch && (
                <p className="text-xs text-muted-foreground mt-1 shrink-0">
                  Tìm thấy {filteredAttendanceRecords.length} kết quả - hiển thị tất cả tuần
                </p>
              )}

              {showDuplicates && (
                <p className="text-xs text-yellow-600 mt-1 shrink-0 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" />
                  Hiển thị {duplicateRecords.length} bản ghi lặp (sinh viên điểm danh ≥2 lần trong cùng tuần)
                </p>
              )}

              {/* Delete History Panel */}
              {showDeleteHistory && (
                <div className="flex-1 min-h-0 overflow-auto mt-2">
                  {isLoadingHistory ? (
                    <div className="flex items-center justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
                  ) : deletedRecords.length === 0 ? (
                    <div className="text-center py-12 text-muted-foreground">
                      <History className="w-12 h-12 mx-auto mb-3 opacity-50" />
                      <p>Chưa có lịch sử xóa điểm danh</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {deletedRecords.map(record => (
                        <div key={record.id} className="border rounded-xl p-4 bg-muted/30 hover:bg-muted/50 transition-colors">
                          <div className="flex items-center justify-between gap-3">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-semibold text-foreground">{record.name}</span>
                                <span className="text-sm font-mono text-muted-foreground">{record.student_code}</span>
                                <span className="px-2 py-0.5 bg-primary/10 text-primary rounded-lg text-xs font-medium">Tuần {record.week_number}</span>
                                <span className="text-xs text-muted-foreground">Nhóm {record.group_number}</span>
                              </div>
                              <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                                <span>Điểm danh lúc: {new Date(record.original_created_at).toLocaleString("vi-VN")}</span>
                                <span className="text-destructive">Xóa lúc: {new Date(record.deleted_at).toLocaleString("vi-VN")}</span>
                              </div>
                            </div>
                            <Button size="sm" variant="outline" onClick={() => setRestoreId(record.id)}
                              className="flex items-center gap-2 border-green-400 text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20 shrink-0">
                              <RotateCcw className="w-4 h-4" />Khôi phục
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Week filter */}
              {!attendanceSearch && !showDuplicates && !showDeleteHistory && (
                <div className="flex items-center gap-1 shrink-0 overflow-x-auto py-2">
                  <span className="text-sm text-muted-foreground whitespace-nowrap mr-1">Lọc:</span>
                  <Button size="sm" variant={attendanceWeekFilter === null ? "default" : "outline"}
                    onClick={() => setAttendanceWeekFilter(null)} className="min-w-[50px] h-8 px-2">Tất cả</Button>
                  {weekButtons.map(week => (
                    <Button key={week} size="sm" variant={attendanceWeekFilter === week ? "default" : "outline"}
                      onClick={() => setAttendanceWeekFilter(week)} className="min-w-[36px] h-8 px-2">{week}</Button>
                  ))}
                </div>
               )}

               {/* Attendance count summary */}
               {!showDeleteHistory && attendanceWeekFilter !== null && !attendanceSearch && !showDuplicates && (
                 <div className="shrink-0 flex items-center gap-2 px-3 py-2 rounded-xl bg-primary/10 text-primary text-sm font-semibold">
                   <CheckCircle className="w-4 h-4" />
                   Tuần {attendanceWeekFilter}: {filteredAttendanceRecords.length} lượt điểm danh
                 </div>
               )}

              {/* Attendance records */}
              {!showDeleteHistory && (isLoading ? (
                <div className="flex items-center justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
              ) : filteredAttendanceRecords.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <CheckCircle className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p>{attendanceSearch ? "Không tìm thấy kết quả" : showDuplicates ? "Không có bản ghi lặp" : "Chưa có ai điểm danh"}</p>
                </div>
              ) : (
                <div className="flex-1 min-h-0 overflow-auto mt-2 flex flex-col">
                  <div className="overflow-x-auto border rounded-xl flex-1">
                    <table className="w-full">
                      <thead className="sticky top-0 z-10" style={{ background: "hsl(var(--primary) / 0.08)" }}>
                        <tr>
                          <th className="text-left p-3 text-xs font-bold text-foreground uppercase tracking-wider">#</th>
                          <th className="text-left p-3 text-xs font-bold text-foreground uppercase tracking-wider">Thời gian</th>
                          <th className="text-left p-3 text-xs font-bold text-foreground uppercase tracking-wider">Tên sinh viên</th>
                          <th className="text-left p-3 text-xs font-bold text-foreground uppercase tracking-wider">Mã SV</th>
                          <th className="text-left p-3 text-xs font-bold text-foreground uppercase tracking-wider">Nhóm</th>
                          {(attendanceWeekFilter === null || attendanceSearch || showDuplicates) && (
                            <th className="text-center p-3 text-xs font-bold text-foreground uppercase tracking-wider">Tuần</th>
                          )}
                          <th className="text-center p-3 text-xs font-bold text-foreground uppercase tracking-wider"><Star className="w-4 h-4 inline text-yellow-500" /></th>
                          <th className="text-center p-3 text-xs font-bold text-foreground uppercase tracking-wider">Ảnh</th>
                          <th className="text-right p-3 text-xs font-bold text-foreground uppercase tracking-wider">Thao tác</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {paginatedAttendance.map((record, index) => (
                          <AttendanceRow
                            key={record.id}
                            record={record}
                            index={index}
                            showWeek={attendanceWeekFilter === null || !!attendanceSearch || showDuplicates}
                            onViewPhoto={handleViewPhoto}
                            onDelete={handleSetDeleteAttendance}
                          />
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {hasMoreAttendance && (
                    <div className="p-2 text-center shrink-0">
                      <Button variant="ghost" size="sm" onClick={() => setAttendancePage(p => p + 1)}>
                        Xem thêm ({filteredAttendanceRecords.length - paginatedAttendance.length} còn lại)
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </TabsContent>
          </Tabs>
        </div>
      </div>

      {/* Photo View Modal */}
      {selectedPhoto && (
        <PhotoViewModal photoUrl={selectedPhoto}
          studentInfo={selectedPhotoRecord ? {
            student_code: selectedPhotoRecord.student_code, student_name: selectedPhotoRecord.name,
            group_number: selectedPhotoRecord.group_number, class_id: classInfo.id,
            week_number: selectedPhotoRecord.week_number,
          } : undefined}
          onClose={() => { setSelectedPhoto(null); setSelectedPhotoRecord(null); }}
          onWarningAdded={() => {}} />
      )}

      {showPhotoStorage && <PhotoStorageModal classInfo={classInfo} onClose={() => setShowPhotoStorage(false)} />}
      {showUnmatched && <UnmatchedStudentsModal classId={classInfo.id} className={classInfo.name} onClose={() => setShowUnmatched(false)} />}
      {showWarnings && <WarningStudentsModal classId={classInfo.id} className={classInfo.name} onClose={() => setShowWarnings(false)} />}

      {/* Confirmation Dialogs */}
      <AlertDialog open={!!deleteStudentId} onOpenChange={(open) => !open && setDeleteStudentId(null)}>
        <AlertDialogContent onClick={(e) => e.stopPropagation()}>
          <AlertDialogHeader>
            <AlertDialogTitle>Xác nhận xóa sinh viên</AlertDialogTitle>
            <AlertDialogDescription>Bạn có chắc chắn muốn xóa sinh viên này? Hành động này không thể hoàn tác.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Hủy</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => { if (deleteStudentId) { handleDeleteStudent(deleteStudentId); setDeleteStudentId(null); } }}>Xóa</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!deleteAttendanceId} onOpenChange={(open) => !open && setDeleteAttendanceId(null)}>
        <AlertDialogContent onClick={(e) => e.stopPropagation()}>
          <AlertDialogHeader>
            <AlertDialogTitle>Xác nhận xóa bản ghi điểm danh</AlertDialogTitle>
            <AlertDialogDescription>Bạn có chắc chắn muốn xóa bản ghi điểm danh này? Bản ghi sẽ được lưu vào lịch sử và có thể khôi phục.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Hủy</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => { if (deleteAttendanceId) { handleDeleteAttendance(deleteAttendanceId); setDeleteAttendanceId(null); } }}>Xóa</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!restoreId} onOpenChange={(open) => !open && setRestoreId(null)}>
        <AlertDialogContent onClick={(e) => e.stopPropagation()}>
          <AlertDialogHeader>
            <AlertDialogTitle>Xác nhận khôi phục điểm danh</AlertDialogTitle>
            <AlertDialogDescription>Bạn có chắc chắn muốn khôi phục bản ghi điểm danh này?</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Hủy</AlertDialogCancel>
            <AlertDialogAction onClick={() => { const r = deletedRecords.find(d => d.id === restoreId); if (r) handleRestore(r); }}>
              Khôi phục
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default ClassDetailModal;
