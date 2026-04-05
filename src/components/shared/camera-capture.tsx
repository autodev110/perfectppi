"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import { X, Camera, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface CameraCaptureProps {
  onCapture: (file: File) => void;
  onClose: () => void;
  photoPrompt?: string;
}

export function CameraCapture({ onCapture, onClose, photoPrompt }: CameraCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [mode, setMode] = useState<"loading" | "camera" | "fallback" | "error">("loading");
  const [facingMode, setFacingMode] = useState<"environment" | "user">("environment");
  const [capturing, setCapturing] = useState(false);
  const [previewFile, setPreviewFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const clearPreview = useCallback(() => {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    setPreviewFile(null);
    setPreviewUrl(null);
  }, [previewUrl]);

  const setPreview = useCallback(
    (file: File) => {
      clearPreview();
      setPreviewFile(file);
      setPreviewUrl(URL.createObjectURL(file));
    },
    [clearPreview]
  );

  const startCamera = useCallback(async (facing: "environment" | "user") => {
    setMode("loading");
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: facing },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setMode("camera");
    } catch {
      setMode("fallback");
    }
  }, []);

  useEffect(() => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setMode("fallback");
      return;
    }

    startCamera("environment");

    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, [startCamera]);

  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  function flipCamera() {
    const next = facingMode === "environment" ? "user" : "environment";
    setFacingMode(next);
    startCamera(next);
  }

  function captureFrame() {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    setCapturing(true);
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")?.drawImage(video, 0, 0);

    canvas.toBlob(
      (blob) => {
        if (blob) {
          setPreview(
            new File([blob], `capture-${Date.now()}.jpg`, {
              type: "image/jpeg",
            })
          );
        }
        setCapturing(false);
      },
      "image/jpeg",
      0.92
    );
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      setPreview(file);
    }
  }

  function handleClose() {
    clearPreview();
    onClose();
  }

  function handleUsePhoto() {
    if (!previewFile) return;
    onCapture(previewFile);
    clearPreview();
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black">
      <div className="flex items-center justify-between bg-black/60 px-4 py-3">
        <button
          onClick={handleClose}
          className="rounded-full p-2 text-white transition hover:bg-white/10"
        >
          <X className="h-6 w-6" />
        </button>
        {photoPrompt && (
          <p className="flex-1 px-4 text-center text-sm font-medium text-white">
            {photoPrompt}
          </p>
        )}
        {mode === "camera" && !previewUrl ? (
          <button
            onClick={flipCamera}
            className="rounded-full p-2 text-white transition hover:bg-white/10"
          >
            <RefreshCw className="h-5 w-5" />
          </button>
        ) : (
          <div className="h-9 w-9" />
        )}
      </div>

      <div className="relative flex-1 overflow-hidden">
        {previewUrl && (
          <div className="absolute inset-0 p-4">
            <div
              className="h-full w-full rounded-2xl bg-cover bg-center bg-no-repeat"
              style={{ backgroundImage: `url("${previewUrl}")` }}
            />
          </div>
        )}

        {!previewUrl && mode === "loading" && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/30 border-t-white" />
          </div>
        )}

        {!previewUrl && mode === "camera" && (
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="h-full w-full object-cover"
          />
        )}

        {!previewUrl && mode === "fallback" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-6 px-8 text-center">
            <Camera className="h-16 w-16 text-white/40" />
            <p className="text-sm text-white/70">
              Camera access not available. Use the button below to select a photo.
            </p>
          </div>
        )}

        {!previewUrl && mode === "error" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-8">
            <p className="text-center text-sm text-red-400">
              Could not access camera. Please allow camera permissions and try again.
            </p>
            <Button
              variant="outline"
              onClick={() => startCamera(facingMode)}
              className="border-white/30 text-white"
            >
              Try Again
            </Button>
          </div>
        )}
      </div>

      <div className="flex items-center justify-center gap-8 bg-black/60 px-8 pb-10 pt-6">
        {previewUrl ? (
          <>
            <Button
              variant="outline"
              onClick={clearPreview}
              className="border-white/30 text-white hover:bg-white/10 hover:text-white"
            >
              Retake
            </Button>
            <Button onClick={handleUsePhoto} className="px-8 py-3 text-base">
              Use Photo
            </Button>
          </>
        ) : mode === "camera" ? (
          <button
            onClick={captureFrame}
            disabled={capturing}
            className={cn(
              "flex h-20 w-20 items-center justify-center rounded-full border-4 border-white transition",
              capturing ? "opacity-50" : "active:scale-95 hover:scale-105"
            )}
          >
            <div className="h-14 w-14 rounded-full bg-white" />
          </button>
        ) : (
          <>
            <Button
              onClick={() => fileInputRef.current?.click()}
              className="px-8 py-3 text-base"
            >
              Choose Photo
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={handleFileChange}
            />
          </>
        )}
      </div>

      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
}
