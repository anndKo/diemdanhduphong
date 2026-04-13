import { useState, useCallback, useRef, lazy, Suspense, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  LogIn, CheckCircle, MapPin, AlertTriangle, Search,
  Zap, ShieldCheck, Smartphone, Clock, ArrowRight,
  ChevronRight, Mail, Heart,
} from "lucide-react";
import LoginModal from "@/components/LoginModal";
import useGPS, { calculateDistance } from "@/hooks/useGPS";
import BugReportModal from "@/components/BugReportModal";

const AttendanceModal = lazy(() => import("@/components/attendance/AttendanceModal"));

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
const blockAll = (e: React.SyntheticEvent) => {
  e.stopPropagation();
  e.preventDefault();
};

const SearchingModal = ({ visible }: { visible: boolean }) => {
  if (!visible) return null;
  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center"
      style={{ backgroundColor: "hsl(var(--foreground) / 0.35)", backdropFilter: "blur(8px)" }}
      onClickCapture={blockAll}
      onPointerDownCapture={blockAll}
      onPointerUpCapture={blockAll}
      onTouchStartCapture={blockAll}
      onTouchEndCapture={blockAll}
      onKeyDownCapture={blockAll}
      onMouseDownCapture={blockAll}
    >
      <div
        className="relative bg-card border border-border/60 rounded-3xl shadow-2xl px-10 py-10 flex flex-col items-center gap-6 w-[90vw] max-w-sm"
        style={{
          animation: "searchModalIn 0.35s cubic-bezier(0.34,1.56,0.64,1) forwards",
          boxShadow: "0 32px 64px -16px hsl(var(--primary) / 0.18), 0 8px 32px -8px hsl(220 20% 10% / 0.15)",
        }}
      >
        <div className="absolute inset-0 rounded-3xl pointer-events-none"
          style={{ boxShadow: "inset 0 0 0 1px hsl(var(--primary) / 0.12)" }} />
        <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
          <CheckCircle className="w-8 h-8 text-primary" />
        </div>
        <div className="text-center space-y-2">
          <h2 className="text-lg font-semibold tracking-tight text-foreground">
            Đang tìm lớp học
          </h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Vui lòng chờ trong giây lát...
          </p>
        </div>
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

/* ── Feature cards data ── */
const FEATURES = [
  {
    icon: Zap,
    title: "Nhanh chóng",
    desc: "Điểm danh chỉ trong vài giây với mã 6 số đơn giản",
  },
  {
    icon: ShieldCheck,
    title: "Chính xác",
    desc: "Xác minh GPS và khuôn mặt đảm bảo tính chính xác",
  },
  {
    icon: Smartphone,
    title: "Dễ sử dụng",
    desc: "Giao diện đơn giản, hoạt động mượt trên mọi thiết bị",
  },
  {
    icon: Clock,
    title: "Bảo mật",
    desc: "Dữ liệu được mã hóa và bảo vệ theo tiêu chuẩn cao",
  },
];

const STEPS = [
  { num: "01", title: "Nhận mã từ giảng viên", desc: "Giảng viên sẽ cung cấp mã điểm danh 6 số cho lớp học" },
  { num: "02", title: "Nhập mã điểm danh", desc: "Nhập mã 6 số vào ô bên dưới để xác nhận lớp học" },
  { num: "03", title: "Xác nhận điểm danh", desc: "Chụp ảnh và hoàn tất điểm danh thành công" },
];

const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  visible: (i: number) => ({
    opacity: 1, y: 0,
    transition: { delay: i * 0.06, duration: 0.35, ease: "easeOut" as const },
  }),
};

const Index = () => {
  const navigate = useNavigate();
  const [showLogin, setShowLogin] = useState(false);
  const [showBugReport, setShowBugReport] = useState(false);
  const [attendanceCode, setAttendanceCode] = useState("");
  const [verifiedClass, setVerifiedClass] = useState<ClassData | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const isSearchingRef = useRef(false);

  const { getAccuratePosition, requestPermission, permissionStatus, startContinuousTracking, stopContinuousTracking, currentPosition } = useGPS();

  // Request GPS on mount and start continuous tracking for accurate position
  useEffect(() => {
    requestPermission();
    // Start continuous tracking so position is ready when user submits
    startContinuousTracking();
    return () => stopContinuousTracking();
  }, [requestPermission, startContinuousTracking, stopContinuousTracking]);

  // Show GPS prompt if denied
  useEffect(() => {
    if (permissionStatus === 'denied') {
      toast.error('Vui lòng bật GPS trong cài đặt trình duyệt để điểm danh!', { duration: 5000 });
    }
  }, [permissionStatus]);

  const handleVerifyCode = useCallback(async () => {
    if (isSearchingRef.current) return;
    if (attendanceCode.length !== 6) {
      toast.error("Mã điểm danh phải có 6 chữ số!");
      return;
    }

    isSearchingRef.current = true;
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
            // Use current tracked position if fresh enough, otherwise get new one
            let userPosition;
            if (currentPosition && currentPosition.accuracy <= 50) {
              userPosition = currentPosition;
            } else {
              userPosition = await getAccuratePosition();
            }
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
      isSearchingRef.current = false;
      setIsSearching(false);
    }
  }, [attendanceCode, getAccuratePosition, currentPosition]);

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
    <div className="min-h-screen bg-background">
      {/* ─── Sticky Header ─── */}
      <header className="sticky top-0 z-50 w-full border-b border-border/50 bg-background/80 backdrop-blur-xl">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 h-14 sm:h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-primary flex items-center justify-center shadow-sm">
              <CheckCircle className="w-5 h-5 text-primary-foreground" />
            </div>
            <span className="font-bold text-lg sm:text-xl text-foreground tracking-tight">AnndKO</span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowBugReport(true)}
              className="h-9 px-2.5 text-destructive hover:bg-destructive/10"
            >
              <AlertTriangle className="w-4 h-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowLogin(true)}
              className="h-9 px-3.5 text-sm font-medium"
            >
              <LogIn className="w-4 h-4 mr-1.5" />
              Đăng nhập
            </Button>
          </div>
        </div>
        
      </header>

      {/* ─── Hero Section ─── */}
      <section className="relative overflow-hidden">
        {/* Background gradient */}
        <div className="absolute inset-0 -z-10" style={{
          background: "linear-gradient(180deg, hsl(210 60% 98%) 0%, hsl(217 50% 95%) 50%, hsl(210 60% 98%) 100%)",
        }} />
        {/* Decorative blobs */}
        <div className="absolute top-20 left-1/4 w-72 h-72 bg-primary/5 rounded-full blur-3xl -z-10" />
        <div className="absolute bottom-10 right-1/4 w-96 h-96 bg-primary/3 rounded-full blur-3xl -z-10" />

        <div className="mx-auto max-w-6xl px-4 sm:px-6 pt-4 sm:pt-8 pb-8 sm:pb-14">
          <div className="flex flex-col lg:flex-row items-center gap-6 lg:gap-12">
            {/* Left: Text */}
            <motion.div
              className="flex-1 text-center lg:text-left"
              initial="hidden"
              animate="visible"
              variants={{ visible: { transition: { staggerChildren: 0.1 } } }}
            >
              <motion.div variants={fadeUp} custom={0}
                className="inline-flex items-center gap-2 px-3 py-1.5 mb-4 rounded-full border border-primary/20 bg-primary/5 text-primary text-xs sm:text-sm font-medium"
              >
                <Zap className="w-3.5 h-3.5" />
                Điểm danh thông minh
              </motion.div>

              <motion.h1 variants={fadeUp} custom={1}
                className="text-3xl sm:text-4xl md:text-5xl lg:text-[3.25rem] font-extrabold text-foreground leading-[1.15] tracking-tight mb-3 sm:mb-4"
              >
                Điểm Danh{" "}
                <span className="text-primary">Nhanh Chóng</span>
                {" "}& Chính Xác
              </motion.h1>

              <motion.p variants={fadeUp} custom={2}
                className="text-base sm:text-lg text-muted-foreground max-w-lg mx-auto lg:mx-0 leading-relaxed"
              >
                Nhập mã điểm danh do giảng viên cung cấp
              </motion.p>
            </motion.div>

            {/* Right: CTA Card */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15, duration: 0.4, ease: [0.25, 0.1, 0.25, 1] }}
              className="w-full max-w-md"
            >
              {/* Tra cứu button above card */}
              <div className="flex justify-center sm:justify-end mb-3">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => navigate("/tracuudiemdanh")}
                  className="flex items-center gap-1.5 h-9 text-sm border-primary/25 text-primary hover:bg-primary/5 rounded-xl"
                >
                  <Search className="w-3.5 h-3.5" />
                  Tra cứu điểm danh
                </Button>
              </div>
              <div className="relative rounded-3xl border border-border/40 bg-card/80 backdrop-blur-sm overflow-hidden"
                style={{ boxShadow: "0 24px 48px -12px hsl(var(--primary) / 0.15), 0 12px 24px -8px hsl(220 20% 10% / 0.08)" }}
              >
                {/* Top accent bar */}
                <div className="h-1 w-full bg-gradient-to-r from-primary via-primary/70 to-primary/40" />
                
                <div className="p-6 sm:p-8">
                  {/* Header */}
                  <div className="flex items-center gap-3 mb-5">
                    <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center shadow-md"
                      style={{ boxShadow: "0 4px 12px hsl(var(--primary) / 0.3)" }}
                    >
                      <CheckCircle className="w-5 h-5 text-primary-foreground" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-foreground text-base">Nhập mã điểm danh</h3>
                      <p className="text-xs text-muted-foreground">Mã gồm 6 chữ số từ giảng viên</p>
                    </div>
                  </div>

                  {/* Input */}
                  <div className="space-y-3">
                    <div className="relative">
                      <Input
                        type="text"
                        placeholder="● ● ● ● ● ●"
                        value={attendanceCode}
                        onChange={handleCodeChange}
                        className="h-14 text-center text-2xl sm:text-3xl tracking-[0.35em] font-mono bg-background/60 border-border/50 focus:border-primary focus:ring-4 focus:ring-primary/10 rounded-2xl transition-all duration-300"
                        maxLength={6}
                        inputMode="numeric"
                        pattern="[0-9]*"
                        autoComplete="off"
                      />
                      {attendanceCode.length > 0 && (
                        <div className="absolute bottom-1.5 left-1/2 -translate-x-1/2 flex gap-1.5">
                          {[0,1,2,3,4,5].map(i => (
                            <div key={i} className={`w-1.5 h-1.5 rounded-full transition-all duration-200 ${i < attendanceCode.length ? 'bg-primary scale-110' : 'bg-border'}`} />
                          ))}
                        </div>
                      )}
                    </div>
                    <Button
                      onClick={handleVerifyCode}
                      disabled={attendanceCode.length !== 6 || isSearching}
                      className="w-full h-12 text-base font-semibold rounded-2xl bg-gradient-to-r from-primary to-primary/90 hover:from-primary/95 hover:to-primary/85 text-primary-foreground shadow-lg transition-all duration-300 hover:-translate-y-0.5 hover:shadow-xl"
                      style={{ boxShadow: "0 6px 20px hsl(var(--primary) / 0.35)" }}
                    >
                      {isSearching ? (
                        <>
                          <MapPin className="w-5 h-5 mr-2 animate-pulse" />
                          Đang tìm lớp...
                        </>
                      ) : (
                        <>
                          Xác nhận mã
                          <ArrowRight className="w-5 h-5 ml-2" />
                        </>
                      )}
                    </Button>
                  </div>

                  <p className="text-[11px] text-muted-foreground text-center mt-3 flex items-center justify-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    Tự động xác minh GPS & khuôn mặt
                  </p>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ─── Features Section ─── */}
      <section className="py-16 sm:py-24 bg-background">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-50px" }}
            variants={{ visible: { transition: { staggerChildren: 0.08 } } }}
            className="text-center mb-12 sm:mb-16"
          >
            <motion.p variants={fadeUp} custom={0}
              className="text-sm font-medium text-primary mb-2 uppercase tracking-wider"
            >
              Tính năng
            </motion.p>
            <motion.h2 variants={fadeUp} custom={1}
              className="text-2xl sm:text-3xl font-bold text-foreground"
            >
              Tại sao chọn hệ thống của chúng tôi?
            </motion.h2>
          </motion.div>

          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-30px" }}
            variants={{ visible: { transition: { staggerChildren: 0.1 } } }}
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6"
          >
            {FEATURES.map((f, i) => (
              <motion.div
                key={f.title}
                variants={fadeUp}
                custom={i}
                className="group relative rounded-2xl border border-border/50 bg-card p-6 hover:border-primary/20 hover:shadow-lg hover:-translate-y-1 transition-all duration-300"
              >
                <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center mb-4 group-hover:bg-primary/15 transition-colors">
                  <f.icon className="w-5 h-5 text-primary" />
                </div>
                <h3 className="font-semibold text-foreground mb-2">{f.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{f.desc}</p>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ─── How it Works ─── */}
      <section className="py-16 sm:py-24" style={{
        background: "linear-gradient(180deg, hsl(210 40% 97%) 0%, hsl(var(--background)) 100%)",
      }}>
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-50px" }}
            variants={{ visible: { transition: { staggerChildren: 0.08 } } }}
            className="text-center mb-12 sm:mb-16"
          >
            <motion.p variants={fadeUp} custom={0}
              className="text-sm font-medium text-primary mb-2 uppercase tracking-wider"
            >
              Hướng dẫn
            </motion.p>
            <motion.h2 variants={fadeUp} custom={1}
              className="text-2xl sm:text-3xl font-bold text-foreground"
            >
              Chỉ 3 bước đơn giản
            </motion.h2>
          </motion.div>

          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-30px" }}
            variants={{ visible: { transition: { staggerChildren: 0.15 } } }}
            className="grid grid-cols-1 md:grid-cols-3 gap-6 sm:gap-8"
          >
            {STEPS.map((step, i) => (
              <motion.div
                key={step.num}
                variants={fadeUp}
                custom={i}
                className="relative flex flex-col items-center text-center p-6 sm:p-8"
              >
                {/* Connector line (desktop) */}
                {i < STEPS.length - 1 && (
                  <div className="hidden md:block absolute top-12 right-0 translate-x-1/2 w-full h-px border-t-2 border-dashed border-primary/20" />
                )}
                <div className="w-14 h-14 rounded-2xl bg-primary text-primary-foreground flex items-center justify-center text-xl font-bold mb-5 shadow-lg relative z-10"
                  style={{ boxShadow: "0 4px 14px hsl(var(--primary) / 0.25)" }}
                >
                  {step.num}
                </div>
                <h3 className="font-semibold text-foreground mb-2 text-base">{step.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed max-w-xs">{step.desc}</p>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ─── CTA Section ─── */}
      <section className="py-16 sm:py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="relative rounded-3xl overflow-hidden px-6 sm:px-12 py-12 sm:py-16 text-center"
            style={{
              background: "linear-gradient(135deg, hsl(var(--primary)) 0%, hsl(226 71% 40%) 100%)",
            }}
          >
            {/* Decorative circles */}
            <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/2" />
            <div className="absolute bottom-0 left-0 w-48 h-48 bg-white/5 rounded-full translate-y-1/2 -translate-x-1/2" />

            <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-primary-foreground mb-4 relative z-10">
              Bắt đầu điểm danh ngay
            </h2>
            <p className="text-primary-foreground/80 text-base sm:text-lg max-w-lg mx-auto mb-8 relative z-10">
              Nhập mã điểm danh và hoàn tất trong chưa đầy 10 giây
            </p>
            <Button
              size="lg"
              onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
              className="relative z-10 h-12 px-8 text-base font-semibold bg-primary-foreground text-primary hover:bg-primary-foreground/90 rounded-xl shadow-lg transition-all hover:-translate-y-0.5"
            >
              Điểm danh ngay
              <ChevronRight className="w-5 h-5 ml-1" />
            </Button>
          </motion.div>
        </div>
      </section>

      {/* ─── Footer ─── */}
      <footer className="border-t border-border/50 bg-muted/30">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 py-8 sm:py-10">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
                <CheckCircle className="w-4 h-4 text-primary-foreground" />
              </div>
              <span className="font-semibold text-sm text-foreground">AnndKO</span>
            </div>
            <div className="flex items-center gap-6 text-sm text-muted-foreground">
              <button onClick={() => setShowBugReport(true)} className="hover:text-foreground transition-colors">
                Báo cáo lỗi
              </button>
              <button onClick={() => setShowLogin(true)} className="hover:text-foreground transition-colors">
                Đăng nhập
              </button>
            </div>
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              Made with <Heart className="w-3 h-3 text-destructive" /> © {new Date().getFullYear()}
            </p>
          </div>
        </div>
      </footer>

      {/* ─── Modals ─── */}
      <SearchingModal visible={isSearching} />

      {showBugReport && (
        <BugReportModal onClose={() => setShowBugReport(false)} />
      )}

      {showLogin && (
        <LoginModal onClose={() => setShowLogin(false)} onSuccess={() => navigate("/admin")} />
      )}

      {verifiedClass && (
        <Suspense fallback={<SearchingModal visible />}>
          <AttendanceModal
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
