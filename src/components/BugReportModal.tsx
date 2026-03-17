import { useState, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { X, Send, Upload, Loader2, AlertTriangle, Image, Film, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { generateDeviceFingerprint } from "@/lib/fingerprint";
import { motion, AnimatePresence } from "framer-motion";

interface BugReportModalProps {
  onClose: () => void;
}

interface SelectedFile {
  file: File;
  previewUrl: string | null;
  type: "image" | "video";
}

const MAX_REPORTS_PER_DEVICE = 3;
const BUG_REPORT_STORAGE_KEY = "bug_report_count";

const getLocalBugReportCount = (): { count: number; date: string } => {
  try {
    const stored = localStorage.getItem(BUG_REPORT_STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      // Get today's date in Vietnam timezone
      const now = new Date();
      const vnOffset = 7 * 60 * 60 * 1000;
      const vnNow = new Date(now.getTime() + vnOffset);
      const today = vnNow.toISOString().split("T")[0];
      if (parsed.date === today) {
        return parsed;
      }
    }
  } catch {}
  return { count: 0, date: "" };
};

const incrementLocalBugReportCount = () => {
  const now = new Date();
  const vnOffset = 7 * 60 * 60 * 1000;
  const vnNow = new Date(now.getTime() + vnOffset);
  const today = vnNow.toISOString().split("T")[0];
  const current = getLocalBugReportCount();
  const newCount = current.date === today ? current.count + 1 : 1;
  localStorage.setItem(BUG_REPORT_STORAGE_KEY, JSON.stringify({ count: newCount, date: today }));
};

const BugReportModal = ({ onClose }: BugReportModalProps) => {
  const [content, setContent] = useState("");
  const [files, setFiles] = useState<SelectedFile[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [limitReached, setLimitReached] = useState(false);
  const [isCheckingLimit, setIsCheckingLimit] = useState(true);
  const [remainingReports, setRemainingReports] = useState(MAX_REPORTS_PER_DEVICE);

  // Check limit on mount using both localStorage and DB
  useEffect(() => {
    const checkLimit = async () => {
      // First check localStorage (strict, can't be bypassed easily)
      const local = getLocalBugReportCount();
      const now = new Date();
      const vnOffset = 7 * 60 * 60 * 1000;
      const vnNow = new Date(now.getTime() + vnOffset);
      const today = vnNow.toISOString().split("T")[0];
      
      if (local.date === today && local.count >= MAX_REPORTS_PER_DEVICE) {
        setLimitReached(true);
        setRemainingReports(0);
        setIsCheckingLimit(false);
        return;
      }

      // Also check DB as backup
      try {
        const { hash } = await generateDeviceFingerprint();
        const vnStartOfDay = new Date(Date.UTC(vnNow.getUTCFullYear(), vnNow.getUTCMonth(), vnNow.getUTCDate()));
        const startOfDayUTC = new Date(vnStartOfDay.getTime() - vnOffset).toISOString();

        const { count } = await supabase
          .from("bug_reports" as any)
          .select("*", { count: "exact", head: true })
          .eq("device_hash", hash)
          .gte("created_at", startOfDayUTC);

        const dbCount = count || 0;
        const maxCount = Math.max(local.date === today ? local.count : 0, dbCount);
        
        if (maxCount >= MAX_REPORTS_PER_DEVICE) {
          setLimitReached(true);
          setRemainingReports(0);
          // Sync localStorage
          if (local.count < maxCount) {
            localStorage.setItem(BUG_REPORT_STORAGE_KEY, JSON.stringify({ count: maxCount, date: today }));
          }
        } else {
          setRemainingReports(MAX_REPORTS_PER_DEVICE - maxCount);
        }
      } catch {
        // If DB fails, still enforce localStorage limit
        const localCount = local.date === today ? local.count : 0;
        setRemainingReports(MAX_REPORTS_PER_DEVICE - localCount);
      }
      setIsCheckingLimit(false);
    };
    checkLimit();
  }, []);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = e.target.files;
    if (!selectedFiles) return;

    const newFiles: SelectedFile[] = [];
    for (let i = 0; i < selectedFiles.length; i++) {
      const file = selectedFiles[i];
      const isImage = file.type.startsWith("image/");
      const isVideo = file.type.startsWith("video/");
      
      if (!isImage && !isVideo) {
        toast.error(`${file.name}: Chỉ hỗ trợ ảnh và video`);
        continue;
      }

      if (file.size > 100 * 1024 * 1024) {
        toast.error(`${file.name}: Dung lượng tối đa 100MB`);
        continue;
      }

      newFiles.push({
        file,
        previewUrl: isImage ? URL.createObjectURL(file) : null,
        type: isImage ? "image" : "video",
      });
    }

    setFiles(prev => [...prev, ...newFiles]);
    e.target.value = "";
  }, []);

  const removeFile = useCallback((index: number) => {
    setFiles(prev => {
      const updated = [...prev];
      if (updated[index].previewUrl) {
        URL.revokeObjectURL(updated[index].previewUrl!);
      }
      updated.splice(index, 1);
      return updated;
    });
  }, []);

  const handleSubmit = async () => {
    if (!content.trim()) {
      toast.error("Vui lòng nhập nội dung báo cáo!");
      return;
    }

    setIsSubmitting(true);
    try {
      // Get device fingerprint
      const { hash: deviceHash } = await generateDeviceFingerprint();

      // Check report limit - 3 per device per day (Vietnam timezone)
      const now = new Date();
      // Get start of today in Vietnam timezone (UTC+7)
      const vnOffset = 7 * 60 * 60 * 1000;
      const vnNow = new Date(now.getTime() + vnOffset);
      const vnStartOfDay = new Date(Date.UTC(vnNow.getUTCFullYear(), vnNow.getUTCMonth(), vnNow.getUTCDate()));
      const startOfDayUTC = new Date(vnStartOfDay.getTime() - vnOffset).toISOString();

      const { count, error: countError } = await supabase
        .from("bug_reports" as any)
        .select("*", { count: "exact", head: true })
        .eq("device_hash", deviceHash)
        .gte("created_at", startOfDayUTC);

      if (countError) throw countError;

      // Check both localStorage and DB
      const local = getLocalBugReportCount();
      const now2 = new Date();
      const vnOffset2 = 7 * 60 * 60 * 1000;
      const vnNow2 = new Date(now2.getTime() + vnOffset2);
      const today2 = vnNow2.toISOString().split("T")[0];
      const localCount = local.date === today2 ? local.count : 0;
      const maxCount = Math.max(localCount, count || 0);

      if (maxCount >= MAX_REPORTS_PER_DEVICE) {
        toast.error("Thiết bị của bạn đã đạt giới hạn 3 lần báo cáo trong ngày hôm nay!");
        setLimitReached(true);
        return;
      }

      // Upload files with XHR for progress tracking
      const fileUrls: string[] = [];
      const totalSize = files.reduce((sum, f) => sum + f.file.size, 0);
      let uploadedSize = 0;

      for (let i = 0; i < files.length; i++) {
        const { file } = files[i];
        const ext = file.name.split(".").pop();
        const fileName = `${deviceHash}/${Date.now()}_${i}.${ext}`;

        // Use XMLHttpRequest for real progress tracking
        const uploadResult = await new Promise<{ error: any }>((resolve) => {
          const xhr = new XMLHttpRequest();
          const url = `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/bug-reports/${fileName}`;
          
          xhr.upload.onprogress = (event) => {
            if (event.lengthComputable) {
              const currentProgress = ((uploadedSize + event.loaded) / totalSize) * 100;
              setUploadProgress(Math.min(Math.round(currentProgress), 99));
            }
          };
          
          xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
              resolve({ error: null });
            } else {
              resolve({ error: new Error(`Upload failed: ${xhr.status}`) });
            }
          };
          
          xhr.onerror = () => resolve({ error: new Error("Upload failed") });
          
          xhr.open("POST", url);
          xhr.setRequestHeader("Authorization", `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`);
          xhr.setRequestHeader("apikey", import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY);
          xhr.setRequestHeader("x-upsert", "false");
          xhr.send(file); // Send raw file to keep original quality
        });

        uploadedSize += file.size;

        if (uploadResult.error) {
          console.error("Upload error:", uploadResult.error);
          toast.error(`Lỗi tải file: ${file.name}`);
          continue;
        }

        const { data: urlData } = supabase.storage
          .from("bug-reports")
          .getPublicUrl(fileName);

        fileUrls.push(urlData.publicUrl);
      }

      setUploadProgress(100);

      // Insert bug report
      const { error: insertError } = await supabase
        .from("bug_reports" as any)
        .insert({
          device_hash: deviceHash,
          content: content.trim(),
          file_urls: fileUrls,
        });

      if (insertError) throw insertError;

      // Increment localStorage counter
      incrementLocalBugReportCount();

      toast.success("Đã gửi báo cáo lỗi thành công!");
      onClose();
    } catch (error) {
      console.error("Bug report error:", error);
      toast.error("Có lỗi xảy ra khi gửi báo cáo!");
    } finally {
      setIsSubmitting(false);
      setUploadProgress(0);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-card rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 md:p-5 border-b">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-destructive/10 flex items-center justify-center">
              <AlertTriangle className="w-5 h-5 text-destructive" />
            </div>
          <div>
              <h2 className="font-semibold text-foreground">Báo cáo lỗi</h2>
              <p className="text-xs text-muted-foreground">Mỗi thiết bị chỉ được báo cáo {MAX_REPORTS_PER_DEVICE} lần/ngày</p>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} disabled={isSubmitting}>
            <X className="w-5 h-5" />
          </Button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 md:p-5 space-y-4">
          {/* Limit warning */}
          {isCheckingLimit ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : limitReached ? (
            <div className="p-4 rounded-xl bg-destructive/10 border border-destructive/30">
              <div className="flex items-center gap-2 text-destructive mb-2">
                <AlertTriangle className="w-5 h-5" />
                <span className="font-semibold text-sm">Đã đạt giới hạn báo cáo</span>
              </div>
              <p className="text-sm text-destructive/80">
                Thiết bị của bạn đã gửi {MAX_REPORTS_PER_DEVICE} báo cáo trong ngày hôm nay. Vui lòng thử lại vào ngày mai.
              </p>
            </div>
          ) : (
          <>
          {/* Text input */}
          <div>
            <label className="text-sm font-medium text-foreground/80 mb-2 block">
              Nội dung báo cáo *
            </label>
            <Textarea
              placeholder="Mô tả lỗi bạn gặp phải..."
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className="min-h-[120px] resize-none"
              disabled={isSubmitting}
            />
          </div>

          {/* File upload */}
          <div>
            <label className="text-sm font-medium text-foreground/80 mb-2 block">
              Ảnh / Video đính kèm (tối đa 100MB/file)
            </label>
            <label
              className={`flex flex-col items-center gap-2 p-6 border-2 border-dashed rounded-xl cursor-pointer transition-colors ${
                isSubmitting
                  ? "opacity-50 cursor-not-allowed"
                  : "hover:border-primary/50 hover:bg-secondary/30"
              }`}
            >
              <Upload className="w-8 h-8 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">
                Bấm để chọn ảnh hoặc video
              </span>
              <input
                type="file"
                accept="image/*,video/*"
                multiple
                onChange={handleFileSelect}
                className="hidden"
                disabled={isSubmitting}
              />
            </label>
          </div>

          {/* File previews */}
          <AnimatePresence>
            {files.length > 0 && (
              <div className="space-y-2">
                {files.map((f, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, height: 0 }}
                    className="flex items-center gap-3 p-2 bg-secondary/50 rounded-lg"
                  >
                    <div className="w-10 h-10 rounded-lg bg-secondary flex items-center justify-center shrink-0">
                      {f.type === "image" ? (
                        f.previewUrl ? (
                          <img src={f.previewUrl} alt="" className="w-10 h-10 rounded-lg object-cover" />
                        ) : (
                          <Image className="w-5 h-5 text-muted-foreground" />
                        )
                      ) : (
                        <Film className="w-5 h-5 text-muted-foreground" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm truncate">{f.file.name}</p>
                      <p className="text-xs text-muted-foreground">{formatFileSize(f.file.size)}</p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="shrink-0 h-8 w-8"
                      onClick={() => removeFile(i)}
                      disabled={isSubmitting}
                    >
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  </motion.div>
                ))}
              </div>
            )}
          </AnimatePresence>

          {/* Upload progress */}
          {isSubmitting && uploadProgress > 0 && (
            <div className="space-y-1">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Đang tải lên...</span>
                <span>{uploadProgress}%</span>
              </div>
              <div className="w-full h-2 bg-secondary rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary transition-all duration-300 rounded-full"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
            </div>
          )}
          </>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 md:p-5 border-t flex gap-3">
          <Button variant="outline" onClick={onClose} disabled={isSubmitting} className="flex-1">
            {limitReached ? "Đóng" : "Hủy"}
          </Button>
          {!limitReached && (
          <Button
            onClick={handleSubmit}
            disabled={!content.trim() || isSubmitting || limitReached}
            className="flex-1 btn-primary-gradient"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Đang gửi...
              </>
            ) : (
              <>
                <Send className="w-4 h-4 mr-2" />
                Gửi báo cáo
              </>
            )}
          </Button>
          )}
        </div>
      </motion.div>
    </div>
  );
};

export default BugReportModal;
