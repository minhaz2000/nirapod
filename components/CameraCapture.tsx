'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';

interface Props {
  label?: string;
  onCapture?: (file: File) => void;
  /** Show the optional getUserMedia live preview toggle. */
  livePreview?: boolean;
  size?: 'large' | 'normal';
}

/** Camera input: file input with capture="environment", plus optional getUserMedia live preview. */
export default function CameraCapture({ label, onCapture, livePreview = false, size = 'normal' }: Props) {
  const t = useTranslations('camera');
  const [fileName, setFileName] = useState<string | null>(null);
  const [streaming, setStreaming] = useState(false);
  const [previewError, setPreviewError] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => () => streamRef.current?.getTracks().forEach((tr) => tr.stop()), []);

  async function togglePreview() {
    if (streaming) {
      streamRef.current?.getTracks().forEach((tr) => tr.stop());
      streamRef.current = null;
      setStreaming(false);
      return;
    }
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('unsupported');
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
      setStreaming(true);
      setPreviewError(false);
    } catch {
      setPreviewError(true);
    }
  }

  const big = size === 'large';
  return (
    <div className="space-y-3">
      <label
        data-testid="camera-button"
        className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-3xl bg-teal-800 text-center font-bold text-white shadow-md hover:bg-teal-900 focus-within:outline-4 focus-within:outline-teal-950 ${
          big ? 'min-h-44 text-2xl' : 'min-h-16 text-lg'
        }`}
      >
        <span aria-hidden="true" className={big ? 'text-6xl' : 'text-2xl'}>
          📷
        </span>
        <span>{label ?? t('take')}</span>
        <input
          type="file"
          accept="image/*"
          capture="environment"
          className="sr-only"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            setFileName(file.name);
            onCapture?.(file);
          }}
        />
      </label>
      {fileName && (
        <p role="status" className="text-slate-800">
          {t('selected', { name: fileName })}
        </p>
      )}
      {livePreview && (
        <div className="space-y-2">
          <button
            type="button"
            onClick={togglePreview}
            className="min-h-11 w-full rounded-xl border-2 border-teal-800 px-4 font-semibold text-teal-900"
          >
            {streaming ? t('stopPreview') : t('startPreview')}
          </button>
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            aria-label={t('livePreview')}
            className={streaming ? 'w-full rounded-xl bg-black' : 'hidden'}
          />
          {previewError && <p className="text-slate-700">{t('previewUnavailable')}</p>}
        </div>
      )}
    </div>
  );
}
