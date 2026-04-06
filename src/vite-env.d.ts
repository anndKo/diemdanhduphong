/// <reference types="vite/client" />

// Ambient declarations for @mediapipe/tasks-vision (resolves bundler moduleResolution issue)
declare module "@mediapipe/tasks-vision" {
  export interface WasmFileset {
    wasmLoaderPath: string;
    wasmBinaryPath: string;
  }

  export class FilesetResolver {
    static forVisionTasks(basePath: string): Promise<WasmFileset>;
    static forAudioTasks(basePath: string): Promise<WasmFileset>;
    static forTextTasks(basePath: string): Promise<WasmFileset>;
  }

  export interface NormalizedLandmark {
    x: number;
    y: number;
    z: number;
    visibility?: number;
  }

  export interface FaceLandmarkerOptions {
    baseOptions?: {
      modelAssetPath?: string;
      delegate?: "CPU" | "GPU";
    };
    runningMode?: "IMAGE" | "VIDEO";
    numFaces?: number;
    minFaceDetectionConfidence?: number;
    minFacePresenceConfidence?: number;
    minTrackingConfidence?: number;
    outputFaceBlendshapes?: boolean;
    outputFacialTransformationMatrixes?: boolean;
  }

  export interface FaceLandmarkerResult {
    faceLandmarks: NormalizedLandmark[][];
    faceBlendshapes?: Array<{ categories: Array<{ categoryName: string; score: number }> }>;
  }

  export class FaceLandmarker {
    static createFromOptions(
      wasmFileset: WasmFileset,
      options: FaceLandmarkerOptions
    ): Promise<FaceLandmarker>;
    detectForVideo(videoFrame: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement, timestamp: number): FaceLandmarkerResult;
    detect(image: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement): FaceLandmarkerResult;
    setOptions(options: FaceLandmarkerOptions): Promise<void>;
    close(): void;
  }
}
