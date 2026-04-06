import { detectFace, compareFaces } from "@/lib/faceapi";
import { supabase } from "@/integrations/supabase/client";

const LS_KEY_NAME = "attendance_studentName";
const LS_KEY_CODE = "attendance_studentCode";

// Thresholds
const FACE_MATCH_THRESHOLD = 0.75; // ≥75% = same person

export interface FaceVerificationResult {
  passed: boolean;
  reason: "same_device" | "first_time" | "face_matched" | "face_mismatch";
  similarity?: number;
}

/** Save current student info to localStorage */
export const saveStudentToLocal = (name: string, code: string) => {
  try {
    localStorage.setItem(LS_KEY_NAME, name);
    localStorage.setItem(LS_KEY_CODE, code);
  } catch {}
};

/** Check if the current student matches localStorage */
export const isSameAsLocal = (name: string, code: string): boolean => {
  try {
    const savedName = localStorage.getItem(LS_KEY_NAME);
    const savedCode = localStorage.getItem(LS_KEY_CODE);
    if (!savedName || !savedCode) return false;
    return savedName.trim().toLowerCase() === name.trim().toLowerCase() &&
           savedCode.trim() === code.trim();
  } catch {
    return false;
  }
};

/** Create an HTMLImageElement from a URL */
const loadImage = (url: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });

/** Extract face embedding from a data-URL or http URL */
export const getEmbedding = async (photoUrl: string): Promise<Float32Array | null> => {
  const img = await loadImage(photoUrl);
  return detectFace(img);
};

/** Fetch up to 2 recent attendance photos for a student in a class */
const fetchRecentPhotos = async (
  classId: string,
  studentCode: string,
): Promise<string[]> => {
  const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  // Try recent photos first (within 1 week)
  const { data: recent } = await supabase
    .from("attendance_records" as any)
    .select("photo_url")
    .eq("class_id", classId)
    .eq("student_code", studentCode)
    .gte("created_at", oneWeekAgo)
    .order("created_at", { ascending: false })
    .limit(2);

  const recentUrls = ((recent as any[]) || [])
    .map((r: any) => r.photo_url)
    .filter(Boolean) as string[];

  if (recentUrls.length >= 1) return recentUrls;

  // Fallback: get latest photo regardless of time
  const { data: fallback } = await supabase
    .from("attendance_records" as any)
    .select("photo_url")
    .eq("class_id", classId)
    .eq("student_code", studentCode)
    .order("created_at", { ascending: false })
    .limit(1);

  return ((fallback as any[]) || [])
    .map((r: any) => r.photo_url)
    .filter(Boolean) as string[];
};

/**
 * Full face verification flow.
 * Returns quickly if same device (localStorage match).
 */
export const verifyFace = async (
  currentPhotoDataUrl: string,
  classId: string,
  studentCode: string,
  studentName: string,
): Promise<FaceVerificationResult> => {
  // Step 1: Same device → skip
  if (isSameAsLocal(studentName, studentCode)) {
    return { passed: true, reason: "same_device" };
  }

  // Step 2: Get current photo embedding
  const currentEmbedding = await getEmbedding(currentPhotoDataUrl);
  if (!currentEmbedding) {
    // Can't detect face in current photo — allow but treat as first time
    return { passed: true, reason: "first_time" };
  }

  // Step 3: Fetch recent photos
  const recentUrls = await fetchRecentPhotos(classId, studentCode);

  // No previous photos → first time
  if (recentUrls.length === 0) {
    return { passed: true, reason: "first_time" };
  }

  // Step 4: Compare with each recent photo, take best match
  let bestSimilarity = 0;

  for (const url of recentUrls) {
    try {
      const storedEmbedding = await getEmbedding(url);
      if (!storedEmbedding) continue;
      const similarity = compareFaces(currentEmbedding, storedEmbedding);
      if (similarity > bestSimilarity) bestSimilarity = similarity;
    } catch {
      // Skip broken images
    }
  }

  // Step 5: If no stored embeddings were extractable, treat as first time
  if (bestSimilarity === 0) {
    return { passed: true, reason: "first_time" };
  }

  // Step 6: Decide
  if (bestSimilarity >= FACE_MATCH_THRESHOLD) {
    return { passed: true, reason: "face_matched", similarity: bestSimilarity };
  }

  return { passed: false, reason: "face_mismatch", similarity: bestSimilarity };
};
