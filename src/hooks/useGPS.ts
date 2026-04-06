import { useState, useCallback, useEffect, useRef } from 'react';

interface GPSResult {
  latitude: number;
  longitude: number;
  accuracy: number;
}

interface UseGPSReturn {
  getAccuratePosition: () => Promise<GPSResult>;
  requestPermission: () => void;
  isLoading: boolean;
  error: string | null;
  permissionStatus: PermissionState | null;
}

// Calculate distance between two GPS coordinates in meters (Haversine formula)
export const calculateDistance = (
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number => {
  const R = 6371e3;
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

const useGPS = (): UseGPSReturn => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [permissionStatus, setPermissionStatus] = useState<PermissionState | null>(null);

  // Cache: best position seen so far
  const cachedPosition = useRef<{ result: GPSResult; ts: number } | null>(null);

  // Watch permission status
  useEffect(() => {
    if (!navigator.permissions) return;
    navigator.permissions.query({ name: 'geolocation' }).then((result) => {
      setPermissionStatus(result.state);
      result.onchange = () => setPermissionStatus(result.state);
    });
  }, []);

  // Request permission eagerly on mount — silent warm-up
  const requestPermission = useCallback(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const result: GPSResult = {
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        };
        cachedPosition.current = { result, ts: Date.now() };
        setPermissionStatus('granted');
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) setPermissionStatus('denied');
        else setPermissionStatus('prompt');
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 5000 }
    );
  }, []);

  /**
   * Lấy vị trí chính xác cao bằng cách dùng watchPosition liên tục.
   * - Không bao giờ reject vì hết giờ (TIMEOUT).
   * - Resolve ngay khi accuracy ≤ 40m.
   * - Nếu sau 10 giây vẫn chưa ≤ 40m, resolve với kết quả tốt nhất hiện có.
   * - Chỉ reject khi PERMISSION_DENIED (người dùng từ chối hoàn toàn).
   */
  const getAccuratePosition = useCallback((): Promise<GPSResult> => {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error('Trình duyệt không hỗ trợ GPS'));
        return;
      }

      setIsLoading(true);
      setError(null);

      // Dùng cache nếu còn tươi (≤ 10s) và đủ chính xác (≤ 40m)
      const cached = cachedPosition.current;
      if (cached && Date.now() - cached.ts < 10000 && cached.result.accuracy <= 40) {
        setIsLoading(false);
        resolve(cached.result);
        return;
      }

      let settled = false;
      let bestResult: GPSResult | null = cached?.result ?? null;
      let bestAccuracy = cached?.result?.accuracy ?? Infinity;
      let watchId: number;

      const done = (result: GPSResult) => {
        if (settled) return;
        settled = true;
        navigator.geolocation.clearWatch(watchId);
        clearTimeout(softDeadline);
        cachedPosition.current = { result, ts: Date.now() };
        setIsLoading(false);
        resolve(result);
      };

      // Soft deadline: 10s — resolve với kết quả tốt nhất, không reject
      const softDeadline = setTimeout(() => {
        if (settled) return;
        if (bestResult) {
          done(bestResult);
        }
        // Nếu chưa có gì (rất hiếm), tiếp tục chờ thêm 10s rồi resolve lần nữa
        // (watchPosition vẫn chạy cho đến khi có kết quả)
      }, 10000);

      // Hard fallback: 30s — resolve với bất kỳ kết quả nào, hoặc từ chối nếu vẫn không có
      const hardDeadline = setTimeout(() => {
        if (settled) return;
        if (bestResult) {
          done(bestResult);
        } else {
          settled = true;
          navigator.geolocation.clearWatch(watchId);
          setIsLoading(false);
          const msg = 'Không thể lấy vị trí GPS. Vui lòng đảm bảo GPS đang bật và thử lại.';
          setError(msg);
          reject(new Error(msg));
        }
      }, 30000);

      watchId = navigator.geolocation.watchPosition(
        (pos) => {
          const result: GPSResult = {
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
          };

          // Cập nhật best nếu tốt hơn
          if (result.accuracy < bestAccuracy) {
            bestAccuracy = result.accuracy;
            bestResult = result;
          }

          // Resolve ngay nếu accuracy đủ tốt
          if (!settled && result.accuracy <= 40) {
            clearTimeout(hardDeadline);
            done(result);
          }
        },
        (err) => {
          // Chỉ PERMISSION_DENIED mới reject hoàn toàn
          if (err.code === err.PERMISSION_DENIED) {
            if (settled) return;
            settled = true;
            clearTimeout(softDeadline);
            clearTimeout(hardDeadline);
            navigator.geolocation.clearWatch(watchId);
            setIsLoading(false);
            const msg = 'Bạn đã từ chối quyền truy cập vị trí. Vui lòng bật GPS và cho phép truy cập.';
            setError(msg);
            reject(new Error(msg));
            return;
          }

          // POSITION_UNAVAILABLE hoặc TIMEOUT → không reject, tiếp tục watchPosition
          // watchPosition tự động thử lại theo trình duyệt
          // Nếu đã có best result từ trước, giữ nguyên và chờ tiếp
          console.warn('GPS temporary error (will retry):', err.code, err.message);
        },
        {
          enableHighAccuracy: true,
          timeout: 15000,   // thời gian mỗi lần thử của watchPosition
          maximumAge: 5000, // dùng cache tối đa 5s
        }
      );
    });
  }, []);

  return { getAccuratePosition, requestPermission, isLoading, error, permissionStatus };
};

export default useGPS;
