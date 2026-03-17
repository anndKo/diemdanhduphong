import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { X, Loader2, AlertTriangle, Trash2 } from "lucide-react";
import { compareNames, compareStrings } from "@/lib/nameUtils";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface UnmatchedRecord {
  id: string;
  name: string;
  student_code: string;
  group_number: string;
  week_number: number;
  created_at: string;
}

interface UnmatchedStudentsModalProps {
  classId: string;
  className: string;
  onClose: () => void;
}

const UnmatchedStudentsModal = ({ classId, className, onClose }: UnmatchedStudentsModalProps) => {
  const [records, setRecords] = useState<UnmatchedRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<string | "all" | null>(null);

  useEffect(() => {
    scanUnmatched();
  }, [classId]);

  const scanUnmatched = async () => {
    setIsLoading(true);
    try {
      const [studentsRes, attendanceRes] = await Promise.all([
        supabase.from("students" as any).select("name, student_code, group_number").eq("class_id", classId),
        supabase.from("attendance_records" as any).select("id, name, student_code, group_number, week_number, created_at").eq("class_id", classId).order("created_at", { ascending: false }),
      ]);

      if (studentsRes.error) throw studentsRes.error;
      if (attendanceRes.error) throw attendanceRes.error;

      const students = (studentsRes.data as any[]) || [];
      const attendance = (attendanceRes.data as any[]) || [];

      // Find attendance records that don't exactly match any student
      const unmatched = attendance.filter((a: any) => {
        return !students.some((s: any) =>
          compareNames(s.name, a.name) &&
          compareStrings(s.student_code, a.student_code) &&
          compareStrings(s.group_number, a.group_number)
        );
      });

      setRecords(unmatched);
    } catch (error) {
      console.error("Scan error:", error);
      toast.error("Không thể quét dữ liệu!");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const { error } = await supabase.from("attendance_records" as any).delete().eq("id", id);
      if (error) throw error;
      setRecords((prev) => prev.filter((r) => r.id !== id));
      toast.success("Đã xóa bản ghi!");
    } catch (error) {
      toast.error("Không thể xóa!");
    }
  };

  const handleDeleteAll = async () => {
    try {
      const ids = records.map((r) => r.id);
      const { error } = await supabase.from("attendance_records" as any).delete().in("id", ids);
      if (error) throw error;
      setRecords([]);
      toast.success("Đã xóa tất cả!");
    } catch (error) {
      toast.error("Không thể xóa!");
    }
  };

  const confirmDelete = () => {
    if (deleteTarget === "all") {
      handleDeleteAll();
    } else if (deleteTarget) {
      handleDelete(deleteTarget);
    }
    setDeleteTarget(null);
  };

  return (
    <div className="modal-overlay animate-fade-in" onClick={onClose}>
      <div
        className="fixed inset-4 md:inset-16 bg-card rounded-2xl shadow-2xl overflow-hidden flex flex-col animate-scale-in max-w-2xl mx-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 md:p-5 border-b bg-card flex items-center justify-between shrink-0">
          <div>
            <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-destructive" />
              SV ngoài danh sách
            </h2>
            <p className="text-sm text-muted-foreground mt-0.5">{className}</p>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-muted flex items-center justify-center hover:bg-muted/80 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 md:p-5">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
            </div>
          ) : records.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-muted-foreground">✅ Không có sinh viên nào ngoài danh sách!</p>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-medium text-destructive">
                  Tìm thấy {records.length} bản ghi không khớp
                </p>
                <Button size="sm" variant="destructive" onClick={() => setDeleteTarget("all")}>
                  <Trash2 className="w-3.5 h-3.5 mr-1" />
                  Xóa tất cả
                </Button>
              </div>
              {records.map((r) => (
                <div
                  key={r.id}
                  className="flex items-center justify-between p-3 bg-destructive/5 border border-destructive/20 rounded-lg"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-sm truncate">{r.name}</p>
                    <p className="text-xs text-muted-foreground">
                      MSV: {r.student_code} · Nhóm: {r.group_number} · Tuần {r.week_number}
                    </p>
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="shrink-0 w-8 h-8"
                    onClick={() => setDeleteTarget(r.id)}
                  >
                    <Trash2 className="w-4 h-4 text-destructive" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Confirm Delete Dialog */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xác nhận xóa</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget === "all"
                ? `Bạn có chắc muốn xóa tất cả ${records.length} bản ghi không khớp? Hành động này không thể hoàn tác.`
                : "Bạn có chắc muốn xóa bản ghi này? Hành động này không thể hoàn tác."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Hủy</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Xóa
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default UnmatchedStudentsModal;
