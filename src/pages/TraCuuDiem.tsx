import { useState, useCallback, useRef, useEffect, useMemo, lazy, Suspense } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  ArrowLeft, Search, CheckCircle, X, Loader2, BookOpen, GraduationCap, Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/* ─── Lazy-load Three.js scene ─── */
const SpaceScene = lazy(() => import("@/components/space/SpaceBackground"));

/* ─── Types ─── */
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

/* ─── 3D Tilt hook ─── */
function use3DTilt(ref: React.RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let raf = 0;
    const handle = (e: MouseEvent) => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const rect = el.getBoundingClientRect();
        const x = (e.clientX - rect.left) / rect.width - 0.5;
        const y = (e.clientY - rect.top) / rect.height - 0.5;
        el.style.transform = `perspective(800px) rotateY(${x * 10}deg) rotateX(${-y * 8}deg) scale3d(1.02,1.02,1.02)`;
      });
    };
    const reset = () => {
      cancelAnimationFrame(raf);
      el.style.transform = "perspective(800px) rotateY(0) rotateX(0) scale3d(1,1,1)";
    };
    el.addEventListener("mousemove", handle);
    el.addEventListener("mouseleave", reset);
    return () => {
      cancelAnimationFrame(raf);
      el.removeEventListener("mousemove", handle);
      el.removeEventListener("mouseleave", reset);
    };
  }, [ref]);
}

/* ─── Sci-fi loading spinner ─── */
const SciFiLoader = () => (
  <div className="relative w-16 h-16">
    <div className="absolute inset-0 rounded-full border-2 border-cyan-400/30 animate-spin" style={{ animationDuration: "3s" }} />
    <div className="absolute inset-1 rounded-full border-2 border-transparent border-t-cyan-400 animate-spin" style={{ animationDuration: "1s" }} />
    <div className="absolute inset-3 rounded-full border-2 border-transparent border-b-purple-400 animate-spin" style={{ animationDuration: "1.5s", animationDirection: "reverse" }} />
    <div className="absolute inset-0 flex items-center justify-center">
      <div className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
    </div>
  </div>
);

/* ─── Ripple button ─── */
const RippleButton = ({ children, onClick, disabled, className = "" }: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  className?: string;
}) => {
  const btnRef = useRef<HTMLButtonElement>(null);
  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (disabled) return;
    const btn = btnRef.current;
    if (btn) {
      const rect = btn.getBoundingClientRect();
      const ripple = document.createElement("span");
      const size = Math.max(rect.width, rect.height);
      ripple.style.cssText = `
        position:absolute;width:${size}px;height:${size}px;border-radius:50%;
        background:rgba(0,255,255,0.3);transform:scale(0);animation:spaceRipple 0.6s ease-out;
        left:${e.clientX - rect.left - size / 2}px;top:${e.clientY - rect.top - size / 2}px;
        pointer-events:none;
      `;
      btn.appendChild(ripple);
      setTimeout(() => ripple.remove(), 600);
    }
    onClick();
  };
  return (
    <button
      ref={btnRef}
      onClick={handleClick}
      disabled={disabled}
      className={`relative overflow-hidden ${className}`}
    >
      {children}
    </button>
  );
};

/* ═══════════════════════ Main Component ═══════════════════════ */
const TraCuuDiem = () => {
  const navigate = useNavigate();
  const [studentCode, setStudentCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [classes, setClasses] = useState<ClassInfo[]>([]);
  const cardRef = useRef<HTMLDivElement>(null);
  const isMobile = useRef(typeof window !== "undefined" && window.innerWidth < 768);

  use3DTilt(cardRef);

  const handleSearch = useCallback(async () => {
    const code = studentCode.trim();
    if (!code) { toast.error("Vui lòng nhập mã sinh viên!"); return; }
    setLoading(true);
    setSearched(false);
    try {
      const { data: attData, error } = await supabase
        .from("attendance_records" as any)
        .select("id, class_id, name, student_code, week_number, created_at")
        .eq("student_code", code)
        .order("created_at", { ascending: true });
      if (error) throw error;
      const recs = (attData || []) as unknown as AttendanceRecord[];
      setRecords(recs);
      const classIds = [...new Set(recs.map((r) => r.class_id))];
      if (classIds.length > 0) {
        const { data: clsData } = await supabase
          .from("classes" as any).select("id, name, weeks_count").in("id", classIds);
        setClasses((clsData || []) as unknown as ClassInfo[]);
      } else { setClasses([]); }
      setSearched(true);
      if (recs.length === 0) toast.info("Không tìm thấy dữ liệu điểm danh.");
    } catch { toast.error("Có lỗi xảy ra khi tra cứu!"); }
    finally { setLoading(false); }
  }, [studentCode]);

  const handleCodeChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setStudentCode(e.target.value.replace(/\D/g, ""));
  }, []);

  const getClassAttendance = useCallback((classId: string) => {
    const classRecs = records.filter((r) => r.class_id === classId);
    const attendedWeeks = new Set(classRecs.map((r) => r.week_number));
    const cls = classes.find((c) => c.id === classId);
    const totalWeeks = cls?.weeks_count || Math.max(15, ...Array.from(attendedWeeks));
    return { attendedWeeks, totalWeeks, studentName: classRecs[0]?.name || "", className: cls?.name || "Lớp học" };
  }, [records, classes]);

  const uniqueClassIds = useMemo(() => [...new Set(records.map((r) => r.class_id))], [records]);

  return (
    <div className="fixed inset-0 overflow-y-auto overflow-x-hidden" style={{ background: "#050510" }}>
      {/* ── Space CSS styles ── */}
      <style>{`
        @keyframes spaceRipple {
          to { transform: scale(2.5); opacity: 0; }
        }
        @keyframes neonPulse {
          0%, 100% { text-shadow: 0 0 10px rgba(0,255,255,0.5), 0 0 40px rgba(0,255,255,0.2); }
          50% { text-shadow: 0 0 20px rgba(0,255,255,0.8), 0 0 60px rgba(0,255,255,0.3), 0 0 80px rgba(120,0,255,0.15); }
        }
        @keyframes cardFloat {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-6px); }
        }
        @keyframes slideReveal {
          from { opacity: 0; transform: translateY(30px) scale(0.97); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes scanLine {
          0% { top: 0; }
          100% { top: 100%; }
        }
        .glass-card {
          background: rgba(10, 15, 40, 0.65);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          border: 1px solid rgba(0, 255, 255, 0.12);
          box-shadow: 0 0 30px rgba(0, 255, 255, 0.06), inset 0 1px 0 rgba(255,255,255,0.05);
          transition: transform 0.3s cubic-bezier(0.33,1,0.68,1), box-shadow 0.3s ease;
        }
        .glass-card:hover {
          box-shadow: 0 0 50px rgba(0, 255, 255, 0.12), inset 0 1px 0 rgba(255,255,255,0.08);
        }
        .neon-text {
          animation: neonPulse 3s ease-in-out infinite;
        }
        .neon-border {
          position: relative;
        }
        .neon-border::before {
          content: '';
          position: absolute;
          inset: -1px;
          border-radius: inherit;
          padding: 1px;
          background: linear-gradient(135deg, rgba(0,255,255,0.3), rgba(120,0,255,0.2), rgba(0,255,255,0.1));
          mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
          -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
          mask-composite: exclude;
          -webkit-mask-composite: xor;
          pointer-events: none;
        }
        .result-slide {
          animation: slideReveal 0.5s ease-out both;
        }
        .week-cell {
          transition: all 0.2s cubic-bezier(0.34,1.56,0.64,1);
          will-change: transform;
        }
        .week-cell:hover {
          transform: translateZ(6px) scale(1.15);
          z-index: 10;
        }
        .scan-line::after {
          content: '';
          position: absolute;
          left: 0; right: 0;
          height: 2px;
          background: linear-gradient(90deg, transparent, rgba(0,255,255,0.6), transparent);
          animation: scanLine 2s linear infinite;
          pointer-events: none;
        }
        /* Scrollbar */
        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-track { background: rgba(0,0,0,0.3); }
        ::-webkit-scrollbar-thumb { background: rgba(0,255,255,0.2); border-radius: 3px; }
        ::-webkit-scrollbar-thumb:hover { background: rgba(0,255,255,0.4); }
      `}</style>

      {/* ── Three.js Background (lazy) ── */}
      <div className="fixed inset-0 -z-0">
        <Suspense fallback={null}>
          <SpaceScene />
        </Suspense>
      </div>

      {/* ── Header ── */}
      <header
        className="sticky top-0 z-50 w-full px-4 sm:px-6 py-3 flex items-center gap-3"
        style={{
          background: "linear-gradient(180deg, rgba(5,5,16,0.95) 0%, rgba(5,5,16,0.7) 100%)",
          backdropFilter: "blur(12px)",
          borderBottom: "1px solid rgba(0,255,255,0.08)",
        }}
      >
        <button
          onClick={() => navigate("/")}
          className="w-9 h-9 rounded-xl flex items-center justify-center border border-cyan-500/20 bg-cyan-500/5 hover:bg-cyan-500/15 transition-colors"
        >
          <ArrowLeft className="w-4 h-4 text-cyan-400" />
        </button>
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-gradient-to-br from-cyan-500/20 to-purple-500/20 border border-cyan-500/20">
            <Search className="w-4 h-4 text-cyan-400" />
          </div>
          <h1 className="text-sm font-bold text-cyan-50 tracking-wide uppercase">Tra Cứu Điểm</h1>
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5 text-purple-400/60" />
          <span className="text-[10px] text-purple-300/50 font-mono">SPACE.UI</span>
        </div>
      </header>

      {/* ── Main ── */}
      <main className="relative z-10 flex flex-col items-center px-4 sm:px-6 py-8 sm:py-12 min-h-[calc(100dvh-52px)]">
        {/* Title */}
        <div className="text-center mb-8" style={{ animation: "slideReveal 0.6s ease-out" }}>
          <div className="w-20 h-20 mx-auto mb-5 rounded-2xl flex items-center justify-center relative"
            style={{ background: "linear-gradient(135deg, rgba(0,255,255,0.15), rgba(120,0,255,0.15))", border: "1px solid rgba(0,255,255,0.2)" }}
          >
            <GraduationCap className="w-10 h-10 text-cyan-400" />
            <div className="absolute inset-0 rounded-2xl" style={{ boxShadow: "0 0 40px 8px rgba(0,255,255,0.1)" }} />
          </div>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-cyan-300 via-cyan-100 to-purple-300 mb-2 neon-text">
            TRA CỨU ĐIỂM DANH
          </h2>
          <p className="text-sm text-cyan-200/40 font-mono tracking-wider">
            NHẬP MÃ SINH VIÊN ĐỂ KIỂM TRA
          </p>
        </div>

        {/* Search Card */}
        <div
          ref={cardRef}
          className="glass-card neon-border w-full max-w-md rounded-2xl p-6 mb-8"
          style={{ transformStyle: "preserve-3d", animation: "slideReveal 0.6s ease-out 0.1s both" }}
        >
          <div className="space-y-4">
            <div>
              <label className="text-xs font-semibold text-cyan-300/70 mb-2 block flex items-center gap-2 uppercase tracking-wider">
                <BookOpen className="w-3.5 h-3.5 text-cyan-400/60" />
                Mã sinh viên
              </label>
              <Input
                type="text"
                placeholder="Nhập mã sinh viên..."
                value={studentCode}
                onChange={handleCodeChange}
                className="text-center text-xl tracking-[0.3em] font-mono h-14 rounded-xl bg-black/40 border-cyan-500/20 text-cyan-100 placeholder:text-cyan-500/20 focus:border-cyan-400/50 focus:ring-2 focus:ring-cyan-400/20 transition-all"
                inputMode="numeric"
                autoComplete="off"
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              />
            </div>
            <RippleButton
              onClick={handleSearch}
              disabled={!studentCode.trim() || loading}
              className="w-full py-4 text-sm font-bold rounded-xl uppercase tracking-wider transition-all duration-300 disabled:opacity-30 disabled:cursor-not-allowed bg-gradient-to-r from-cyan-500/80 to-purple-500/60 text-white hover:from-cyan-400 hover:to-purple-400 hover:shadow-[0_0_30px_rgba(0,255,255,0.3)] hover:scale-[1.02]"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <SciFiLoader />
                </span>
              ) : (
                <span className="flex items-center justify-center gap-2">
                  <Search className="w-4 h-4" />
                  Tra cứu
                </span>
              )}
            </RippleButton>
          </div>
        </div>

        {/* Student info card */}
        {searched && records.length > 0 && (
          <div
            className="glass-card neon-border w-full max-w-md mb-6 rounded-2xl p-4 flex items-center gap-4 result-slide"
          >
            <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
              style={{ background: "linear-gradient(135deg, rgba(0,255,255,0.2), rgba(120,0,255,0.2))", border: "1px solid rgba(0,255,255,0.15)" }}
            >
              <GraduationCap className="w-6 h-6 text-cyan-400" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-base font-bold text-cyan-50 truncate">{records[0]?.name}</p>
              <p className="text-xs text-cyan-300/40 font-mono">MSSV: {records[0]?.student_code}</p>
            </div>
            <div className="shrink-0 text-right">
              <p className="text-2xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-cyan-300 to-purple-300">{uniqueClassIds.length}</p>
              <p className="text-[10px] text-cyan-300/40 uppercase tracking-wider">lớp học</p>
            </div>
          </div>
        )}

        {/* Empty state */}
        {searched && uniqueClassIds.length === 0 && (
          <div className="glass-card w-full max-w-2xl rounded-2xl p-10 text-center result-slide">
            <div className="w-16 h-16 mx-auto mb-4 rounded-2xl flex items-center justify-center" style={{ background: "rgba(255,255,255,0.03)" }}>
              <X className="w-8 h-8 text-cyan-500/25" />
            </div>
            <p className="text-cyan-200/50 font-medium">Không tìm thấy dữ liệu điểm danh.</p>
            <p className="text-xs text-cyan-300/25 mt-1">Kiểm tra lại mã sinh viên và thử lại.</p>
          </div>
        )}

        {/* Results */}
        {uniqueClassIds.map((classId, idx) => {
          const { attendedWeeks, totalWeeks, studentName, className: clsName } = getClassAttendance(classId);
          const weeksArray = Array.from({ length: totalWeeks }, (_, i) => i + 1);
          const attendanceRate = Math.round((attendedWeeks.size / totalWeeks) * 100);
          const absentWeeks = totalWeeks - attendedWeeks.size;

          return (
            <div
              key={classId}
              className="glass-card neon-border w-full max-w-2xl rounded-2xl p-5 sm:p-6 mb-6 result-slide"
              style={{ animationDelay: `${0.1 + idx * 0.12}s` }}
            >
              {/* Class header */}
              <div className="flex items-center gap-3 mb-5">
                <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
                  style={{ background: "linear-gradient(135deg, rgba(0,255,255,0.15), rgba(120,0,255,0.15))", border: "1px solid rgba(0,255,255,0.12)" }}
                >
                  <BookOpen className="w-6 h-6 text-cyan-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-bold text-cyan-50 truncate">{clsName}</h3>
                  {studentName && (
                    <p className="text-xs text-cyan-300/35 truncate font-mono">SV: {studentName}</p>
                  )}
                </div>
                <div
                  className="shrink-0 px-3 py-1.5 rounded-full text-xs font-bold border"
                  style={{
                    background: attendanceRate >= 80
                      ? "rgba(0,255,180,0.1)"
                      : attendanceRate >= 50
                        ? "rgba(255,200,0,0.1)"
                        : "rgba(255,60,60,0.1)",
                    borderColor: attendanceRate >= 80
                      ? "rgba(0,255,180,0.25)"
                      : attendanceRate >= 50
                        ? "rgba(255,200,0,0.25)"
                        : "rgba(255,60,60,0.25)",
                    color: attendanceRate >= 80
                      ? "#00ffb4"
                      : attendanceRate >= 50
                        ? "#ffc800"
                        : "#ff3c3c",
                  }}
                >
                  {attendedWeeks.size}/{totalWeeks} · {attendanceRate}%
                </div>
              </div>

              {/* Stats row */}
              <div className="grid grid-cols-3 gap-3 mb-5">
                {[
                  { label: "Tổng buổi", value: totalWeeks, color: "cyan" },
                  { label: "Đã điểm danh", value: attendedWeeks.size, color: "green" },
                  { label: "Vắng mặt", value: absentWeeks, color: "red" },
                ].map((stat) => (
                  <div key={stat.label} className="rounded-xl p-3 text-center" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.05)" }}>
                    <p className="text-lg font-extrabold" style={{ color: stat.color === "cyan" ? "#22d3ee" : stat.color === "green" ? "#00ffb4" : "#ff6b6b" }}>
                      {stat.value}
                    </p>
                    <p className="text-[10px] text-cyan-300/35 uppercase tracking-wider">{stat.label}</p>
                  </div>
                ))}
              </div>

              {/* Weeks grid */}
              <div className="grid grid-cols-5 sm:grid-cols-8 gap-2" style={{ transformStyle: "preserve-3d" }}>
                {weeksArray.map((week) => {
                  const attended = attendedWeeks.has(week);
                  return (
                    <div
                      key={week}
                      className="week-cell relative flex flex-col items-center gap-1 rounded-xl p-2 cursor-default"
                      style={{
                        background: attended ? "rgba(0,255,180,0.08)" : "rgba(255,255,255,0.02)",
                        border: `1px solid ${attended ? "rgba(0,255,180,0.2)" : "rgba(255,255,255,0.05)"}`,
                        boxShadow: attended ? "0 0 12px rgba(0,255,180,0.1)" : "none",
                      }}
                    >
                      <span className="text-[10px] font-mono text-cyan-300/40">T{week}</span>
                      {attended ? (
                        <CheckCircle className="w-4 h-4" style={{ color: "#00ffb4" }} />
                      ) : (
                        <X className="w-4 h-4" style={{ color: "rgba(255,60,60,0.35)" }} />
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Progress bar */}
              <div className="mt-4 h-2 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.05)" }}>
                <div
                  className="h-full rounded-full transition-all duration-700 ease-out"
                  style={{
                    width: `${attendanceRate}%`,
                    background: attendanceRate >= 80
                      ? "linear-gradient(90deg, #00ffb4, #22d3ee)"
                      : attendanceRate >= 50
                        ? "linear-gradient(90deg, #ffc800, #ff9500)"
                        : "linear-gradient(90deg, #ff3c3c, #ff6b6b)",
                    boxShadow: `0 0 16px ${attendanceRate >= 80 ? "rgba(0,255,180,0.4)" : attendanceRate >= 50 ? "rgba(255,200,0,0.4)" : "rgba(255,60,60,0.4)"}`,
                  }}
                />
              </div>
            </div>
          );
        })}

        {/* Bottom spacer */}
        <div className="h-8" />
      </main>
    </div>
  );
};

export default TraCuuDiem;
