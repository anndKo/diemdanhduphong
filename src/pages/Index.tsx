import { useState, useCallback, lazy, Suspense } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { User, LogIn, CheckCircle, MapPin, AlertTriangle } from "lucide-react";
import LoginModal from "@/components/LoginModal";
import useGPS, { calculateDistance } from "@/hooks/useGPS";
import BugReportModal from "@/components/BugReportModal";

const AttendanceForm = lazy(() => import("@/components/AttendanceForm"));

interface ClassData {
  id: string;
  name: string;
  weeks_count: number;
  attendance_duration_minutes: number | null;
  attendance_started_at: string | null;
  admin_latitude: number | null;
  admin_longitude: number | null;
  current_week: number | null;
  advanced_verification: boolean | null;
}

/* ── Dots wave animation ── */
const DotsWave = () => (
  <div className="flex items-end gap-1.5 h-8">
    {[0, 1, 2, 3, 4].map((i) => (
      <span
        key={i}
        className="w-2 rounded-full bg-primary/80"
        style={{
          height: "8px",
          animation: `dotsWave 1.2s ease-in-out ${i * 0.15}s infinite`,
        }}
      />
    ))}
    <style>{`
      @keyframes dotsWave {
        0%, 100% { height: 8px; opacity: 0.4; }
        50% { height: 24px; opacity: 1; }
      }
    `}</style>
  </div>
);

/* ── Searching Modal ── */
const SearchingModal = ({ visible }: { visible: boolean }) => {
  if (!visible) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: "hsl(var(--foreground) / 0.35)", backdropFilter: "blur(8px)" }}
    >
      <div
        className="relative bg-card border border-border/60 rounded-3xl shadow-2xl px-10 py-10 flex flex-col items-center gap-6 w-[90vw] max-w-sm"
        style={{
          animation: "searchModalIn 0.35s cubic-bezier(0.34,1.56,0.64,1) forwards",
          boxShadow: "0 32px 64px -16px hsl(var(--primary) / 0.18), 0 8px 32px -8px hsl(220 20% 10% / 0.15)",
        }}
      >
        {/* Glow ring */}
        <div className="absolute inset-0 rounded-3xl pointer-events-none"
          style={{ boxShadow: "inset 0 0 0 1px hsl(var(--primary) / 0.12)" }} />

        {/* Icon badge */}
        <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
          <CheckCircle className="w-8 h-8 text-primary" />
        </div>

        {/* Texts */}
        <div className="text-center space-y-2">
          <h2 className="text-lg font-semibold tracking-tight text-foreground">
            Đang tìm lớp học
          </h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Vui lòng chờ trong giây lát...
          </p>
        </div>

        {/* Animation */}
        <DotsWave />

        <style>{`
          @keyframes searchModalIn {
            from { opacity: 0; transform: scale(0.88); }
            to   { opacity: 1; transform: scale(1); }
          }
        `}</style>
      </div>
    </div>
  );
};

const Index = () => {
  const navigate = useNavigate();
  const [showLogin, setShowLogin] = useState(false);
  const [showBugReport, setShowBugReport] = useState(false);
  const [attendanceCode, setAttendanceCode] = useState("");
  const [verifiedClass, setVerifiedClass] = useState<ClassData | null>(null);
  const [isSearching, setIsSearching] = useState(false);

  const { getAveragePosition } = useGPS();

  const handleVerifyCode = useCallback(async () => {
    if (attendanceCode.length !== 6) {
      toast.error("Mã điểm danh phải có 6 chữ số!");
      return;
    }

    setIsSearching(true);
    try {
      const { data, error } = await supabase
        .from("classes" as any)
        .select("id, name, weeks_count, attendance_duration_minutes, attendance_started_at, admin_latitude, admin_longitude, current_week, advanced_verification")
        .eq("code", attendanceCode)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        const classData = data as any;

        if (classData.attendance_started_at && classData.attendance_duration_minutes) {
          const startTime = new Date(classData.attendance_started_at).getTime();
          const endTime = startTime + classData.attendance_duration_minutes * 60 * 1000;
          if (Date.now() > endTime) {
            toast.error("Mã điểm danh đã hết hiệu lực! Vui lòng liên hệ giảng viên.");
            return;
          }
        }

        if (classData.admin_latitude && classData.admin_longitude) {
          toast.info("Đang xác minh vị trí của bạn...");
          try {
            const userPosition = await getAveragePosition();
            const distance = calculateDistance(
              classData.admin_latitude,
              classData.admin_longitude,
              userPosition.latitude,
              userPosition.longitude
            );
            const MAX_DISTANCE = 300;
            if (distance > MAX_DISTANCE) {
              toast.error(`Bạn ở ngoài phạm vi cho phép (cách ${Math.round(distance)}m, yêu cầu trong ${MAX_DISTANCE}m). Vui lòng di chuyển lại gần và thử lại!`);
              return;
            }
            toast.success(`Vị trí hợp lệ (cách ${Math.round(distance)}m)`);
          } catch (gpsError) {
            console.error("GPS error:", gpsError);
            const message = gpsError instanceof Error ? gpsError.message : "Không thể xác minh vị trí";
            toast.error(message);
            return;
          }
        }

        setVerifiedClass(classData);
        toast.success(`Đã tìm thấy lớp: ${classData.name}`);
      } else {
        toast.error("Mã điểm danh không tồn tại!");
      }
    } catch (error) {
      console.error("Error verifying code:", error);
      toast.error("Có lỗi xảy ra khi kiểm tra mã!");
    } finally {
      setIsSearching(false);
    }
  }, [attendanceCode, getAveragePosition]);

  const handleAttendanceSuccess = useCallback(() => {
    setVerifiedClass(null);
    setAttendanceCode("");
    toast.success("Điểm danh thành công!");
  }, []);

  const handleCodeChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/\D/g, "").slice(0, 6);
    setAttendanceCode(value);
  }, []);

  const handleCloseModal = useCallback(() => setVerifiedClass(null), []);

  return (
    <div className="min-h-screen gradient-bg">
      {/* Header */}
      <header className="w-full px-6 py-4 flex justify-between items-center">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center">
            <CheckCircle className="w-6 h-6 text-primary-foreground" />
          </div>
          <h1 className="text-xl font-bold text-foreground">Hệ Thống Điểm Danh</h1>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => setShowBugReport(true)}
            className="flex items-center gap-2 text-destructive border-destructive/30 hover:bg-destructive/10"
          >
            <AlertTriangle className="w-4 h-4" />
            <span className="hidden sm:inline">Báo cáo lỗi</span>
          </Button>
          <Button
            variant="outline"
            onClick={() => setShowLogin(true)}
            className="flex items-center gap-2"
          >
            <LogIn className="w-4 h-4" />
            Đăng nhập
          </Button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex flex-col items-center justify-center px-6 py-20">
        <div className="text-center mb-12 animate-fade-in">
          <h2 className="text-4xl md:text-5xl font-bold text-foreground mb-4 text-balance">
            Điểm Danh Nhanh Chóng
          </h2>
          <p className="text-lg text-muted-foreground max-w-md mx-auto">
            Nhập mã điểm danh 6 số được cung cấp bởi giảng viên để điểm danh
          </p>
        </div>

        <div className="w-full max-w-md card-elevated p-8 animate-slide-up">
          <div className="flex items-center gap-4 mb-6">
            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
              <User className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h3 className="font-semibold text-foreground">Nhập mã điểm danh</h3>
              <p className="text-sm text-muted-foreground">Mã gồm 6 chữ số</p>
            </div>
          </div>

          <div className="space-y-4">
            <Input
              type="text"
              placeholder="Ví dụ: 123456"
              value={attendanceCode}
              onChange={handleCodeChange}
              className="input-modern text-center text-2xl tracking-widest font-mono"
              maxLength={6}
              inputMode="numeric"
              pattern="[0-9]*"
              autoComplete="off"
            />
            <Button
              onClick={handleVerifyCode}
              disabled={attendanceCode.length !== 6 || isSearching}
              className="w-full btn-primary-gradient py-6 text-lg"
            >
              {isSearching ? (
                <>
                  <MapPin className="w-5 h-5 mr-2 animate-pulse" />
                  Đang tìm lớp...
                </>
              ) : (
                "Xác nhận mã"
              )}
            </Button>
          </div>
        </div>
      </main>

      {/* Searching Modal — không thể đóng thủ công */}
      <SearchingModal visible={isSearching} />

      {/* Bug Report Modal */}
      {showBugReport && (
        <BugReportModal onClose={() => setShowBugReport(false)} />
      )}

      {/* Login Modal */}
      {showLogin && (
        <LoginModal onClose={() => setShowLogin(false)} onSuccess={() => navigate("/admin")} />
      )}

      {/* Attendance Form Modal — Lazy Loaded */}
      {verifiedClass && (
        <Suspense fallback={<SearchingModal visible />}>
          <AttendanceForm
            classInfo={verifiedClass}
            onClose={handleCloseModal}
            onSuccess={handleAttendanceSuccess}
          />
        </Suspense>
      )}
    </div>
  );
};

export default Index;
