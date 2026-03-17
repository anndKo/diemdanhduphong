import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { X, AlertTriangle, Loader2, Trash2 } from "lucide-react";
import PhotoViewModal from "@/components/PhotoViewModal";

interface Warning {
  id: string;
  class_id: string;
  student_code: string;
  student_name: string;
  group_number: string | null;
  photo_url: string | null;
  reason: string;
  week_number: number | null;
  created_at: string;
}

interface WarningStudentsModalProps {
  classId: string;
  className: string;
  onClose: () => void;
}

const WarningStudentsModal = ({ classId, className, onClose }: WarningStudentsModalProps) => {
  const [warnings, setWarnings] = useState<Warning[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null);

  useEffect(() => {
    fetchWarnings();
  }, [classId]);

  const fetchWarnings = async () => {
    try {
      const { data, error } = await supabase
        .from("student_warnings" as any)
        .select("*")
        .eq("class_id", classId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setWarnings((data as any[]) || []);
    } catch (error) {
      console.error("Error fetching warnings:", error);
      toast.error("Không thể tải danh sách cảnh báo!");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Xóa cảnh báo này?")) return;
    try {
      const { error } = await supabase
        .from("student_warnings" as any)
        .delete()
        .eq("id", id);
      if (error) throw error;
      setWarnings(prev => prev.filter(w => w.id !== id));
      toast.success("Đã xóa cảnh báo!");
    } catch (error) {
      toast.error("Không thể xóa!");
    }
  };

  return (
    <div className="fixed inset-0 z-[60] bg-black/50 animate-fade-in" onClick={onClose}>
      <div
        className="fixed inset-4 md:inset-8 lg:inset-16 bg-card rounded-2xl shadow-2xl overflow-hidden flex flex-col animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 md:p-6 border-b flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-yellow-100 dark:bg-yellow-900/30 flex items-center justify-center">
              <AlertTriangle className="w-5 h-5 text-yellow-600" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-foreground">SV Cảnh báo</h2>
              <p className="text-sm text-muted-foreground">{className} • {warnings.length} cảnh báo</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-10 h-10 rounded-full bg-muted flex items-center justify-center hover:bg-muted/80 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-4 md:p-6">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : warnings.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <AlertTriangle className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>Chưa có sinh viên nào bị cảnh báo</p>
            </div>
          ) : (
            <div className="space-y-3">
              {warnings.map((warning) => (
                <div
                  key={warning.id}
                  className="flex items-center gap-4 p-4 bg-muted/50 rounded-xl border hover:bg-muted/70 transition-colors"
                >
                  {warning.photo_url && (
                    <button
                      onClick={() => setSelectedPhoto(warning.photo_url!)}
                      className="shrink-0"
                    >
                      <img
                        src={warning.photo_url}
                        alt={warning.student_name}
                        className="w-16 h-16 object-cover rounded-lg"
                      />
                    </button>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-foreground">{warning.student_name}</p>
                    <p className="text-sm text-muted-foreground">
                      MSV: {warning.student_code} • Nhóm: {warning.group_number || "—"}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {warning.week_number ? `Tuần ${warning.week_number} • ` : ""}
                      {new Date(warning.created_at).toLocaleString("vi-VN")}
                    </p>
                    <p className="text-sm text-yellow-600 mt-1">{warning.reason}</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleDelete(warning.id)}
                  >
                    <Trash2 className="w-4 h-4 text-destructive" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {selectedPhoto && (
        <PhotoViewModal
          photoUrl={selectedPhoto}
          onClose={() => setSelectedPhoto(null)}
        />
      )}
    </div>
  );
};

export default WarningStudentsModal;
