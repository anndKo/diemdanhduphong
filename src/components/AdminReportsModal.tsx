import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { X, Loader2, Trash2, Clock, Image, Film, ExternalLink, ChevronDown, ChevronUp } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import MediaViewerModal from "@/components/MediaViewerModal";

interface BugReport {
  id: string;
  device_hash: string;
  content: string;
  file_urls: string[];
  status: string;
  admin_note: string | null;
  created_at: string;
}

interface AdminReportsModalProps {
  onClose: () => void;
}

const AdminReportsModal = ({ onClose }: AdminReportsModalProps) => {
  const [reports, setReports] = useState<BugReport[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [mediaViewer, setMediaViewer] = useState<{ urls: string[]; index: number } | null>(null);

  useEffect(() => {
    fetchReports();
  }, []);

  const fetchReports = async () => {
    try {
      const { data, error } = await supabase
        .from("bug_reports" as any)
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setReports((data as any[]) || []);
    } catch (error) {
      console.error("Error fetching reports:", error);
      toast.error("Không thể tải danh sách báo cáo!");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Xóa báo cáo này?")) return;
    try {
      const { error } = await supabase
        .from("bug_reports" as any)
        .delete()
        .eq("id", id);
      if (error) throw error;
      setReports(prev => prev.filter(r => r.id !== id));
      toast.success("Đã xóa báo cáo");
    } catch (error) {
      toast.error("Không thể xóa!");
    }
  };

  const handleMarkRead = async (id: string) => {
    try {
      const { error } = await supabase
        .from("bug_reports" as any)
        .update({ status: "read" })
        .eq("id", id);
      if (error) throw error;
      setReports(prev => prev.map(r => r.id === id ? { ...r, status: "read" } : r));
    } catch (error) {
      console.error(error);
    }
  };

  const isMediaUrl = (url: string) => {
    const lower = url.toLowerCase();
    const imageExts = [".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp"];
    const videoExts = [".mp4", ".webm", ".mov", ".avi", ".mkv"];
    if (imageExts.some(ext => lower.includes(ext))) return "image";
    if (videoExts.some(ext => lower.includes(ext))) return "video";
    return "unknown";
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-card rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 md:p-5 border-b">
          <div>
            <h2 className="font-semibold text-foreground text-lg">Các báo cáo lỗi</h2>
            <p className="text-xs text-muted-foreground">{reports.length} báo cáo</p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="w-5 h-5" />
          </Button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 md:p-5">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : reports.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <p>Chưa có báo cáo nào</p>
            </div>
          ) : (
            <div className="space-y-3">
              {reports.map((report) => (
                <motion.div
                  key={report.id}
                  layout
                  className={`border rounded-xl overflow-hidden transition-colors ${
                    report.status === "pending" ? "border-primary/30 bg-primary/5" : "border-border"
                  }`}
                >
                  {/* Report header */}
                  <div
                    className="p-3 md:p-4 cursor-pointer flex items-start justify-between gap-3"
                    onClick={() => {
                      setExpandedId(expandedId === report.id ? null : report.id);
                      if (report.status === "pending") handleMarkRead(report.id);
                    }}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        {report.status === "pending" && (
                          <span className="w-2 h-2 rounded-full bg-primary shrink-0" />
                        )}
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {new Date(report.created_at).toLocaleString("vi-VN")}
                        </span>
                        {(report.file_urls as string[])?.length > 0 && (
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <Image className="w-3 h-3" />
                            {(report.file_urls as string[]).length}
                          </span>
                        )}
                      </div>
                      <p className={`text-sm ${expandedId === report.id ? "" : "line-clamp-2"}`}>
                        {report.content}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={(e) => { e.stopPropagation(); handleDelete(report.id); }}
                      >
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                      {expandedId === report.id ? (
                        <ChevronUp className="w-4 h-4 text-muted-foreground" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-muted-foreground" />
                      )}
                    </div>
                  </div>

                  {/* Expanded content */}
                  <AnimatePresence>
                    {expandedId === report.id && (report.file_urls as string[])?.length > 0 && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden"
                      >
                        <div className="px-3 md:px-4 pb-3 md:pb-4 border-t pt-3 space-y-2">
                          <p className="text-xs font-medium text-muted-foreground mb-2">Tệp đính kèm:</p>
                          <div className="grid grid-cols-2 gap-2">
                            {(report.file_urls as string[]).map((url, i) => {
                              const mediaType = isMediaUrl(url);
                              return (
                                <div key={i} className="relative group rounded-lg overflow-hidden border">
                                  <div
                                    className="cursor-pointer"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setMediaViewer({ urls: report.file_urls as string[], index: i });
                                    }}
                                  >
                                    {mediaType === "image" ? (
                                      <img
                                        src={url}
                                        alt={`Attachment ${i + 1}`}
                                        className="w-full h-32 object-cover hover:opacity-80 transition-opacity"
                                      />
                                    ) : mediaType === "video" ? (
                                      <div className="relative w-full h-32 bg-secondary flex items-center justify-center">
                                        <Film className="w-8 h-8 text-muted-foreground" />
                                        <span className="absolute bottom-1 right-1 text-xs bg-black/60 text-white px-1.5 py-0.5 rounded">Video</span>
                                      </div>
                                    ) : (
                                      <div className="w-full h-32 flex items-center justify-center bg-secondary">
                                        <Film className="w-8 h-8 text-muted-foreground" />
                                      </div>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                          <p className="text-xs text-muted-foreground mt-2">
                            Device: {report.device_hash.slice(0, 12)}...
                          </p>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </motion.div>

      {mediaViewer && (
        <MediaViewerModal
          urls={mediaViewer.urls}
          initialIndex={mediaViewer.index}
          onClose={() => setMediaViewer(null)}
        />
      )}
    </div>
  );
};

export default AdminReportsModal;
