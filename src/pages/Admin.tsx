import { useState, useEffect, useCallback, useMemo, memo, lazy, Suspense } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Plus, BookOpen, Users, Loader2, Copy, Trash2, Calendar, Clock, MapPin, Shield, Star, CalendarOff, BookPlus, HelpCircle, CheckCircle2 } from "lucide-react";
import AdminSettingsMenu from "@/components/AdminSettingsMenu";
import ClassBonusPointsModal from "@/components/ClassBonusPointsModal";
import LeaveManagementModal from "@/components/LeaveManagementModal";
import ProtectionPasswordModal from "@/components/ProtectionPasswordModal";
import CreateGuideModal from "@/components/CreateGuideModal";
import GuidesListModal from "@/components/GuidesListModal";
import WelcomeNotification from "@/components/WelcomeNotification";
import AdvertisementManagementModal from "@/components/AdvertisementManagementModal";
import ImageScanResultsModal from "@/components/ImageScanResultsModal";

import useGPS from "@/hooks/useGPS";

// Lazy load all modals
const ClassDetailModal = lazy(() => import("@/components/ClassDetailModal"));
const CopyCodeModal = lazy(() => import("@/components/CopyCodeModal"));
const ChangePasswordModal = lazy(() => import("@/components/ChangePasswordModal"));
const CreateTeacherModal = lazy(() => import("@/components/CreateTeacherModal"));
const SetProtectionPasswordModal = lazy(() => import("@/components/SetProtectionPasswordModal"));
const AdminReportsModal = lazy(() => import("@/components/AdminReportsModal"));
const PasswordResetRequestsModal = lazy(() => import("@/components/PasswordResetRequestsModal"));
const AccountRequestsModal = lazy(() => import("@/components/AccountRequestsModal"));
const SecurityManagementModal = lazy(() => import("@/components/SecurityManagementModal"));
const ProtectionResetRequestsModal = lazy(() => import("@/components/ProtectionResetRequestsModal"));

const ModalFallback = () =>
<div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
    <Loader2 className="w-8 h-8 animate-spin text-primary" />
  </div>;


interface ClassItem {
  id: string;
  name: string;
  code: string;
  created_at: string;
  weeks_count: number;
  attendance_duration_minutes: number | null;
  attendance_started_at: string | null;
  admin_latitude: number | null;
  admin_longitude: number | null;
  current_week: number | null;
  advanced_verification: boolean | null;
}

// Memoized class card to prevent re-renders from timer
const ClassCard = memo(({
  classItem,
  remainingTime,
  isActive,
  isTimerTarget,
  timerWeek,
  timerMinutes,
  advancedVerification,
  isGettingGPS,
  onSelect,
  onCopyCode,
  onDelete,
  onStartAttendance,
  onStopAttendance,
  onSetTimerTarget,
  onCancelTimer,
  onTimerWeekChange,
  onTimerMinutesChange,
  onAdvancedChange



















}: {classItem: ClassItem;remainingTime: string | null;isActive: boolean;isTimerTarget: boolean;timerWeek: string;timerMinutes: string;advancedVerification: boolean;isGettingGPS: boolean;onSelect: () => void;onCopyCode: () => void;onDelete: () => void;onStartAttendance: () => void;onStopAttendance: () => void;onSetTimerTarget: () => void;onCancelTimer: () => void;onTimerWeekChange: (v: string) => void;onTimerMinutesChange: (v: string) => void;onAdvancedChange: (v: boolean) => void;index?: number;}) => {
const gradients = [
  'from-violet-600/20 via-purple-500/10 to-fuchsia-500/5 border-violet-500/20',
  'from-blue-600/20 via-cyan-500/10 to-teal-500/5 border-blue-500/20',
  'from-emerald-600/20 via-green-500/10 to-lime-500/5 border-emerald-500/20',
  'from-orange-600/20 via-amber-500/10 to-yellow-500/5 border-orange-500/20',
  'from-rose-600/20 via-pink-500/10 to-red-500/5 border-rose-500/20',
  'from-indigo-600/20 via-blue-500/10 to-sky-500/5 border-indigo-500/20',
];
const iconColors = [
  'text-violet-500 bg-violet-500/15',
  'text-blue-500 bg-blue-500/15',
  'text-emerald-500 bg-emerald-500/15',
  'text-orange-500 bg-orange-500/15',
  'text-rose-500 bg-rose-500/15',
  'text-indigo-500 bg-indigo-500/15',
];
const idx = (classItem.name.charCodeAt(0) + classItem.name.length) % gradients.length;
const gradient = gradients[idx];
const iconColor = iconColors[idx];

return (
<div
  className={`relative overflow-hidden rounded-2xl border p-4 md:p-5 cursor-pointer hover:shadow-xl hover:scale-[1.02] transition-all duration-300 group bg-gradient-to-br ${gradient}`}
  onClick={onSelect}>
  
    <div className="flex items-start justify-between mb-2 md:mb-3">
      <div className={`w-10 h-10 md:w-12 md:h-12 rounded-xl ${iconColor} flex items-center justify-center`}>
        <BookOpen className="w-5 h-5 md:w-6 md:h-6" />
      </div>
      <div className="flex items-center gap-1 md:gap-2">
        <div className="px-2 py-1 bg-secondary text-secondary-foreground rounded-lg text-xs font-medium flex items-center gap-1">
          <Calendar className="w-3 h-3" />
          {classItem.weeks_count}T
        </div>
        <Button
        variant="ghost"
        size="icon"
        className="w-8 h-8 opacity-0 group-hover:opacity-100 transition-opacity"
        onClick={(e) => {e.stopPropagation();onDelete();}}>
        
          <Trash2 className="w-4 h-4 text-destructive" />
        </Button>
      </div>
    </div>
    
    <h3 className="font-semibold text-foreground mb-2 line-clamp-1 text-sm md:text-base">
      {classItem.name}
    </h3>
    
    <div className="flex items-center justify-between mb-2 md:mb-3">
      <div
      className="flex items-center gap-1 md:gap-2 px-2 md:px-3 py-1 md:py-1.5 bg-primary/10 rounded-lg cursor-pointer hover:bg-primary/20 transition-colors"
      onClick={(e) => {e.stopPropagation();onCopyCode();}}>
      
        <span className="font-mono font-bold text-primary text-sm md:text-base">{classItem.code}</span>
        <Copy className="w-3 h-3 md:w-4 md:h-4 text-primary" />
      </div>
      <span className="text-xs text-muted-foreground">
        {new Date(classItem.created_at).toLocaleDateString("vi-VN")}
      </span>
    </div>

    {/* Attendance Timer Section */}
    <div className="pt-2 md:pt-3 border-t space-y-2" onClick={(e) => e.stopPropagation()}>
      {isActive ?
    <div className="flex items-center justify-between">
          <div className="flex items-center gap-1 md:gap-2 text-green-600">
            <Clock className="w-3 h-3 md:w-4 md:h-4 animate-pulse" />
            <span className="text-xs md:text-sm font-medium">
              T{classItem.current_week} - {remainingTime}
            </span>
          </div>
          <Button
        size="sm"
        variant="destructive"
        className="h-7 md:h-8 text-xs"
        onClick={onStopAttendance}>
        
            Tắt
          </Button>
        </div> :
    isTimerTarget ?
    <div className="space-y-2 relative">
          {/* GPS Loading Overlay */}
          <AnimatePresence>
            {isGettingGPS && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.25, ease: "easeOut" }}
                className="absolute inset-0 z-10 rounded-xl overflow-hidden flex flex-col items-center justify-center gap-2 py-3"
                style={{
                  background: "linear-gradient(135deg, hsl(var(--primary)/0.12) 0%, hsl(var(--primary)/0.06) 100%)",
                  backdropFilter: "blur(6px)",
                  border: "1px solid hsl(var(--primary)/0.25)",
                }}
              >
                {/* Ripple rings */}
                <div className="relative flex items-center justify-center w-10 h-10">
                  {[0, 1, 2].map((i) => (
                    <motion.div
                      key={i}
                      className="absolute rounded-full border border-primary/40"
                      initial={{ width: 16, height: 16, opacity: 0.8 }}
                      animate={{ width: 40, height: 40, opacity: 0 }}
                      transition={{
                        duration: 1.4,
                        repeat: Infinity,
                        delay: i * 0.45,
                        ease: "easeOut",
                      }}
                    />
                  ))}
                  <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center">
                    <MapPin className="w-4 h-4 text-primary" />
                  </div>
                </div>
                <div className="text-center">
                  <p className="text-xs font-semibold text-primary leading-tight">Đang lấy vị trí GPS</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">Vui lòng chờ...</p>
                </div>
                {/* Animated dots */}
                <div className="flex gap-1">
                  {[0, 1, 2].map((i) => (
                    <motion.div
                      key={i}
                      className="w-1 h-1 rounded-full bg-primary"
                      animate={{ opacity: [0.3, 1, 0.3] }}
                      transition={{ duration: 0.8, repeat: Infinity, delay: i * 0.25 }}
                    />
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div className={`flex items-center gap-1 md:gap-2 transition-opacity duration-200 ${isGettingGPS ? "opacity-0 pointer-events-none" : "opacity-100"}`}>
            <Input
          type="number"
          placeholder="T"
          value={timerWeek}
          onChange={(e) => onTimerWeekChange(e.target.value)}
          className="w-12 md:w-14 h-7 md:h-8 text-xs md:text-sm px-2"
          min={1}
          max={classItem.weeks_count} />
        
            <Input
          type="number"
          placeholder="Phút"
          value={timerMinutes}
          onChange={(e) => onTimerMinutesChange(e.target.value)}
          className="w-14 md:w-16 h-7 md:h-8 text-xs md:text-sm px-2"
          min={1}
          max={120} />
        
            <Button
          size="sm"
          onClick={onStartAttendance}
          className="btn-primary-gradient h-7 md:h-8 text-xs px-2 md:px-3"
          disabled={isGettingGPS}>
          
              Bắt đầu
            </Button>
            <Button
          size="sm"
          variant="ghost"
          className="h-7 md:h-8 text-xs px-2"
          onClick={onCancelTimer}>
          
              Hủy
            </Button>
          </div>
          
          <div className={`flex items-center justify-between p-2 bg-muted/50 rounded-lg transition-opacity duration-200 ${isGettingGPS ? "opacity-0 pointer-events-none" : "opacity-100"}`}>
            <Label className="text-xs flex items-center gap-1.5 cursor-pointer">
              <Shield className="w-3.5 h-3.5 text-primary" />
              <span>Nâng cao</span>
            </Label>
            <Switch
          checked={advancedVerification}
          onCheckedChange={onAdvancedChange}
          className="scale-75" />
        
          </div>
          {advancedVerification && !isGettingGPS &&
      <p className="text-xs text-primary">
              ✓ Yêu cầu xác minh khuôn mặt trước khi điểm danh
            </p>
      }
          
          {!isGettingGPS && <p className="text-xs text-muted-foreground">
            Tuần: 1-{classItem.weeks_count}, Phút: 1-120
          </p>}
        </div> :

    <Button
      size="sm"
      variant="outline"
      className="w-full h-8 md:h-9 text-xs md:text-sm"
      onClick={onSetTimerTarget}>
      
          <Clock className="w-3 h-3 md:w-4 md:h-4 mr-1 md:mr-2" />
          Điểm danh
        </Button>
    }
    </div>
  </div>
);
});

ClassCard.displayName = "ClassCard";

const Admin = () => {
  const uploadAttendancePhoto = async (file: File) => {
    const fileName = `${Date.now()}-${file.name}`;

    const { error } = await supabase.storage.
    from("attendance-photos").
    upload(fileName, file);

    if (error) {
      console.log("Upload lỗi:", error.message);
      toast.error("Upload ảnh thất bại");
      return null;
    }

    const { data } = supabase.storage.
    from("attendance-photos").
    getPublicUrl(fileName);

    return data.publicUrl;
  };
  const navigate = useNavigate();
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [newClassName, setNewClassName] = useState("");
  const [newWeeksCount, setNewWeeksCount] = useState("15");
  const [isCreating, setIsCreating] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedClass, setSelectedClass] = useState<ClassItem | null>(null);
  const [copyCodeClass, setCopyCodeClass] = useState<ClassItem | null>(null);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [showCreateTeacher, setShowCreateTeacher] = useState(false);
  const [showProtectionSettings, setShowProtectionSettings] = useState(false);
  const [showReports, setShowReports] = useState(false);
  const [showResetPasswords, setShowResetPasswords] = useState(false);
  const [showAccountRequests, setShowAccountRequests] = useState(false);
  const [showSecurityManagement, setShowSecurityManagement] = useState(false);
  const [showProtectionResetRequests, setShowProtectionResetRequests] = useState(false);
  const [showBonusPoints, setShowBonusPoints] = useState(false);
  const [showLeaveManagement, setShowLeaveManagement] = useState(false);
  const [showCreateGuide, setShowCreateGuide] = useState(false);
  const [showGuidesList, setShowGuidesList] = useState(false);
  const [showManageAds, setShowManageAds] = useState(false);
  const [showImageScan, setShowImageScan] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  // Protection password state
  const [isProtectionEnabled, setIsProtectionEnabled] = useState<boolean | null>(null);
  const [isProtectionVerified, setIsProtectionVerified] = useState(false);

  // Attendance timer state
  const [timerClassId, setTimerClassId] = useState<string | null>(null);
  const [timerMinutes, setTimerMinutes] = useState("");
  const [timerWeek, setTimerWeek] = useState("1");
  const [advancedVerification, setAdvancedVerification] = useState(false);
  const [isGettingGPS, setIsGettingGPS] = useState(false);

  // Timer tick - only updates a counter, not the classes array
  const [timerTick, setTimerTick] = useState(0);

  const { getAccuratePosition } = useGPS();

  useEffect(() => {
    checkAuth();
  }, []);

  useEffect(() => {
    if (isProtectionEnabled === false || isProtectionVerified) {
      fetchClasses();
    }
  }, [isProtectionEnabled, isProtectionVerified]);

  const checkAuth = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      navigate("/");
      toast.error("Vui lòng đăng nhập!");
      return;
    }

    const userEmail = session.user.email?.toLowerCase();
    setIsAdmin(userEmail === "admindiemdanh@gmail.com");

    try {
      const { data, error } = await (supabase.rpc as any)("is_protection_password_enabled");
      if (error) throw error;
      setIsProtectionEnabled(data || false);
    } catch (error) {
      console.error("Check protection error:", error);
      setIsProtectionEnabled(false);
    }
  };

  const fetchClasses = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const { data, error } = await supabase.
      from("classes" as any).
      select("*").
      eq("created_by", session.user.id).
      order("created_at", { ascending: false });

      if (error) throw error;
      setClasses(data as any[] || []);
    } catch (error) {
      console.error("Error fetching classes:", error);
      toast.error("Không thể tải danh sách lớp!");
    } finally {
      setIsLoading(false);
    }
  }, []);

  const generateCode = (): string => {
    return Math.floor(100000 + Math.random() * 900000).toString();
  };

  const handleCreateClass = useCallback(async () => {
    if (!newClassName.trim()) {
      toast.error("Vui lòng nhập tên lớp!");
      return;
    }

    const weeksCount = parseInt(newWeeksCount) || 15;
    if (weeksCount < 1 || weeksCount > 52) {
      toast.error("Số tuần phải từ 1 đến 52!");
      return;
    }

    setIsCreating(true);
    try {
      const code = generateCode();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error("Phiên đăng nhập đã hết hạn!");
        return;
      }
      const { data, error } = await supabase.
      from("classes" as any).
      insert({ name: newClassName.trim(), code, weeks_count: weeksCount, created_by: session.user.id }).
      select().
      single();

      if (error) {
        if (error.code === "23505") {
          return handleCreateClass();
        }
        throw error;
      }

      setClasses((prev) => [data as any, ...prev]);
      setNewClassName("");
      setNewWeeksCount("15");
      toast.success(`Đã tạo lớp với mã: ${code}`);
    } catch (error) {
      console.error("Error creating class:", error);
      toast.error("Không thể tạo lớp!");
    } finally {
      setIsCreating(false);
    }
  }, [newClassName, newWeeksCount]);

  const handleDeleteClass = useCallback(async (classId: string, className: string) => {
    if (!confirm(`Bạn có chắc muốn xóa lớp "${className}"?`)) return;

    try {
      const { error } = await supabase.
      from("classes" as any).
      delete().
      eq("id", classId);

      if (error) throw error;

      setClasses((prev) => prev.filter((c) => c.id !== classId));
      toast.success("Đã xóa lớp!");
    } catch (error) {
      console.error("Error deleting class:", error);
      toast.error("Không thể xóa lớp!");
    }
  }, []);

  const handleStartAttendance = useCallback(async (classId: string) => {
    const minutes = parseInt(timerMinutes);
    if (!minutes || minutes < 1 || minutes > 120) {
      toast.error("Thời gian phải từ 1 đến 120 phút!");
      return;
    }

    const week = parseInt(timerWeek);
    const classItem = classes.find((c) => c.id === classId);
    if (!week || week < 1 || week > (classItem?.weeks_count || 15)) {
      toast.error(`Tuần phải từ 1 đến ${classItem?.weeks_count || 15}!`);
      return;
    }

    setIsGettingGPS(true);
    try {
      toast.info("Đang lấy vị trí GPS...");
      const position = await getAccuratePosition();

      const newCode = generateCode();

      const { error } = await supabase.
      from("classes" as any).
      update({
        attendance_duration_minutes: minutes,
        attendance_started_at: new Date().toISOString(),
        code: newCode,
        admin_latitude: position.latitude,
        admin_longitude: position.longitude,
        current_week: week,
        advanced_verification: advancedVerification
      }).
      eq("id", classId);

      if (error) throw error;

      setClasses((prev) => prev.map((c) =>
      c.id === classId ?
      {
        ...c,
        attendance_duration_minutes: minutes,
        attendance_started_at: new Date().toISOString(),
        code: newCode,
        admin_latitude: position.latitude,
        admin_longitude: position.longitude,
        current_week: week,
        advanced_verification: advancedVerification
      } :
      c
      ));
      setTimerClassId(null);
      setTimerMinutes("");
      setTimerWeek("1");
      setAdvancedVerification(false);
      const advancedText = advancedVerification ? " (Xác minh nâng cao)" : "";
      toast.success(`Đã bật điểm danh tuần ${week} trong ${minutes} phút${advancedText}! Mã mới: ${newCode}`);
    } catch (error) {
      console.error("Error starting attendance:", error);
      const message = error instanceof Error ? error.message : "Không thể bật điểm danh!";
      toast.error(message);
    } finally {
      setIsGettingGPS(false);
    }
  }, [timerMinutes, timerWeek, advancedVerification, classes, getAccuratePosition]);

  const handleStopAttendance = useCallback(async (classId: string) => {
    try {
      const { error } = await supabase.
      from("classes" as any).
      update({
        attendance_duration_minutes: null,
        attendance_started_at: null
      }).
      eq("id", classId);

      if (error) throw error;

      setClasses((prev) => prev.map((c) =>
      c.id === classId ?
      { ...c, attendance_duration_minutes: null, attendance_started_at: null } :
      c
      ));
      toast.success("Đã tắt điểm danh!");
    } catch (error) {
      console.error("Error stopping attendance:", error);
      toast.error("Không thể tắt điểm danh!");
    }
  }, []);

  // Check if any class has active attendance - only tick if needed
  const hasActiveAttendance = useMemo(() => {
    return classes.some((c) => {
      if (!c.attendance_started_at || !c.attendance_duration_minutes) return false;
      const startTime = new Date(c.attendance_started_at).getTime();
      const endTime = startTime + c.attendance_duration_minutes * 60 * 1000;
      return Date.now() < endTime;
    });
  }, [classes]);

  // Only run timer when there's active attendance
  useEffect(() => {
    if (!hasActiveAttendance) return;
    const interval = setInterval(() => {
      setTimerTick((t) => t + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [hasActiveAttendance]);

  const isAttendanceActive = useCallback((classItem: ClassItem) => {
    if (!classItem.attendance_started_at || !classItem.attendance_duration_minutes) return false;
    const startTime = new Date(classItem.attendance_started_at).getTime();
    const endTime = startTime + classItem.attendance_duration_minutes * 60 * 1000;
    return Date.now() < endTime;
  }, []);

  const getRemainingTime = useCallback((classItem: ClassItem) => {
    if (!classItem.attendance_started_at || !classItem.attendance_duration_minutes) return null;
    const startTime = new Date(classItem.attendance_started_at).getTime();
    const endTime = startTime + classItem.attendance_duration_minutes * 60 * 1000;
    const remaining = endTime - Date.now();
    if (remaining <= 0) return null;
    const minutes = Math.floor(remaining / 60000);
    const seconds = Math.floor(remaining % 60000 / 1000);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }, []);

  const handleLogout = useCallback(async () => {
    await supabase.auth.signOut();
    navigate("/");
    toast.success("Đã đăng xuất!");
  }, [navigate]);

  const handleCopyCode = useCallback((classItem: ClassItem) => {
    setCopyCodeClass(classItem);
  }, []);

  // Pre-compute remaining times to avoid recalculating in render
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const remainingTimes = useMemo(() => {
    const times: Record<string, string | null> = {};
    classes.forEach((c) => {
      times[c.id] = isAttendanceActive(c) ? getRemainingTime(c) : null;
    });
    return times;
    // timerTick forces recalculation
  }, [classes, timerTick, isAttendanceActive, getRemainingTime]);

  // If protection is enabled and not verified, show protection modal
  if (isProtectionEnabled === null) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>);

  }

  if (isProtectionEnabled && !isProtectionVerified) {
    return (
      <ProtectionPasswordModal
        onClose={() => {
          navigate("/");
          toast.info("Đã hủy xác thực");
        }}
        onVerified={() => {
          setIsProtectionVerified(true);
        }} />);


  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header - Mobile Optimized */}
      <header className="w-full px-3 md:px-6 py-3 md:py-4 border-b bg-card">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 md:gap-3 min-w-0">
            <div className="w-8 h-8 md:w-10 md:h-10 rounded-xl bg-primary flex items-center justify-center shrink-0">
              <BookOpen className="w-4 h-4 md:w-6 md:h-6 text-primary-foreground" />
            </div>
            <div className="min-w-0">
              <h1 className="text-base md:text-xl font-bold text-foreground truncate">Quản Trị Điểm Danh</h1>
              <p className="text-xs md:text-sm text-muted-foreground hidden sm:block">Quản lý lớp học</p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              onClick={() => setShowGuidesList(true)}
              className="shrink-0"
              title="Hướng dẫn">
              
              <HelpCircle className="w-5 h-5 text-blue-500" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={() => setShowBonusPoints(true)}
              className="shrink-0"
              title="Điểm thưởng">
              
              <Star className="w-5 h-5 text-amber-500" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={() => setShowLeaveManagement(true)}
              className="shrink-0"
              title="Có phép">
              
              <CalendarOff className="w-5 h-5 text-amber-600" />
            </Button>
            <AdminSettingsMenu
              isAdmin={isAdmin}
              isMobile={true}
              onProtectionPassword={() => setShowProtectionSettings(true)}
              onCreateTeacher={() => setShowCreateTeacher(true)}
              onChangePassword={() => setShowChangePassword(true)}
              onViewReports={() => setShowReports(true)}
              onResetPasswords={() => setShowResetPasswords(true)}
              onProtectionResetRequests={() => setShowProtectionResetRequests(true)}
              onAccountRequests={() => setShowAccountRequests(true)}
              onSecurityManagement={() => setShowSecurityManagement(true)}
              onCreateGuide={() => setShowCreateGuide(true)}
              onManageAds={() => setShowManageAds(true)}
              onImageScan={() => setShowImageScan(true)}
              onLogout={handleLogout} />
            
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container max-w-6xl mx-auto px-3 md:px-4 py-4 md:py-8">
        {/* Welcome Notification */}
        <WelcomeNotification onOpenGuides={() => setShowGuidesList(true)} />

        {/* Create Class Section */}
        <div className="card-elevated p-4 md:p-6 mb-4 md:mb-8">
          <h2 className="text-base md:text-lg font-semibold mb-3 md:mb-4 flex items-center gap-2">
            <Plus className="w-4 h-4 md:w-5 md:h-5" />
            Tạo lớp mới
          </h2>
          <div className="flex flex-col sm:flex-row gap-2 md:gap-3">
            <Input
              placeholder="Nhập tên lớp"
              value={newClassName}
              onChange={(e) => setNewClassName(e.target.value)}
              className="flex-1 input-modern text-sm md:text-base"
              onKeyDown={(e) => e.key === "Enter" && handleCreateClass()} />
            
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-muted-foreground shrink-0" />
              <Input
                type="number"
                placeholder="Tuần"
                value={newWeeksCount}
                onChange={(e) => setNewWeeksCount(e.target.value)}
                className="w-16 md:w-20 input-modern text-sm"
                min={1}
                max={52} />
              
              <span className="text-xs md:text-sm text-muted-foreground shrink-0">tuần</span>
              <Button
                onClick={handleCreateClass}
                disabled={isCreating}
                className="btn-primary-gradient px-4 md:px-6 shrink-0">
                
                {isCreating ?
                <Loader2 className="w-4 h-4 animate-spin" /> :

                <>
                    <Plus className="w-4 h-4 mr-1 md:mr-2" />
                    <span>Tạo lớp</span>
                  </>
                }
              </Button>
            </div>
          </div>
        </div>
        
































        

        {/* Classes List */}
        <div className="space-y-3 md:space-y-4">
          <h2 className="text-base md:text-lg font-semibold flex items-center gap-2">
            <Users className="w-4 h-4 md:w-5 md:h-5" />
            Danh sách lớp ({classes.length})
          </h2>

          {isLoading ?
          <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div> :
          classes.length === 0 ?
          <div className="card-elevated p-8 md:p-12 text-center">
              <BookOpen className="w-12 h-12 md:w-16 md:h-16 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground text-sm md:text-base">Chưa có lớp nào. Hãy tạo lớp mới!</p>
            </div> :

          <div className="grid gap-3 md:gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
              {classes.map((classItem) =>
            <ClassCard
              key={classItem.id}
              classItem={classItem}
              remainingTime={remainingTimes[classItem.id]}
              isActive={isAttendanceActive(classItem)}
              isTimerTarget={timerClassId === classItem.id}
              timerWeek={timerWeek}
              timerMinutes={timerMinutes}
              advancedVerification={advancedVerification}
              isGettingGPS={isGettingGPS}
              onSelect={() => setSelectedClass(classItem)}
              onCopyCode={() => handleCopyCode(classItem)}
              onDelete={() => handleDeleteClass(classItem.id, classItem.name)}
              onStartAttendance={() => handleStartAttendance(classItem.id)}
              onStopAttendance={() => handleStopAttendance(classItem.id)}
              onSetTimerTarget={() => setTimerClassId(classItem.id)}
              onCancelTimer={() => {setTimerClassId(null);setAdvancedVerification(false);}}
              onTimerWeekChange={setTimerWeek}
              onTimerMinutesChange={setTimerMinutes}
              onAdvancedChange={setAdvancedVerification} />

            )}
            </div>
          }
        </div>
      </main>

      {/* Modals - Lazy Loaded */}
      <Suspense fallback={<ModalFallback />}>
        {selectedClass &&
        <ClassDetailModal
          classInfo={selectedClass}
          onClose={() => {
            setSelectedClass(null);
            fetchClasses();
          }} />

        }

        {copyCodeClass &&
        <CopyCodeModal
          code={copyCodeClass.code}
          className={copyCodeClass.name}
          onClose={() => setCopyCodeClass(null)} />

        }

        {showChangePassword &&
        <ChangePasswordModal onClose={() => setShowChangePassword(false)} />
        }

        {showCreateTeacher &&
        <CreateTeacherModal onClose={() => setShowCreateTeacher(false)} />
        }

        {showProtectionSettings &&
        <SetProtectionPasswordModal onClose={() => setShowProtectionSettings(false)} />
        }

        {showReports &&
        <AdminReportsModal onClose={() => setShowReports(false)} />
        }

        {showResetPasswords &&
        <PasswordResetRequestsModal onClose={() => setShowResetPasswords(false)} />
        }

        {showAccountRequests &&
        <AccountRequestsModal onClose={() => setShowAccountRequests(false)} />
        }

        {showSecurityManagement &&
        <SecurityManagementModal onClose={() => setShowSecurityManagement(false)} />
        }

        {showProtectionResetRequests &&
        <ProtectionResetRequestsModal onClose={() => setShowProtectionResetRequests(false)} />
        }
      </Suspense>

      {showBonusPoints &&
      <ClassBonusPointsModal onClose={() => setShowBonusPoints(false)} />
      }

      {showLeaveManagement &&
      <LeaveManagementModal onClose={() => setShowLeaveManagement(false)} />
      }

      {showCreateGuide &&
      <CreateGuideModal onClose={() => setShowCreateGuide(false)} />
      }

      {showGuidesList &&
      <GuidesListModal onClose={() => setShowGuidesList(false)} isAdmin={isAdmin} />
      }

      {showManageAds && isAdmin &&
      <AdvertisementManagementModal onClose={() => setShowManageAds(false)} />
      }

      {showImageScan && isAdmin &&
      <ImageScanResultsModal onClose={() => setShowImageScan(false)} />
      }
    </div>);

};

export default Admin;