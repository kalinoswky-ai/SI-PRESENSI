"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Camera, Loader2, RefreshCw } from "lucide-react";

let modelsLoadPromise: Promise<void> | null = null;

async function loadModels() {
  if (modelsLoadPromise) return modelsLoadPromise;

  modelsLoadPromise = (async () => {
    const faceapi = await import("face-api.js");
    const MODEL_URL = "/models";
    await Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
      faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
      faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
    ]);
  })();

  return modelsLoadPromise;
}

export interface FaceCaptureResult {
  descriptor: number[];
  imageBlob: Blob;
}

interface FaceCameraProps {
  onCapture: (result: FaceCaptureResult) => void;
  captureLabel?: string;
}

export default function FaceCamera({ onCapture, captureLabel = "Ambil Selfie" }: FaceCameraProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [modelsReady, setModelsReady] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [captured, setCaptured] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    loadModels()
      .then(() => mounted && setModelsReady(true))
      .catch(() => mounted && setError("Gagal memuat model face recognition."));

    return () => {
      mounted = false;
    };
  }, []);

  const startCamera = useCallback(async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: 480, height: 480 },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraReady(true);
    } catch {
      setError("Tidak dapat mengakses kamera. Pastikan izin kamera telah diberikan.");
    }
  }, []);

  useEffect(() => {
    startCamera();
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, [startCamera]);

  async function handleCapture() {
    if (!videoRef.current || !canvasRef.current || !modelsReady) return;
    setProcessing(true);
    setError(null);

    try {
      const faceapi = await import("face-api.js");
      const video = videoRef.current;
      const canvas = canvasRef.current;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      const detection = await faceapi
        .detectSingleFace(canvas, new faceapi.TinyFaceDetectorOptions())
        .withFaceLandmarks()
        .withFaceDescriptor();

      if (!detection) {
        setError("Wajah tidak terdeteksi. Pastikan wajah terlihat jelas dan pencahayaan cukup.");
        setProcessing(false);
        return;
      }

      const descriptor = Array.from(detection.descriptor);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
      setCaptured(dataUrl);

      canvas.toBlob(
        (blob) => {
          if (blob) onCapture({ descriptor, imageBlob: blob });
          setProcessing(false);
        },
        "image/jpeg",
        0.85
      );
    } catch {
      setError("Terjadi kesalahan saat memproses wajah. Coba ulangi.");
      setProcessing(false);
    }
  }

  function handleRetake() {
    setCaptured(null);
  }

  return (
    <div className="space-y-3">
      <div className="relative mx-auto aspect-square w-full max-w-sm overflow-hidden rounded-xl bg-slate-900">
        {!captured ? (
          <video ref={videoRef} className="h-full w-full scale-x-[-1] object-cover" muted playsInline />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={captured} alt="Hasil selfie" className="h-full w-full object-cover" />
        )}
        <canvas ref={canvasRef} className="hidden" />

        {!modelsReady && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-slate-900/80 text-white">
            <Loader2 className="animate-spin" size={28} />
            <p className="text-sm">Memuat model deteksi wajah...</p>
          </div>
        )}
      </div>

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

      <div className="flex justify-center gap-2">
        {!captured ? (
          <button
            type="button"
            onClick={handleCapture}
            disabled={!modelsReady || !cameraReady || processing}
            className="btn-primary"
          >
            {processing ? <Loader2 className="animate-spin" size={18} /> : <Camera size={18} />}
            {processing ? "Memproses..." : captureLabel}
          </button>
        ) : (
          <button type="button" onClick={handleRetake} className="btn-secondary">
            <RefreshCw size={18} />
            Ambil Ulang
          </button>
        )}
      </div>
    </div>
  );
}
