import { useState } from "react";
import { X, Download, AlertTriangle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface PhotoViewModalProps {
  photoUrl: string;
  onClose: () => void;
  studentInfo?: {
    student_code: string;
    student_name: string;
    group_number: string;
    class_id: string;
    week_number: number;
  };
  onWarningAdded?: () => void;
}

const PhotoViewModal = ({ photoUrl, onClose, studentInfo, onWarningAdded }: PhotoViewModalProps) => {
  const [isWarning, setIsWarning] = useState(false);

  const handleDownload = async () => {
    try {
      const response = await fetch(photoUrl);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `attendance-${Date.now()}.jpg`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      toast.success("Đã tải ảnh xuống!");
    } catch {
      toast.error("Không thể tải ảnh!");
    }
  };

  const handleWarning = async () => {
    if (!studentInfo) return;
    if (!confirm(`Xác nhận cảnh báo sinh viên ${studentInfo.student_name} (${studentInfo.student_code})?`)) return;

    setIsWarning(true);
    try {
      const { error } = await supabase
        .from("student_warnings" as any)
        .insert({
          class_id: studentInfo.class_id,
          student_code: studentInfo.student_code,
          student_name: studentInfo.student_name,
          group_number: studentInfo.group_number,
          photo_url: photoUrl,
          week_number: studentInfo.week_number,
        });

      if (error) throw error;
      toast.success(`Đã cảnh báo ${studentInfo.student_name}!`);
      onWarningAdded?.();
    } catch (error) {
      console.error("Warning error:", error);
      toast.error("Không thể thêm cảnh báo!");
    } finally {
      setIsWarning(false);
    }
  };

  const handleContainerClick = (e: React.MouseEvent) => {
    e.stopPropagation();
  };

  const handleClose = (e: React.MouseEvent) => {
    e.stopPropagation();
    onClose();
  };

  return (
    <div 
      className="fixed inset-0 bg-black/80 z-[100] animate-fade-in" 
      onClick={handleClose}
    >
      <div 
        className="absolute inset-0"
        onClick={handleContainerClick}
      >
        <div className="absolute top-4 right-4 flex items-center gap-2 z-[101]">
          {studentInfo && (
            <Button
              variant="secondary"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                handleWarning();
              }}
              disabled={isWarning}
              className="bg-yellow-500 hover:bg-yellow-600 text-white"
            >
              {isWarning ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  <AlertTriangle className="w-4 h-4 mr-1" />
                  Cảnh báo
                </>
              )}
            </Button>
          )}
          <Button
            variant="secondary"
            size="icon"
            onClick={(e) => {
              e.stopPropagation();
              handleDownload();
            }}
          >
            <Download className="w-5 h-5" />
          </Button>
          <Button 
            variant="secondary" 
            size="icon" 
            onClick={handleClose}
          >
            <X className="w-5 h-5" />
          </Button>
        </div>
        
        <div 
          className="h-full flex items-center justify-center p-4"
          onClick={handleClose}
        >
          <img
            src={photoUrl}
            alt="Attendance photo"
            className="max-w-full max-h-full object-contain rounded-lg shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      </div>
    </div>
  );
};

export default PhotoViewModal;
