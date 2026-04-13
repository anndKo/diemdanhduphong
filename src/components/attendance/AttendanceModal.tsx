import { memo, useState, useRef, useCallback, useEffect, useMemo, lazy, Suspense } from "react";
import { X, Camera, Shield, CheckCircle, Loader2, User, Hash, Users, Calendar, Star, Plus, AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { z } from "zod";
import { normalizeName, compareNames, compareStrings } from "@/lib/nameUtils";
import CameraCapture from "./CameraCapture";
import AttendanceSuccessAd from "@/components/AttendanceSuccessAd";

const LivenessVerification = lazy(() => import("@/components/LivenessVerification"));

const attendanceSchema = z.object({
  name: z.string().min(2, "Tên phải có ít nhất 2 ký tự").max(100, "Tên quá dài"),
  studentCode: z.string().min(1, "Vui lòng nhập mã sinh viên").max(20, "Mã sinh viên quá dài").regex(/^\d+$/, "Mã sinh viên chỉ được nhập số"),
  groupNumber: z.string().min(1, "Vui lòng nhập số nhóm").max(10, "Số nhóm quá dài").regex(/^\d+$/, "Số nhóm chỉ được nhập số"),
});

interface ClassInfo {
  id: string;
  name: string;
  weeks_count: number;
  current_week?: number | null;
  advanced_verification?: boolean | null;
}

interface Props {
  classInfo: ClassInfo;
  onClose: () => void;
  onSuccess: () => void;
}

interface Student {
  id: string;
  name: string;
  student_code: string;
  group_number: string;
}

type Step = 1 | 2 | 3;

// Step indicator
const StepIndicator = memo(({ current, requiresVerification }: { current: Step; requiresVerification: boolean }) => {
  const steps = requiresVerification
    ? [
        { num: 1, label: "Chụp ảnh" },
        { num: 2, label: "Xác minh" },
        { num: 3, label: "Thông tin" },
      ]
    : [
        { num: 1, label: "Chụp ảnh" },
        { num: 3, label: "Thông tin" },
      ];

  return (
    <div className="flex items-center justify-center gap-2 mb-4">
      {steps.map((s, i) => {
        const isActive = current === s.num;
        const isDone = current > s.num;
        return (
          <div key={s.num} className="flex items-center gap-2">
            {i > 0 && <div className={`w-8 h-0.5 rounded-full transition-colors duration-300 ${isDone ? "bg-primary" : "bg-border"}`} />}
            <div className="flex items-center gap-1.5">
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-300 ${
                  isActive
                    ? "bg-primary text-primary-foreground scale-110 shadow-md"
                    : isDone
                    ? "bg-primary/20 text-primary"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {isDone ? <CheckCircle className="w-3.5 h-3.5" /> : s.num === 2 ? 2 : s.num === 1 ? 1 : requiresVerification ? 3 : 2}
              </div>
              <span className={`text-xs font-medium transition-colors ${isActive ? "text-foreground" : "text-muted-foreground"}`}>
                {s.label}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
});
StepIndicator.displayName = "StepIndicator";

const AttendanceModal = ({ classInfo, onClose, onSuccess }: Props) => {
  const requiresVerification = classInfo.advanced_verification === true;
  const defaultWeek = classInfo.current_week || 1;

  // Step state
  const [step, setStep] = useState<Step>(1);

  // Photo
  const [photoData, setPhotoData] = useState<string | null>(null);

  // Liveness
  const [isLivenessVerified, setIsLivenessVerified] = useState(false);

  // Form fields
  const [name, setName] = useState("");
  const [studentCode, setStudentCode] = useState("");
  const [groupNumber, setGroupNumber] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [studentNotFoundError, setStudentNotFoundError] = useState<string | null>(null);

  // Bonus
  const [bonusCodes, setBonusCodes] = useState<string[]>([]);
  const [bonusCodeInput, setBonusCodeInput] = useState("");
  const [bonusCodeError, setBonusCodeError] = useState<string | null>(null);

  // Students list
  const [students, setStudents] = useState<Student[]>([]);
  const [isLoadingStudents, setIsLoadingStudents] = useState(true);

  // Submit state
  const [isLoading, setIsLoading] = useState(false);
  const isSubmittingRef = useRef(false);
  const [showSuccessAd, setShowSuccessAd] = useState(false);
  const [submittedName, setSubmittedName] = useState("");

  // Fetch students on mount
  useEffect(() => {
    (async () => {
      try {
        const { data, error } = await supabase
          .from("students" as any)
          .select("*")
          .eq("class_id", classInfo.id);
        if (error) throw error;
        setStudents((data as any[]) || []);
      } catch {
        // silently fail
      } finally {
        setIsLoadingStudents(false);
      }
    })();
  }, [classInfo.id]);

  // Photo captured → advance step
  const handleCapture = useCallback(
    (data: string) => {
      setPhotoData(data);
      if (requiresVerification) {
        setStep(2);
      } else {
        setStep(3);
      }
    },
    [requiresVerification]
  );

  const handleRetakePhoto = useCallback(() => {
    setPhotoData(null);
    setIsLivenessVerified(false);
    setStep(1);
  }, []);

  // Liveness verified → advance to form
  const handleLivenessVerified = useCallback(() => {
    setIsLivenessVerified(true);
    setStep(3);
    toast.success("Xác minh danh tính thành công!");
  }, []);

  const handleLivenessCancel = useCallback(() => {
    // Go back to step 1
    setStep(1);
    setPhotoData(null);
  }, []);

  // Real-time validation (debounced)
  useEffect(() => {
    if (students.length === 0 || step !== 3) {
      setStudentNotFoundError(null);
      return;
    }
    const normalizedInputName = normalizeName(name);
    const normalizedStudentCode = studentCode.trim();
    const normalizedGroupNumber = groupNumber.trim();

    if (!normalizedInputName && !normalizedStudentCode && !normalizedGroupNumber) {
      setStudentNotFoundError(null);
      return;
    }

    const timer = setTimeout(() => {
      if (normalizedStudentCode) {
        const byCode = students.find((s) => compareStrings(s.student_code, normalizedStudentCode));
        if (!byCode) {
          setStudentNotFoundError(`Mã sinh viên "${normalizedStudentCode}" không có trong danh sách lớp.`);
          return;
        }
        if (normalizedInputName && !compareNames(byCode.name, normalizedInputName)) {
          setStudentNotFoundError(`Họ tên không khớp với mã sinh viên ${normalizedStudentCode}.`);
          return;
        }
        if (normalizedGroupNumber && !compareStrings(byCode.group_number, normalizedGroupNumber)) {
          setStudentNotFoundError(`Số nhóm không khớp. Mã SV ${normalizedStudentCode} thuộc nhóm ${byCode.group_number}.`);
          return;
        }
        setStudentNotFoundError(null);
        return;
      }
      if (normalizedInputName) {
        const byName = students.find((s) => compareNames(s.name, normalizedInputName));
        if (!byName) {
          setStudentNotFoundError("Họ tên không có trong danh sách lớp.");
          return;
        }
      }
      setStudentNotFoundError(null);
    }, 300);

    return () => clearTimeout(timer);
  }, [name, studentCode, groupNumber, students, step]);

  // Submit
  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (isSubmittingRef.current) return;

      const normalizedName = normalizeName(name);
      setErrors({});
      setStudentNotFoundError(null);

      // Zod validation
      const result = attendanceSchema.safeParse({ name: normalizedName, studentCode, groupNumber });
      if (!result.success) {
        const fieldErrors: Record<string, string> = {};
        result.error.errors.forEach((err) => {
          fieldErrors[err.path[0] as string] = err.message;
        });
        setErrors(fieldErrors);
        return;
      }

      // Student list validation
      if (students.length > 0) {
        const exactMatch = students.find(
          (s) =>
            compareNames(s.name, normalizedName) &&
            compareStrings(s.student_code, studentCode.trim()) &&
            compareStrings(s.group_number, groupNumber.trim())
        );
        if (!exactMatch) {
          const errorMsg = "Tên, mã sinh viên hoặc nhóm không khớp với danh sách lớp!";
          setStudentNotFoundError(errorMsg);
          toast.error(errorMsg);
          return;
        }
      }

      if (!photoData) {
        toast.error("Vui lòng chụp ảnh điểm danh!");
        setStep(1);
        return;
      }

      // Validate bonus codes
      const validBonusCodes: string[] = [];
      if (bonusCodes.length > 0) {
        const codeChecks = await Promise.all(
          bonusCodes.map((code) =>
            supabase
              .from("class_bonus_points" as any)
              .select("id, bonus_code, status, used_by_student_name, used_by_student_id, used_by_group")
              .eq("class_id", classInfo.id)
              .eq("bonus_code", code)
              .single()
              .then(({ data, error }) => {
                if (error || !data) return { code, valid: false, reason: "not_found" as const, data: null };
                const d = data as any;
                if (d.status === "used") return { code, valid: false, reason: "used" as const, data: d };
                return { code, valid: true, reason: "ok" as const, data: d };
              })
          )
        );

        const invalid = codeChecks.find((c) => !c.valid);
        if (invalid) {
          if (invalid.reason === "used" && invalid.data) {
            const d = invalid.data;
            setBonusCodeError(
              `Mã "${invalid.code}" đã được sử dụng bởi: ${d.used_by_student_name} (MSV: ${d.used_by_student_id}, Nhóm ${d.used_by_group})`
            );
          } else {
            setBonusCodeError(`Mã điểm thưởng "${invalid.code}" không hợp lệ!`);
          }
          return;
        }
        validBonusCodes.push(...codeChecks.map((c) => c.code));
      }

      const bonusPointsValue = validBonusCodes.length;

      // Submit
      isSubmittingRef.current = true;
      setIsLoading(true);

      try {
        // Upload photo
        const blob = await fetch(photoData).then((r) => r.blob());
        const compressedBlob = new Blob([blob], { type: "image/jpeg" });
        const fileName = `${classInfo.id}/${Date.now()}_${studentCode}.jpg`;

        for (let attempt = 0; attempt < 3; attempt++) {
          const { error } = await supabase.storage
            .from("attendance-photos")
            .upload(fileName, compressedBlob, { contentType: "image/jpeg", cacheControl: "3600" });
          if (!error) break;
          if (attempt === 2) throw error;
          await new Promise((r) => setTimeout(r, 500));
        }

        const {
          data: { publicUrl },
        } = supabase.storage.from("attendance-photos").getPublicUrl(fileName);

        // Insert record
        for (let attempt = 0; attempt < 3; attempt++) {
          const { error } = await supabase.from("attendance_records" as any).insert({
            class_id: classInfo.id,
            name: normalizedName,
            student_code: studentCode,
            group_number: groupNumber,
            photo_url: publicUrl,
            week_number: defaultWeek,
            bonus_points: bonusPointsValue,
          });
          if (!error) break;
          if (attempt === 2) throw error;
          await new Promise((r) => setTimeout(r, 500));
        }

        // Mark bonus codes as used
        if (validBonusCodes.length > 0) {
          const { data } = await (supabase as any)
            .from("class_bonus_points")
            .update({
              status: "used",
              used_by_student_name: normalizedName,
              used_by_student_id: studentCode,
              used_by_group: groupNumber,
              used_at: new Date().toISOString(),
            })
            .in("bonus_code", validBonusCodes)
            .eq("class_id", classInfo.id)
            .eq("status", "unused")
            .select();

          if (data && data.length > 0) {
            toast.success(`Áp dụng ${data.length} mã thưởng thành công ⭐`);
          }
        }

        setSubmittedName(normalizedName);
        setShowSuccessAd(true);
      } catch (err: any) {
        console.error("Attendance save error:", err);
        const msg = err?.message || err?.error_description || JSON.stringify(err);
        toast.error(`Lỗi lưu điểm danh: ${msg}`);
      } finally {
        setIsLoading(false);
        isSubmittingRef.current = false;
      }
    },
    [name, studentCode, groupNumber, photoData, students, bonusCodes, classInfo, defaultWeek]
  );

  const canSubmit = useMemo(
    () =>
      !isLoading &&
      !studentNotFoundError &&
      name.trim().length > 0 &&
      studentCode.trim().length > 0 &&
      groupNumber.trim().length > 0 &&
      !!photoData &&
      (!requiresVerification || isLivenessVerified),
    [isLoading, studentNotFoundError, name, studentCode, groupNumber, photoData, requiresVerification, isLivenessVerified]
  );

  // ESC to close
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !showSuccessAd) onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose, showSuccessAd]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{
        backgroundColor: "hsl(var(--foreground) / 0.4)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
      }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="relative w-full max-w-lg mx-4 bg-card border border-border/40 rounded-3xl shadow-2xl overflow-hidden"
        style={{
          maxHeight: "92vh",
          willChange: "transform",
          animation: "modalIn 0.3s cubic-bezier(0.34,1.56,0.64,1) forwards",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="overflow-y-auto" style={{ maxHeight: "92vh" }}>
          {/* Header */}
          <div className="sticky top-0 z-10 bg-card/95 backdrop-blur-sm border-b border-border/30 px-6 pt-5 pb-3">
            <div className="flex items-center justify-between mb-2">
              <div>
                <h2 className="text-lg font-bold text-foreground">Điểm Danh</h2>
                <p className="text-xs text-muted-foreground">Lớp: {classInfo.name}</p>
              </div>
              <button
                onClick={onClose}
                className="w-8 h-8 rounded-full bg-muted flex items-center justify-center hover:bg-muted/80 transition-colors"
                aria-label="Đóng"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <StepIndicator current={step} requiresVerification={requiresVerification} />
          </div>

          <div className="px-6 pb-6 pt-4">
            {isLoadingStudents ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
              </div>
            ) : (
              <>
                {/* ── Step 1: Camera ── */}
                <div
                  style={{
                    display: step === 1 ? "block" : "none",
                    willChange: "transform, opacity",
                  }}
                >
                  <CameraCapture
                    photoData={photoData}
                    onCapture={handleCapture}
                    onRetake={handleRetakePhoto}
                  />

                  {photoData && !requiresVerification && (
                    <div className="mt-4 flex gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={handleRetakePhoto}
                        className="flex-1"
                      >
                        <RefreshCw className="w-4 h-4 mr-2" />
                        Chụp lại
                      </Button>
                      <Button
                        type="button"
                        onClick={() => setStep(3)}
                        className="flex-1 btn-primary-gradient"
                      >
                        Tiếp tục
                        <CheckCircle className="w-4 h-4 ml-2" />
                      </Button>
                    </div>
                  )}
                </div>

                {/* ── Step 2: Liveness Verification (lazy) ── */}
                {step === 2 && requiresVerification && photoData && (
                  <Suspense
                    fallback={
                      <div className="flex items-center justify-center py-12">
                        <Loader2 className="w-8 h-8 animate-spin text-primary" />
                        <span className="ml-3 text-sm text-muted-foreground">Đang tải xác minh...</span>
                      </div>
                    }
                  >
                    <LivenessVerification
                      referencePhotoUrl={photoData}
                      onVerified={handleLivenessVerified}
                      onCancel={handleLivenessCancel}
                    />
                  </Suspense>
                )}

                {/* ── Step 3: Form ── */}
                <div
                  style={{
                    display: step === 3 ? "block" : "none",
                    willChange: "transform, opacity",
                  }}
                >
                  {/* Photo preview thumbnail */}
                  {photoData && (
                    <div className="flex items-center gap-3 mb-4 p-3 bg-muted/50 rounded-xl">
                      <img
                        src={photoData}
                        alt="Ảnh điểm danh"
                        className="w-16 h-12 object-cover rounded-lg"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground">Ảnh đã chụp</p>
                        <div className="flex items-center gap-1.5">
                          {requiresVerification && isLivenessVerified && (
                            <span className="text-xs text-green-600 flex items-center gap-1">
                              <Shield className="w-3 h-3" /> Đã xác minh
                            </span>
                          )}
                        </div>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={handleRetakePhoto}
                        className="text-xs"
                      >
                        <RefreshCw className="w-3 h-3 mr-1" /> Chụp lại
                      </Button>
                    </div>
                  )}

                  <form onSubmit={handleSubmit} className="space-y-4">
                    {/* Name */}
                    <div className="space-y-1.5">
                      <Label className="text-sm font-medium flex items-center gap-2">
                        <User className="w-4 h-4" /> Họ và tên
                      </Label>
                      <Input
                        placeholder="Nguyễn Văn A"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className="input-modern"
                      />
                      {errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
                    </div>

                    {/* Student Code */}
                    <div className="space-y-1.5">
                      <Label className="text-sm font-medium flex items-center gap-2">
                        <Hash className="w-4 h-4" /> Mã sinh viên
                      </Label>
                      <Input
                        placeholder="VD: 123456"
                        value={studentCode}
                        onChange={(e) => setStudentCode(e.target.value.replace(/\D/g, ""))}
                        className="input-modern"
                        inputMode="numeric"
                        pattern="[0-9]*"
                      />
                      {errors.studentCode && <p className="text-xs text-destructive">{errors.studentCode}</p>}
                    </div>

                    {/* Group */}
                    <div className="space-y-1.5">
                      <Label className="text-sm font-medium flex items-center gap-2">
                        <Users className="w-4 h-4" /> Số nhóm
                      </Label>
                      <Input
                        placeholder="VD: 1"
                        value={groupNumber}
                        onChange={(e) => setGroupNumber(e.target.value.replace(/\D/g, ""))}
                        className="input-modern"
                        inputMode="numeric"
                        pattern="[0-9]*"
                      />
                      {errors.groupNumber && <p className="text-xs text-destructive">{errors.groupNumber}</p>}
                    </div>

                    {/* Week (read-only) */}
                    <div className="space-y-1.5">
                      <Label className="text-sm font-medium flex items-center gap-2">
                        <Calendar className="w-4 h-4" /> Tuần thứ
                      </Label>
                      <Input
                        type="number"
                        value={defaultWeek}
                        readOnly
                        disabled
                        className="input-modern bg-muted"
                      />
                      <p className="text-xs text-muted-foreground">Tuần được đặt bởi giảng viên</p>
                    </div>

                    {/* Bonus codes */}
                    <div className="space-y-2 p-3 bg-amber-500/5 border border-amber-500/20 rounded-xl">
                      <Label className="text-sm font-medium flex items-center gap-2">
                        <Star className="w-4 h-4 text-amber-500" />
                        Mã điểm thưởng (không bắt buộc)
                      </Label>

                      {bonusCodes.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {bonusCodes.map((code, idx) => (
                            <span
                              key={idx}
                              className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-amber-500/20 text-amber-700 rounded-full text-xs font-mono"
                            >
                              {code} (+1)
                              <button
                                type="button"
                                onClick={() => {
                                  setBonusCodes((prev) => prev.filter((_, i) => i !== idx));
                                  setBonusCodeError(null);
                                }}
                                className="ml-0.5 hover:text-destructive"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </span>
                          ))}
                        </div>
                      )}

                      <div className="flex gap-2">
                        <Input
                          placeholder="Nhập mã 6 số"
                          value={bonusCodeInput}
                          onChange={(e) => {
                            const val = e.target.value.replace(/\D/g, "").slice(0, 6);
                            setBonusCodeInput(val);
                            setBonusCodeError(null);
                            if (val.length === 6) {
                              if (bonusCodes.includes(val)) {
                                setBonusCodeError("Mã này đã được thêm rồi!");
                                return;
                              }
                              setBonusCodes((prev) => [...prev, val]);
                              setBonusCodeInput("");
                            }
                          }}
                          className="input-modern font-mono text-lg tracking-widest flex-1"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          maxLength={6}
                        />
                        <Button
                          type="button"
                          variant="outline"
                          disabled={bonusCodeInput.length !== 6}
                          onClick={() => {
                            const code = bonusCodeInput.trim();
                            if (bonusCodes.includes(code)) {
                              setBonusCodeError("Mã này đã được thêm rồi!");
                              return;
                            }
                            setBonusCodes((prev) => [...prev, code]);
                            setBonusCodeInput("");
                            setBonusCodeError(null);
                          }}
                        >
                          <Plus className="w-4 h-4 mr-1" /> Thêm
                        </Button>
                      </div>

                      {bonusCodeError && <p className="text-xs text-destructive">{bonusCodeError}</p>}
                      <p className="text-xs text-muted-foreground">
                        Nhập mã 6 chữ số do giảng viên cung cấp, mỗi mã +1 điểm
                      </p>
                      {bonusCodes.length > 0 && (
                        <p className="text-xs font-medium text-amber-600">
                          Tổng điểm thưởng: +{bonusCodes.length}
                        </p>
                      )}
                    </div>

                    {/* Validation error */}
                    {studentNotFoundError && (
                      <div className="p-3 bg-destructive/10 border border-destructive/30 rounded-xl">
                        <p className="text-xs text-destructive font-medium text-center">{studentNotFoundError}</p>
                      </div>
                    )}

                    {/* Submit */}
                    <Button
                      type="submit"
                      disabled={!canSubmit}
                      className="w-full btn-primary-gradient py-5 text-base"
                    >
                      {isLoading ? (
                        <>
                          <Loader2 className="w-5 h-5 mr-2 animate-spin" /> Đang lưu...
                        </>
                      ) : (
                        "Lưu điểm danh"
                      )}
                    </Button>
                  </form>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Success overlay */}
      {showSuccessAd && <AttendanceSuccessAd studentName={submittedName} />}

      <style>{`
        @keyframes modalIn {
          from { opacity: 0; transform: scale(0.92) translateY(12px); }
          to   { opacity: 1; transform: scale(1) translateY(0); }
        }
      `}</style>
    </div>
  );
};

export default AttendanceModal;
