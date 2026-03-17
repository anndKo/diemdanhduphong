import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { X, Loader2, BookOpen, ChevronLeft, ChevronRight, Play, Trash2, GripVertical, Save, ArrowUpDown, Search } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { ScrollArea } from "@/components/ui/scroll-area";
import MediaViewerModal from "@/components/MediaViewerModal";

interface Guide {
  id: string;
  title: string;
  content: string;
  image_urls: string[];
  video_urls: string[];
  created_at: string;
  sort_order: number;
}

interface GuidesListModalProps {
  onClose: () => void;
  isAdmin?: boolean;
}

const VideoPlayer = ({ url, onClose }: { url: string; onClose: () => void }) => (
  <div className="fixed inset-0 bg-black z-[300] flex flex-col" onClick={onClose}>
    <div className="absolute top-4 right-4 z-[301]">
      <Button variant="ghost" size="icon" onClick={e => { e.stopPropagation(); onClose(); }} className="text-white hover:bg-white/20">
        <X className="w-6 h-6" />
      </Button>
    </div>
    <div className="flex-1 flex items-center justify-center p-4" onClick={e => e.stopPropagation()}>
      <video src={url} controls autoPlay className="max-w-full max-h-full rounded-2xl shadow-2xl" style={{ maxHeight: "90vh" }} />
    </div>
  </div>
);

const GuidesListModal = ({ onClose, isAdmin = false }: GuidesListModalProps) => {
  const [guides, setGuides] = useState<Guide[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedGuide, setSelectedGuide] = useState<Guide | null>(null);
  const [playingVideo, setPlayingVideo] = useState<string | null>(null);
  const [viewImageUrls, setViewImageUrls] = useState<string[] | null>(null);
  const [viewImageIndex, setViewImageIndex] = useState(0);
  const [search, setSearch] = useState("");

  // Drag & drop reorder
  const [isReordering, setIsReordering] = useState(false);
  const [reorderGuides, setReorderGuides] = useState<Guide[]>([]);
  const [isSavingOrder, setIsSavingOrder] = useState(false);
  const dragItem = useRef<number | null>(null);
  const dragOverItem = useRef<number | null>(null);

  // Touch drag state
  const [draggingIdx, setDraggingIdx] = useState<number | null>(null);
  const touchStartY = useRef<number>(0);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => { fetchGuides(); }, []);

  // Search: rank by number of matching keywords
  const filteredGuides = useMemo(() => {
    if (!search.trim()) return guides;
    const keywords = search.toLowerCase().split(/\s+/).filter(Boolean);
    if (keywords.length === 0) return guides;
    const scored = guides.map(g => {
      const text = `${g.title} ${g.content}`.toLowerCase();
      const matchCount = keywords.filter(kw => text.includes(kw)).length;
      return { guide: g, matchCount };
    }).filter(s => s.matchCount > 0);
    scored.sort((a, b) => b.matchCount - a.matchCount);
    return scored.map(s => s.guide);
  }, [guides, search]);

  const fetchGuides = async () => {
    try {
      const { data, error } = await supabase
        .from("guides" as any)
        .select("*")
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: false });
      if (error) throw error;
      setGuides((data as any[]) || []);
    } catch (error) {
      console.error("Fetch guides error:", error);
      toast.error("Không thể tải danh sách hướng dẫn!");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Bạn có chắc muốn xóa hướng dẫn này?")) return;
    try {
      const { error } = await supabase.from("guides" as any).delete().eq("id", id);
      if (error) throw error;
      setGuides(prev => prev.filter(g => g.id !== id));
      if (selectedGuide?.id === id) setSelectedGuide(null);
      toast.success("Đã xóa hướng dẫn!");
    } catch {
      toast.error("Không thể xóa!");
    }
  };

  // Start reordering mode
  const startReorder = useCallback(() => {
    setReorderGuides([...guides]);
    setIsReordering(true);
  }, [guides]);

  const cancelReorder = () => {
    setIsReordering(false);
    setReorderGuides([]);
  };

  // Mouse drag handlers
  const handleDragStart = (idx: number) => {
    dragItem.current = idx;
  };
  const handleDragEnter = (idx: number) => {
    dragOverItem.current = idx;
  };
  const handleDragEnd = () => {
    if (dragItem.current === null || dragOverItem.current === null) return;
    const items = [...reorderGuides];
    const [draggedItem] = items.splice(dragItem.current, 1);
    items.splice(dragOverItem.current, 0, draggedItem);
    setReorderGuides(items);
    dragItem.current = null;
    dragOverItem.current = null;
  };

  // Touch drag handlers
  const handleTouchStart = (idx: number, e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY;
    setDraggingIdx(idx);
    dragItem.current = idx;
  };
  const handleTouchMove = (e: React.TouchEvent) => {
    if (dragItem.current === null || !listRef.current) return;
    const touchY = e.touches[0].clientY;
    const items = listRef.current.querySelectorAll('[data-reorder-item]');
    for (let i = 0; i < items.length; i++) {
      const rect = items[i].getBoundingClientRect();
      if (touchY > rect.top && touchY < rect.bottom && i !== dragItem.current) {
        dragOverItem.current = i;
        break;
      }
    }
  };
  const handleTouchEnd = () => {
    handleDragEnd();
    setDraggingIdx(null);
  };

  // Save order
  const saveOrder = async () => {
    setIsSavingOrder(true);
    try {
      for (let i = 0; i < reorderGuides.length; i++) {
        const { error } = await supabase
          .from("guides" as any)
          .update({ sort_order: i } as any)
          .eq("id", reorderGuides[i].id);
        if (error) throw error;
      }
      setGuides(reorderGuides);
      setIsReordering(false);
      toast.success("Đã lưu thứ tự hướng dẫn!");
    } catch {
      toast.error("Không thể lưu thứ tự!");
    } finally {
      setIsSavingOrder(false);
    }
  };

  // Detail view
  if (selectedGuide) {
    const images = Array.isArray(selectedGuide.image_urls) ? selectedGuide.image_urls : [];
    const videos = Array.isArray(selectedGuide.video_urls) ? selectedGuide.video_urls : [];

    return (
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-card rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden"
          onClick={e => e.stopPropagation()}
        >
          <div className="flex items-center justify-between p-5 border-b shrink-0">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="icon" onClick={() => setSelectedGuide(null)}>
                <ChevronLeft className="w-5 h-5" />
              </Button>
              <h2 className="text-lg font-bold line-clamp-1">{selectedGuide.title}</h2>
            </div>
            <button onClick={onClose} className="w-9 h-9 rounded-full bg-muted flex items-center justify-center hover:bg-muted/80">
              <X className="w-4 h-4" />
            </button>
          </div>

          <ScrollArea className="flex-1 p-5">
            <div className="space-y-6">
              <div className="prose prose-sm max-w-none">
                <p className="text-foreground whitespace-pre-wrap leading-relaxed">{selectedGuide.content}</p>
              </div>

              {images.length > 0 && (
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Hình ảnh</h3>
                  <div className="grid grid-cols-2 gap-3">
                    {images.map((url, i) => (
                      <motion.img key={i} src={url} alt={`Hình ${i + 1}`}
                        className="w-full h-40 object-cover rounded-xl border cursor-pointer hover:opacity-80 transition-opacity"
                        whileHover={{ scale: 1.02 }}
                        onClick={() => { setViewImageUrls(images); setViewImageIndex(i); }}
                      />
                    ))}
                  </div>
                </div>
              )}

              {videos.length > 0 && (
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Video</h3>
                  <div className="space-y-3">
                    {videos.map((url, i) => (
                      <motion.div key={i} className="relative group rounded-xl overflow-hidden border cursor-pointer bg-black/5"
                        whileHover={{ scale: 1.01 }} onClick={() => setPlayingVideo(url)}>
                        <video src={url} className="w-full h-48 object-cover" preload="metadata" />
                        <div className="absolute inset-0 bg-black/30 flex items-center justify-center group-hover:bg-black/40 transition-colors">
                          <div className="w-16 h-16 rounded-full bg-white/90 flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
                            <Play className="w-7 h-7 text-primary ml-1" />
                          </div>
                        </div>
                        <div className="absolute bottom-3 left-3 px-3 py-1 bg-black/60 rounded-lg text-white text-xs">Video {i + 1}</div>
                      </motion.div>
                    ))}
                  </div>
                </div>
              )}

              <p className="text-xs text-muted-foreground pt-4 border-t">
                Ngày tạo: {new Date(selectedGuide.created_at).toLocaleString("vi-VN")}
              </p>
            </div>
          </ScrollArea>
        </motion.div>

        {playingVideo && <VideoPlayer url={playingVideo} onClose={() => setPlayingVideo(null)} />}
        {viewImageUrls && (
          <MediaViewerModal urls={viewImageUrls} initialIndex={viewImageIndex} onClose={() => setViewImageUrls(null)} />
        )}
      </div>
    );
  }

  const displayGuides = isReordering ? reorderGuides : filteredGuides;

  // List view
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-card rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-5 border-b shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <BookOpen className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 className="text-lg font-bold">Hướng dẫn</h2>
              <p className="text-xs text-muted-foreground">{guides.length} hướng dẫn</p>
            </div>
          </div>
          <button onClick={onClose} className="w-9 h-9 rounded-full bg-muted flex items-center justify-center hover:bg-muted/80">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Search */}
        <div className="px-4 pt-3 shrink-0">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Nhập vấn đề cần hướng dẫn..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>

        {/* Admin reorder controls */}
        {isAdmin && !isLoading && guides.length > 1 && (
          <div className="px-5 pt-3 shrink-0">
            {isReordering ? (
              <div className="flex gap-2">
                <Button size="sm" onClick={saveOrder} disabled={isSavingOrder} className="flex-1 btn-primary-gradient">
                  {isSavingOrder ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Save className="w-4 h-4 mr-1" />}
                  Lưu thứ tự
                </Button>
                <Button size="sm" variant="outline" onClick={cancelReorder} disabled={isSavingOrder}>
                  Hủy
                </Button>
              </div>
            ) : (
              <Button size="sm" variant="outline" className="w-full" onClick={startReorder}>
                <ArrowUpDown className="w-4 h-4 mr-2" />
                Sắp xếp hướng dẫn
              </Button>
            )}
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-4">
          {isLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : displayGuides.length === 0 ? (
            <div className="text-center py-12">
              <BookOpen className="w-12 h-12 mx-auto text-muted-foreground mb-3 opacity-50" />
              <p className="text-muted-foreground">{search ? "Không tìm thấy hướng dẫn phù hợp" : "Chưa có hướng dẫn nào"}</p>
            </div>
          ) : (
            <div className="space-y-2" ref={listRef}>
              {displayGuides.map((guide, idx) => (
                <motion.div
                  key={guide.id}
                  data-reorder-item
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: draggingIdx === idx ? 0.5 : 1, y: 0 }}
                  transition={{ delay: isReordering ? 0 : idx * 0.05 }}
                  className={`group border rounded-xl p-4 transition-all ${
                    isReordering 
                      ? "cursor-grab active:cursor-grabbing bg-muted/20 hover:bg-muted/40" 
                      : "hover:bg-muted/30 cursor-pointer"
                  }`}
                  draggable={isReordering}
                  onDragStart={() => isReordering && handleDragStart(idx)}
                  onDragEnter={() => isReordering && handleDragEnter(idx)}
                  onDragEnd={() => isReordering && handleDragEnd()}
                  onDragOver={e => isReordering && e.preventDefault()}
                  onTouchStart={e => isReordering && handleTouchStart(idx, e)}
                  onTouchMove={e => isReordering && handleTouchMove(e)}
                  onTouchEnd={() => isReordering && handleTouchEnd()}
                  onClick={() => !isReordering && setSelectedGuide(guide)}
                >
                  <div className="flex items-center gap-3">
                    {isReordering && (
                      <GripVertical className="w-5 h-5 text-muted-foreground shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-foreground line-clamp-1 group-hover:text-primary transition-colors">
                        {guide.title}
                      </h3>
                      <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                        <span>{new Date(guide.created_at).toLocaleDateString("vi-VN")}</span>
                        {Array.isArray(guide.image_urls) && guide.image_urls.length > 0 && (
                          <span>📷 {guide.image_urls.length}</span>
                        )}
                        {Array.isArray(guide.video_urls) && guide.video_urls.length > 0 && (
                          <span>🎬 {guide.video_urls.length}</span>
                        )}
                      </div>
                    </div>
                    {!isReordering && (
                      <div className="flex items-center gap-1">
                        <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" />
                        {isAdmin && (
                          <Button variant="ghost" size="icon"
                            className="w-8 h-8 opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={e => { e.stopPropagation(); handleDelete(guide.id); }}>
                            <Trash2 className="w-4 h-4 text-destructive" />
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
};

export default GuidesListModal;
