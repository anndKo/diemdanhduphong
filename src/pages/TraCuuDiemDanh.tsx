import { useState, useCallback } from "react";
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

const TraCuuDiemDanh = () => {
  const navigate = useNavigate();
  const [studentCode, setStudentCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [classes, setClasses] = useState<ClassInfo[]>([]);

  const handleSearch = useCallback(async () => {
    const code = studentCode.trim();
    if (!code) {
      toast.error("Vui lòng nhập mã sinh viên!");
      return;
    }
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
          .from("classes" as any)
          .select("id, name, weeks_count")
          .in("id", classIds);
        setClasses((classData || []) as unknown as ClassInfo[]);
      } else {
        setClasses([]);
      }

      setSearched(true);
      if (recs.length === 0) {
        toast.info("Không tìm thấy dữ liệu điểm danh cho mã sinh viên này.");
      }
    } catch (err) {
      console.error("Search error:", err);
      toast.error("Có lỗi xảy ra khi tra cứu!");
    } finally {
      setLoading(false);
    }
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
      {/* Animated background */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div
          className="absolute -top-1/2 -left-1/2 w-[200%] h-[200%] opacity-[0.03]"
          style={{
            backgroundImage: `radial-gradient(circle at 30% 40%, hsl(var(--primary)) 0%, transparent 50%),
                              radial-gradient(circle at 70% 60%, hsl(var(--accent)) 0%, transparent 50%)`,
            animation: "bgFloat 20s ease-in-out infinite alternate",
          }}
        />
      </div>

      <style>{`
        @keyframes bgFloat {
          0% { transform: translate(0, 0) rotate(0deg); }
          100% { transform: translate(-5%, -3%) rotate(3deg); }
        }
        @keyframes cardEnter {
          from { opacity: 0; transform: translateY(30px) perspective(800px) rotateX(5deg); }
          to { opacity: 1; transform: translateY(0) perspective(800px) rotateX(0deg); }
        }
        @keyframes heroEnter {
          from { opacity: 0; transform: scale(0.95) translateY(-20px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(24px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes shimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
        .card-3d {
          transform-style: preserve-3d;
          transition: transform 0.3s ease, box-shadow 0.3s ease;
        }
        .card-3d:hover {
          transform: translateY(-4px) perspective(800px) rotateX(1deg);
        }
        .week-cell {
          transition: all 0.2s ease;
        }
        .week-cell:hover {
          transform: scale(1.08);
          z-index: 10;
        }
      `}</style>

      {/* Header */}
      <header
        className="relative w-full px-6 py-4 flex items-center gap-3 border-b border-border/40"
        style={{
          background: "linear-gradient(135deg, hsl(var(--card)) 0%, hsl(var(--background)) 100%)",
          backdropFilter: "blur(12px)",
          animation: "heroEnter 0.4s ease-out",
        }}
      >
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate("/")}
          className="shrink-0 rounded-xl hover:bg-primary/10"
        >
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center shadow-md"
            style={{ background: "var(--gradient-primary)" }}
          >
            <Search className="w-5 h-5 text-primary-foreground" />
          </div>
          <h1 className="text-xl font-bold text-foreground">Tra Cứu Điểm Danh</h1>
        </div>
      </header>

      {/* Main */}
      <main className="relative flex flex-col items-center px-4 sm:px-6 py-8 sm:py-12">
        {/* Hero */}
        <div
          className="text-center mb-8"
          style={{ animation: "heroEnter 0.5s ease-out" }}
        >
          <div
            className="w-20 h-20 mx-auto mb-5 rounded-2xl flex items-center justify-center shadow-lg"
            style={{
              background: "var(--gradient-primary)",
              transform: "perspective(400px) rotateY(-8deg)",
            }}
          >
            <GraduationCap className="w-10 h-10 text-primary-foreground" />
          </div>
          <h2 className="text-3xl sm:text-4xl font-bold text-foreground mb-3 text-balance">
            Tra Cứu Điểm Danh
          </h2>
          <p className="text-muted-foreground max-w-md mx-auto text-sm sm:text-base">
            Nhập mã sinh viên để xem lịch sử điểm danh tất cả các tuần
          </p>
        </div>

        {/* Search card */}
        <div
          className="card-3d w-full max-w-md rounded-2xl border border-border/50 p-6 mb-8"
          style={{
            background: "linear-gradient(145deg, hsl(var(--card)) 0%, hsl(var(--background)) 100%)",
            boxShadow: "var(--shadow-elevated), inset 0 1px 0 hsl(0 0% 100% / 0.1)",
            animation: "cardEnter 0.5s ease-out 0.1s both",
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
                <>
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                  Đang tra cứu...
                </>
              ) : (
                <>
                  <Search className="w-5 h-5 mr-2" />
                  Tra cứu
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Student name card */}
        {searched && records.length > 0 && (
          <div
            className="w-full max-w-md mb-6 rounded-2xl border border-border/50 p-4 flex items-center gap-4"
            style={{
              background: "linear-gradient(145deg, hsl(var(--card)) 0%, hsl(var(--background)) 100%)",
              boxShadow: "var(--shadow-card)",
              animation: "slideUp 0.3s ease-out",
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
            <div className="shrink-0 text-right">
              <p className="text-2xl font-bold text-primary">{uniqueClassIds.length}</p>
              <p className="text-xs text-muted-foreground">lớp học</p>
            </div>
          </div>
        )}

        {/* Empty state */}
        {searched && uniqueClassIds.length === 0 && (
          <div
            className="card-3d w-full max-w-2xl rounded-2xl border border-border/50 p-10 text-center"
            style={{
              background: "linear-gradient(145deg, hsl(var(--card)) 0%, hsl(var(--background)) 100%)",
              boxShadow: "var(--shadow-card)",
              animation: "cardEnter 0.5s ease-out",
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
              className="card-3d w-full max-w-2xl rounded-2xl border border-border/50 p-5 sm:p-6 mb-6"
              style={{
                background: "linear-gradient(145deg, hsl(var(--card)) 0%, hsl(var(--background)) 100%)",
                boxShadow: "var(--shadow-elevated), inset 0 1px 0 hsl(0 0% 100% / 0.08)",
                animation: `slideUp 0.4s ease-out ${0.1 + idx * 0.1}s both`,
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
                {/* Attendance rate badge */}
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
                  }}
                >
                  {attendedWeeks.size}/{totalWeeks} tuần · {attendanceRate}%
                </div>
              </div>

              {/* Weeks grid */}
              <div className="grid grid-cols-5 sm:grid-cols-8 gap-2">
                {weeksArray.map((week) => {
                  const attended = attendedWeeks.has(week);
                  return (
                    <div
                      key={week}
                      className="week-cell relative flex flex-col items-center gap-1 rounded-xl p-2 cursor-default"
                      style={{
                        background: attended
                          ? "hsl(var(--success) / 0.1)"
                          : "hsl(var(--muted) / 0.5)",
                        border: `1px solid ${attended
                          ? "hsl(var(--success) / 0.25)"
                          : "hsl(var(--border) / 0.4)"}`,
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

              {/* Progress bar */}
              <div className="mt-4 h-2 rounded-full bg-muted/50 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-700 ease-out"
                  style={{
                    width: `${attendanceRate}%`,
                    background: attendanceRate >= 80
                      ? "hsl(var(--success))"
                      : attendanceRate >= 50
                        ? "hsl(var(--accent))"
                        : "hsl(var(--destructive))",
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
