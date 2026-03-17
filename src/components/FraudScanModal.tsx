import { useState, useEffect, useMemo, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { 
  X, ShieldAlert, Search, CheckSquare, Square, Loader2, 
  AlertTriangle, Shield, ChevronDown, ChevronUp, Eye,
  FileText, Camera
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { analyzeImage, generateFraudResults, type FraudResult } from "@/lib/fraudAnalysis";

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

interface FraudScanModalProps {
  classInfo: ClassInfo;
  onClose: () => void;
}

const FraudScanModal = ({ classInfo, onClose }: FraudScanModalProps) => {
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [isLoadingRecords, setIsLoadingRecords] = useState(true);
  const [selectedWeeks, setSelectedWeeks] = useState<Set<number>>(new Set());
  const [isScanning, setIsScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  const [currentScanInfo, setCurrentScanInfo] = useState("");
  const [results, setResults] = useState<FraudResult[] | null>(null);
  const [expandedResult, setExpandedResult] = useState<number | null>(null);
  const [viewMode, setViewMode] = useState<'select' | 'results'>('select');

  // Fetch attendance records
  useEffect(() => {
    (async () => {
      try {
        const { data, error } = await supabase
          .from("attendance_records" as any)
          .select("*")
          .eq("class_id", classInfo.id)
          .not("photo_url", "is", null)
          .order("week_number");
        if (error) throw error;
        setRecords((data as any[]) || []);
      } catch (err) {
        console.error(err);
        toast.error("Không thể tải dữ liệu!");
      } finally {
        setIsLoadingRecords(false);
      }
    })();
  }, [classInfo.id]);

  // Week stats
  const weekStats = useMemo(() => {
    const stats: { week: number; count: number }[] = [];
    for (let w = 1; w <= classInfo.weeks_count; w++) {
      const count = records.filter(r => r.week_number === w && r.photo_url).length;
      stats.push({ week: w, count });
    }
    return stats;
  }, [records, classInfo.weeks_count]);

  const toggleWeek = (week: number) => {
    setSelectedWeeks(prev => {
      const next = new Set(prev);
      if (next.has(week)) next.delete(week);
      else next.add(week);
      return next;
    });
  };

  const selectAll = () => {
    const all = new Set<number>();
    weekStats.filter(w => w.count > 0).forEach(w => all.add(w.week));
    setSelectedWeeks(all);
  };

  const deselectAll = () => setSelectedWeeks(new Set());

  const totalPhotosSelected = useMemo(() => {
    return records.filter(r => selectedWeeks.has(r.week_number) && r.photo_url).length;
  }, [records, selectedWeeks]);

  // Start scan
  const handleStartScan = useCallback(async () => {
    if (selectedWeeks.size === 0) {
      toast.error("Vui lòng chọn ít nhất 1 tuần!");
      return;
    }

    const photosToScan = records.filter(r => selectedWeeks.has(r.week_number) && r.photo_url);
    if (photosToScan.length === 0) {
      toast.info("Không có ảnh nào để quét!");
      return;
    }

    setIsScanning(true);
    setScanProgress(0);
    setResults(null);
    setViewMode('results');

    try {
      const analyses = [];
      for (let i = 0; i < photosToScan.length; i++) {
        const r = photosToScan[i];
        setCurrentScanInfo(`${r.name} - Tuần ${r.week_number} (${i + 1}/${photosToScan.length})`);
        setScanProgress(Math.round(((i) / photosToScan.length) * 100));

        try {
          const analysis = await analyzeImage(r, (step) => {
            setCurrentScanInfo(`${r.name} - ${step}`);
          });
          analyses.push(analysis);
        } catch (err) {
          console.error(`Error analyzing ${r.name}:`, err);
        }

        // Yield to UI
        await new Promise(r => setTimeout(r, 10));
      }

      setScanProgress(100);
      setCurrentScanInfo("Đang phân tích kết quả...");
      await new Promise(r => setTimeout(r, 100));

      const fraudResults = generateFraudResults(analyses);
      setResults(fraudResults);

      const highRisk = fraudResults.filter(r => r.riskLevel === 'high').length;
      const suspicious = fraudResults.filter(r => r.riskLevel === 'suspicious').length;

      if (highRisk > 0) {
        toast.error(`Phát hiện ${highRisk} ảnh gian lận cao!`);
      } else if (suspicious > 0) {
        toast.warning(`Phát hiện ${suspicious} ảnh nghi ngờ!`);
      } else {
        toast.success("Không phát hiện gian lận!");
      }
    } catch (err) {
      console.error("Scan error:", err);
      toast.error("Có lỗi xảy ra khi quét!");
    } finally {
      setIsScanning(false);
      setCurrentScanInfo("");
    }
  }, [records, selectedWeeks]);

  const getRiskColor = (level: FraudResult['riskLevel']) => {
    switch (level) {
      case 'safe': return 'text-green-600 bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800';
      case 'suspicious': return 'text-yellow-600 bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800';
      case 'high': return 'text-red-600 bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800';
    }
  };

  const getRiskLabel = (level: FraudResult['riskLevel']) => {
    switch (level) {
      case 'safe': return 'An toàn';
      case 'suspicious': return 'Nghi ngờ';
      case 'high': return 'Gian lận cao';
    }
  };

  const getRiskIcon = (level: FraudResult['riskLevel']) => {
    switch (level) {
      case 'safe': return <Shield className="w-4 h-4" />;
      case 'suspicious': return <AlertTriangle className="w-4 h-4" />;
      case 'high': return <ShieldAlert className="w-4 h-4" />;
    }
  };

  const summaryStats = useMemo(() => {
    if (!results) return null;
    return {
      total: results.length,
      safe: results.filter(r => r.riskLevel === 'safe').length,
      suspicious: results.filter(r => r.riskLevel === 'suspicious').length,
      high: results.filter(r => r.riskLevel === 'high').length,
    };
  }, [results]);

  return (
    <div className="modal-overlay animate-fade-in" style={{ zIndex: 60 }} onClick={isScanning ? undefined : onClose}>
      <div
        className="fixed inset-3 md:inset-6 lg:inset-12 bg-card rounded-2xl shadow-2xl overflow-hidden flex flex-col animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 md:p-5 border-b bg-gradient-to-r from-slate-800 to-slate-700 dark:from-slate-900 dark:to-slate-800 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 flex items-center justify-center">
              <ShieldAlert className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Quét gian lận</h2>
              <p className="text-sm text-slate-300">{classInfo.name} • Phân tích ảnh kỹ thuật số</p>
            </div>
          </div>
          {!isScanning && (
            <button
              onClick={onClose}
              className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors"
            >
              <X className="w-5 h-5 text-white" />
            </button>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-4 md:p-6">
          {isLoadingRecords ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : viewMode === 'select' && !isScanning ? (
            /* Week Selection */
            <div className="max-w-3xl mx-auto space-y-6">
              {/* Section A - Week Selection */}
              <div>
                <h3 className="text-base font-semibold mb-3 flex items-center gap-2">
                  <FileText className="w-4 h-4 text-primary" />
                  Chọn tuần học cần quét
                </h3>
                <div className="flex items-center gap-2 mb-3">
                  <Button variant="outline" size="sm" onClick={selectAll}>
                    <CheckSquare className="w-3.5 h-3.5 mr-1.5" />
                    Chọn tất cả
                  </Button>
                  <Button variant="outline" size="sm" onClick={deselectAll}>
                    <Square className="w-3.5 h-3.5 mr-1.5" />
                    Bỏ chọn tất cả
                  </Button>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                  {weekStats.map(({ week, count }) => (
                    <button
                      key={week}
                      onClick={() => count > 0 && toggleWeek(week)}
                      disabled={count === 0}
                      className={`p-3 rounded-xl border-2 transition-all text-left ${
                        count === 0
                          ? 'opacity-40 cursor-not-allowed border-border bg-muted/30'
                          : selectedWeeks.has(week)
                          ? 'border-primary bg-primary/5 shadow-sm'
                          : 'border-border hover:border-primary/50 bg-card'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-sm">Tuần {week}</span>
                        <Checkbox
                          checked={selectedWeeks.has(week)}
                          disabled={count === 0}
                          className="pointer-events-none"
                        />
                      </div>
                      <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                        <Camera className="w-3 h-3" />
                        {count} ảnh
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Section B - Action */}
              <div className="p-4 bg-muted/30 rounded-xl border">
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <div className="text-sm text-muted-foreground">
                    Đã chọn <span className="font-semibold text-foreground">{selectedWeeks.size}</span> tuần •{' '}
                    <span className="font-semibold text-foreground">{totalPhotosSelected}</span> ảnh
                  </div>
                  <Button
                    onClick={handleStartScan}
                    disabled={selectedWeeks.size === 0 || totalPhotosSelected === 0}
                    className="bg-amber-600 hover:bg-amber-700 text-white"
                  >
                    <Search className="w-4 h-4 mr-2" />
                    Bắt đầu quét
                  </Button>
                </div>
              </div>

              {/* Analysis info */}
              <div className="text-xs text-muted-foreground space-y-1 p-3 bg-muted/20 rounded-lg">
                <p className="font-medium text-foreground text-sm mb-2">Các phân tích sẽ thực hiện:</p>
                <p>• Kiểm tra EXIF metadata (thiết bị, thời gian, phần mềm)</p>
                <p>• Phát hiện chụp lại từ màn hình (Moiré Pattern)</p>
                <p>• Phát hiện ảnh in rồi chụp lại (Edge/Noise analysis)</p>
                <p>• So sánh ảnh giữa các tuần (Perceptual Hash, dHash)</p>
                <p>• Phân tích ánh sáng & môi trường (Histogram RGB)</p>
                <p>• Kiểm tra chỉnh sửa ảnh (Error Level Analysis)</p>
              </div>
            </div>
          ) : (
            /* Scanning / Results */
            <div className="max-w-4xl mx-auto space-y-4">
              {/* Progress */}
              {isScanning && (
                <div className="p-5 bg-muted/30 rounded-xl border space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Đang quét gian lận...</span>
                    <span className="text-sm font-bold text-primary">{scanProgress}%</span>
                  </div>
                  <Progress value={scanProgress} className="h-2.5" />
                  <p className="text-xs text-muted-foreground truncate">{currentScanInfo}</p>
                </div>
              )}

              {/* Summary */}
              {results && summaryStats && (
                <>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="p-3 rounded-xl bg-muted/30 border text-center">
                      <p className="text-2xl font-bold">{summaryStats.total}</p>
                      <p className="text-xs text-muted-foreground">Tổng ảnh</p>
                    </div>
                    <div className="p-3 rounded-xl bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-center">
                      <p className="text-2xl font-bold text-green-600">{summaryStats.safe}</p>
                      <p className="text-xs text-green-600">An toàn</p>
                    </div>
                    <div className="p-3 rounded-xl bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 text-center">
                      <p className="text-2xl font-bold text-yellow-600">{summaryStats.suspicious}</p>
                      <p className="text-xs text-yellow-600">Nghi ngờ</p>
                    </div>
                    <div className="p-3 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-center">
                      <p className="text-2xl font-bold text-red-600">{summaryStats.high}</p>
                      <p className="text-xs text-red-600">Gian lận cao</p>
                    </div>
                  </div>

                  {/* Back button */}
                  <div className="flex justify-between items-center">
                    <Button variant="outline" size="sm" onClick={() => { setViewMode('select'); setResults(null); }}>
                      ← Quét lại
                    </Button>
                  </div>

                  {/* Results table */}
                  <div className="space-y-2">
                    {results.map((result, idx) => (
                      <div
                        key={`${result.studentCode}-${result.weekNumber}-${idx}`}
                        className={`rounded-xl border overflow-hidden transition-all ${getRiskColor(result.riskLevel)}`}
                      >
                        <button
                          className="w-full p-3 flex items-center gap-3 text-left"
                          onClick={() => setExpandedResult(expandedResult === idx ? null : idx)}
                        >
                          {/* Photo thumbnail */}
                          <img
                            src={result.photoUrl}
                            alt=""
                            className="w-10 h-10 rounded-lg object-cover shrink-0"
                            loading="lazy"
                          />
                          
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-medium text-sm truncate">{result.studentName}</span>
                              <span className="text-xs opacity-75">{result.studentCode}</span>
                            </div>
                            <div className="text-xs opacity-75">Tuần {result.weekNumber}</div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            <div className="flex items-center gap-1 text-xs font-bold">
                              {getRiskIcon(result.riskLevel)}
                              <span>{result.riskScore}</span>
                            </div>
                            <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-white/30 dark:bg-black/20">
                              {getRiskLabel(result.riskLevel)}
                            </span>
                            {expandedResult === idx ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                          </div>
                        </button>

                        {/* Expanded detail */}
                        {expandedResult === idx && (
                          <div className="px-3 pb-3 space-y-3 border-t border-current/10">
                            {/* Reasons */}
                            <div className="mt-3">
                              <p className="text-xs font-semibold mb-1.5">Lý do:</p>
                              <ul className="space-y-1">
                                {result.reasons.map((reason, ri) => (
                                  <li key={ri} className="text-xs flex items-start gap-1.5">
                                    <span className="mt-0.5">•</span>
                                    <span>{reason}</span>
                                  </li>
                                ))}
                              </ul>
                            </div>

                            {/* EXIF Metadata */}
                            {result.metadata && (
                              <div>
                                <p className="text-xs font-semibold mb-1.5">Metadata EXIF:</p>
                                <div className="grid grid-cols-2 gap-1 text-xs opacity-80">
                                  {result.metadata.make && <span>Hãng: {result.metadata.make}</span>}
                                  {result.metadata.model && <span>Model: {result.metadata.model}</span>}
                                  {result.metadata.software && <span>Software: {result.metadata.software}</span>}
                                  {result.metadata.dateTimeOriginal && <span>Ngày chụp: {result.metadata.dateTimeOriginal}</span>}
                                  {result.metadata.fNumber && <span>f/{result.metadata.fNumber}</span>}
                                  {result.metadata.iso && <span>ISO: {result.metadata.iso}</span>}
                                  {result.metadata.focalLength && <span>FL: {result.metadata.focalLength}</span>}
                                  {!result.metadata.hasFullExif && <span className="col-span-2 font-semibold">⚠ EXIF không đầy đủ</span>}
                                </div>
                              </div>
                            )}

                            {/* Histogram visualization */}
                            {result.histogram && (
                              <div>
                                <p className="text-xs font-semibold mb-1.5">Histogram ánh sáng:</p>
                                <div className="h-16 bg-black/5 dark:bg-white/5 rounded-lg overflow-hidden flex items-end p-1">
                                  {result.histogram.brightness
                                    .filter((_, i) => i % 4 === 0)
                                    .map((val, i) => {
                                      const max = Math.max(...result.histogram!.brightness);
                                      const h = max > 0 ? (val / max) * 100 : 0;
                                      return (
                                        <div
                                          key={i}
                                          className="flex-1 bg-current opacity-40 rounded-t-sm min-w-[1px]"
                                          style={{ height: `${h}%` }}
                                        />
                                      );
                                    })}
                                </div>
                              </div>
                            )}

                            {/* Full photo */}
                            <div>
                              <p className="text-xs font-semibold mb-1.5">Ảnh gốc:</p>
                              <img
                                src={result.photoUrl}
                                alt=""
                                className="w-full max-w-xs rounded-lg border"
                                loading="lazy"
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default FraudScanModal;
