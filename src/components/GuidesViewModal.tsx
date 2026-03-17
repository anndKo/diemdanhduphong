import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { X, Loader2, Search, ChevronLeft, BookOpen, Play } from "lucide-react";
import { motion } from "framer-motion";
import { ScrollArea } from "@/components/ui/scroll-area";
import MediaViewerModal from "@/components/MediaViewerModal";

interface Guide {
  id: string;
  title: string;
  content: string;
  image_urls: string[];
  video_url: string | null;
  created_at: string;
}

interface GuidesViewModalProps {
  onClose: () => void;
}

const GuidesViewModal = ({ onClose }: GuidesViewModalProps) => {
  const [guides, setGuides] = useState<Guide[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedGuide, setSelectedGuide] = useState<Guide | null>(null);
  const [viewImageUrl, setViewImageUrl] = useState<string | null>(null);

  useEffect(() => {
    fetchGuides();
  }, []);

  const fetchGuides = async () => {
    try {
      const { data, error } = await (supabase as any)
        .from("guides")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      setGuides((data as any[]) || []);
    } catch {
      toast.error("Không thể tải hướng dẫn!");
    } finally {
      setIsLoading(false);
    }
  };

  const filtered = guides.filter(g =>
    g.title.toLowerCase().includes(search.toLowerCase())
  );

  // Detail view
  if (selectedGuide) {
    const imageUrls = Array.isArray(selectedGuide.image_urls) ? selectedGuide.image_urls : [];
    return (
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-card rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col"
        >
          <div className="flex items-center justify-between p-4 md:p-5 border-b shrink-0">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="icon" onClick={() => setSelectedGuide(null)}>
                <ChevronLeft className="w-5 h-5" />
              </Button>
              <h2 className="text-lg font-bold line-clamp-1">{selectedGuide.title}</h2>
            </div>
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X className="w-5 h-5" />
            </Button>
          </div>

          <ScrollArea className="flex-1 p-4 md:p-5">
            <div className="space-y-6">
              {/* Video */}
              {selectedGuide.video_url && (
                <div className="rounded-xl overflow-hidden border bg-black">
                  <video
                    src={selectedGuide.video_url}
                    controls
                    className="w-full max-h-[60vh] mx-auto"
                    controlsList="nodownload"
                    playsInline
                  />
                </div>
              )}

              {/* Content */}
              <div className="prose prose-sm max-w-none">
                <p className="text-sm text-muted-foreground mb-1">
                  {new Date(selectedGuide.created_at).toLocaleString("vi-VN")}
                </p>
                <div className="whitespace-pre-wrap text-foreground">{selectedGuide.content}</div>
              </div>

              {/* Images */}
              {imageUrls.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-sm font-semibold">Hình ảnh</h3>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    {imageUrls.map((url, i) => (
                      <img
                        key={i}
                        src={url}
                        alt={`Ảnh ${i + 1}`}
                        className="w-full aspect-video object-cover rounded-xl border cursor-pointer hover:opacity-80 transition-opacity"
                        onClick={() => setViewImageUrl(url)}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          </ScrollArea>
          {viewImageUrl && <MediaViewerModal urls={[viewImageUrl]} onClose={() => setViewImageUrl(null)} />}
        </motion.div>
      </div>
    );
  }

  // List view
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-card rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col"
      >
        <div className="flex items-center justify-between p-4 md:p-5 border-b shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <BookOpen className="w-5 h-5 text-primary" />
            </div>
            <h2 className="text-lg font-bold">Hướng dẫn sử dụng</h2>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="w-5 h-5" />
          </Button>
        </div>

        <div className="px-4 md:px-5 pt-3 shrink-0">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Tìm kiếm hướng dẫn..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10" />
          </div>
        </div>

        <ScrollArea className="flex-1 p-4 md:p-5">
          {isLoading ? (
            <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <BookOpen className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>{search ? "Không tìm thấy hướng dẫn" : "Chưa có hướng dẫn nào"}</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filtered.map(guide => (
                <button
                  key={guide.id}
                  onClick={() => setSelectedGuide(guide)}
                  className="w-full text-left border rounded-xl p-4 hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 min-w-0">
                      <BookOpen className="w-5 h-5 text-primary shrink-0" />
                      <div className="min-w-0">
                        <h3 className="font-medium text-sm line-clamp-1">{guide.title}</h3>
                        <p className="text-xs text-muted-foreground line-clamp-1">{guide.content}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 ml-2">
                      {guide.video_url && <Play className="w-4 h-4 text-primary" />}
                      <span className="text-xs text-muted-foreground">
                        {new Date(guide.created_at).toLocaleDateString("vi-VN")}
                      </span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </ScrollArea>
      </motion.div>
    </div>
  );
};

export default GuidesViewModal;
