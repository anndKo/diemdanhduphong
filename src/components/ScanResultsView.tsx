import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import {
  X, Users, ImageOff, UserX, Eye, ChevronDown, ChevronUp,
  CheckCircle, AlertTriangle
} from "lucide-react";
import type { ScanResult, ScanSummary } from "@/lib/imageScanService";

interface Props {
  scanSummary: ScanSummary;
  onClose: () => void;
}

type Tab = "cross_week" | "no_face" | "duplicates";

/** Full-screen image preview overlay */
const FullImagePreview = ({ url, onClose }: { url: string; onClose: () => void }) => (
  <div
    className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center p-4 cursor-pointer"
    onClick={(e) => { e.stopPropagation(); onClose(); }}
  >
    <button onClick={(e) => { e.stopPropagation(); onClose(); }} className="absolute top-4 right-4 z-10 w-10 h-10 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20">
      <X className="w-5 h-5 text-white" />
    </button>
    <img
      src={url}
      alt="Preview"
      className="max-w-full max-h-full object-contain rounded-lg"
      onClick={e => e.stopPropagation()}
    />
  </div>
);

/** Cross-week comparison card: valid (green left) vs invalid (red right) */
const CrossWeekCard = ({
  studentCode,
  studentName,
  validResults,
  invalidResults,
  onViewImage,
}: {
  studentCode: string;
  studentName: string;
  validResults: ScanResult[];
  invalidResults: ScanResult[];
  onViewImage: (url: string) => void;
}) => {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border border-border rounded-xl overflow-hidden bg-card">
      <button
        className="w-full p-3 flex items-center gap-3 text-left hover:bg-muted/30 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <UserX className="w-5 h-5 text-orange-500 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold truncate">{studentName}</p>
          <p className="text-xs text-muted-foreground">{studentCode} • {invalidResults.length} tuần không khớp</p>
        </div>
        {expanded ? <ChevronUp className="w-4 h-4 shrink-0" /> : <ChevronDown className="w-4 h-4 shrink-0" />}
      </button>

      {expanded && (
        <div className="p-3 pt-0 space-y-3">
          {/* Side-by-side: valid left, invalid right */}
          <div className="grid grid-cols-2 gap-3">
            {/* Left: valid weeks */}
            <div>
              <p className="text-xs font-medium text-emerald-500 mb-2 flex items-center gap-1">
                <CheckCircle className="w-3.5 h-3.5" /> Tuần hợp lệ
              </p>
              <div className="space-y-2">
                {validResults.map(r => (
                  <div key={r.image_id} className="relative group">
                    <img
                      src={r.image_path}
                      alt={r.name}
                      className="w-full aspect-square object-cover rounded-lg border-2 border-emerald-500/40 cursor-pointer hover:border-emerald-500 transition-colors"
                      loading="lazy"
                      onClick={() => onViewImage(r.image_path)}
                    />
                    <div className="absolute bottom-1 left-1 bg-emerald-600/90 text-white text-[10px] px-1.5 py-0.5 rounded-md font-medium">
                      T{r.week}
                    </div>
                    <button
                      onClick={() => onViewImage(r.image_path)}
                      className="absolute top-1 right-1 bg-black/50 rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <Eye className="w-3 h-3 text-white" />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Right: invalid weeks */}
            <div>
              <p className="text-xs font-medium text-red-500 mb-2 flex items-center gap-1">
                <AlertTriangle className="w-3.5 h-3.5" /> Tuần không khớp
              </p>
              <div className="space-y-2">
                {invalidResults.map(r => (
                  <div key={r.image_id} className="relative group">
                    <img
                      src={r.image_path}
                      alt={r.name}
                      className="w-full aspect-square object-cover rounded-lg border-2 border-red-500/40 cursor-pointer hover:border-red-500 transition-colors"
                      loading="lazy"
                      onClick={() => onViewImage(r.image_path)}
                    />
                    <div className="absolute bottom-1 left-1 bg-red-600/90 text-white text-[10px] px-1.5 py-0.5 rounded-md font-medium">
                      T{r.week} • {(r.similarity_score * 100).toFixed(0)}%
                    </div>
                    <button
                      onClick={() => onViewImage(r.image_path)}
                      className="absolute top-1 right-1 bg-black/50 rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <Eye className="w-3 h-3 text-white" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

/** No-face photo card */
const NoFaceCard = ({ result, onViewImage }: { result: ScanResult; onViewImage: (url: string) => void }) => (
  <div className="flex items-center gap-3 p-2.5 border border-border rounded-xl hover:bg-muted/30 transition-colors">
    <div className="relative shrink-0 cursor-pointer" onClick={() => onViewImage(result.image_path)}>
      <img src={result.image_path} alt="" className="w-12 h-12 rounded-lg object-cover" loading="lazy" />
      <div className="absolute inset-0 bg-red-500/20 rounded-lg flex items-center justify-center">
        <ImageOff className="w-4 h-4 text-red-500" />
      </div>
    </div>
    <div className="flex-1 min-w-0">
      <p className="text-sm font-medium truncate">{result.name}</p>
      <p className="text-xs text-muted-foreground">{result.student_code} • Tuần {result.week}</p>
    </div>
    <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => onViewImage(result.image_path)}>
      <Eye className="w-4 h-4" />
    </Button>
  </div>
);

/** Duplicate face pair card (same week, different students) */
const DuplicateCard = ({
  result,
  matchName,
  matchCode,
  matchImage,
  similarity,
  onViewImage,
}: {
  result: ScanResult;
  matchName: string;
  matchCode: string;
  matchImage?: string;
  similarity: number;
  onViewImage: (url: string) => void;
}) => (
  <div className="border border-amber-500/30 rounded-xl overflow-hidden bg-amber-500/5">
    <div className="p-3 flex items-center gap-3">
      <Users className="w-5 h-5 text-amber-500 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold truncate">{result.name} ↔ {matchName}</p>
        <p className="text-xs text-muted-foreground">
          Tuần {result.week} • Trùng {(similarity * 100).toFixed(1)}%
        </p>
      </div>
    </div>
    <div className="px-3 pb-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="text-center">
          <img
            src={result.image_path}
            alt={result.name}
            className="w-full aspect-square object-cover rounded-lg border border-border cursor-pointer hover:border-primary transition-colors"
            loading="lazy"
            onClick={() => onViewImage(result.image_path)}
          />
          <p className="text-xs font-medium mt-1 truncate">{result.name}</p>
          <p className="text-[10px] text-muted-foreground">{result.student_code}</p>
        </div>
        {matchImage && (
          <div className="text-center">
            <img
              src={matchImage}
              alt={matchName}
              className="w-full aspect-square object-cover rounded-lg border border-border cursor-pointer hover:border-primary transition-colors"
              loading="lazy"
              onClick={() => onViewImage(matchImage)}
            />
            <p className="text-xs font-medium mt-1 truncate">{matchName}</p>
            <p className="text-[10px] text-muted-foreground">{matchCode}</p>
          </div>
        )}
      </div>
    </div>
  </div>
);

const ScanResultsView = ({ scanSummary, onClose }: Props) => {
  const [activeTab, setActiveTab] = useState<Tab>("cross_week");
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  const { results } = scanSummary;

  // --- Cross-week: group by student, find those with valid + invalid weeks ---
  const crossWeekData = useMemo(() => {
    const byStudent = new Map<string, ScanResult[]>();
    for (const r of results) {
      if (r.status === 'no_face' || r.status === 'error') continue;
      const key = r.student_code.toLowerCase();
      if (!byStudent.has(key)) byStudent.set(key, []);
      byStudent.get(key)!.push(r);
    }

    const mismatchStudents: {
      studentCode: string;
      studentName: string;
      validResults: ScanResult[];
      invalidResults: ScanResult[];
    }[] = [];

    for (const [, group] of byStudent) {
      const valid = group.filter(r => r.status === 'valid');
      const invalid = group.filter(r => r.status === 'different_person' || r.status === 'suspicious');
      if (invalid.length > 0 && valid.length > 0) {
        mismatchStudents.push({
          studentCode: group[0].student_code,
          studentName: group[0].name,
          validResults: valid,
          invalidResults: invalid,
        });
      }
    }

    return mismatchStudents;
  }, [results]);

  // --- No face ---
  const noFaceResults = useMemo(() => results.filter(r => r.status === 'no_face'), [results]);

  // --- Same-week duplicates (suspicious with error_message containing "Trùng mặt") ---
  const duplicateResults = useMemo(() => {
    const dupes: {
      result: ScanResult;
      matchName: string;
      matchCode: string;
      matchImage?: string;
      similarity: number;
    }[] = [];

    // Track already-added pairs to avoid duplicating
    const addedPairs = new Set<string>();

    for (const r of results) {
      if (r.status === 'suspicious' && r.error_message?.includes('Trùng mặt với')) {
        // Parse "Trùng mặt với Name (code)"
        const match = r.error_message.match(/Trùng mặt với (.+?) \((.+?)\)/);
        if (match) {
          const matchName = match[1];
          const matchCode = match[2];
          const pairKey = [r.student_code, matchCode].sort().join('|');
          if (addedPairs.has(pairKey)) continue;
          addedPairs.add(pairKey);

          // Find matching student's image
          const matchResult = results.find(
            x => x.student_code.toLowerCase() === matchCode.toLowerCase() && x.image_path
          );

          dupes.push({
            result: r,
            matchName,
            matchCode,
            matchImage: matchResult?.image_path,
            similarity: r.similarity_score,
          });
        }
      }
    }

    return dupes;
  }, [results]);

  const tabs: { id: Tab; label: string; count: number; icon: typeof UserX; color: string }[] = [
    { id: "cross_week", label: "Không giống mặt", count: crossWeekData.length, icon: UserX, color: "text-orange-500" },
    { id: "no_face", label: "Không khuôn mặt", count: noFaceResults.length, icon: ImageOff, color: "text-red-500" },
    { id: "duplicates", label: "Trùng mặt", count: duplicateResults.length, icon: Users, color: "text-amber-500" },
  ];

  return (
    <>
      <div className="fixed inset-0 z-[70] bg-black/60 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4" onClick={onClose}>
        <div
          className="bg-card border border-border rounded-2xl w-full max-w-3xl max-h-[92vh] overflow-hidden shadow-2xl flex flex-col"
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div className="p-4 border-b border-border flex items-center justify-between shrink-0">
            <div>
              <h2 className="text-lg font-bold">Kết quả quét chi tiết</h2>
              <p className="text-xs text-muted-foreground">
                {scanSummary.total} ảnh • {(scanSummary.duration_ms / 1000).toFixed(1)}s
              </p>
            </div>
            <button onClick={onClose} className="w-9 h-9 rounded-full bg-muted flex items-center justify-center hover:bg-muted/80">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 p-3 border-b border-border overflow-x-auto shrink-0">
            {tabs.map(tab => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium shrink-0 transition-colors ${
                    activeTab === tab.id
                      ? 'bg-primary text-primary-foreground'
                      : 'hover:bg-muted text-muted-foreground'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {tab.label}
                  <span className={`ml-1 text-xs px-1.5 py-0.5 rounded-full ${
                    activeTab === tab.id ? 'bg-primary-foreground/20 text-primary-foreground' : 'bg-muted text-muted-foreground'
                  }`}>
                    {tab.count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {activeTab === "cross_week" && (
              crossWeekData.length === 0 ? (
                <EmptyState icon={CheckCircle} message="Tất cả sinh viên đều có khuôn mặt khớp giữa các tuần" />
              ) : (
                crossWeekData.map(data => (
                  <CrossWeekCard
                    key={data.studentCode}
                    {...data}
                    onViewImage={setPreviewImage}
                  />
                ))
              )
            )}

            {activeTab === "no_face" && (
              noFaceResults.length === 0 ? (
                <EmptyState icon={CheckCircle} message="Tất cả ảnh đều có khuôn mặt hợp lệ" />
              ) : (
                noFaceResults.map(r => (
                  <NoFaceCard key={r.image_id} result={r} onViewImage={setPreviewImage} />
                ))
              )
            )}

            {activeTab === "duplicates" && (
              duplicateResults.length === 0 ? (
                <EmptyState icon={CheckCircle} message="Không phát hiện khuôn mặt trùng lặp" />
              ) : (
                duplicateResults.map((d, i) => (
                  <DuplicateCard key={i} {...d} onViewImage={setPreviewImage} />
                ))
              )
            )}
          </div>
        </div>
      </div>

      {previewImage && (
        <FullImagePreview url={previewImage} onClose={() => setPreviewImage(null)} />
      )}
    </>
  );
};

const EmptyState = ({ icon: Icon, message }: { icon: typeof CheckCircle; message: string }) => (
  <div className="text-center py-12 text-muted-foreground">
    <Icon className="w-10 h-10 mx-auto mb-3 text-emerald-500 opacity-60" />
    <p className="text-sm">{message}</p>
  </div>
);

export default ScanResultsView;
