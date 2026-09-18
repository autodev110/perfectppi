"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { X, Camera } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { UPLOAD_HINT } from "@/lib/uploads/upload-photo";

import { useTranslator } from "@/lib/i18n/client";

// The sheet is always black, regardless of theme, so its buttons carry
// explicit colors: the app's primary token is near-black (invisible here)
// and the outline variant paints a white background under white text.
const OVERLAY_PRIMARY = "bg-white text-black hover:bg-white/90 hover:text-black";
const OVERLAY_OUTLINE = "border-white/40 bg-transparent text-white hover:bg-white/10 hover:text-white dark:bg-transparent dark:border-white/40";
const OVERLAY_GHOST = "text-white hover:bg-white/10 hover:text-white";

interface CameraCaptureProps {
  onCapture: (file: File) => void;
  onClose: () => void;
  photoPrompt?: string;
}

export function CameraCapture({ onCapture, onClose, photoPrompt }: CameraCaptureProps) {
  const uiText = useTranslator();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const libraryInputRef = useRef<HTMLInputElement>(null);

  const [mode, setMode] = useState<"loading" | "camera" | "fallback" | "error">("fallback");
  const [facingMode, setFacingMode] = useState<"environment" | "user">("environment");
  const [capturing, setCapturing] = useState(false);
  const [previewFile, setPreviewFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [supportsBrowserCamera, setSupportsBrowserCamera] = useState(false);
  const [videoReady, setVideoReady] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const attachStreamToVideo = useCallback((video: HTMLVideoElement, stream: MediaStream) => {
    if (video.srcObject !== stream) {
      video.srcObject = stream;
    }
    const playPromise = video.play();
    if (playPromise && typeof playPromise.then === "function") {
      playPromise.catch((err) => {
        console.error("Video play failed:", err);
      });
    }
  }, []);

  const videoCallbackRef = useCallback(
    (node: HTMLVideoElement | null) => {
      videoRef.current = node;
      if (node && streamRef.current) {
        attachStreamToVideo(node, streamRef.current);
      }
    },
    [attachStreamToVideo]
  );

  const stopStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setVideoReady(false);
  }, []);

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

  const startCamera = useCallback(
    async (facing: "environment" | "user") => {
      setMode("loading");
      setCameraError(null);
      stopStream();

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: facing } },
          audio: false,
        });
        streamRef.current = stream;
        setFacingMode(facing);
        setMode("camera");
        // If the video element is already mounted (e.g., switching cameras while
        // already in camera mode) attach immediately. Otherwise the videoCallbackRef
        // will attach the stream the moment the element mounts.
        if (videoRef.current) {
          attachStreamToVideo(videoRef.current, stream);
        }
      } catch (error) {
        const message =
          error instanceof DOMException && error.name === "NotAllowedError"
            ? uiText("ui.camera_permission_was_blocked_you_can_allow__e52472affd")
            : error instanceof DOMException && error.name === "NotFoundError"
              ? uiText("ui.no_camera_was_found_on_this_device_use_the_p_814f0a4d4a")
              : uiText("ui.could_not_start_the_live_camera_use_the_phot_b995b7b1f8");
        setCameraError(message);
        setMode("error");
      }
    },
    [stopStream, attachStreamToVideo, uiText]
  );

  useEffect(() => {
    setSupportsBrowserCamera(
      window.isSecureContext && typeof navigator.mediaDevices?.getUserMedia === "function"
    );

    return () => {
      stopStream();
    };
  }, [stopStream]);

  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  function captureFrame() {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    if (!video.videoWidth || !video.videoHeight) {
      setCameraError(uiText("ui.camera_is_still_initializing_please_wait_a_m_b1f188dd5e"));
      return;
    }

    setCapturing(true);
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      setCapturing(false);
      return;
    }
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

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
    e.target.value = "";
  }

  function handleClose() {
    stopStream();
    clearPreview();
    onClose();
  }

  function handleUsePhoto() {
    if (!previewFile) return;
    onCapture(previewFile);
    clearPreview();
  }

  if (!mounted) return null;

  const overlay = (
    <div className="fixed inset-0 z-[100] flex flex-col bg-black">
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
        <div className="h-9 w-9" />
      </div>

      <div className="relative flex-1 overflow-hidden">
        {previewUrl && (
          <div className="absolute inset-0 p-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={previewUrl}
              alt={uiText("ui.captured_preview_e7f5e3b146")}
              className="h-full w-full rounded-2xl object-contain"
            />
          </div>
        )}

        {!previewUrl && (mode === "camera" || mode === "loading") && (
          <video
            ref={videoCallbackRef}
            autoPlay
            playsInline
            muted
            onLoadedMetadata={() => {
              videoRef.current?.play().catch((err) => {
                console.error("Video play failed onLoadedMetadata:", err);
              });
            }}
            onPlaying={() => setVideoReady(true)}
            onCanPlay={() => {
              if (videoRef.current && videoRef.current.readyState >= 3) {
                setVideoReady(true);
              }
            }}
            className={cn(
              "h-full w-full object-cover",
              mode === "camera" ? "block" : "hidden"
            )}
          />
        )}

        {!previewUrl && mode === "loading" && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="h-10 w-10 animate-spin rounded-full border-2 border-white/30 border-t-white" />
          </div>
        )}

        {!previewUrl && mode === "fallback" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-6 px-8 text-center">
            <Camera className="h-16 w-16 text-white/40" />
            <p className="text-sm text-white/70">{uiText("ui.take_a_photo_with_your_device_camera_or_choo_fe081048b5")}</p>
            <p className="text-xs text-white/50">{UPLOAD_HINT}</p>
          </div>
        )}

        {!previewUrl && mode === "error" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-8">
            <p className="text-center text-sm text-red-400">
              {cameraError ?? uiText("ui.could_not_access_camera_please_allow_camera__ea253caa87")}
            </p>
            <Button
              variant="outline"
              onClick={() => startCamera(facingMode)}
              className={OVERLAY_OUTLINE}
            >{uiText("ui.use_browser_camera_28f7028fd7")}</Button>
          </div>
        )}
      </div>

      {/* Actions wrap and stack on narrow phones; a fixed row of three
          no-wrap buttons overflowed and clipped its edges on iPhone. */}
      <div className="flex flex-col items-stretch justify-center gap-3 bg-black/60 px-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-5 sm:flex-row sm:flex-wrap sm:items-center sm:gap-6 sm:px-8">
        {previewUrl ? (
          <div className="flex w-full items-center justify-center gap-4 sm:w-auto">
            <Button
              variant="outline"
              onClick={clearPreview}
              className={cn(OVERLAY_OUTLINE, "flex-1 sm:flex-none")}
            >{uiText("ui.retake_1c62f54c28")}</Button>
            <Button onClick={handleUsePhoto} className={cn(OVERLAY_PRIMARY, "flex-1 px-8 py-3 text-base sm:flex-none")}>{uiText("ui.use_photo_6c042d2a42")}</Button>
          </div>
        ) : mode === "camera" || mode === "loading" ? (
          <button
            onClick={captureFrame}
            disabled={capturing || !videoReady}
            aria-label={uiText("ui.capture_photo_a2678d11e3")}
            className={cn(
              "mx-auto flex h-20 w-20 items-center justify-center rounded-full border-4 border-white transition",
              capturing || !videoReady ? "opacity-50" : "active:scale-95 hover:scale-105"
            )}
          >
            <div className="h-14 w-14 rounded-full bg-white" />
          </button>
        ) : (
          <>
            <Button
              onClick={() => cameraInputRef.current?.click()}
              className={cn(OVERLAY_PRIMARY, "w-full px-8 py-3 text-base sm:w-auto")}
            >{uiText("ui.take_photo_1ca36a90c3")}</Button>
            <Button
              variant="outline"
              onClick={() => libraryInputRef.current?.click()}
              className={cn(OVERLAY_OUTLINE, "w-full sm:w-auto")}
            >{uiText("ui.choose_from_library_626d06a750")}</Button>
            {supportsBrowserCamera && (
              <Button
                variant="ghost"
                onClick={() => startCamera(facingMode)}
                className={cn(OVERLAY_GHOST, "w-full sm:w-auto")}
              >{uiText("ui.use_browser_camera_instead_dd526fd3a6")}</Button>
            )}
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={handleFileChange}
            />
            <input
              ref={libraryInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileChange}
            />
          </>
        )}
      </div>

      <canvas ref={canvasRef} className="hidden" />
    </div>
  );

  return createPortal(overlay, document.body);
}
