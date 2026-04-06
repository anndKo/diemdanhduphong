import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ScanSearch, AlertTriangle, CheckCircle2, XCircle, Loader2, Filter, Download, Trash2, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface ScanResult {
  id: string;
  image_path: string;
  status: string;
  similarity_score: number;
  week: string | null;
  processing_time_ms: number;
  error_message: string | null;
  created_at: string;
}

interface Props {
  onClose: () => void;
}

const statusConfig: Record<string, { label: string; icon: typeof CheckCircle2; color: string; bg: string }> = {
  valid: { label: 'Hợp lệ', icon: CheckCircle2, color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
  no_face: { label: 'Không có mặt', icon: XCircle, color: 'text-red-400', bg: 'bg-red-500/10' },
  different_person: { label: 'Người khác', icon: AlertTriangle, color: 'text-amber-400', bg: 'bg-amber-500/10' },
  low_confidence: { label: 'Độ tin cậy thấp', icon: AlertTriangle, color: 'text-orange-400', bg: 'bg-orange-500/10' },
  error: { label: 'Lỗi', icon: XCircle, color: 'text-red-500', bg: 'bg-red-500/10' },
  pending: { label: 'Đang chờ', icon: Loader2, color: 'text-muted-foreground', bg: 'bg-muted/50' },
};

const ImageScanResultsModal = ({ onClose }: Props) => {
  const [results, setResults] = useState<ScanResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('all');
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);

  useEffect(() => {
    fetchResults();
  }, []);

  const fetchResults = async () => {
    try {
      const { data, error } = await (supabase.from as any)('image_scan_results')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(500);
      if (error) throw error;
      setResults(data || []);
    } catch (e: any) {
      toast.error('Không thể tải kết quả quét');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      const { error } = await (supabase.from as any)('image_scan_results').delete().eq('id', deleteId);
      if (error) throw error;
      setResults(r => r.filter(x => x.id !== deleteId));
      toast.success('Đã xoá kết quả');
    } catch {
      toast.error('Không thể xoá');
    } finally {
      setDeleteId(null);
    }
  };

  const filtered = filter === 'all' ? results : results.filter(r => r.status === filter);

  const stats = {
    total: results.length,
    valid: results.filter(r => r.status === 'valid').length,
    no_face: results.filter(r => r.status === 'no_face').length,
    different_person: results.filter(r => r.status === 'different_person').length,
    error: results.filter(r => r.status === 'error' || r.status === 'low_confidence').length,
  };

  const exportJSON = () => {
    const blob = new Blob([JSON.stringify(results, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `scan_results_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="bg-card border border-border rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden shadow-2xl"
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between p-5 border-b border-border">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <ScanSearch className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h2 className="text-lg font-semibold">Kết quả quét ảnh</h2>
                <p className="text-xs text-muted-foreground">{results.length} kết quả</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={exportJSON}>
                <Download className="w-4 h-4 mr-1" /> Xuất JSON
              </Button>
              <Button variant="ghost" size="icon" onClick={onClose}>
                <X className="w-5 h-5" />
              </Button>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 border-b border-border bg-muted/30">
            <StatCard label="Hợp lệ" value={stats.valid} total={stats.total} color="text-emerald-400" />
            <StatCard label="Không có mặt" value={stats.no_face} total={stats.total} color="text-red-400" />
            <StatCard label="Người khác" value={stats.different_person} total={stats.total} color="text-amber-400" />
            <StatCard label="Lỗi" value={stats.error} total={stats.total} color="text-orange-400" />
          </div>

          {/* Filters */}
          <div className="flex gap-2 p-4 overflow-x-auto">
            {['all', 'valid', 'no_face', 'different_person', 'low_confidence', 'error'].map(f => (
              <Button
                key={f}
                variant={filter === f ? 'default' : 'outline'}
                size="sm"
                onClick={() => setFilter(f)}
                className="shrink-0"
              >
                {f === 'all' ? 'Tất cả' : statusConfig[f]?.label || f}
              </Button>
            ))}
          </div>

          {/* Results List */}
          <div className="overflow-y-auto max-h-[50vh] p-4 space-y-2">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
              </div>
            ) : filtered.length === 0 ? (
              <p className="text-center text-muted-foreground py-12">Không có kết quả nào</p>
            ) : (
              filtered.map(r => {
                const cfg = statusConfig[r.status] || statusConfig.pending;
                const Icon = cfg.icon;
                return (
                  <motion.div
                    key={r.id}
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`flex items-center gap-3 p-3 rounded-xl border border-border/50 ${cfg.bg} hover:border-border transition-colors`}
                  >
                    <div className={`shrink-0 ${cfg.color}`}>
                      <Icon className="w-5 h-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{r.image_path.split('/').pop()}</p>
                      <div className="flex gap-3 text-xs text-muted-foreground mt-0.5">
                        {r.week && <span>Tuần: {r.week}</span>}
                        <span>Điểm: {(r.similarity_score * 100).toFixed(1)}%</span>
                        <span>{r.processing_time_ms.toFixed(0)}ms</span>
                      </div>
                      {r.error_message && (
                        <p className="text-xs text-destructive mt-1 truncate">{r.error_message}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {r.image_path.startsWith('http') && (
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setSelectedImage(r.image_path)}>
                          <Eye className="w-4 h-4" />
                        </Button>
                      )}
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => setDeleteId(r.id)}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </motion.div>
                );
              })
            )}
          </div>
        </motion.div>
      </motion.div>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent onClick={e => e.stopPropagation()}>
          <AlertDialogHeader>
            <AlertDialogTitle>Xác nhận xoá</AlertDialogTitle>
            <AlertDialogDescription>Bạn có chắc muốn xoá kết quả quét này?</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Huỷ</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">Xoá</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Image preview */}
      {selectedImage && (
        <div className="fixed inset-0 z-[60] bg-black/80 flex items-center justify-center p-4" onClick={() => setSelectedImage(null)}>
          <img src={selectedImage} alt="Preview" className="max-w-full max-h-full rounded-lg object-contain" />
        </div>
      )}
    </>
  );
};

const StatCard = ({ label, value, total, color }: { label: string; value: number; total: number; color: string }) => (
  <div className="text-center p-3 rounded-xl bg-card border border-border/50">
    <p className={`text-2xl font-bold ${color}`}>{value}</p>
    <p className="text-xs text-muted-foreground mt-1">{label}</p>
    {total > 0 && <p className="text-[10px] text-muted-foreground">{((value / total) * 100).toFixed(1)}%</p>}
  </div>
);

export default ImageScanResultsModal;
