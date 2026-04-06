import * as faceapi from '@vladmandic/face-api';
import { supabase } from '@/integrations/supabase/client';

// ─── Types ───────────────────────────────────────────────────────────
export interface ScanImage {
  id: string;
  student_code: string;
  name: string;
  photo_url: string;
  week_number: number;
  group_number: string;
  class_id: string;
}

export interface ScanResult {
  image_id: string;
  image_path: string;
  student_code: string;
  name: string;
  week: number;
  status: 'valid' | 'no_face' | 'different_person' | 'suspicious' | 'error';
  similarity_score: number;
  processing_time_ms: number;
  error_message?: string;
}

export interface ScanProgress {
  phase: 'loading_models' | 'processing' | 'comparing' | 'saving' | 'done';
  current: number;
  total: number;
  message: string;
}

export interface ScanSummary {
  total: number;
  valid: number;
  no_face: number;
  different_person: number;
  suspicious: number;
  errors: number;
  duration_ms: number;
  results: ScanResult[];
}

// ─── Config ──────────────────────────────────────────────────────────
const MODEL_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model';
const MAX_IMAGE_SIZE = 640;
const BATCH_SIZE = 4; // Smaller batch for SSD (heavier model)

// Euclidean distance thresholds (face-api.js standard)
// face-api euclidean distance: 0 = identical, ~0.6 = threshold for same person
const MATCH_DISTANCE = 0.45;      // Below this = definitely same person (valid)
const SUSPICIOUS_DISTANCE = 0.55; // Between MATCH and this = suspicious
// Above SUSPICIOUS_DISTANCE = different person

// Cross-student duplicate detection threshold
const CROSS_STUDENT_MATCH_DISTANCE = 0.45; // Very strict for cross-student matches

const EMBEDDING_DB_NAME = 'face_embeddings_cache';
const EMBEDDING_STORE_NAME = 'embeddings';

// ─── Model Loading ───────────────────────────────────────────────────
let modelsLoaded = false;

export const loadFaceModels = async (): Promise<void> => {
  if (modelsLoaded) return;
  await Promise.all([
    faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL),    // More accurate detector
    faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),  // Full landmark model
    faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
  ]);
  modelsLoaded = true;
};

export const areModelsLoaded = () => modelsLoaded;

// ─── IndexedDB Embedding Cache ───────────────────────────────────────
const openEmbeddingDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(EMBEDDING_DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(EMBEDDING_STORE_NAME)) {
        db.createObjectStore(EMBEDDING_STORE_NAME, { keyPath: 'key' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
};

const getCachedEmbedding = async (photoUrl: string): Promise<Float32Array | null> => {
  try {
    const db = await openEmbeddingDB();
    return new Promise((resolve) => {
      const tx = db.transaction(EMBEDDING_STORE_NAME, 'readonly');
      const store = tx.objectStore(EMBEDDING_STORE_NAME);
      const req = store.get(photoUrl);
      req.onsuccess = () => {
        if (req.result?.embedding) {
          resolve(new Float32Array(req.result.embedding));
        } else {
          resolve(null);
        }
      };
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
};

const cacheEmbedding = async (photoUrl: string, embedding: Float32Array): Promise<void> => {
  try {
    const db = await openEmbeddingDB();
    const tx = db.transaction(EMBEDDING_STORE_NAME, 'readwrite');
    const store = tx.objectStore(EMBEDDING_STORE_NAME);
    store.put({ key: photoUrl, embedding: Array.from(embedding), cachedAt: Date.now() });
  } catch {
    // Silent fail for cache
  }
};

export const clearEmbeddingCache = async (): Promise<void> => {
  try {
    const db = await openEmbeddingDB();
    const tx = db.transaction(EMBEDDING_STORE_NAME, 'readwrite');
    tx.objectStore(EMBEDDING_STORE_NAME).clear();
  } catch {
    // Silent
  }
};

// ─── Image Processing ────────────────────────────────────────────────
const resizeImage = (img: HTMLImageElement): HTMLCanvasElement => {
  const canvas = document.createElement('canvas');
  let { width, height } = img;

  if (width > MAX_IMAGE_SIZE || height > MAX_IMAGE_SIZE) {
    const scale = MAX_IMAGE_SIZE / Math.max(width, height);
    width = Math.round(width * scale);
    height = Math.round(height * scale);
  }

  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, 0, 0, width, height);
  return canvas;
};

const loadImage = (url: string): Promise<HTMLImageElement> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    const timeout = setTimeout(() => reject(new Error('Image load timeout')), 15000);
    img.onload = () => { clearTimeout(timeout); resolve(img); };
    img.onerror = () => { clearTimeout(timeout); reject(new Error(`Failed to load: ${url}`)); };
    img.src = url;
  });
};

// Use SSD MobileNet for higher accuracy face detection
const ssdOptions = new faceapi.SsdMobilenetv1Options({
  minConfidence: 0.5,
});

const extractEmbedding = async (photoUrl: string): Promise<Float32Array | null> => {
  // Check cache first
  const cached = await getCachedEmbedding(photoUrl);
  if (cached) return cached;

  try {
    const img = await loadImage(photoUrl);
    const canvas = resizeImage(img);

    const detection = await faceapi
      .detectSingleFace(canvas as any, ssdOptions)
      .withFaceLandmarks()
      .withFaceDescriptor();

    if (!detection) return null;

    // Filter tiny faces (likely not a real person face)
    const box = detection.detection.box;
    if (box.width < 50 || box.height < 50) return null;

    // Check confidence score - must be high enough
    if (detection.detection.score < 0.6) return null;

    const descriptor = detection.descriptor;
    await cacheEmbedding(photoUrl, descriptor);
    return descriptor;
  } catch {
    return null;
  }
};

// ─── Distance (Euclidean - standard for face-api.js) ─────────────────
const euclideanDistance = (a: Float32Array, b: Float32Array): number => {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const diff = a[i] - b[i];
    sum += diff * diff;
  }
  return Math.sqrt(sum);
};

// ─── Main Scan Pipeline ──────────────────────────────────────────────
export const scanClassImages = async (
  images: ScanImage[],
  classId: string,
  onProgress: (progress: ScanProgress) => void,
  abortSignal?: AbortSignal
): Promise<ScanSummary> => {
  const startTime = performance.now();
  const results: ScanResult[] = [];

  // Phase 1: Load models
  onProgress({ phase: 'loading_models', current: 0, total: 1, message: 'Đang tải mô hình AI...' });
  await loadFaceModels();

  if (abortSignal?.aborted) throw new Error('Aborted');

  // Phase 2: Extract embeddings in batches
  const embeddings = new Map<string, { image: ScanImage; embedding: Float32Array | null }>();
  const total = images.length;

  for (let i = 0; i < total; i += BATCH_SIZE) {
    if (abortSignal?.aborted) throw new Error('Aborted');

    const batch = images.slice(i, i + BATCH_SIZE);

    const batchResults = await Promise.all(
      batch.map(async (img) => {
        const t0 = performance.now();
        try {
          const embedding = await extractEmbedding(img.photo_url);
          const processingTime = performance.now() - t0;

          if (!embedding) {
            results.push({
              image_id: img.id,
              image_path: img.photo_url,
              student_code: img.student_code,
              name: img.name,
              week: img.week_number,
              status: 'no_face',
              similarity_score: 0,
              processing_time_ms: processingTime,
            });
          }

          return { image: img, embedding };
        } catch (err: any) {
          results.push({
            image_id: img.id,
            image_path: img.photo_url,
            student_code: img.student_code,
            name: img.name,
            week: img.week_number,
            status: 'error',
            similarity_score: 0,
            processing_time_ms: performance.now() - t0,
            error_message: err.message,
          });
          return { image: img, embedding: null };
        }
      })
    );

    for (const r of batchResults) {
      if (r.embedding) {
        embeddings.set(r.image.id, r);
      }
    }

    onProgress({
      phase: 'processing',
      current: Math.min(i + BATCH_SIZE, total),
      total,
      message: `Đang xử lý ảnh ${Math.min(i + BATCH_SIZE, total)}/${total}...`,
    });
  }

  // Phase 3: Compare embeddings per student
  onProgress({ phase: 'comparing', current: 0, total: 1, message: 'Đang so sánh khuôn mặt...' });

  // Group by student_code (case insensitive)
  const studentGroups = new Map<string, { image: ScanImage; embedding: Float32Array }[]>();
  for (const [, entry] of embeddings) {
    if (!entry.embedding) continue;
    const key = entry.image.student_code.toLowerCase();
    if (!studentGroups.has(key)) studentGroups.set(key, []);
    studentGroups.get(key)!.push({ image: entry.image, embedding: entry.embedding });
  }

  let comparedStudents = 0;
  const totalStudents = studentGroups.size;

  for (const [, group] of studentGroups) {
    if (abortSignal?.aborted) throw new Error('Aborted');

    if (group.length === 1) {
      results.push({
        image_id: group[0].image.id,
        image_path: group[0].image.photo_url,
        student_code: group[0].image.student_code,
        name: group[0].image.name,
        week: group[0].image.week_number,
        status: 'valid',
        similarity_score: 1,
        processing_time_ms: 0,
      });
    } else {
      // Use median embedding as reference (more robust than first photo)
      // Compare each pair to the first photo (reference)
      const reference = group[0];

      results.push({
        image_id: reference.image.id,
        image_path: reference.image.photo_url,
        student_code: reference.image.student_code,
        name: reference.image.name,
        week: reference.image.week_number,
        status: 'valid',
        similarity_score: 1,
        processing_time_ms: 0,
      });

      for (let i = 1; i < group.length; i++) {
        const distance = euclideanDistance(reference.embedding, group[i].embedding);
        // Convert distance to similarity score (0-1, higher = more similar)
        const similarity = Math.max(0, 1 - distance);
        let status: ScanResult['status'];

        if (distance <= MATCH_DISTANCE) {
          status = 'valid';
        } else if (distance <= SUSPICIOUS_DISTANCE) {
          status = 'suspicious';
        } else {
          status = 'different_person';
        }

        results.push({
          image_id: group[i].image.id,
          image_path: group[i].image.photo_url,
          student_code: group[i].image.student_code,
          name: group[i].image.name,
          week: group[i].image.week_number,
          status,
          similarity_score: Math.round(similarity * 10000) / 10000,
          processing_time_ms: 0,
        });
      }
    }

    comparedStudents++;
    onProgress({
      phase: 'comparing',
      current: comparedStudents,
      total: totalStudents,
      message: `Đang so sánh ${comparedStudents}/${totalStudents} sinh viên...`,
    });
  }

  // Cross-student duplicate detection
  const refEmbeddings = Array.from(studentGroups.entries()).map(([code, group]) => ({
    code,
    name: group[0].image.name,
    embedding: group[0].embedding,
  }));

  for (let i = 0; i < refEmbeddings.length; i++) {
    for (let j = i + 1; j < refEmbeddings.length; j++) {
      const distance = euclideanDistance(refEmbeddings[i].embedding, refEmbeddings[j].embedding);
      if (distance < CROSS_STUDENT_MATCH_DISTANCE) {
        const similarity = Math.max(0, 1 - distance);
        const group = studentGroups.get(refEmbeddings[j].code)!;
        for (const item of group) {
          const existing = results.find(r => r.image_id === item.image.id);
          if (existing && existing.status === 'valid') {
            existing.status = 'suspicious';
            existing.similarity_score = Math.round(similarity * 10000) / 10000;
            existing.error_message = `Trùng mặt với ${refEmbeddings[i].name} (${refEmbeddings[i].code})`;
          }
        }
      }
    }
  }

  // Phase 4: Save to database
  onProgress({ phase: 'saving', current: 0, total: results.length, message: 'Đang lưu kết quả...' });
  await saveResultsToDB(results, classId);

  const duration = performance.now() - startTime;
  onProgress({ phase: 'done', current: results.length, total: results.length, message: 'Hoàn tất!' });

  return {
    total: results.length,
    valid: results.filter(r => r.status === 'valid').length,
    no_face: results.filter(r => r.status === 'no_face').length,
    different_person: results.filter(r => r.status === 'different_person').length,
    suspicious: results.filter(r => r.status === 'suspicious').length,
    errors: results.filter(r => r.status === 'error').length,
    duration_ms: Math.round(duration),
    results,
  };
};

// ─── Save to DB ──────────────────────────────────────────────────────
const saveResultsToDB = async (results: ScanResult[], classId: string): Promise<void> => {
  await (supabase.from as any)('image_scan_results')
    .delete()
    .eq('class_id', classId);

  const CHUNK_SIZE = 100;
  for (let i = 0; i < results.length; i += CHUNK_SIZE) {
    const chunk = results.slice(i, i + CHUNK_SIZE).map(r => ({
      image_path: r.image_path,
      status: r.status,
      similarity_score: r.similarity_score,
      week: `week_${r.week}`,
      processing_time_ms: r.processing_time_ms,
      error_message: r.error_message || null,
      class_id: classId,
    }));

    await (supabase.from as any)('image_scan_results').insert(chunk);
  }
};

// ─── Scan Single Week ────────────────────────────────────────────────
export const scanWeekImages = async (
  images: ScanImage[],
  classId: string,
  weekNumber: number,
  onProgress: (progress: ScanProgress) => void,
  abortSignal?: AbortSignal
): Promise<ScanSummary> => {
  const weekImages = images.filter(i => i.week_number === weekNumber);
  return scanClassImages(weekImages, classId, onProgress, abortSignal);
};
