/**
 * Fraud Analysis Engine - No AI, pure image processing
 * Uses: EXIF metadata, perceptual hashing, histogram analysis, ELA, screen recapture detection
 */
import ExifReader from 'exifreader';

export interface FraudResult {
  studentCode: string;
  studentName: string;
  weekNumber: number;
  riskScore: number; // 0-100
  riskLevel: 'safe' | 'suspicious' | 'high';
  reasons: string[];
  photoUrl: string;
  metadata?: ExifData;
  histogram?: HistogramData;
}

export interface ExifData {
  make?: string;
  model?: string;
  software?: string;
  dateTimeOriginal?: string;
  imageWidth?: number;
  imageHeight?: number;
  orientation?: number;
  gpsLatitude?: number;
  gpsLongitude?: number;
  fNumber?: string;
  exposureTime?: string;
  iso?: number;
  focalLength?: string;
  hasFullExif: boolean;
}

export interface HistogramData {
  r: number[];
  g: number[];
  b: number[];
  brightness: number[];
}

interface ImageAnalysis {
  studentCode: string;
  studentName: string;
  weekNumber: number;
  photoUrl: string;
  exif: ExifData | null;
  pHash: string;
  dHash: string;
  histogram: HistogramData;
  brightness: number;
  contrast: number;
  sharpness: number;
  noiseLevel: number;
  elaScore: number;
  moireScore: number;
  edgeSharpnessVariance: number;
}

// ========================
// EXIF Extraction
// ========================
async function extractExif(url: string): Promise<ExifData | null> {
  try {
    const response = await fetch(url, { mode: 'cors' });
    const buffer = await response.arrayBuffer();
    const tags = ExifReader.load(buffer, { expanded: true });

    const exif = tags.exif || {};
    const gps = tags.gps || {};

    return {
      make: exif.Make?.description || undefined,
      model: exif.Model?.description || undefined,
      software: exif.Software?.description || undefined,
      dateTimeOriginal: exif.DateTimeOriginal?.description || undefined,
      imageWidth: exif.PixelXDimension?.value as number || undefined,
      imageHeight: exif.PixelYDimension?.value as number || undefined,
      orientation: exif.Orientation?.value as number || undefined,
      gpsLatitude: gps?.Latitude as number || undefined,
      gpsLongitude: gps?.Longitude as number || undefined,
      fNumber: exif.FNumber?.description || undefined,
      exposureTime: exif.ExposureTime?.description || undefined,
      iso: exif.ISOSpeedRatings?.value as number || undefined,
      focalLength: exif.FocalLength?.description || undefined,
      hasFullExif: !!(exif.Make || exif.Model || exif.DateTimeOriginal),
    };
  } catch {
    return null;
  }
}

// ========================
// Canvas Helpers
// ========================
function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

function getImageData(img: HTMLImageElement, maxSize = 256): { data: ImageData; canvas: HTMLCanvasElement } {
  const canvas = document.createElement('canvas');
  const scale = Math.min(maxSize / img.width, maxSize / img.height, 1);
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return { data: ctx.getImageData(0, 0, canvas.width, canvas.height), canvas };
}

// ========================
// Perceptual Hash (pHash) - 64-bit
// ========================
function computePHash(img: HTMLImageElement): string {
  const canvas = document.createElement('canvas');
  canvas.width = 32;
  canvas.height = 32;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, 0, 0, 32, 32);
  const imageData = ctx.getImageData(0, 0, 32, 32);
  const d = imageData.data;

  // Convert to grayscale
  const gray: number[] = [];
  for (let i = 0; i < d.length; i += 4) {
    gray.push(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]);
  }

  // Simple DCT-like: compute mean and compare
  const mean = gray.reduce((a, b) => a + b, 0) / gray.length;
  let hash = '';
  // Use 8x8 center block for hash
  for (let y = 4; y < 12; y++) {
    for (let x = 4; x < 12; x++) {
      hash += gray[y * 32 + x] >= mean ? '1' : '0';
    }
  }
  return hash;
}

// ========================
// Difference Hash (dHash) - 64-bit
// ========================
function computeDHash(img: HTMLImageElement): string {
  const canvas = document.createElement('canvas');
  canvas.width = 9;
  canvas.height = 8;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, 0, 0, 9, 8);
  const imageData = ctx.getImageData(0, 0, 9, 8);
  const d = imageData.data;

  const gray: number[] = [];
  for (let i = 0; i < d.length; i += 4) {
    gray.push(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]);
  }

  let hash = '';
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      hash += gray[y * 9 + x] < gray[y * 9 + x + 1] ? '1' : '0';
    }
  }
  return hash;
}

function hammingDistance(a: string, b: string): number {
  let dist = 0;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) dist++;
  }
  return dist;
}

export function hashSimilarity(a: string, b: string): number {
  const dist = hammingDistance(a, b);
  return 1 - dist / a.length;
}

// ========================
// Histogram Analysis
// ========================
function computeHistogram(imageData: ImageData): HistogramData {
  const r = new Array(256).fill(0);
  const g = new Array(256).fill(0);
  const b = new Array(256).fill(0);
  const brightness = new Array(256).fill(0);
  const d = imageData.data;

  for (let i = 0; i < d.length; i += 4) {
    r[d[i]]++;
    g[d[i + 1]]++;
    b[d[i + 2]]++;
    const br = Math.round(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]);
    brightness[br]++;
  }

  return { r, g, b, brightness };
}

function computeBrightness(imageData: ImageData): number {
  const d = imageData.data;
  let sum = 0;
  const total = d.length / 4;
  for (let i = 0; i < d.length; i += 4) {
    sum += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
  }
  return sum / total;
}

function computeContrast(imageData: ImageData): number {
  const d = imageData.data;
  let sum = 0;
  let sumSq = 0;
  const total = d.length / 4;
  for (let i = 0; i < d.length; i += 4) {
    const br = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    sum += br;
    sumSq += br * br;
  }
  const mean = sum / total;
  return Math.sqrt(sumSq / total - mean * mean);
}

// ========================
// Sharpness (Laplacian Variance)
// ========================
function computeSharpness(imageData: ImageData, width: number, height: number): number {
  const d = imageData.data;
  const gray: number[] = [];
  for (let i = 0; i < d.length; i += 4) {
    gray.push(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]);
  }

  let sum = 0;
  let count = 0;
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x;
      const laplacian = 
        gray[idx - width] + gray[idx + width] + 
        gray[idx - 1] + gray[idx + 1] - 
        4 * gray[idx];
      sum += laplacian * laplacian;
      count++;
    }
  }
  return sum / count;
}

// ========================
// Noise Level Estimation
// ========================
function computeNoiseLevel(imageData: ImageData, width: number, height: number): number {
  const d = imageData.data;
  const gray: number[] = [];
  for (let i = 0; i < d.length; i += 4) {
    gray.push(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]);
  }

  // Median filter difference for noise estimation
  let noiseSq = 0;
  let count = 0;
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x;
      const neighbors = [
        gray[idx - width - 1], gray[idx - width], gray[idx - width + 1],
        gray[idx - 1], gray[idx], gray[idx + 1],
        gray[idx + width - 1], gray[idx + width], gray[idx + width + 1]
      ].sort((a, b) => a - b);
      const median = neighbors[4];
      const diff = gray[idx] - median;
      noiseSq += diff * diff;
      count++;
    }
  }
  return Math.sqrt(noiseSq / count);
}

// ========================
// Error Level Analysis (ELA)
// ========================
function computeELA(img: HTMLImageElement): number {
  const canvas1 = document.createElement('canvas');
  const w = Math.min(img.width, 256);
  const h = Math.min(img.height, 256);
  canvas1.width = w;
  canvas1.height = h;
  const ctx1 = canvas1.getContext('2d')!;
  ctx1.drawImage(img, 0, 0, w, h);

  // Re-compress at lower quality
  const canvas2 = document.createElement('canvas');
  canvas2.width = w;
  canvas2.height = h;
  const ctx2 = canvas2.getContext('2d')!;
  
  const dataUrl = canvas1.toDataURL('image/jpeg', 0.75);
  
  return new Promise<number>((resolve) => {
    const img2 = new Image();
    img2.onload = () => {
      ctx2.drawImage(img2, 0, 0, w, h);
      const d1 = ctx1.getImageData(0, 0, w, h).data;
      const d2 = ctx2.getImageData(0, 0, w, h).data;
      
      let totalDiff = 0;
      let maxDiff = 0;
      const pixelCount = w * h;
      
      for (let i = 0; i < d1.length; i += 4) {
        const diff = Math.abs(d1[i] - d2[i]) + Math.abs(d1[i+1] - d2[i+1]) + Math.abs(d1[i+2] - d2[i+2]);
        totalDiff += diff;
        maxDiff = Math.max(maxDiff, diff);
      }
      
      // Compute variance of differences (inconsistent blocks = editing)
      const avgDiff = totalDiff / pixelCount;
      let variance = 0;
      for (let i = 0; i < d1.length; i += 4) {
        const diff = Math.abs(d1[i] - d2[i]) + Math.abs(d1[i+1] - d2[i+1]) + Math.abs(d1[i+2] - d2[i+2]);
        variance += (diff - avgDiff) ** 2;
      }
      variance /= pixelCount;
      
      // High variance = inconsistent compression = possible editing
      resolve(Math.sqrt(variance));
    };
    img2.src = dataUrl;
  }) as unknown as number;
}

// Async version
async function computeELAAsync(img: HTMLImageElement): Promise<number> {
  const canvas1 = document.createElement('canvas');
  const w = Math.min(img.width, 256);
  const h = Math.min(img.height, 256);
  canvas1.width = w;
  canvas1.height = h;
  const ctx1 = canvas1.getContext('2d')!;
  ctx1.drawImage(img, 0, 0, w, h);

  const dataUrl = canvas1.toDataURL('image/jpeg', 0.75);

  return new Promise<number>((resolve) => {
    const img2 = new Image();
    img2.onload = () => {
      const canvas2 = document.createElement('canvas');
      canvas2.width = w;
      canvas2.height = h;
      const ctx2 = canvas2.getContext('2d')!;
      ctx2.drawImage(img2, 0, 0, w, h);
      const d1 = ctx1.getImageData(0, 0, w, h).data;
      const d2 = ctx2.getImageData(0, 0, w, h).data;

      let totalDiff = 0;
      const pixelCount = w * h;
      const diffs: number[] = [];

      for (let i = 0; i < d1.length; i += 4) {
        const diff = Math.abs(d1[i] - d2[i]) + Math.abs(d1[i + 1] - d2[i + 1]) + Math.abs(d1[i + 2] - d2[i + 2]);
        totalDiff += diff;
        diffs.push(diff);
      }

      const avgDiff = totalDiff / pixelCount;
      let variance = 0;
      for (const d of diffs) {
        variance += (d - avgDiff) ** 2;
      }
      resolve(Math.sqrt(variance / pixelCount));
    };
    img2.src = dataUrl;
  });
}

// ========================
// Moiré Pattern Detection (simplified frequency analysis)
// ========================
function computeMoireScore(imageData: ImageData, width: number, height: number): number {
  const d = imageData.data;
  const gray: number[] = [];
  for (let i = 0; i < d.length; i += 4) {
    gray.push(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]);
  }

  // Detect repetitive patterns by looking at horizontal and vertical gradients
  let horizontalRepetition = 0;
  let verticalRepetition = 0;
  let count = 0;

  for (let y = 1; y < height - 1; y++) {
    for (let x = 2; x < width - 2; x++) {
      const idx = y * width + x;
      // Check for alternating pattern: high-low-high
      const h1 = gray[idx - 1] - gray[idx];
      const h2 = gray[idx] - gray[idx + 1];
      if (h1 * h2 < 0) horizontalRepetition++;
      
      const v1 = gray[idx - width] - gray[idx];
      const v2 = gray[idx] - gray[idx + width];
      if (v1 * v2 < 0) verticalRepetition++;
      count++;
    }
  }

  const hScore = horizontalRepetition / count;
  const vScore = verticalRepetition / count;
  
  // High alternation rate suggests moiré pattern (screen recapture)
  return (hScore + vScore) / 2;
}

// ========================
// Edge Sharpness Variance (detect printed photo recapture)
// ========================
function computeEdgeSharpnessVariance(imageData: ImageData, width: number, height: number): number {
  const d = imageData.data;
  const gray: number[] = [];
  for (let i = 0; i < d.length; i += 4) {
    gray.push(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]);
  }

  // Sobel edge detection
  const edges: number[] = [];
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x;
      const gx = 
        -gray[idx - width - 1] + gray[idx - width + 1] +
        -2 * gray[idx - 1] + 2 * gray[idx + 1] +
        -gray[idx + width - 1] + gray[idx + width + 1];
      const gy =
        -gray[idx - width - 1] - 2 * gray[idx - width] - gray[idx - width + 1] +
        gray[idx + width - 1] + 2 * gray[idx + width] + gray[idx + width + 1];
      edges.push(Math.sqrt(gx * gx + gy * gy));
    }
  }

  if (edges.length === 0) return 0;
  const mean = edges.reduce((a, b) => a + b) / edges.length;
  const variance = edges.reduce((a, b) => a + (b - mean) ** 2, 0) / edges.length;
  return Math.sqrt(variance);
}

// ========================
// Yield to UI thread (prevents jank)
// ========================
const yieldToUI = () => new Promise<void>(resolve => setTimeout(resolve, 0));

// ========================
// Full Image Analysis (optimised: yield between heavy steps, small canvas for pixel ops)
// ========================
export async function analyzeImage(
  record: { student_code: string; name: string; week_number: number; photo_url: string },
  onProgress?: (step: string) => void
): Promise<ImageAnalysis> {
  onProgress?.('Tải ảnh...');
  const img = await loadImage(record.photo_url);

  // 256px for hash/histogram/ELA (quality matters), 128px for heavy pixel ops (speed)
  const { data: imageData256, canvas: canvas256 } = getImageData(img, 256);
  const { data: imageData128, canvas: canvas128 } = getImageData(img, 128);
  const w256 = canvas256.width;
  const h256 = canvas256.height;
  const w128 = canvas128.width;
  const h128 = canvas128.height;

  // ── Fast sync ops (no yield needed) ──────────────────────
  onProgress?.('Tính hash & histogram...');
  const pHash = computePHash(img);
  const dHash = computeDHash(img);
  const histogram = computeHistogram(imageData256);
  const brightness = computeBrightness(imageData256);
  const contrast = computeContrast(imageData256);

  // ── Yield before heavy CPU ops ────────────────────────────
  await yieldToUI();

  onProgress?.('Phân tích pixel...');
  const sharpness = computeSharpness(imageData128, w128, h128);

  await yieldToUI();

  const noiseLevel = computeNoiseLevel(imageData128, w128, h128);

  await yieldToUI();

  const moireScore = computeMoireScore(imageData128, w128, h128);

  await yieldToUI();

  const edgeSharpnessVariance = computeEdgeSharpnessVariance(imageData128, w128, h128);

  // ── Async ops (EXIF fetch + ELA) — run concurrently ───────
  onProgress?.('Phân tích EXIF & ELA...');
  const [exif, elaScore] = await Promise.all([
    extractExif(record.photo_url),
    computeELAAsync(img),
  ]);

  return {
    studentCode: record.student_code,
    studentName: record.name,
    weekNumber: record.week_number,
    photoUrl: record.photo_url,
    exif,
    pHash,
    dHash,
    histogram,
    brightness,
    contrast,
    sharpness,
    noiseLevel,
    elaScore,
    moireScore,
    edgeSharpnessVariance,
  };
}

// ========================
// Cross-Analysis & Scoring
// ========================
export function generateFraudResults(analyses: ImageAnalysis[]): FraudResult[] {
  const results: FraudResult[] = [];

  // Group by student
  const byStudent = new Map<string, ImageAnalysis[]>();
  for (const a of analyses) {
    const key = a.studentCode.toLowerCase();
    if (!byStudent.has(key)) byStudent.set(key, []);
    byStudent.get(key)!.push(a);
  }

  for (const a of analyses) {
    let riskScore = 0;
    const reasons: string[] = [];
    const studentAnalyses = byStudent.get(a.studentCode.toLowerCase()) || [];

    // A. EXIF Forensic Check
    if (!a.exif || !a.exif.hasFullExif) {
      riskScore += 15;
      reasons.push('Metadata EXIF bị thiếu hoặc bị xóa');
    }

    // Check device change across weeks
    if (studentAnalyses.length > 1) {
      const devices = new Set(
        studentAnalyses
          .filter(s => s.exif?.model)
          .map(s => `${s.exif!.make || ''}-${s.exif!.model}`)
      );
      if (devices.size > 1) {
        riskScore += 10;
        reasons.push(`Đổi thiết bị chụp (${devices.size} thiết bị khác nhau)`);
      }
    }

    // B. Screen Recapture Detection (Moiré)
    if (a.moireScore > 0.55) {
      riskScore += 25;
      reasons.push('Phát hiện pattern lưới màn hình (nghi chụp lại từ màn hình)');
    } else if (a.moireScore > 0.48) {
      riskScore += 12;
      reasons.push('Nghi ngờ chụp lại từ màn hình');
    }

    // Flat brightness (screen photos tend to have flat histogram)
    const hist = a.histogram.brightness;
    const totalPixels = hist.reduce((a, b) => a + b, 0);
    const peakValue = Math.max(...hist);
    const peakRatio = peakValue / totalPixels;
    if (peakRatio > 0.15 && a.contrast < 30) {
      riskScore += 10;
      reasons.push('Ánh sáng phẳng bất thường (có thể chụp từ màn hình)');
    }

    // C. Printed Photo Recapture
    if (a.sharpness < 50 && a.edgeSharpnessVariance < 15) {
      riskScore += 15;
      reasons.push('Biên ảnh mờ bất thường (nghi chụp lại ảnh in)');
    }

    // Paper texture noise pattern
    if (a.noiseLevel > 8 && a.sharpness < 100) {
      riskScore += 8;
      reasons.push('Pattern nhiễu bất thường (có thể là ảnh chụp lại từ giấy)');
    }

    // D. Image Reuse Detection (hash comparison across weeks)
    for (const other of studentAnalyses) {
      if (other.weekNumber === a.weekNumber) continue;
      const pSim = hashSimilarity(a.pHash, other.pHash);
      const dSim = hashSimilarity(a.dHash, other.dHash);
      const avgSim = (pSim + dSim) / 2;
      
      if (avgSim > 0.85) {
        riskScore += 30;
        reasons.push(`Ảnh rất giống với tuần ${other.weekNumber} (${Math.round(avgSim * 100)}% tương đồng)`);
      } else if (avgSim > 0.75) {
        riskScore += 15;
        reasons.push(`Ảnh tương tự tuần ${other.weekNumber} (${Math.round(avgSim * 100)}% - có thể crop lại)`);
      }
    }

    // E. Environment Analysis
    if (studentAnalyses.length > 1) {
      const brightnesses = studentAnalyses.map(s => s.brightness);
      const avgBr = brightnesses.reduce((a, b) => a + b) / brightnesses.length;
      const brDiff = Math.abs(a.brightness - avgBr);
      if (brDiff > 50) {
        riskScore += 5;
        reasons.push('Ánh sáng thay đổi đáng kể so với các buổi khác');
      }

      const noiseLevels = studentAnalyses.map(s => s.noiseLevel);
      const avgNoise = noiseLevels.reduce((a, b) => a + b) / noiseLevels.length;
      if (Math.abs(a.noiseLevel - avgNoise) > 5) {
        riskScore += 5;
        reasons.push('Noise profile khác biệt so với các buổi khác');
      }
    }

    // F. Editing Detection (ELA)
    if (a.elaScore > 25) {
      riskScore += 20;
      reasons.push('Phát hiện dấu hiệu chỉnh sửa ảnh (ELA bất thường)');
    } else if (a.elaScore > 15) {
      riskScore += 8;
      reasons.push('Nghi ngờ ảnh đã qua chỉnh sửa');
    }

    // Cap at 100
    riskScore = Math.min(riskScore, 100);

    const riskLevel: FraudResult['riskLevel'] = 
      riskScore <= 30 ? 'safe' : 
      riskScore <= 60 ? 'suspicious' : 'high';

    results.push({
      studentCode: a.studentCode,
      studentName: a.studentName,
      weekNumber: a.weekNumber,
      riskScore,
      riskLevel,
      reasons: reasons.length > 0 ? reasons : ['Không phát hiện vấn đề'],
      photoUrl: a.photoUrl,
      metadata: a.exif || undefined,
      histogram: a.histogram,
    });
  }

  // Sort by risk score descending
  results.sort((a, b) => b.riskScore - a.riskScore);
  return results;
}
