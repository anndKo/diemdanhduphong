import { useState, useRef, useCallback, useEffect, memo, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { X, Camera, User, Hash, Users, Loader2, RefreshCw, Calendar, Star, Shield, CheckCircle, Plus } from "lucide-react";

import { z } from "zod";
import { normalizeName, compareNames, compareStrings } from "@/lib/nameUtils";
import LivenessVerification from "./LivenessVerification";
import AttendanceSuccessAd from "./AttendanceSuccessAd";

const attendanceSchema = z.object({
  name: z.string().min(2, "Tên phải có ít nhất 2 ký tự").max(100, "Tên quá dài"),
  studentCode: z.string().min(1, "Vui lòng nhập mã sinh viên").max(20, "Mã sinh viên quá dài").regex(/^\d+$/, "Mã sinh viên chỉ được nhập số"),
  groupNumber: z.string().min(1, "Vui lòng nhập số nhóm").max(10, "Số nhóm quá dài").regex(/^\d+$/, "Số nhóm chỉ được nhập số"),
});

interface AttendanceFormProps {
  classInfo: { 
    id: string; 
    name: string; 
    weeks_count: number;
    current_week?: number | null;
    advanced_verification?: boolean | null;
  };
  onClose: () => void;
  onSuccess: () => void;
}

interface Student {
  id: string;
  name: string;
  student_code: string;
  group_number: string;
}

// Memoized input component for better performance
const MemoInput = memo(({ 
  value, 
  onChange, 
  placeholder, 
  className, 
  type = "text",
  min,
  max,
  disabled,
  readOnly,
}: { 
  value: string; 
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder: string;
  className?: string;
  type?: string;
  min?: number;
  max?: number;
  disabled?: boolean;
  readOnly?: boolean;
}) => (
  <Input
    type={type}
    placeholder={placeholder}
    value={value}
    onChange={onChange}
    className={className}
    min={min}
    max={max}
    disabled={disabled}
    readOnly={readOnly}
  />
));

const AttendanceForm = ({ classInfo, onClose, onSuccess }: AttendanceFormProps) => {
  const [name, setName] = useState("");
  const [studentCode, setStudentCode] = useState("");
  const [groupNumber, setGroupNumber] = useState("");
  const [weekNumber, setWeekNumber] = useState(classInfo.current_week?.toString() || "1");
  const [photoData, setPhotoData] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [isCameraLoading, setIsCameraLoading] = useState(false);
  const [showSuccessAd, setShowSuccessAd] = useState(false);
  const [submittedName, setSubmittedName] = useState("");
  
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [students, setStudents] = useState<Student[]>([]);
  const [isLoadingStudents, setIsLoadingStudents] = useState(true);
  const [studentNotFoundError, setStudentNotFoundError] = useState<string | null>(null);
  
  // Bonus points code - support multiple codes
  const [bonusCodes, setBonusCodes] = useState<string[]>([]);
  const [bonusCodeInput, setBonusCodeInput] = useState("");
  const [isBonusEnabled, setIsBonusEnabled] = useState(false);
  const [bonusCodeError, setBonusCodeError] = useState<string | null>(null);
  
  // Prevent double submit
  const isSubmittingRef = useRef(false);
  
  // Advanced verification
  const [showLivenessVerification, setShowLivenessVerification] = useState(false);
  const [isLivenessVerified, setIsLivenessVerified] = useState(false);
  const requiresVerification = classInfo.advanced_verification === true;
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Use admin-set week as default (cannot be changed by student)
  const defaultWeek = classInfo.current_week || 1;

  useEffect(() => {
    fetchStudents();
    checkBonusEnabled();
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, [classInfo.id]);

  const checkBonusEnabled = async () => {
    try {
      // Check if any bonus codes exist for this class
      const { data, error } = await supabase
        .from("class_bonus_points" as any)
        .select("id")
        .eq("class_id", classInfo.id)
        .eq("status", "unused")
        .limit(1);
      if (error) throw error;
      setIsBonusEnabled((data as any[])?.length > 0);
    } catch { setIsBonusEnabled(false); }
  };

  const fetchStudents = async () => {
    try {
      const { data, error } = await supabase
        .from("students" as any)
        .select("*")
        .eq("class_id", classInfo.id);
      
      if (error) throw error;
      setStudents((data as any[]) || []);
    } catch (error) {
      
    } finally {
      setIsLoadingStudents(false);
    }
  };

  const startCamera = useCallback(async () => {
    setIsCameraLoading(true);
  
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
  
    try {
      const isMobileDevice = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
      const isIOSDevice = /iPad|iPhone|iPod/.test(navigator.userAgent);
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "user",
          width: { ideal: isMobileDevice ? 480 : 640 },
          height: { ideal: isMobileDevice ? 360 : 480 },
          ...(isIOSDevice ? { frameRate: { ideal: 24, max: 30 } } : {}),
        },
        audio: false,
      });
  
      streamRef.current = stream;
  
      if (!videoRef.current) {
        setIsCameraLoading(false);
        return;
      }
  
      const video = videoRef.current;
      video.srcObject = stream;
      video.muted = true;
      video.playsInline = true;
  
      video.onloadedmetadata = async () => {
        try {
          await video.play(); // 🔥 PHẢI await
          setIsCameraActive(true);
        } catch (e) {
          toast.error("Trình duyệt chặn camera. Vui lòng bấm lại.");
        } finally {
          setIsCameraLoading(false);
        }
      };
    } catch (err) {
      toast.error("Không thể mở camera. Vui lòng kiểm tra quyền.");
      setIsCameraLoading(false);
    }
  }, []);

  

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsCameraActive(false);
  }, []);


  const capturePhoto = useCallback(() => {
    if (!videoRef.current || !videoRef.current.videoWidth) {
      toast.error("Camera chưa sẵn sàng, vui lòng thử lại!");
      return;
    }

    const canvas = document.createElement("canvas");
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    const ctx = canvas.getContext("2d");
    
    if (ctx) {
      // Mirror image if using front camera
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);

      ctx.drawImage(videoRef.current, 0, 0);
      // Lower quality on mobile for faster processing
      const isMobileDevice = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
      const dataUrl = canvas.toDataURL("image/jpeg", isMobileDevice ? 0.75 : 0.85);
      setPhotoData(dataUrl);
      stopCamera();
      toast.success("Đã chụp ảnh!");
      // Auto-open liveness verification if required
      if (requiresVerification) {
        setTimeout(() => setShowLivenessVerification(true), 100);
      }
    }
  }, [stopCamera, requiresVerification]);

  const retakePhoto = useCallback(() => {
    setPhotoData(null);
    startCamera();
  }, [startCamera]);

  const validateStudentInList = (): { valid: boolean; error?: string } => {
    // If no students in the class list, allow anyone to attend
    if (students.length === 0) {
      return { valid: true };
    }

    // Normalize input values
    const normalizedInputName = normalizeName(name);
    const normalizedStudentCode = studentCode.trim();
    const normalizedGroupNumber = groupNumber.trim();

    // Validation: All fields must be filled
    if (!normalizedInputName || !normalizedStudentCode || !normalizedGroupNumber) {
      return { valid: false, error: "Vui lòng điền đầy đủ thông tin" };
    }

    // Step 1: Check student code exists
    const byCode = students.find((s) => compareStrings(s.student_code, normalizedStudentCode));
    if (!byCode) {
      return { valid: false, error: `Mã sinh viên "${normalizedStudentCode}" không có trong danh sách lớp. Vui lòng kiểm tra lại!` };
    }

    // Step 2: Check name matches for that student code
    if (!compareNames(byCode.name, normalizedInputName)) {
      return { valid: false, error: `Họ tên không khớp với mã sinh viên ${normalizedStudentCode}. Tên đúng phải trùng với danh sách lớp. Vui lòng kiểm tra lại!` };
    }

    // Step 3: Check group matches
    if (!compareStrings(byCode.group_number, normalizedGroupNumber)) {
      return { valid: false, error: `Số nhóm không khớp. Mã SV ${normalizedStudentCode} thuộc nhóm ${byCode.group_number}, bạn nhập nhóm ${normalizedGroupNumber}. Vui lòng kiểm tra lại!` };
    }

    return { valid: true };
  };

  // Debounced real-time validation when any field changes
  useEffect(() => {
    if (students.length === 0) {
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

    // Debounce validation by 300ms to avoid running on every keystroke
    const timer = setTimeout(() => {
      if (normalizedStudentCode) {
        const byCode = students.find((s) => compareStrings(s.student_code, normalizedStudentCode));
        if (!byCode) {
          setStudentNotFoundError(`Mã sinh viên "${normalizedStudentCode}" không có trong danh sách lớp.`);
          return;
        }
        if (normalizedInputName && !compareNames(byCode.name, normalizedInputName)) {
          setStudentNotFoundError(`Họ tên không khớp với mã sinh viên ${normalizedStudentCode}. Vui lòng kiểm tra lại!`);
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
          setStudentNotFoundError("Họ tên không có trong danh sách lớp. Vui lòng kiểm tra lại!");
          return;
        }
      }
      setStudentNotFoundError(null);
    }, 300);

    return () => clearTimeout(timer);
  }, [name, studentCode, groupNumber, students]);

  const handleSubmit = async (e: React.FormEvent) => {
    
    e.preventDefault();
    setErrors({});
    setStudentNotFoundError(null);

    // Normalize name before validation
    const normalizedName = normalizeName(name);

    // Validate
    const result = attendanceSchema.safeParse({ name: normalizedName, studentCode, groupNumber });
    if (!result.success) {
      const fieldErrors: Record<string, string> = {};
      result.error.errors.forEach((err) => {
        fieldErrors[err.path[0] as string] = err.message;
      });
      setErrors(fieldErrors);
      return;
    }

    // Validate student is in the list - ALWAYS re-check before saving
    const validationResult = validateStudentInList();
    if (!validationResult.valid) {
      const errorMsg = validationResult.error || "Thông tin không khớp với danh sách lớp. Vui lòng kiểm tra lại tên, mã sinh viên và số nhóm.";
      setStudentNotFoundError(errorMsg);
      toast.error(errorMsg);
      return;
    }

    // Double-check: if students list exists, require exact match
    if (students.length > 0) {
      const exactMatch = students.find((s) => 
        compareNames(s.name, normalizedName) && 
        compareStrings(s.student_code, studentCode.trim()) && 
        compareStrings(s.group_number, groupNumber.trim())
      );
      if (!exactMatch) {
        const errorMsg = "Tên, mã sinh viên hoặc nhóm không khớp với danh sách lớp. Vui lòng kiểm tra lại!";
        setStudentNotFoundError(errorMsg);
        toast.error(errorMsg);
        return;
      }
    }

    // Validate week number
    const week = defaultWeek;
    if (!week || week < 1 || week > classInfo.weeks_count) {
      toast.error(`Tuần phải từ 1 đến ${classInfo.weeks_count}!`);
      return;
    }

    if (!photoData) {
      toast.error("Vui lòng chụp ảnh điểm danh!");
      return;
    }

    // Validate all bonus codes in parallel if enabled
    
    const validBonusCodes: string[] = [];
    if (bonusCodes.length > 0) {
      const codeChecks = await Promise.all(
        bonusCodes.map(code =>
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
      
      const invalid = codeChecks.find(c => !c.valid);
      if (invalid) {
        if (invalid.reason === "used" && invalid.data) {
          const d = invalid.data;
          setBonusCodeError(`Mã "${invalid.code}" đã được sử dụng bởi: ${d.used_by_student_name} (MSV: ${d.used_by_student_id}, Nhóm ${d.used_by_group})`);
        } else {
          setBonusCodeError(`Mã điểm thưởng "${invalid.code}" không hợp lệ!`);
        }
        toast.error(`Mã điểm thưởng "${invalid.code}" không hợp lệ hoặc đã sử dụng!`);
        return;
      }
      validBonusCodes.push(...codeChecks.map(c => c.code));
    }
    const bonusPointsValue = validBonusCodes.length;

    // Prevent double submit
    if (isSubmittingRef.current) return;
    isSubmittingRef.current = true;
    setIsLoading(true);

    try {
      // Compress photo for faster upload on slow networks
      const blob = await fetch(photoData).then(r => r.blob());
      const compressedBlob = new Blob([blob], { type: "image/jpeg" });
      const fileName = `${classInfo.id}/${Date.now()}_${studentCode}.jpg`;
      
      // Upload photo and save record in parallel where possible
      let photoUrl = "";
      
      // Upload with retry
      for (let attempt = 0; attempt < 3; attempt++) {
        const { error } = await supabase.storage
          .from("attendance-photos")
          .upload(fileName, compressedBlob, { contentType: "image/jpeg", cacheControl: "3600" });
        if (!error) break;
        if (attempt === 2) throw error;
        await new Promise(r => setTimeout(r, 500));
      }

      const { data: { publicUrl } } = supabase.storage
        .from("attendance-photos")
        .getPublicUrl(fileName);
      photoUrl = publicUrl;

      // Save attendance record
      for (let attempt = 0; attempt < 3; attempt++) {
        const { error } = await supabase
          .from("attendance_records" as any)
          .insert({
            class_id: classInfo.id,
            name: normalizedName,
            student_code: studentCode,
            group_number: groupNumber,
            photo_url: photoUrl,
            week_number: week,
            bonus_points: bonusPointsValue,
          });
        if (!error) break;
        if (attempt === 2) throw error;
        await new Promise(r => setTimeout(r, 500));
      }

      // Mark valid bonus codes as used in new class_bonus_points table
      


     if (validBonusCodes.length > 0) {
       

      const { data, error } = await (supabase as any)
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
    
      
    

    
      if (!data || data.length === 0) {
        toast.error("Mã không hợp lệ hoặc đã được sử dụng");
      }
    
      if (data && data.length > 0) {
        toast.success(`Áp dụng ${data.length} mã thưởng thành công ⭐`);
      }
    }

      // Show success + ad overlay — do NOT call onSuccess() yet (keeps form alive for overlay)
      setSubmittedName(normalizeName(name));
      setShowSuccessAd(true);
      // onSuccess is intentionally NOT called here; overlay is permanent (reload to close)
    } catch (error) {
      
      toast.error("Có lỗi xảy ra khi lưu điểm danh! Vui lòng thử lại.");
    } finally {
      setIsLoading(false);
      isSubmittingRef.current = false;
    }
  };

  const handleClose = () => {
    stopCamera();
    onClose();
  };

  return (
    <div className="modal-overlay animate-fade-in" onClick={handleClose}>
      <div className="min-h-screen flex items-center justify-center p-4">
        <div
          className="modal-content w-full max-w-lg p-6 md:p-8 animate-scale-in max-h-[90vh] overflow-y-auto"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-xl font-bold text-foreground">Điểm Danh</h2>
              <p className="text-sm text-muted-foreground">Lớp: {classInfo.name}</p>
            </div>
            <button
              onClick={handleClose}
              className="w-8 h-8 rounded-full bg-muted flex items-center justify-center hover:bg-muted/80 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {isLoadingStudents ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Camera Section */}
              <div className="space-y-3">
                <Label className="text-sm font-medium flex items-center gap-2">
                  <Camera className="w-4 h-4" />
                  Ảnh điểm danh
                </Label>
                
                <div className="relative aspect-[4/3] bg-muted rounded-xl overflow-hidden">
                  {/* VIDEO LUÔN RENDER */}
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className={`w-full h-full object-cover will-change-transform ${
                      isCameraActive ? "block" : "hidden"
                    }`}
                    style={{ transform: "scaleX(-1)" }}
                  />
                
                  {/* ẢNH SAU KHI CHỤP */}
                  {photoData && (
                    <img
                      src={photoData}
                      alt="Captured"
                      className="absolute inset-0 w-full h-full object-cover"
                    />
                  )}
                
                  {/* TRẠNG THÁI CHƯA MỞ CAMERA */}
                  {!isCameraActive && !photoData && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground">
                      <Camera className="w-12 h-12 mb-2" />
                      <p>Chưa có ảnh</p>
                    </div>
                  )}
                
                  {/* LOADING */}
                  {isCameraLoading && (
                    <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                      <Loader2 className="w-8 h-8 animate-spin text-white" />
                    </div>
                  )}
                </div>


                <div className="flex gap-2">
                  {photoData ? (
                    <>
                      {/* Hide retake button after verification is done */}
                      {!(requiresVerification && isLivenessVerified) && (
                        <Button
                          type="button"
                          variant="outline"
                          onClick={retakePhoto}
                          className="flex-1"
                        >
                          <RefreshCw className="w-4 h-4 mr-2" />
                          Chụp lại
                        </Button>
                      )}
                      {requiresVerification && !isLivenessVerified && (
                        <Button
                          type="button"
                          onClick={() => setShowLivenessVerification(true)}
                          className="flex-1 btn-primary-gradient"
                        >
                          <Shield className="w-4 h-4 mr-2" />
                          Xác minh
                        </Button>
                      )}
                    </>
                  ) : isCameraActive ? (
                    <>
                      
                      <Button
                        type="button"
                        onClick={capturePhoto}
                        className="flex-1 btn-primary-gradient"
                        disabled={isCameraLoading}
                      >
                        <Camera className="w-4 h-4 mr-2" />
                        Chụp ảnh
                      </Button>
                    </>
                  ) : (
                    <Button
                      type="button"
                      onClick={() => startCamera()}
                      className="flex-1"
                      variant="outline"
                      disabled={isCameraLoading}
                    >
                      {isCameraLoading ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <Camera className="w-4 h-4 mr-2" />
                      )}
                      Mở camera
                    </Button>
                  )}
                </div>

                {/* Advanced Verification Status */}
                {requiresVerification && (
                  <div className={`p-3 rounded-xl flex items-center gap-2 ${
                    isLivenessVerified 
                      ? "bg-green-500/10 text-green-600" 
                      : "bg-amber-500/10 text-amber-600"
                  }`}>
                    {isLivenessVerified ? (
                      <>
                        <CheckCircle className="w-5 h-5" />
                        <span className="text-sm font-medium">Đã xác minh danh tính</span>
                      </>
                    ) : (
                      <>
                        <Shield className="w-5 h-5" />
                        <span className="text-sm">Chụp ảnh và bấm "Xác minh" để tiếp tục</span>
                      </>
                    )}
                  </div>
                )}
              </div>

              {/* Name Input */}
              <div className="space-y-2">
                <Label className="text-sm font-medium flex items-center gap-2">
                  <User className="w-4 h-4" />
                  Họ và tên
                </Label>
                <Input
                  placeholder="Nguyễn Văn A"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="input-modern"
                  disabled={requiresVerification && !isLivenessVerified}
                />
                {errors.name && <p className="text-sm text-destructive">{errors.name}</p>}
              </div>

              {/* Student Code Input */}
              <div className="space-y-2">
                <Label className="text-sm font-medium flex items-center gap-2">
                  <Hash className="w-4 h-4" />
                  Mã sinh viên
                </Label>
                <Input
                  placeholder="VD: 123456"
                  value={studentCode}
                  onChange={(e) => setStudentCode(e.target.value.replace(/\D/g, ""))}
                  className="input-modern"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  disabled={requiresVerification && !isLivenessVerified}
                />
                {errors.studentCode && <p className="text-sm text-destructive">{errors.studentCode}</p>}
              </div>

              {/* Group Number Input */}
              <div className="space-y-2">
                <Label className="text-sm font-medium flex items-center gap-2">
                  <Users className="w-4 h-4" />
                  Số nhóm
                </Label>
                <Input
                  placeholder="VD: 1"
                  value={groupNumber}
                  onChange={(e) => setGroupNumber(e.target.value.replace(/\D/g, ""))}
                  className="input-modern"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  disabled={requiresVerification && !isLivenessVerified}
                />
                {errors.groupNumber && <p className="text-sm text-destructive">{errors.groupNumber}</p>}
              </div>

              {/* Week Number Display (Read-only) */}
              <div className="space-y-2">
                <Label className="text-sm font-medium flex items-center gap-2">
                  <Calendar className="w-4 h-4" />
                  Tuần thứ
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

              {/* Bonus Code Input - always visible */}
              <div className="space-y-3 p-4 bg-amber-500/5 border border-amber-500/20 rounded-xl">
                <Label className="text-sm font-medium flex items-center gap-2">
                  <Star className="w-4 h-4 text-amber-500" />
                  Mã điểm thưởng (không bắt buộc)
                </Label>
                
                {/* Added bonus codes list */}
                {bonusCodes.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {bonusCodes.map((code, idx) => (
                      <span key={idx} className="inline-flex items-center gap-1 px-3 py-1 bg-amber-500/20 text-amber-700 rounded-full text-sm font-mono">
                        {code} (+1)
                        <button
                          type="button"
                          onClick={() => {
                            setBonusCodes(prev => prev.filter((_, i) => i !== idx));
                            setBonusCodeError(null);
                          }}
                          className="ml-1 hover:text-destructive"
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
                    
                        // ⭐ tự thêm mã khi đủ 6 số
                        if (val.length === 6) {
                    
                          if (bonusCodes.includes(val)) {
                            setBonusCodeError("Mã này đã được thêm rồi!");
                            return;
                          }
                    
                          setBonusCodes(prev => [...prev, val]);
                    
                          // reset ô nhập để nhập mã tiếp
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
                  
                      setBonusCodes(prev => [...prev, code]);
                      setBonusCodeInput("");
                      setBonusCodeError(null);
                    }}
                  >
                    <Plus className="w-4 h-4 mr-1" />
                    Thêm mã
                  </Button>
                </div>
                
                {bonusCodeError && (
                  <p className="text-sm text-destructive">{bonusCodeError}</p>
                )}
                <p className="text-xs text-muted-foreground">
                  Nhập mã 6 chữ số do giảng viên cung cấp, mỗi mã +1 điểm (có thể thêm nhiều mã)
                </p>
                {bonusCodes.length > 0 && (
                  <p className="text-xs font-medium text-amber-600">
                    Tổng điểm thưởng: +{bonusCodes.length}
                  </p>
                )}
              </div>

              {/* Student Not Found Error */}
              {studentNotFoundError && (
                <div className="p-4 bg-destructive/10 border border-destructive/30 rounded-xl">
                  <p className="text-sm text-destructive font-medium text-center">
                    {studentNotFoundError}
                  </p>
                </div>
              )}

              {/* Submit Button */}
              <Button
                type="submit"
                disabled={isLoading || (requiresVerification && !isLivenessVerified) || !!studentNotFoundError || !name.trim() || !studentCode.trim() || !groupNumber.trim() || !photoData}
                className="w-full btn-primary-gradient py-6 text-base"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                    Đang lưu...
                  </>
                ) : requiresVerification && !isLivenessVerified ? (
                  "Vui lòng xác minh danh tính trước"
                ) : studentNotFoundError ? (
                  "Không thể lưu điểm danh"
                ) : !name.trim() || !studentCode.trim() || !groupNumber.trim() ? (
                  "Vui lòng điền đầy đủ thông tin"
                ) : !photoData ? (
                  "Vui lòng chụp ảnh điểm danh"
                ) : (
                  "Lưu điểm danh"
                )}
              </Button>
            </form>
          )}
        </div>
      </div>

      {/* Liveness Verification Modal */}
      {showLivenessVerification && photoData && (
        <LivenessVerification
          referencePhotoUrl={photoData}
          onVerified={() => {
            setIsLivenessVerified(true);
            setShowLivenessVerification(false);
            toast.success("Xác minh danh tính thành công!");
          }}
          onCancel={() => setShowLivenessVerification(false)}
        />
      )}

      {/* Success + Ad overlay — shown after successful submit, cannot be closed */}
      {showSuccessAd && (
        <AttendanceSuccessAd studentName={submittedName} />
      )}
    </div>
  );
};

export default AttendanceForm;
