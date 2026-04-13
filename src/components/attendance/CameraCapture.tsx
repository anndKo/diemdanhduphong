import { memo, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Camera, Loader2, RefreshCw } from "lucide-react";
import { useCamera } from "@/hooks/useCamera";
import { toast } from "sonner";

interface Props {
  onCapture: (photoData: string) => void;
  photoData: string | null;
  onRetake: () => void;
}

const CameraCapture = memo(({ onCapture, photoData, onRetake }: Props) => {
  const { videoRef, isActive, isLoading, start, stop, capture } = useCamera();

  // Auto-start camera on mount if no photo
  useEffect(() => {
    if (!photoData) {
      start().then((ok) => {
        if (!ok) toast.error("Không thể mở camera. Vui lòng kiểm tra quyền.");
      });
    }
    return () => stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCapture = useCallback(() => {
    const data = capture();
    if (data) {
      stop();
      onCapture(data);
      toast.success("Đã chụp ảnh!");
    } else {
      toast.error("Camera chưa sẵn sàng, vui lòng thử lại!");
    }
  }, [capture, stop, onCapture]);

  const handleRetake = useCallback(() => {
    onRetake();
    start().then((ok) => {
      if (!ok) toast.error("Không thể mở camera.");
    });
  }, [onRetake, start]);

  return (
    <div className="space-y-3">
      {/* Camera viewport — fixed aspect ratio to prevent CLS */}
      <div
        className="relative bg-muted rounded-2xl overflow-hidden"
        style={{ aspectRatio: "4/3", contain: "layout style" }}
      >
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className={`w-full h-full object-cover will-change-transform ${
            isActive && !photoData ? "block" : "hidden"
          }`}
          style={{ transform: "scaleX(-1)" }}
        />

        {photoData && (
          <img
            src={photoData}
            alt="Captured"
            className="absolute inset-0 w-full h-full object-cover"
          />
        )}

        {!isActive && !photoData && !isLoading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground">
            <Camera className="w-12 h-12 mb-2" />
            <p className="text-sm">Đang mở camera...</p>
          </div>
        )}

        {isLoading && (
          <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-white" />
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="flex gap-2">
        {photoData ? (
          <Button type="button" variant="outline" onClick={handleRetake} className="flex-1">
            <RefreshCw className="w-4 h-4 mr-2" />
            Chụp lại
          </Button>
        ) : isActive ? (
          <Button
            type="button"
            onClick={handleCapture}
            className="flex-1 btn-primary-gradient"
            disabled={isLoading}
          >
            <Camera className="w-4 h-4 mr-2" />
            Chụp ảnh
          </Button>
        ) : (
          <Button
            type="button"
            onClick={() => start()}
            className="flex-1"
            variant="outline"
            disabled={isLoading}
          >
            {isLoading ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Camera className="w-4 h-4 mr-2" />
            )}
            Mở camera
          </Button>
        )}
      </div>
    </div>
  );
});

CameraCapture.displayName = "CameraCapture";
export default CameraCapture;
