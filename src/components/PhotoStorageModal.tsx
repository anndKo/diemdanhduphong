import { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { 
  X, 
  FolderOpen, 
  Image as ImageIcon, 
  Loader2, 
  ScanFace,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Users,
  ImageOff,
  CheckCircle,
  Shield,
  Clock,
  Zap,
  XCircle,
  Eye
} from "lucide-react";
import { Progress } from "@/components/ui/progress";
import PhotoViewModal from "@/components/PhotoViewModal";
import ScanResultsView from "@/components/ScanResultsView";
import {
  scanClassImages,
  scanWeekImages,
  loadFaceModels,
  areModelsLoaded,
  clearEmbeddingCache,
  type ScanImage,
  type ScanProgress,
  type ScanSummary,
  type ScanResult,
} from "@/lib/imageScanService";

interface ClassInfo {
  id: string;
  name: string;
  weeks_count: number;
}

interface AttendanceRecord {
  id: string;
  name: string;
  student_code: string;
  group_number: string;
  photo_url: string;
  created_at: string;
  week_number: number;
}

interface PhotoStorageModalProps {
  classInfo: ClassInfo;
  onClose: () => void;
}

const PhotoStorageModal = ({ classInfo, onClose }: PhotoStorageModalProps) => {
  const [selectedWeek, setSelectedWeek] = useState(1);
  const [attendanceRecords, setAttendanceRecords] = useState<AttendanceRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null);
  const [selectedPhotoRecord, setSelectedPhotoRecord] = useState<AttendanceRecord | null>(null);
  const [modelsLoaded, setModelsLoaded] = useState(areModelsLoaded());

  // Scan state
  const [isScanning, setIsScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState<ScanProgress | null>(null);
  const [scanSummary, setScanSummary] = useState<ScanSummary | null>(null);
  const [resultFilter, setResultFilter] = useState<string>('all');
  const [showResults, setShowResults] = useState(false);
  const [showDetailedResults, setShowDetailedResults] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    loadFaceModels().then(() => setModelsLoaded(true)).catch(() => {
      toast.error("Không thể tải mô hình nhận diện!");
    });
    fetchAttendanceRecords();
    return () => { abortControllerRef.current?.abort(); };
  }, [classInfo.id]);

  const fetchAttendanceRecords = async () => {
    try {
      const { data, error } = await supabase
        .from("attendance_records" as any)
        .select("*")
        .eq("class_id", classInfo.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      setAttendanceRecords((data as any[]) || []);
    } catch {
      toast.error("Không thể tải dữ liệu điểm danh!");
    } finally {
      setIsLoading(false);
    }
  };

  const getPhotosByWeek = useCallback((week: number) => {
    return attendanceRecords.filter(r => r.week_number === week && r.photo_url);
  }, [attendanceRecords]);

  const allPhotosWithUrl = attendanceRecords.filter(r => r.photo_url);

  const toScanImages = (records: AttendanceRecord[]): ScanImage[] =>
    records.map(r => ({
      id: r.id,
      student_code: r.student_code,
      name: r.name,
      photo_url: r.photo_url,
      week_number: r.week_number,
      group_number: r.group_number,
      class_id: classInfo.id,
    }));

  const handleScanWeek = async () => {
    const weekPhotos = getPhotosByWeek(selectedWeek);
    if (weekPhotos.length < 1) { toast.info("Không có ảnh để quét!"); return; }
    await runScan(toScanImages(weekPhotos), `tuần ${selectedWeek}`);
  };

  const handleScanAll = async () => {
    if (allPhotosWithUrl.length < 1) { toast.info("Không có ảnh để quét!"); return; }
    await runScan(toScanImages(allPhotosWithUrl), "toàn bộ");
  };

  const runScan = async (images: ScanImage[], label: string) => {
    if (!modelsLoaded) { toast.error("Mô hình chưa sẵn sàng!"); return; }

    setIsScanning(true);
    setScanSummary(null);
    setShowResults(false);
    setResultFilter('all');

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const summary = await scanClassImages(
        images,
        classInfo.id,
        (progress) => setScanProgress(progress),
        controller.signal
      );

      setScanSummary(summary);
      setShowResults(true);

      const issues = summary.no_face + summary.different_person + summary.suspicious;
      if (issues > 0) {
        toast.warning(`Quét ${label}: phát hiện ${issues} vấn đề trong ${summary.total} ảnh (${(summary.duration_ms / 1000).toFixed(1)}s)`);
      } else {
        toast.success(`Quét ${label}: ${summary.total} ảnh hợp lệ (${(summary.duration_ms / 1000).toFixed(1)}s)`);
      }
    } catch (err: any) {
      if (err.message !== 'Aborted') {
        toast.error("Lỗi khi quét ảnh!");
        console.error(err);
      }
    } finally {
      setIsScanning(false);
      setScanProgress(null);
      abortControllerRef.current = null;
    }
  };

  const handleAbort = () => {
    abortControllerRef.current?.abort();
    setIsScanning(false);
    setScanProgress(null);
    toast.info("Đã huỷ quét");
  };

  const filteredResults = scanSummary?.results.filter(r => resultFilter === 'all' || r.status === resultFilter) || [];

  const weekPhotos = getPhotosByWeek(selectedWeek);

  const progressPercent = scanProgress
    ? scanProgress.total > 0 ? Math.round((scanProgress.current / scanProgress.total) * 100) : 0
    : 0;

  return (
    <div className="modal-overlay animate-fade-in" onClick={onClose}>
      <div
        className="fixed inset-4 md:inset-8 bg-card rounded-2xl shadow-2xl overflow-hidden flex flex-col animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 md:p-6 border-b border-border bg-card flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <FolderOpen className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-foreground">Kho lưu trữ ảnh</h2>
              <p className="text-sm text-muted-foreground">{classInfo.name} • {allPhotosWithUrl.length} ảnh</p>
            </div>
          </div>
          <button onClick={onClose} className="w-10 h-10 rounded-full bg-muted flex items-center justify-center hover:bg-muted/80 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden flex flex-col p-4 md:p-6">
          {/* Week selector */}
          <div className="flex items-center justify-between mb-4 shrink-0">
            <div className="flex items-center gap-2 overflow-x-auto pb-2">
              <Button variant="ghost" size="icon" onClick={() => setSelectedWeek(Math.max(1, selectedWeek - 1))} disabled={selectedWeek === 1}>
                <ChevronLeft className="w-4 h-4" />
              </Button>
              {Array.from({ length: classInfo.weeks_count }, (_, i) => i + 1).map((week) => (
                <Button key={week} size="sm" variant={selectedWeek === week ? "default" : "outline"} onClick={() => setSelectedWeek(week)} className="min-w-[48px]">
                  T{week}
                </Button>
              ))}
              <Button variant="ghost" size="icon" onClick={() => setSelectedWeek(Math.min(classInfo.weeks_count, selectedWeek + 1))} disabled={selectedWeek === classInfo.weeks_count}>
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {/* Scan buttons */}
          <div className="flex items-center justify-between mb-4 shrink-0 flex-wrap gap-2">
            <span className="text-sm text-muted-foreground">
              {weekPhotos.length} ảnh tuần {selectedWeek}
            </span>
            <div className="flex items-center gap-2 flex-wrap">
              {scanSummary && (
                <>
                  <Button variant="outline" size="sm" onClick={() => setShowResults(!showResults)}>
                    <Eye className="w-4 h-4 mr-1" />
                    {showResults ? 'Ẩn' : 'Xem'} kết quả
                  </Button>
                  <Button size="sm" className="bg-orange-600 hover:bg-orange-700 text-white" onClick={() => setShowDetailedResults(true)}>
                    <ScanFace className="w-4 h-4 mr-1" />
                    Xem chi tiết
                  </Button>
                </>
              )}
              <Button variant="outline" size="sm" onClick={() => clearEmbeddingCache().then(() => toast.success('Đã xoá cache'))}>
                Xoá cache
              </Button>
              <Button
                onClick={handleScanWeek}
                disabled={isScanning || !modelsLoaded || weekPhotos.length < 1}
                variant="outline"
              >
                {isScanning ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <ScanFace className="w-4 h-4 mr-2" />}
                Quét tuần {selectedWeek}
              </Button>
              <Button
                onClick={handleScanAll}
                disabled={isScanning || !modelsLoaded || allPhotosWithUrl.length < 1}
                className="btn-primary-gradient"
              >
                {isScanning ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Shield className="w-4 h-4 mr-2" />}
                Quét toàn bộ ({allPhotosWithUrl.length})
              </Button>
              {isScanning && (
                <Button variant="destructive" size="sm" onClick={handleAbort}>
                  <XCircle className="w-4 h-4 mr-1" /> Huỷ
                </Button>
              )}
            </div>
          </div>

          {/* Model loading */}
          {!modelsLoaded && (
            <div className="mb-4 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin text-amber-500" />
              <span className="text-sm text-amber-600 dark:text-amber-400">Đang tải mô hình nhận diện khuôn mặt...</span>
            </div>
          )}

          {/* Scan progress */}
          {isScanning && scanProgress && (
            <div className="mb-4 p-4 bg-primary/5 border border-primary/20 rounded-xl shrink-0">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-foreground">{scanProgress.message}</span>
                <span className="text-sm text-muted-foreground">{progressPercent}%</span>
              </div>
              <Progress value={progressPercent} className="h-2" />
              <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                <span className="flex items-center gap-1"><Zap className="w-3 h-3" /> {scanProgress.phase}</span>
                <span>{scanProgress.current}/{scanProgress.total}</span>
              </div>
            </div>
          )}

          {/* Scan Summary */}
          {scanSummary && showResults && (
            <div className="mb-4 shrink-0 space-y-3">
              {/* Stats cards */}
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2">
                <StatBadge label="Tổng" value={scanSummary.total} icon={ImageIcon} color="text-foreground" onClick={() => setResultFilter('all')} active={resultFilter === 'all'} />
                <StatBadge label="Hợp lệ" value={scanSummary.valid} icon={CheckCircle} color="text-emerald-500" onClick={() => setResultFilter('valid')} active={resultFilter === 'valid'} />
                <StatBadge label="Không mặt" value={scanSummary.no_face} icon={ImageOff} color="text-red-500" onClick={() => setResultFilter('no_face')} active={resultFilter === 'no_face'} />
                <StatBadge label="Người khác" value={scanSummary.different_person} icon={Users} color="text-orange-500" onClick={() => setResultFilter('different_person')} active={resultFilter === 'different_person'} />
                <StatBadge label="Nghi ngờ" value={scanSummary.suspicious} icon={AlertTriangle} color="text-amber-500" onClick={() => setResultFilter('suspicious')} active={resultFilter === 'suspicious'} />
                <StatBadge label="Thời gian" value={`${(scanSummary.duration_ms / 1000).toFixed(1)}s`} icon={Clock} color="text-muted-foreground" />
              </div>

              {/* Filtered results */}
              {filteredResults.length > 0 && (
                <div className="border border-border rounded-xl overflow-hidden">
                  <div className="max-h-[300px] overflow-y-auto">
                    {filteredResults.map((r, idx) => (
                      <ScanResultRow key={idx} result={r} onViewPhoto={setSelectedPhoto} />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Photos Grid */}
          <div className="flex-1 overflow-auto">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
              </div>
            ) : weekPhotos.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <ImageIcon className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>Chưa có ảnh nào trong tuần {selectedWeek}</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                {weekPhotos.map((record) => {
                  const scanResult = scanSummary?.results.find(r => r.image_id === record.id);
                  return (
                    <div
                      key={record.id}
                      className="group relative rounded-xl overflow-hidden cursor-pointer hover:shadow-lg transition-all duration-300"
                      onClick={() => { setSelectedPhoto(record.photo_url); setSelectedPhotoRecord(record); }}
                    >
                      <img src={record.photo_url} alt={record.name} className="w-full aspect-square object-cover" loading="lazy" />
                      {/* Scan status badge */}
                      {scanResult && (
                        <div className="absolute top-2 right-2">
                          <ScanStatusBadge status={scanResult.status} />
                        </div>
                      )}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                        <div className="absolute bottom-0 left-0 right-0 p-3 text-white">
                          <p className="font-medium text-sm line-clamp-1">{record.name}</p>
                          <p className="text-xs opacity-80">{record.student_code}</p>
                          {scanResult && scanResult.status !== 'valid' && (
                            <p className="text-xs text-amber-300 mt-1">
                              {scanResult.status === 'no_face' ? 'Không phát hiện mặt' :
                               scanResult.status === 'different_person' ? `Người khác (${(scanResult.similarity_score * 100).toFixed(0)}%)` :
                               scanResult.status === 'suspicious' ? `Nghi ngờ: ${scanResult.error_message || `${(scanResult.similarity_score * 100).toFixed(0)}%`}` :
                               scanResult.error_message || 'Lỗi'}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Photo View Modal */}
      {selectedPhoto && (
        <PhotoViewModal
          photoUrl={selectedPhoto}
          studentInfo={selectedPhotoRecord ? {
            student_code: selectedPhotoRecord.student_code,
            student_name: selectedPhotoRecord.name,
            group_number: selectedPhotoRecord.group_number,
            class_id: classInfo.id,
            week_number: selectedPhotoRecord.week_number,
          } : undefined}
          onClose={() => { setSelectedPhoto(null); setSelectedPhotoRecord(null); }}
          onWarningAdded={() => {}}
        />
      )}

      {/* Detailed Scan Results View */}
      {showDetailedResults && scanSummary && (
        <ScanResultsView
          scanSummary={scanSummary}
          onClose={() => setShowDetailedResults(false)}
        />
      )}
    </div>
  );
};

// ─── Sub-components ──────────────────────────────────────────────────

const StatBadge = ({ label, value, icon: Icon, color, onClick, active }: {
  label: string; value: string | number; icon: any; color: string; onClick?: () => void; active?: boolean;
}) => (
  <button
    onClick={onClick}
    className={`p-2 rounded-lg border text-center transition-colors ${
      active ? 'border-primary bg-primary/10' : 'border-border bg-card hover:bg-muted/50'
    } ${onClick ? 'cursor-pointer' : 'cursor-default'}`}
  >
    <Icon className={`w-4 h-4 mx-auto mb-1 ${color}`} />
    <p className={`text-lg font-bold ${color}`}>{value}</p>
    <p className="text-[10px] text-muted-foreground">{label}</p>
  </button>
);

const ScanStatusBadge = ({ status }: { status: ScanResult['status'] }) => {
  const config: Record<string, { icon: any; bg: string }> = {
    valid: { icon: CheckCircle, bg: 'bg-emerald-500' },
    no_face: { icon: ImageOff, bg: 'bg-red-500' },
    different_person: { icon: Users, bg: 'bg-orange-500' },
    suspicious: { icon: AlertTriangle, bg: 'bg-amber-500' },
    error: { icon: XCircle, bg: 'bg-red-600' },
  };
  const cfg = config[status] || config.error;
  const Icon = cfg.icon;
  return (
    <div className={`${cfg.bg} rounded-full p-1 shadow-lg`}>
      <Icon className="w-3.5 h-3.5 text-white" />
    </div>
  );
};

const ScanResultRow = ({ result, onViewPhoto }: { result: ScanResult; onViewPhoto: (url: string) => void }) => {
  const statusLabels: Record<string, { label: string; color: string }> = {
    valid: { label: 'Hợp lệ', color: 'text-emerald-500' },
    no_face: { label: 'Không mặt', color: 'text-red-500' },
    different_person: { label: 'Người khác', color: 'text-orange-500' },
    suspicious: { label: 'Nghi ngờ', color: 'text-amber-500' },
    error: { label: 'Lỗi', color: 'text-red-600' },
  };
  const cfg = statusLabels[result.status] || statusLabels.error;

  return (
    <div className="flex items-center gap-3 p-2.5 border-b border-border/50 last:border-b-0 hover:bg-muted/30 transition-colors">
      <button onClick={() => onViewPhoto(result.image_path)} className="shrink-0">
        <img src={result.image_path} alt="" className="w-10 h-10 rounded-lg object-cover" loading="lazy" />
      </button>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{result.name}</p>
        <p className="text-xs text-muted-foreground">{result.student_code} • Tuần {result.week}</p>
      </div>
      <div className="text-right shrink-0">
        <p className={`text-xs font-medium ${cfg.color}`}>{cfg.label}</p>
        {result.similarity_score > 0 && result.status !== 'no_face' && (
          <p className="text-[10px] text-muted-foreground">{(result.similarity_score * 100).toFixed(1)}%</p>
        )}
      </div>
      {result.error_message && (
        <span className="text-[10px] text-destructive truncate max-w-[120px]" title={result.error_message}>
          {result.error_message}
        </span>
      )}
    </div>
  );
};

export default PhotoStorageModal;
