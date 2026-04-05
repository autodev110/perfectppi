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

  const startCamera = useCallback(
    async (facing: "environment" | "user") => {
      setMode("loading");
      // Stop any existing stream
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
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
        // Fall back to file input
        setMode("fallback");
      }
    },
    []
  );

  useEffect(() => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setMode("fallback");
      return;
    }
    startCamera(facingMode);

    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
          const file = new File([blob], `capture-${Date.now()}.jpg`, {
            type: "image/jpeg",
          });
          onCapture(file);
        }
        setCapturing(false);
      },
      "image/jpeg",
      0.92
    );
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) onCapture(file);
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-black/60">
        <button
          onClick={onClose}
          className="p-2 rounded-full text-white hover:bg-white/10 transition"
        >
          <X className="h-6 w-6" />
        </button>
        {photoPrompt && (
          <p className="text-white text-sm text-center flex-1 px-4 font-medium">
            {photoPrompt}
          </p>
        )}
        {mode === "camera" && (
          <button
            onClick={flipCamera}
            className="p-2 rounded-full text-white hover:bg-white/10 transition"
          >
            <RefreshCw className="h-5 w-5" />
          </button>
        )}
      </div>

      {/* Camera view */}
      <div className="flex-1 relative overflow-hidden">
        {mode === "loading" && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-8 h-8 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          </div>
        )}

        {mode === "camera" && (
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-cover"
          />
        )}

        {mode === "fallback" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-6 px-8 text-center">
            <Camera className="h-16 w-16 text-white/40" />
            <p className="text-white/70 text-sm">
              Camera access not available. Use the button below to select a photo.
            </p>
          </div>
        )}

        {mode === "error" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-8">
            <p className="text-red-400 text-center text-sm">
              Could not access camera. Please allow camera permissions and try again.
            </p>
            <Button variant="outline" onClick={() => startCamera(facingMode)} className="text-white border-white/30">
              Try Again
            </Button>
          </div>
        )}
      </div>

      {/* Capture controls */}
      <div className="px-8 pb-10 pt-6 bg-black/60 flex items-center justify-center gap-8">
        {mode === "camera" ? (
          <button
            onClick={captureFrame}
            disabled={capturing}
            className={cn(
              "w-20 h-20 rounded-full border-4 border-white flex items-center justify-center transition",
              capturing ? "opacity-50" : "hover:scale-105 active:scale-95"
            )}
          >
            <div className="w-14 h-14 rounded-full bg-white" />
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

      {/* Hidden canvas for frame capture */}
      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
}
