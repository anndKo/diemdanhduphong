import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Eye, EyeOff, Mail, Lock, User, Scan, ShieldAlert, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import {
  generateDeviceFingerprint,
  detectBotSignals,
  BehaviorTracker,
  checkRegisterAllowed,
  registerDevice,
  checkLoginAllowed,
  logLoginAttempt,
} from '@/lib/fingerprint';

function formatCountdown(seconds: number): string {
  if (seconds <= 0) return '';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export const AuthForm = () => {
  const [isLogin, setIsLogin] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');

  // Security states - use refs for non-UI data
  const deviceHashRef = useRef('');
  const fpComponentsRef = useRef<Record<string, string>>({});
  const [isBlocked, setIsBlocked] = useState(false);
  const [blockReason, setBlockReason] = useState('');
  const [countdown, setCountdown] = useState(0);
  const [isPermanent, setIsPermanent] = useState(false);
  const [attemptsRemaining, setAttemptsRemaining] = useState<number | null>(null);
  const [securityReady, setSecurityReady] = useState(false);

  const behaviorTracker = useRef(new BehaviorTracker());
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const { signIn, signUp } = useAuth();

  // Generate fingerprint in background - don't block UI
  useEffect(() => {
    let cancelled = false;
    const init = async () => {
      try {
        const { hash, components } = await generateDeviceFingerprint();
        if (cancelled) return;
        deviceHashRef.current = hash;
        fpComponentsRef.current = components;

        // Check block status in background
        try {
          const response = await fetch(
            `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/security-check/check-device-block`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
              },
              body: JSON.stringify({ device_hash: hash }),
            }
          );
          if (cancelled) return;
          const result = await response.json();
          if (result.blocked) {
            setIsBlocked(true);
            setBlockReason(result.reason || 'Thiết bị tạm thời bị khóa');
            setIsPermanent(result.permanent || false);
            if (result.remaining_seconds && !result.permanent) {
              setCountdown(Math.ceil(result.remaining_seconds));
            }
          }
        } catch { /* non-critical */ }
      } catch {
        // Fallback fingerprint
        const fallback = await crypto.subtle.digest(
          'SHA-256',
          new TextEncoder().encode(navigator.userAgent + screen.width + screen.height)
        );
        const hashArray = Array.from(new Uint8Array(fallback));
        deviceHashRef.current = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
      }
      if (!cancelled) setSecurityReady(true);
    };
    init();
    return () => { cancelled = true; };
  }, []);

  // Countdown timer
  useEffect(() => {
    if (countdown > 0) {
      countdownRef.current = setInterval(() => {
        setCountdown(prev => {
          if (prev <= 1) {
            clearInterval(countdownRef.current!);
            setIsBlocked(false);
            setBlockReason('');
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => {
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, [countdown]);

  const handleKeyDown = useCallback(() => {
    behaviorTracker.current.trackKeystroke();
  }, []);

  const handleBlockResponse = useCallback((result: any) => {
    if (!result.allowed && result.blocked) {
      setIsBlocked(true);
      setBlockReason(result.reason || 'Thiết bị tạm thời bị khóa');
      setIsPermanent(result.permanent || false);
      if (result.remaining_seconds && !result.permanent) {
        setCountdown(Math.ceil(result.remaining_seconds));
      }
      return true;
    }
    if (!result.allowed) {
      toast.error(result.reason || 'Thông tin đăng nhập không hợp lệ');
      return true;
    }
    return false;
  }, []);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();

    if (isBlocked) {
      toast.error(blockReason);
      return;
    }

    const hash = deviceHashRef.current;
    if (!hash) {
      toast.error('Đang khởi tạo bảo mật, vui lòng thử lại');
      return;
    }

    setLoading(true);
    behaviorTracker.current.trackRequest();
    const botSignals = detectBotSignals();
    const behaviorData = behaviorTracker.current.getData();

    try {
      if (isLogin) {
        // Run security check and login in parallel for speed
        const [loginCheck] = await Promise.all([
          checkLoginAllowed(hash, email, botSignals, behaviorData),
        ]);

        if (handleBlockResponse(loginCheck)) {
          setLoading(false);
          return;
        }

        if (loginCheck.attempts_remaining !== undefined) {
          setAttemptsRemaining(loginCheck.attempts_remaining);
        }

        const { error } = await signIn(email, password);

        // Fire-and-forget: don't await log
        logLoginAttempt(hash, email, !error, behaviorData).catch(() => {});

        if (error) {
          toast.error('Thông tin đăng nhập không hợp lệ');
          if (attemptsRemaining !== null && attemptsRemaining > 1) {
            setAttemptsRemaining(prev => prev ? prev - 1 : null);
          }
        } else {
          setAttemptsRemaining(null);
          setIsBlocked(false);
          setBlockReason('');
          setCountdown(0);
          setIsPermanent(false);
          toast.success('Đăng nhập thành công!');
        }
      } else {
        if (!fullName.trim()) {
          toast.error('Vui lòng nhập họ tên');
          setLoading(false);
          return;
        }

        const registerCheck = await checkRegisterAllowed(
          hash, botSignals, fpComponentsRef.current
        );

        if (handleBlockResponse(registerCheck)) {
          setLoading(false);
          return;
        }

        const { error } = await signUp(email, password, fullName);

        if (error) {
          toast.error('Không thể tạo tài khoản. Vui lòng thử lại.');
        } else {
          // Fire-and-forget device registration
          import('@/integrations/supabase/client').then(({ supabase }) => {
            supabase.auth.getSession().then(({ data: { session } }) => {
              if (session?.user?.id) {
                registerDevice(hash, session.user.id, fpComponentsRef.current).catch(() => {});
              }
            });
          });
          toast.success('Đăng ký thành công! Vui lòng đăng nhập.');
          setIsLogin(true);
        }
      }
    } catch {
      toast.error('Thông tin đăng nhập không hợp lệ');
    } finally {
      setLoading(false);
    }
  }, [isLogin, email, password, fullName, isBlocked, blockReason, attemptsRemaining, signIn, signUp, handleBlockResponse]);

  // Memoize input handlers
  const onEmailChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => setEmail(e.target.value), []);
  const onPasswordChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => setPassword(e.target.value), []);
  const onFullNameChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => setFullName(e.target.value), []);
  const togglePassword = useCallback(() => setShowPassword(p => !p), []);
  const switchToLogin = useCallback(() => setIsLogin(true), []);
  const switchToRegister = useCallback(() => setIsLogin(false), []);

  // Form is usable immediately - no waiting for security init
  const isSubmitDisabled = loading || isBlocked;

  return (
    <div className="min-h-screen flex items-center justify-center p-4 grid-pattern relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-background via-background to-background" />
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/10 rounded-full blur-3xl" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-accent/10 rounded-full blur-3xl" />
      
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md relative z-10"
      >
        <motion.div 
          className="text-center mb-8"
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.15 }}
        >
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-primary/10 border border-primary/30 mb-4 glow-effect">
            <Scan className="w-10 h-10 text-primary" />
          </div>
          <h1 className="text-3xl font-display font-bold text-gradient">FaceAI</h1>
          <p className="text-muted-foreground mt-2">Nhận diện khuôn mặt thông minh</p>
        </motion.div>

        <motion.div 
          className="glass-card p-8"
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.2 }}
        >
          <AnimatePresence>
            {isBlocked && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="mb-6 p-4 rounded-xl bg-destructive/10 border border-destructive/30"
              >
                <div className="flex items-center gap-2 text-destructive mb-2">
                  <ShieldAlert className="w-5 h-5" />
                  <span className="font-semibold text-sm">Thiết bị bị khóa</span>
                </div>
                <p className="text-sm text-destructive/80">{blockReason}</p>
                {!isPermanent && countdown > 0 && (
                  <div className="flex items-center gap-2 mt-3 text-sm font-mono text-destructive">
                    <Clock className="w-4 h-4" />
                    <span>Thử lại sau: {formatCountdown(countdown)}</span>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          <div className="flex mb-8 p-1 bg-secondary rounded-lg">
            <button
              onClick={switchToLogin}
              className={`flex-1 py-2.5 px-4 rounded-md text-sm font-medium transition-all duration-300 ${
                isLogin 
                  ? 'bg-primary text-primary-foreground shadow-lg' 
                  : 'text-muted-foreground hover:text-foreground'
              }`}
              disabled={isBlocked}
            >
              Đăng nhập
            </button>
            <button
              onClick={switchToRegister}
              className={`flex-1 py-2.5 px-4 rounded-md text-sm font-medium transition-all duration-300 ${
                !isLogin 
                  ? 'bg-primary text-primary-foreground shadow-lg' 
                  : 'text-muted-foreground hover:text-foreground'
              }`}
              disabled={isBlocked}
            >
              Đăng ký
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5" onKeyDown={handleKeyDown}>
            <AnimatePresence mode="wait">
              {!isLogin && (
                <motion.div
                  key="fullName"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.25 }}
                >
                  <Label htmlFor="fullName" className="text-sm font-medium text-foreground/80">
                    Họ và tên
                  </Label>
                  <div className="relative mt-1.5">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                    <Input
                      id="fullName"
                      type="text"
                      value={fullName}
                      onChange={onFullNameChange}
                      placeholder="Nhập họ tên của bạn"
                      className="pl-11 h-12 bg-secondary/50 border-border/50 focus:border-primary input-glow"
                      disabled={isBlocked}
                    />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <div>
              <Label htmlFor="email" className="text-sm font-medium text-foreground/80">
                Email
              </Label>
              <div className="relative mt-1.5">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={onEmailChange}
                  placeholder="email@example.com"
                  className="pl-11 h-12 bg-secondary/50 border-border/50 focus:border-primary input-glow"
                  required
                  disabled={isBlocked}
                />
              </div>
            </div>

            <div>
              <Label htmlFor="password" className="text-sm font-medium text-foreground/80">
                Mật khẩu
              </Label>
              <div className="relative mt-1.5">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={onPasswordChange}
                  placeholder="••••••••"
                  className="pl-11 pr-11 h-12 bg-secondary/50 border-border/50 focus:border-primary input-glow"
                  required
                  minLength={6}
                  disabled={isBlocked}
                />
                <button
                  type="button"
                  onClick={togglePassword}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            <AnimatePresence>
              {isLogin && attemptsRemaining !== null && attemptsRemaining <= 3 && !isBlocked && (
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="text-sm text-destructive flex items-center gap-1.5"
                >
                  <ShieldAlert className="w-4 h-4" />
                  Còn {attemptsRemaining} lần thử
                </motion.p>
              )}
            </AnimatePresence>

            <Button
              type="submit"
              className="w-full h-12 btn-primary font-semibold text-base"
              disabled={isSubmitDisabled}
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
              ) : isLogin ? (
                'Đăng nhập'
              ) : (
                'Đăng ký'
              )}
            </Button>
          </form>
        </motion.div>

        <p className="text-center text-sm text-muted-foreground mt-6">
          🔒 Bảo mật nâng cao bởi Device Fingerprint + AI
        </p>
      </motion.div>
    </div>
  );
};
