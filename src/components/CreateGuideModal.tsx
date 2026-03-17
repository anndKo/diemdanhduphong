import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { uploadFileWithProgress } from "@/lib/uploadWithProgress";
import { toast } from "sonner";
import { X, Loader2, Upload, Image as ImageIcon, Video, Trash2, BookPlus } from "lucide-react";
import { motion } from "framer-motion";

interface CreateGuideModalProps {
  onClose: () => void;
  onCreated?: () => void;
}

const CreateGuideModal = ({ onClose, onCreated }: CreateGuideModalProps) => {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const [videoFiles, setVideoFiles] = useState<File[]>([]);
  const [videoNames, setVideoNames] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadLabel, setUploadLabel] = useState("");

  const imageInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []).filter(f => f.type.startsWith("image/"));
    if (files.length === 0) return;
    setImageFiles(prev => [...prev, ...files]);
    setImagePreviews(prev => [...prev, ...files.map(f => URL.createObjectURL(f))]);
    if (imageInputRef.current) imageInputRef.current.value = "";
  };

  const handleVideoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []).filter(f => f.type.startsWith("video/"));
    if (files.length === 0) { toast.error("Vui lòng chọn file video!"); return; }
    setVideoFiles(prev => [...prev, ...files]);
    setVideoNames(prev => [...prev, ...files.map(f => f.name)]);
    if (videoInputRef.current) videoInputRef.current.value = "";
  };

  const removeImage = (idx: number) => {
    URL.revokeObjectURL(imagePreviews[idx]);
    setImageFiles(prev => prev.filter((_, i) => i !== idx));
    setImagePreviews(prev => prev.filter((_, i) => i !== idx));
  };

  const removeVideo = (idx: number) => {
    setVideoFiles(prev => prev.filter((_, i) => i !== idx));
    setVideoNames(prev => prev.filter((_, i) => i !== idx));
  };

  const handleSubmit = async () => {
    if (!title.trim()) { toast.error("Vui lòng nhập tiêu đề!"); return; }
    if (!content.trim()) { toast.error("Vui lòng nhập nội dung!"); return; }

    setIsSubmitting(true);
    setUploadProgress(0);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Chưa đăng nhập");

      const totalFiles = imageFiles.length + videoFiles.length;
      let completedFiles = 0;
      const imageUrls: string[] = [];
      const videoUrls: string[] = [];

      // Upload images
      for (let i = 0; i < imageFiles.length; i++) {
        setUploadLabel(`Đang tải ảnh ${i + 1}/${imageFiles.length}...`);
        const file = imageFiles[i];
        const fileName = `images/${Date.now()}_${i}_${file.name}`;
        const url = await uploadFileWithProgress("guide-media", fileName, file, supabaseUrl, supabaseKey, (p) => {
          const overallPercent = totalFiles > 0 ? Math.round(((completedFiles + p / 100) / totalFiles) * 100) : p;
          setUploadProgress(overallPercent);
        });
        imageUrls.push(url);
        completedFiles++;
      }

      // Upload videos
      for (let i = 0; i < videoFiles.length; i++) {
        setUploadLabel(`Đang tải video ${i + 1}/${videoFiles.length}...`);
        const file = videoFiles[i];
        const fileName = `videos/${Date.now()}_${i}_${file.name}`;
        const url = await uploadFileWithProgress("guide-media", fileName, file, supabaseUrl, supabaseKey, (p) => {
          const overallPercent = totalFiles > 0 ? Math.round(((completedFiles + p / 100) / totalFiles) * 100) : p;
          setUploadProgress(overallPercent);
        });
        videoUrls.push(url);
        completedFiles++;
      }

      setUploadLabel("Đang lưu hướng dẫn...");
      setUploadProgress(100);
      const { error } = await supabase.from("guides" as any).insert({
        title: title.trim(),
        content: content.trim(),
        image_urls: imageUrls,
        video_urls: videoUrls,
        created_by: session.user.id,
      });
      if (error) throw error;

      toast.success("Đã tạo hướng dẫn thành công!");
      onCreated?.();
      onClose();
    } catch (error: any) {
      console.error("Create guide error:", error);
      toast.error(error.message || "Không thể tạo hướng dẫn!");
    } finally {
      setIsSubmitting(false);
      setUploadProgress(0);
      setUploadLabel("");
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-card rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-5 border-b shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <BookPlus className="w-5 h-5 text-primary" />
            </div>
            <h2 className="text-lg font-bold">Tạo hướng dẫn</h2>
          </div>
          <button onClick={onClose} className="w-9 h-9 rounded-full bg-muted flex items-center justify-center hover:bg-muted/80">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Tiêu đề</label>
            <Input placeholder="Nhập tiêu đề hướng dẫn..." value={title} onChange={e => setTitle(e.target.value)} />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Nội dung</label>
            <Textarea placeholder="Nhập nội dung hướng dẫn..." value={content} onChange={e => setContent(e.target.value)} className="min-h-[120px]" />
          </div>

          {/* Images */}
          <div className="space-y-2">
            <label className="text-sm font-medium flex items-center gap-2">
              <ImageIcon className="w-4 h-4" /> Hình ảnh
            </label>
            <input ref={imageInputRef} type="file" accept="image/*" multiple onChange={handleImageSelect} className="hidden" />
            <Button variant="outline" className="w-full" onClick={() => imageInputRef.current?.click()}>
              <Upload className="w-4 h-4 mr-2" /> Tải hình ảnh
            </Button>
            {imagePreviews.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {imagePreviews.map((url, i) => (
                  <div key={i} className="relative group">
                    <img src={url} alt="" className="w-20 h-20 object-cover rounded-lg border" />
                    <button onClick={() => removeImage(i)} className="absolute -top-2 -right-2 w-5 h-5 bg-destructive text-destructive-foreground rounded-full flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity">
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Videos */}
          <div className="space-y-2">
            <label className="text-sm font-medium flex items-center gap-2">
              <Video className="w-4 h-4" /> Video
            </label>
            <input ref={videoInputRef} type="file" accept="video/*" multiple onChange={handleVideoSelect} className="hidden" />
            <Button variant="outline" className="w-full" onClick={() => videoInputRef.current?.click()}>
              <Upload className="w-4 h-4 mr-2" /> Tải video
            </Button>
            {videoNames.length > 0 && (
              <div className="space-y-1">
                {videoNames.map((name, i) => (
                  <div key={i} className="flex items-center gap-2 px-3 py-2 bg-muted/50 rounded-lg text-sm">
                    <Video className="w-4 h-4 text-primary shrink-0" />
                    <span className="truncate flex-1">{name}</span>
                    <button onClick={() => removeVideo(i)} className="text-muted-foreground hover:text-destructive">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-5 border-t shrink-0">
          {isSubmitting && (
            <div className="mb-3 space-y-1.5">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground flex items-center gap-2">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" /> {uploadLabel}
                </span>
                <span className="font-semibold text-primary">{uploadProgress}%</span>
              </div>
              <Progress value={uploadProgress} className="h-2" />
            </div>
          )}
          <Button className="w-full btn-primary-gradient" onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <BookPlus className="w-4 h-4 mr-2" />}
            Xác nhận tạo hướng dẫn
          </Button>
        </div>
      </motion.div>
    </div>
  );
};

export default CreateGuideModal;
