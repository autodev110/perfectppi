"use client";

// TODO Phase B: Direct device camera integration for inspection media capture
// Uses getUserMedia API — mobile-first, full-screen capture

interface CameraCaptureProps {
  onCapture: (file: File) => void;
  onClose: () => void;
}

export function CameraCapture({ onCapture, onClose }: CameraCaptureProps) {
  // Phase B implementation: suppress unused-param warnings until implemented
  void onCapture;
  void onClose;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background">
      <p className="text-muted-foreground">Camera capture — Phase B</p>
    </div>
  );
}
