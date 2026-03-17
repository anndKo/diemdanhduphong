import { X, Download, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";

interface MediaViewerModalProps {
  urls: string[];
  initialIndex?: number;
  onClose: () => void;
}

const MediaViewerModal = ({ urls, initialIndex = 0, onClose }: MediaViewerModalProps) => {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);

  const isMediaUrl = (url: string) => {
    const lower = url.toLowerCase();
    const imageExts = [".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp"];
    const videoExts = [".mp4", ".webm", ".mov", ".avi", ".mkv"];
    if (imageExts.some(ext => lower.includes(ext))) return "image";
    if (videoExts.some(ext => lower.includes(ext))) return "video";
    return "unknown";
  };

  const currentUrl = urls[currentIndex];
  const mediaType = isMediaUrl(currentUrl);

  const handlePrev = (e: React.MouseEvent) => {
    e.stopPropagation();
    setCurrentIndex(prev => (prev > 0 ? prev - 1 : urls.length - 1));
  };

  const handleNext = (e: React.MouseEvent) => {
    e.stopPropagation();
    setCurrentIndex(prev => (prev < urls.length - 1 ? prev + 1 : 0));
  };

  const handleDownload = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const response = await fetch(currentUrl);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `media-${Date.now()}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      toast.success("Đã tải xuống!");
    } catch {
      toast.error("Không thể tải xuống!");
    }
  };

  return (
    <div className="fixed inset-0 bg-black/90 z-[200] animate-fade-in" onClick={onClose}>
      {/* Top bar */}
      <div className="absolute top-0 left-0 right-0 p-4 flex items-center justify-between z-[201]">
        <span className="text-white/70 text-sm">
          {urls.length > 1 ? `${currentIndex + 1} / ${urls.length}` : ""}
        </span>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={handleDownload} className="text-white hover:bg-white/20">
            <Download className="w-5 h-5" />
          </Button>
          <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); onClose(); }} className="text-white hover:bg-white/20">
            <X className="w-5 h-5" />
          </Button>
        </div>
      </div>

      {/* Navigation arrows */}
      {urls.length > 1 && (
        <>
          <button
            onClick={handlePrev}
            className="absolute left-2 top-1/2 -translate-y-1/2 z-[201] p-2 rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
          <button
            onClick={handleNext}
            className="absolute right-2 top-1/2 -translate-y-1/2 z-[201] p-2 rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors"
          >
            <ChevronRight className="w-6 h-6" />
          </button>
        </>
      )}

      {/* Content */}
      <div className="h-full flex items-center justify-center p-8 pt-16" onClick={(e) => e.stopPropagation()}>
        <motion.div
          key={currentIndex}
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.2 }}
          className="max-w-full max-h-full"
        >
          {mediaType === "image" ? (
            <img
              src={currentUrl}
              alt={`Media ${currentIndex + 1}`}
              className="max-w-full max-h-[85vh] object-contain rounded-lg shadow-2xl"
            />
          ) : mediaType === "video" ? (
            <video
              src={currentUrl}
              controls
              autoPlay
              className="max-w-full max-h-[85vh] rounded-lg shadow-2xl"
            />
          ) : (
            <div className="text-white text-center">
              <p>Không thể hiển thị tệp này</p>
              <a href={currentUrl} target="_blank" rel="noopener noreferrer" className="text-primary underline mt-2 block">
                Mở trong tab mới
              </a>
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
};

export default MediaViewerModal;
