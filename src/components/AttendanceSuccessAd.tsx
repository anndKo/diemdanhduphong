import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ExternalLink, Loader2, Megaphone, Sparkles, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Ad {
  id: string;
  title: string;
  content: string;
  image_url: string | null;
  link: string | null;
}

interface AttendanceSuccessAdProps {
  studentName: string;
}

const AttendanceSuccessAd = ({ studentName }: AttendanceSuccessAdProps) => {
  const [phase, setPhase] = useState<"success" | "transitioning" | "ad">("success");
  const [ad, setAd] = useState<Ad | null>(null);
  const [adChecked, setAdChecked] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);

  // Fetch active ad
  useEffect(() => {
    (async () => {
      try {
        const { data } = await (supabase as any)
          .from("advertisements")
          .select("id, title, content, image_url, link")
          .eq("is_active", true)
          .limit(1)
          .maybeSingle();
        setAd(data || null);
      } catch {
        setAd(null);
      } finally {
        setAdChecked(true);
      }
    })();
  }, []);

  // After 1s → transition → ad
  useEffect(() => {
    if (!adChecked || !ad) return;
    const t1 = setTimeout(() => setPhase("transitioning"), 1000);
    const t2 = setTimeout(() => setPhase("ad"), 1500);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [adChecked, ad]);

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center overflow-hidden"
      style={{
        background: "hsl(var(--background) / 0.6)",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* ── Ambient glow circles ── */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div
          className="absolute w-96 h-96 rounded-full"
          style={{
            background: "radial-gradient(circle, hsl(var(--primary) / 0.15) 0%, transparent 70%)",
            top: "-10%", left: "50%", transform: "translateX(-50%)",
            animation: "floatGlow 6s ease-in-out infinite",
          }}
        />
        <div
          className="absolute w-64 h-64 rounded-full"
          style={{
            background: "radial-gradient(circle, hsl(var(--primary) / 0.1) 0%, transparent 70%)",
            bottom: "5%", right: "10%",
            animation: "floatGlow 8s ease-in-out 1s infinite reverse",
          }}
        />
      </div>

      {/* ── SUCCESS CARD ── */}
      <div
        className="absolute inset-0 flex items-center justify-center"
        style={{
          opacity: phase === "success" ? 1 : 0,
          transform: phase === "success" ? "scale(1) translateY(0)" : "scale(0.85) translateY(-40px)",
          transition: "opacity 0.5s cubic-bezier(0.4,0,0.2,1), transform 0.5s cubic-bezier(0.4,0,0.2,1)",
          pointerEvents: phase === "success" ? "auto" : "none",
        }}
      >
        <div
          className="relative bg-card border border-border/40 rounded-3xl w-[88vw] max-w-[360px] flex flex-col items-center gap-6 px-8 py-10 text-center overflow-hidden"
          style={{
            boxShadow:
              "0 0 0 1px hsl(var(--primary) / 0.12), 0 32px 80px -16px hsl(var(--primary) / 0.3), 0 8px 32px -8px hsl(220 20% 10% / 0.25)",
            animation: "successCardIn 0.55s cubic-bezier(0.34,1.56,0.64,1) forwards",
          }}
        >
          {/* Shimmer top bar */}
          <div
            className="absolute top-0 left-0 right-0 h-0.5 rounded-full"
            style={{
              background: "linear-gradient(90deg, transparent, hsl(var(--primary) / 0.6), transparent)",
              animation: "shimmerBar 2s ease-in-out infinite",
            }}
          />

          {/* Icon */}
          <div className="relative">
            <div
              className="w-24 h-24 rounded-full flex items-center justify-center"
              style={{
                background: "radial-gradient(circle at 40% 35%, hsl(142 76% 55% / 0.25), hsl(142 76% 45% / 0.1))",
                boxShadow: "0 0 0 8px hsl(142 76% 50% / 0.08), 0 0 40px hsl(142 76% 50% / 0.15)",
              }}
            >
              <CheckCircle2 className="w-12 h-12" style={{ color: "hsl(142 76% 45%)" }} strokeWidth={1.8} />
            </div>
            {/* Ripple */}
            <div
              className="absolute inset-0 rounded-full"
              style={{
                border: "2px solid hsl(142 76% 50% / 0.3)",
                animation: "ripple 2s ease-out 0.3s infinite",
              }}
            />
            <div
              className="absolute inset-0 rounded-full"
              style={{
                border: "2px solid hsl(142 76% 50% / 0.15)",
                animation: "ripple 2s ease-out 0.7s infinite",
              }}
            />
          </div>

          <div className="space-y-2">
            <h2 className="text-2xl font-bold text-foreground tracking-tight">Điểm danh thành công!</h2>
            <p className="text-muted-foreground text-sm leading-relaxed">
              Chào mừng{" "}
              <span
                className="font-semibold"
                style={{ color: "hsl(var(--primary))" }}
              >
                {studentName}
              </span>
              {" "}đã điểm danh hôm nay 🎉
            </p>
          </div>

          {/* Loading dots — only if ad is coming */}
          {adChecked && ad && (
            <div className="flex items-center gap-1.5">
              {[0, 1, 2, 3].map((i) => (
                <span
                  key={i}
                  className="rounded-full"
                  style={{
                    width: i === 1 || i === 2 ? "6px" : "5px",
                    height: i === 1 || i === 2 ? "6px" : "5px",
                    background: "hsl(var(--primary) / 0.5)",
                    animation: `dotPulse 1.2s ease-in-out ${i * 0.18}s infinite`,
                  }}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── AD CARD ── */}
      {ad && (
        <div
          className="absolute inset-0 flex items-center justify-center px-4"
          style={{
            opacity: phase === "ad" ? 1 : 0,
            transform: phase === "ad" ? "scale(1) translateY(0)" : "scale(0.9) translateY(32px)",
            transition: "opacity 0.6s cubic-bezier(0.34,1.56,0.64,1), transform 0.6s cubic-bezier(0.34,1.56,0.64,1)",
            pointerEvents: phase === "ad" ? "auto" : "none",
          }}
        >
          <div
            className="relative bg-card border border-border/40 rounded-3xl w-full max-w-[380px] overflow-hidden flex flex-col"
            style={{
              boxShadow:
                "0 0 0 1px hsl(var(--primary) / 0.15), 0 48px 96px -24px hsl(var(--primary) / 0.35), 0 16px 48px -12px hsl(220 20% 10% / 0.28)",
            }}
          >
            {/* ── TOP BADGE HEADER ── */}
            <div
              className="relative flex items-center gap-2.5 px-5 py-3.5 overflow-hidden"
              style={{
                background: "linear-gradient(135deg, hsl(var(--primary) / 0.18), hsl(var(--primary) / 0.08))",
                borderBottom: "1px solid hsl(var(--primary) / 0.2)",
              }}
            >
              {/* Shimmer sweep */}
              <div
                className="absolute inset-0 pointer-events-none"
                style={{
                  background: "linear-gradient(90deg, transparent 0%, hsl(var(--primary) / 0.15) 50%, transparent 100%)",
                  animation: "sweepShimmer 3s ease-in-out 1s infinite",
                }}
              />
              <div
                className="relative w-7 h-7 rounded-xl flex items-center justify-center shrink-0"
                style={{
                  background: "linear-gradient(135deg, hsl(var(--primary) / 0.3), hsl(var(--primary) / 0.15))",
                  boxShadow: "0 2px 8px hsl(var(--primary) / 0.2)",
                }}
              >
                <Megaphone className="w-3.5 h-3.5" style={{ color: "hsl(var(--primary))" }} />
              </div>
              <span
                className="relative text-xs font-bold tracking-widest uppercase"
                style={{ color: "hsl(var(--primary))" }}
              >
                Quảng cáo nổi bật
              </span>
              <Sparkles
                className="w-3 h-3 ml-auto shrink-0"
                style={{ color: "hsl(var(--primary) / 0.6)", animation: "sparkSpin 4s linear infinite" }}
              />
            </div>

            {/* ── IMAGE ── */}
            {ad.image_url && (
              <div className="relative w-full overflow-hidden" style={{ aspectRatio: "16/9" }}>
                {/* Skeleton shimmer */}
                {!imageLoaded && !imageError && (
                  <div
                    className="absolute inset-0"
                    style={{
                      background: "linear-gradient(90deg, hsl(var(--muted)) 25%, hsl(var(--muted-foreground) / 0.1) 50%, hsl(var(--muted)) 75%)",
                      backgroundSize: "200% 100%",
                      animation: "skeletonSweep 1.5s ease-in-out infinite",
                    }}
                  >
                    <div className="absolute inset-0 flex items-center justify-center">
                      <Loader2
                        className="w-8 h-8 animate-spin"
                        style={{ color: "hsl(var(--muted-foreground) / 0.35)" }}
                      />
                    </div>
                  </div>
                )}
                <img
                  src={ad.image_url}
                  alt={ad.title}
                  className="w-full h-full object-cover"
                  style={{
                    opacity: imageLoaded ? 1 : 0,
                    transform: imageLoaded ? "scale(1)" : "scale(1.05)",
                    transition: "opacity 0.4s ease-out, transform 0.5s ease-out",
                  }}
                  onLoad={() => setImageLoaded(true)}
                  onError={() => { setImageError(true); setImageLoaded(true); }}
                  loading="eager"
                  decoding="async"
                  fetchPriority="high"
                />
                {/* Image bottom fade overlay */}
                {imageLoaded && (
                  <div
                    className="absolute bottom-0 left-0 right-0 h-12 pointer-events-none"
                    style={{
                      background: "linear-gradient(to bottom, transparent, hsl(var(--card) / 0.8))",
                    }}
                  />
                )}
              </div>
            )}

            {/* ── CONTENT ── */}
            <div className="px-5 pt-4 pb-5 flex flex-col gap-3.5">
              <div>
                <h3
                  className="text-lg font-bold leading-snug text-foreground"
                  style={{ letterSpacing: "-0.01em" }}
                >
                  {ad.title}
                </h3>
                <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed">{ad.content}</p>
              </div>

              {ad.link && (
                <Button
                  className="w-full py-5 text-sm font-semibold rounded-xl gap-2 relative overflow-hidden"
                  style={{
                    background: "linear-gradient(135deg, hsl(var(--primary)), hsl(var(--primary) / 0.8))",
                    boxShadow: "0 4px 20px hsl(var(--primary) / 0.4)",
                    color: "hsl(var(--primary-foreground))",
                  }}
                  onClick={() => window.open(ad.link!, "_blank", "noopener,noreferrer")}
                >
                  <div
                    className="absolute inset-0 pointer-events-none"
                    style={{
                      background: "linear-gradient(90deg, transparent, hsl(255 255 255 / 0.12), transparent)",
                      animation: "sweepShimmer 2.5s ease-in-out infinite",
                    }}
                  />
                  <ExternalLink className="w-4 h-4 relative" />
                  <span className="relative">Xem ngay</span>
                </Button>
              )}

              <p
                className="text-center text-[10px] leading-relaxed"
                style={{ color: "hsl(var(--muted-foreground) / 0.45)" }}
              >
                Tải lại trang để tắt thông báo này
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ── Keyframes ── */}
      <style>{`
        @keyframes successCardIn {
          from { opacity: 0; transform: scale(0.88) translateY(20px); }
          to   { opacity: 1; transform: scale(1) translateY(0); }
        }
        @keyframes ripple {
          0%   { transform: scale(1); opacity: 1; }
          100% { transform: scale(1.8); opacity: 0; }
        }
        @keyframes dotPulse {
          0%, 100% { transform: scale(0.7); opacity: 0.4; }
          50%       { transform: scale(1.2); opacity: 1; }
        }
        @keyframes floatGlow {
          0%, 100% { transform: translateX(-50%) translateY(0); }
          50%       { transform: translateX(-50%) translateY(-20px); }
        }
        @keyframes shimmerBar {
          0%   { background-position: -200% center; }
          100% { background-position: 200% center; }
        }
        @keyframes sweepShimmer {
          0%   { transform: translateX(-100%); }
          100% { transform: translateX(200%); }
        }
        @keyframes skeletonSweep {
          0%   { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
        @keyframes sparkSpin {
          0%   { transform: rotate(0deg) scale(1); opacity: 0.6; }
          50%  { transform: rotate(180deg) scale(1.3); opacity: 1; }
          100% { transform: rotate(360deg) scale(1); opacity: 0.6; }
        }
      `}</style>
    </div>
  );
};

export default AttendanceSuccessAd;
