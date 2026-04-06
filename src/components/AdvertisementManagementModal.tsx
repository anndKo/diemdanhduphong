import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { X, Plus, Trash2, Edit2, Power, PowerOff, Loader2, Image, Link, FileText, Type, AlertTriangle, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface Advertisement {
  id: string;
  title: string;
  content: string;
  image_url: string | null;
  link: string | null;
  is_active: boolean;
  created_at: string;
}

interface AdvertisementManagementModalProps {
  onClose: () => void;
}

const AdvertisementManagementModal = ({ onClose }: AdvertisementManagementModalProps) => {
  const [ads, setAds] = useState<Advertisement[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingAd, setEditingAd] = useState<Advertisement | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState({
    title: "",
    content: "",
    image_url: "",
    link: "",
  });

  useEffect(() => {
    fetchAds();
  }, []);

  const fetchAds = async () => {
    try {
      const { data, error } = await (supabase as any)
        .from("advertisements")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      setAds(data || []);
    } catch {
      toast.error("Không thể tải danh sách quảng cáo!");
    } finally {
      setIsLoading(false);
    }
  };

  const handleImageUpload = async (file: File) => {
    setIsUploadingImage(true);
    try {
      const ext = file.name.split(".").pop();
      const fileName = `ad_${Date.now()}.${ext}`;
      const { error } = await supabase.storage
        .from("advertisement-images")
        .upload(fileName, file, { contentType: file.type, upsert: false });
      if (error) throw error;
      const { data: { publicUrl } } = supabase.storage
        .from("advertisement-images")
        .getPublicUrl(fileName);
      setForm((f) => ({ ...f, image_url: publicUrl }));
      toast.success("Đã tải ảnh lên!");
    } catch {
      toast.error("Không thể tải ảnh lên!");
    } finally {
      setIsUploadingImage(false);
    }
  };

  const openCreate = () => {
    setEditingAd(null);
    setForm({ title: "", content: "", image_url: "", link: "" });
    setShowForm(true);
  };

  const openEdit = (ad: Advertisement) => {
    setEditingAd(ad);
    setForm({
      title: ad.title,
      content: ad.content,
      image_url: ad.image_url || "",
      link: ad.link || "",
    });
    setShowForm(true);
  };

  const handleSubmit = async () => {
    if (!form.title.trim() || !form.content.trim()) {
      toast.error("Vui lòng nhập tiêu đề và nội dung!");
      return;
    }
    setIsSubmitting(true);
    try {
      const payload = {
        title: form.title.trim(),
        content: form.content.trim(),
        image_url: form.image_url.trim() || null,
        link: form.link.trim() || null,
      };
      if (editingAd) {
        const { error } = await (supabase as any)
          .from("advertisements")
          .update(payload)
          .eq("id", editingAd.id);
        if (error) throw error;
        toast.success("Đã cập nhật quảng cáo!");
      } else {
        const { error } = await (supabase as any)
          .from("advertisements")
          .insert({ ...payload, is_active: false });
        if (error) throw error;
        toast.success("Đã tạo quảng cáo!");
      }
      setShowForm(false);
      fetchAds();
    } catch {
      toast.error("Không thể lưu quảng cáo!");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggle = async (ad: Advertisement) => {
    const willActivate = !ad.is_active;
    try {
      // If activating: deactivate all others first
      if (willActivate) {
        await (supabase as any)
          .from("advertisements")
          .update({ is_active: false })
          .eq("is_active", true);
      }
      const { error } = await (supabase as any)
        .from("advertisements")
        .update({ is_active: willActivate })
        .eq("id", ad.id);
      if (error) throw error;
      toast.success(willActivate ? "Đã bật quảng cáo!" : "Đã tắt quảng cáo!");
      fetchAds();
    } catch {
      toast.error("Không thể thay đổi trạng thái!");
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const { error } = await (supabase as any)
        .from("advertisements")
        .delete()
        .eq("id", id);
      if (error) throw error;
      setDeleteConfirm(null);
      toast.success("Đã xóa quảng cáo!");
      fetchAds();
    } catch {
      toast.error("Không thể xóa quảng cáo!");
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: "hsl(var(--foreground) / 0.4)", backdropFilter: "blur(6px)" }}
    >
      <div
        className="bg-card border border-border/60 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col mx-4"
        style={{ animation: "scaleIn 0.25s cubic-bezier(0.34,1.56,0.64,1) forwards" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border/40 shrink-0">
          <h2 className="text-lg font-bold text-foreground">Quản lý Quảng cáo</h2>
          <div className="flex items-center gap-2">
            <Button size="sm" className="btn-primary-gradient h-8 text-xs" onClick={openCreate}>
              <Plus className="w-3.5 h-3.5 mr-1" />
              Thêm quảng cáo
            </Button>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-muted flex items-center justify-center hover:bg-muted/80 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="overflow-y-auto flex-1 p-6 space-y-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : ads.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <Image className="w-12 h-12 mx-auto mb-3 opacity-40" />
              <p>Chưa có quảng cáo nào.</p>
            </div>
          ) : (
            ads.map((ad) => (
              <div
                key={ad.id}
                className={`border rounded-xl p-4 transition-all ${
                  ad.is_active
                    ? "border-primary/40 bg-primary/5"
                    : "border-border/40 bg-muted/30"
                }`}
              >
                <div className="flex items-start gap-3">
                  {/* Image preview */}
                  {ad.image_url && (
                    <img
                      src={ad.image_url}
                      alt={ad.title}
                      className="w-16 h-16 rounded-lg object-cover shrink-0"
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-semibold text-foreground text-sm truncate">
                        {ad.title}
                      </span>
                      {ad.is_active && (
                        <span className="shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-green-500/20 text-green-600">
                          ĐANG BẬT
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-2">{ad.content}</p>
                    {ad.link && (
                      <p className="text-xs text-primary mt-1 truncate">{ad.link}</p>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      size="icon"
                      variant="ghost"
                      className={`w-8 h-8 ${ad.is_active ? "text-green-600" : "text-muted-foreground"}`}
                      onClick={() => handleToggle(ad)}
                      title={ad.is_active ? "Tắt" : "Bật"}
                    >
                      {ad.is_active ? <Power className="w-4 h-4" /> : <PowerOff className="w-4 h-4" />}
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="w-8 h-8"
                      onClick={() => openEdit(ad)}
                    >
                      <Edit2 className="w-4 h-4" />
                    </Button>
                    {deleteConfirm === ad.id ? (
                      <div className="flex items-center gap-1">
                        <Button
                          size="icon"
                          variant="destructive"
                          className="w-7 h-7"
                          onClick={() => handleDelete(ad.id)}
                        >
                          <Check className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="w-7 h-7"
                          onClick={() => setDeleteConfirm(null)}
                        >
                          <X className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    ) : (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="w-8 h-8 text-destructive"
                        onClick={() => setDeleteConfirm(ad.id)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Form Modal */}
      {showForm && (
        <div
          className="absolute inset-0 z-10 flex items-center justify-center"
          style={{ backgroundColor: "hsl(var(--foreground) / 0.25)" }}
        >
          <div
            className="bg-card border border-border/60 rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6"
            style={{ animation: "scaleIn 0.2s cubic-bezier(0.34,1.56,0.64,1) forwards" }}
          >
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-bold text-foreground">
                {editingAd ? "Chỉnh sửa quảng cáo" : "Thêm quảng cáo"}
              </h3>
              <button
                onClick={() => setShowForm(false)}
                className="w-7 h-7 rounded-full bg-muted flex items-center justify-center hover:bg-muted/80"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <Label className="text-xs mb-1 flex items-center gap-1.5">
                  <Type className="w-3.5 h-3.5" /> Tiêu đề *
                </Label>
                <Input
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  placeholder="Nhập tiêu đề quảng cáo"
                  className="text-sm"
                />
              </div>

              <div>
                <Label className="text-xs mb-1 flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5" /> Nội dung *
                </Label>
                <Textarea
                  value={form.content}
                  onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
                  placeholder="Nhập nội dung quảng cáo"
                  className="text-sm resize-none"
                  rows={3}
                />
              </div>

              {/* Image upload */}
              <div>
                <Label className="text-xs mb-1 flex items-center gap-1.5">
                  <Image className="w-3.5 h-3.5" /> Hình ảnh (tuỳ chọn)
                </Label>
                <div className="flex gap-2">
                  <Input
                    value={form.image_url}
                    onChange={(e) => setForm((f) => ({ ...f, image_url: e.target.value }))}
                    placeholder="URL ảnh hoặc tải từ thiết bị"
                    className="text-sm flex-1"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="shrink-0"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploadingImage}
                  >
                    {isUploadingImage ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      "Tải lên"
                    )}
                  </Button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleImageUpload(file);
                      e.target.value = "";
                    }}
                  />
                </div>
                {form.image_url && (
                  <img
                    src={form.image_url}
                    alt="Preview"
                    className="mt-2 h-24 rounded-lg object-cover w-full"
                  />
                )}
              </div>

              <div>
                <Label className="text-xs mb-1 flex items-center gap-1.5">
                  <Link className="w-3.5 h-3.5" /> Link (tuỳ chọn)
                </Label>
                <Input
                  value={form.link}
                  onChange={(e) => setForm((f) => ({ ...f, link: e.target.value }))}
                  placeholder="https://..."
                  className="text-sm"
                />
              </div>

              <div className="flex gap-2 pt-1">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => setShowForm(false)}
                  disabled={isSubmitting}
                >
                  Hủy
                </Button>
                <Button
                  className="flex-1 btn-primary-gradient"
                  onClick={handleSubmit}
                  disabled={isSubmitting}
                >
                  {isSubmitting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : editingAd ? (
                    "Cập nhật"
                  ) : (
                    "Thêm quảng cáo"
                  )}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes scaleIn {
          from { opacity: 0; transform: scale(0.92); }
          to   { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </div>
  );
};

export default AdvertisementManagementModal;
