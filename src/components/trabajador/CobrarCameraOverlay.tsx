"use client";

import { useEffect, useRef, useState } from "react";
import { captureVideoFrameAsJpeg } from "@/lib/image-utils";

type Props = {
  slotIndex: number;
  onClose: () => void;
  onCapture: (file: File) => void;
  onCaptureError: (message: string) => void;
};

function CloseIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

/** Overlay de cámara para evidencia de transferencia; cargado bajo demanda desde cobrar/page. */
export default function CobrarCameraOverlay({ slotIndex, onClose, onCapture, onCaptureError }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);

  useEffect(() => {
    setCameraError(null);
    const video = videoRef.current;
    if (!video) return;
    const constraints: MediaStreamConstraints = {
      video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } },
    };
    navigator.mediaDevices
      .getUserMedia(constraints)
      .then((stream) => {
        streamRef.current = stream;
        video.srcObject = stream;
      })
      .catch((err) => setCameraError(err?.message ?? "No se pudo acceder a la cámara"));
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      if (video) video.srcObject = null;
    };
  }, []);

  const handleClose = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    const video = videoRef.current;
    if (video) video.srcObject = null;
    onClose();
  };

  return (
    <div className="cobrar-camera-overlay" role="dialog" aria-modal="true" aria-label="Tomar foto">
      <div className="cobrar-camera-backdrop" onClick={handleClose} aria-hidden />
      <div className="cobrar-camera-box">
        <div className="cobrar-camera-header">
          <h4 className="cobrar-camera-title">Tomar foto {slotIndex + 1}</h4>
          <button type="button" className="cobrar-camera-close" onClick={handleClose} aria-label="Cerrar">
            <CloseIcon />
          </button>
        </div>
        {cameraError ? (
          <p className="cobrar-camera-error">{cameraError}</p>
        ) : (
          <video ref={videoRef} autoPlay playsInline muted className="cobrar-camera-video" />
        )}
        <div className="cobrar-camera-actions">
          <button type="button" className="btn btn-secondary" onClick={handleClose}>
            Cancelar
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={!!cameraError}
            onClick={() => {
              const video = videoRef.current;
              if (!video || !video.videoWidth) return;
              void captureVideoFrameAsJpeg(video, `evidencia-${slotIndex + 1}`)
                .then((file) => {
                  streamRef.current?.getTracks().forEach((t) => t.stop());
                  streamRef.current = null;
                  if (video) video.srcObject = null;
                  onCapture(file);
                })
                .catch(() => onCaptureError("No se pudo capturar la imagen"));
            }}
          >
            Capturar
          </button>
        </div>
      </div>
    </div>
  );
}
