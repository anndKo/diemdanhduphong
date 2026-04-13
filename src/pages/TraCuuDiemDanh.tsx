import { useState, useCallback, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  ArrowLeft, Search, CheckCircle, X, Loader2, BookOpen, GraduationCap,
} from "lucide-react";

interface AttendanceRecord {
  id: string;
  class_id: string;
  name: string;
  student_code: string;
  week_number: number;
  created_at: string;
}

interface ClassInfo {
  id: string;
  name: string;
  weeks_count?: number;
}

/* ─── 3D tilt on mouse move ─── */
function use3DTilt(ref: React.RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const handle = (e: MouseEvent) => {
      const rect = el.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width - 0.5;
      const y = (e.clientY - rect.top) / rect.height - 0.5;
      el.style.transform = `perspective(800px) rotateY(${x * 8}deg) rotateX(${-y * 6}deg) scale3d(1.02,1.02,1.02)`;
    };
    const reset = () => {
      el.style.transform = "perspective(800px) rotateY(0) rotateX(0) scale3d(1,1,1)";
    };
    el.addEventListener("mousemove", handle);
    el.addEventListener("mouseleave", reset);
    return () => {
      el.removeEventListener("mousemove", handle);
      el.removeEventListener("mouseleave", reset);
    };
  }, [ref]);
}

const TraCuuDiemDanh = () => {
  const navigate = useNavigate();
  const [studentCode, setStudentCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [classes, setClasses] = useState<ClassInfo[]>([]);
  const searchCardRef = useRef<HTMLDivElement>(null);

  use3DTilt(searchCardRef);

  const handleSearch = useCallback(async () => {
    const code = studentCode.trim();
    if (!code) { toast.error("Vui lòng nhập mã sinh viên!"); return; }
    setLoading(true);
    setSearched(false);
    try {
      const { data: attendanceData, error: attErr } = await supabase
        .from("attendance_records" as any)
        .select("id, class_id, name, student_code, week_number, created_at")
        .eq("student_code", code)
        .order("created_at", { ascending: true });
      if (attErr) throw attErr;
      const recs = (attendanceData || []) as unknown as AttendanceRecord[];
      setRecords(recs);
      const classIds = [...new Set(recs.map((r) => r.class_id))];
      if (classIds.length > 0) {
        const { data: classData } = await supabase
          .from("classes" as any).select("id, name, weeks_count").in("id", classIds);
        setClasses((classData || []) as unknown as ClassInfo[]);
      } else { setClasses([]); }
      setSearched(true);
      if (recs.length === 0) toast.info("Không tìm thấy dữ liệu điểm danh cho mã sinh viên này.");
    } catch { toast.error("Có lỗi xảy ra khi tra cứu!"); }
    finally { setLoading(false); }
  }, [studentCode]);

  const handleCodeChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setStudentCode(e.target.value.replace(/\D/g, ""));
  }, []);

  const getClassAttendance = (classId: string) => {
    const classRecs = records.filter((r) => r.class_id === classId);
    const attendedWeeks = new Set(classRecs.map((r) => r.week_number));
    const cls = classes.find((c) => c.id === classId);
    const totalWeeks = cls?.weeks_count || Math.max(15, ...Array.from(attendedWeeks));
    return { attendedWeeks, totalWeeks, studentName: classRecs[0]?.name || "" };
  };

  const uniqueClassIds = [...new Set(records.map((r) => r.class_id))];

  return (
    <div className="min-h-screen bg-background relative overflow-hidden">
      {/* ── Animated 3D background scene ── */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden" aria-hidden>
        {/* Floating orbs */}
        <div className="orb orb-1" />
        <div className="orb orb-2" />
        <div className="orb orb-3" />
        {/* Grid plane */}
        <div className="perspective-grid" />
      </div>

      <style>{`
        /* ── Floating orbs ── */
        .orb {
          position: absolute;
          border-radius: 50%;
          filter: blur(80px);
          will-change: transform;
          animation: orbFloat 12s ease-in-out infinite alternate;
        }
        .orb-1 {
          width: 400px; height: 400px;
          top: -10%; left: -5%;
          background: hsl(var(--primary) / 0.12);
          animation-duration: 14s;
        }
        .orb-2 {
          width: 300px; height: 300px;
          bottom: 10%; right: -8%;
          background: hsl(var(--accent) / 0.10);
          animation-duration: 18s;
          animation-delay: -4s;
        }
        .orb-3 {
          width: 200px; height: 200px;
          top: 50%; left: 40%;
          background: hsl(var(--primary) / 0.06);
          animation-duration: 10s;
          animation-delay: -2s;
        }
        @keyframes orbFloat {
          0%   { transform: translate(0, 0) scale(1); }
          50%  { transform: translate(30px, -40px) scale(1.1); }
          100% { transform: translate(-20px, 20px) scale(0.95); }
        }

        /* ── Perspective grid ── */
        .perspective-grid {
          position: absolute;
          bottom: -20%;
          left: -10%;
          width: 120%;
          height: 60%;
          background:
            linear-gradient(90deg, hsl(var(--primary) / 0.04) 1px, transparent 1px),
            linear-gradient(180deg, hsl(var(--primary) / 0.04) 1px, transparent 1px);
          background-size: 60px 60px;
          transform: perspective(500px) rotateX(55deg);
          mask-image: linear-gradient(to top, black 20%, transparent 80%);
          -webkit-mask-image: linear-gradient(to top, black 20%, transparent 80%);
          animation: gridSlide 20s linear infinite;
        }
        @keyframes gridSlide {
          0%   { background-position: 0 0; }
          100% { background-position: 0 60px; }
        }

        /* ── Card animations ── */
        @keyframes heroFloat {
          from { opacity: 0; transform: perspective(800px) translateZ(-60px) translateY(-30px) rotateX(8deg); }
          to   { opacity: 1; transform: perspective(800px) translateZ(0) translateY(0) rotateX(0); }
        }
        @keyframes cardReveal {
          from { opacity: 0; transform: perspective(600px) translateY(40px) rotateX(6deg) scale(0.96); }
          to   { opacity: 1; transform: perspective(600px) translateY(0) rotateX(0) scale(1); }
        }
        @keyframes badgePop {
          from { opacity: 0; transform: scale(0.6); }
          to   { opacity: 1; transform: scale(1); }
        }
        @keyframes iconSpin3D {
          from { transform: perspective(400px) rotateY(0deg); }
          to   { transform: perspective(400px) rotateY(360deg); }
        }

        .tilt-card {
          transform-style: preserve-3d;
          transition: transform 0.25s cubic-bezier(0.33, 1, 0.68, 1), box-shadow 0.25s ease;
        }
        .result-card {
          transform-style: preserve-3d;
          transition: transform 0.3s ease, box-shadow 0.3s ease;
        }
        .result-card:hover {
          transform: translateY(-6px) perspective(800px) rotateX(2deg);
          box-shadow: 0 20px 40px -12px hsl(var(--primary) / 0.15), 0 0 0 1px hsl(var(--primary) / 0.1);
        }
        .week-cell-3d {
          transition: all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
          transform-style: preserve-3d;
        }
        .week-cell-3d:hover {
          transform: translateZ(8px) scale(1.12);
          z-index: 10;
        }

        .shimmer-border {
          position: relative;
          overflow: hidden;
        }
        .shimmer-border::before {
          content: '';
          position: absolute;
          top: -1px; left: -1px; right: -1px; bottom: -1px;
          border-radius: inherit;
          background: linear-gradient(90deg, transparent, hsl(var(--primary) / 0.2), transparent);
          background-size: 200% 100%;
          animation: shimmerMove 3s ease-in-out infinite;
          z-index: -1;
        }
        @keyframes shimmerMove {
          0%   { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
      `}</style>

      {/* Header */}
      <header
        className="relative w-full px-6 py-4 flex items-center gap-3 border-b border-border/40"
        style={{
          background: "linear-gradient(135deg, hsl(var(--card)) 0%, hsl(var(--background)) 100%)",
          backdropFilter: "blur(16px)",
          animation: "heroFloat 0.5s ease-out",
        }}
      >
        <Button variant="ghost" size="icon" onClick={() => navigate("/")} className="shrink-0 rounded-xl hover:bg-primary/10">
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center shadow-md"
            style={{ background: "var(--gradient-primary)", animation: "iconSpin3D 8s linear infinite" }}
          >
            <Search className="w-5 h-5 text-primary-foreground" />
          </div>
          <h1 className="text-xl font-bold text-foreground">Tra Cứu Điểm Danh</h1>
        </div>
      </header>

      {/* Main */}
      <main className="relative flex flex-col items-center px-4 sm:px-6 py-8 sm:py-12">
        {/* Hero */}
        <div className="text-center mb-8" style={{ animation: "heroFloat 0.6s ease-out 0.1s both" }}>
          <div
            className="w-20 h-20 mx-auto mb-5 rounded-2xl flex items-center justify-center shadow-lg relative"
            style={{ background: "var(--gradient-primary)" }}
          >
            <GraduationCap className="w-10 h-10 text-primary-foreground" />
            {/* Glow ring */}
            <div className="absolute inset-0 rounded-2xl" style={{
              boxShadow: "0 0 30px 8px hsl(var(--primary) / 0.2)",
              animation: "orbFloat 4s ease-in-out infinite alternate",
            }} />
          </div>
          <h2 className="text-3xl sm:text-4xl font-bold text-foreground mb-3 text-balance">
            Tra Cứu Điểm Danh
          </h2>
          <p className="text-muted-foreground max-w-md mx-auto text-sm sm:text-base">
            Nhập mã sinh viên để xem lịch sử điểm danh tất cả các tuần
          </p>
        </div>

        {/* Search card — 3D tilt */}
        <div
          ref={searchCardRef}
          className="tilt-card shimmer-border w-full max-w-md rounded-2xl border border-border/50 p-6 mb-8"
          style={{
            background: "linear-gradient(145deg, hsl(var(--card)) 0%, hsl(var(--background)) 100%)",
            boxShadow: "0 16px 48px -8px hsl(var(--primary) / 0.1), 0 0 0 1px hsl(var(--border) / 0.3)",
            animation: "cardReveal 0.6s ease-out 0.15s both",
          }}
        >
          <div className="space-y-4">
            <div>
              <label className="text-sm font-semibold text-foreground mb-2 block flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-primary" />
                Mã sinh viên
              </label>
              <Input
                type="text"
                placeholder="Nhập mã sinh viên..."
                value={studentCode}
                onChange={handleCodeChange}
                className="text-center text-xl tracking-widest font-mono h-14 rounded-xl border-border/60 bg-background/60 focus:bg-background transition-colors"
                inputMode="numeric"
                autoComplete="off"
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              />
            </div>
            <Button
              onClick={handleSearch}
              disabled={!studentCode.trim() || loading}
              className="w-full py-6 text-base rounded-xl font-semibold shadow-lg transition-all duration-200 hover:shadow-xl"
              style={{ background: "var(--gradient-primary)" }}
            >
              {loading ? (
                <><Loader2 className="w-5 h-5 mr-2 animate-spin" />Đang tra cứu...</>
              ) : (
                <><Search className="w-5 h-5 mr-2" />Tra cứu</>
              )}
            </Button>
          </div>
        </div>

        {/* Student name card */}
        {searched && records.length > 0 && (
          <div
            className="result-card w-full max-w-md mb-6 rounded-2xl border border-border/50 p-4 flex items-center gap-4"
            style={{
              background: "linear-gradient(145deg, hsl(var(--card)) 0%, hsl(var(--background)) 100%)",
              boxShadow: "0 8px 32px -6px hsl(var(--primary) / 0.08)",
              animation: "cardReveal 0.4s ease-out",
            }}
          >
            <div
              className="w-12 h-12 rounded-xl flex items-center justify-center shadow-md shrink-0"
              style={{ background: "var(--gradient-primary)" }}
            >
              <GraduationCap className="w-6 h-6 text-primary-foreground" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-lg font-bold text-foreground truncate">{records[0]?.name}</p>
              <p className="text-sm text-muted-foreground font-mono">MSSV: {records[0]?.student_code}</p>
            </div>
            <div className="shrink-0 text-right" style={{ animation: "badgePop 0.5s ease-out 0.2s both" }}>
              <p className="text-2xl font-bold text-primary">{uniqueClassIds.length}</p>
              <p className="text-xs text-muted-foreground">lớp học</p>
            </div>
          </div>
        )}

        {/* Empty state */}
        {searched && uniqueClassIds.length === 0 && (
          <div
            className="result-card w-full max-w-2xl rounded-2xl border border-border/50 p-10 text-center"
            style={{
              background: "linear-gradient(145deg, hsl(var(--card)) 0%, hsl(var(--background)) 100%)",
              animation: "cardReveal 0.5s ease-out",
            }}
          >
            <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-muted/50 flex items-center justify-center">
              <X className="w-8 h-8 text-muted-foreground/40" />
            </div>
            <p className="text-muted-foreground font-medium">Không tìm thấy dữ liệu điểm danh.</p>
            <p className="text-sm text-muted-foreground/60 mt-1">Kiểm tra lại mã sinh viên và thử lại.</p>
          </div>
        )}

        {/* Results */}
        {uniqueClassIds.map((classId, idx) => {
          const cls = classes.find((c) => c.id === classId);
          const { attendedWeeks, totalWeeks, studentName } = getClassAttendance(classId);
          const weeksArray = Array.from({ length: totalWeeks }, (_, i) => i + 1);
          const attendanceRate = Math.round((attendedWeeks.size / totalWeeks) * 100);

          return (
            <div
              key={classId}
              className="result-card w-full max-w-2xl rounded-2xl border border-border/50 p-5 sm:p-6 mb-6"
              style={{
                background: "linear-gradient(145deg, hsl(var(--card)) 0%, hsl(var(--background)) 100%)",
                boxShadow: "0 12px 40px -8px hsl(var(--primary) / 0.08), inset 0 1px 0 hsl(0 0% 100% / 0.08)",
                animation: `cardReveal 0.5s ease-out ${0.1 + idx * 0.12}s both`,
              }}
            >
              {/* Class header */}
              <div className="flex items-center gap-3 mb-5">
                <div
                  className="w-12 h-12 rounded-xl flex items-center justify-center shadow-md shrink-0"
                  style={{ background: "var(--gradient-primary)" }}
                >
                  <BookOpen className="w-6 h-6 text-primary-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-bold text-foreground truncate">{cls?.name || "Lớp học"}</h3>
                  {studentName && (
                    <p className="text-sm text-muted-foreground truncate">Sinh viên: {studentName}</p>
                  )}
                </div>
                <div
                  className="shrink-0 px-3 py-1.5 rounded-full text-xs font-bold"
                  style={{
                    background: attendanceRate >= 80
                      ? "hsl(var(--success) / 0.15)"
                      : attendanceRate >= 50
                        ? "hsl(var(--accent) / 0.15)"
                        : "hsl(var(--destructive) / 0.15)",
                    color: attendanceRate >= 80
                      ? "hsl(var(--success))"
                      : attendanceRate >= 50
                        ? "hsl(var(--accent-foreground))"
                        : "hsl(var(--destructive))",
                    animation: "badgePop 0.4s ease-out 0.3s both",
                  }}
                >
                  {attendedWeeks.size}/{totalWeeks} tuần · {attendanceRate}%
                </div>
              </div>

              {/* Weeks grid — 3D cells */}
              <div className="grid grid-cols-5 sm:grid-cols-8 gap-2">
                {weeksArray.map((week) => {
                  const attended = attendedWeeks.has(week);
                  return (
                    <div
                      key={week}
                      className="week-cell-3d relative flex flex-col items-center gap-1 rounded-xl p-2 cursor-default"
                      style={{
                        background: attended
                          ? "hsl(var(--success) / 0.1)"
                          : "hsl(var(--muted) / 0.5)",
                        border: `1px solid ${attended
                          ? "hsl(var(--success) / 0.25)"
                          : "hsl(var(--border) / 0.4)"}`,
                        boxShadow: attended
                          ? "0 4px 12px -2px hsl(var(--success) / 0.15)"
                          : "none",
                      }}
                    >
                      <span className="text-[10px] font-semibold text-muted-foreground">T{week}</span>
                      {attended ? (
                        <CheckCircle className="w-5 h-5" style={{ color: "hsl(var(--success))" }} />
                      ) : (
                        <X className="w-5 h-5 text-destructive/50" />
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Progress bar with glow */}
              <div className="mt-4 h-2.5 rounded-full bg-muted/50 overflow-hidden relative">
                <div
                  className="h-full rounded-full transition-all duration-700 ease-out"
                  style={{
                    width: `${attendanceRate}%`,
                    background: attendanceRate >= 80
                      ? "hsl(var(--success))"
                      : attendanceRate >= 50
                        ? "hsl(var(--accent))"
                        : "hsl(var(--destructive))",
                    boxShadow: `0 0 12px 2px ${
                      attendanceRate >= 80
                        ? "hsl(var(--success) / 0.4)"
                        : attendanceRate >= 50
                          ? "hsl(var(--accent) / 0.4)"
                          : "hsl(var(--destructive) / 0.4)"
                    }`,
                  }}
                />
              </div>
            </div>
          );
        })}
      </main>
    </div>
  );
};

export default TraCuuDiemDanh;
