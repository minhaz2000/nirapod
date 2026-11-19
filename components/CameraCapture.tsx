'use client';

import { useEffect, useRef, useState, type ClipboardEvent, type DragEvent } from 'react';
import { useTranslations } from 'next-intl';
import Icon from '@/components/Icon';
import { loadPhoto, PhotoError, sniffPhoto, type PhotoErrorKind } from '@/lib/image/photo';

interface Props {
  label?: string;
  /**
   * Receives the chosen photo. If it throws (or rejects with) a PhotoError — the browser could not open the file —
   * the bilingual "please choose a JPG or PNG" message is shown here.
   */
  onCapture?: (file: File) => void | Promise<void>;
  /** Show the optional getUserMedia live preview toggle. */
  livePreview?: boolean;
  size?: 'large' | 'normal';
}

/**
 * Photo input used by every flow: "Take photo" (capture="environment") and "Choose from gallery" (no capture),
 * plus drag-and-drop and paste on desktop, and an optional getUserMedia live preview. Photos are handled on the
 * phone only; this component never uploads anything.
 */
export default function CameraCapture({ label, onCapture, livePreview = false, size = 'normal' }: Props) {
  const t = useTranslations('camera');
  const [fileName, setFileName] = useState<string | null>(null);
  const [error, setError] = useState<PhotoErrorKind | null>(null);
  const [dragging, setDragging] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [previewError, setPreviewError] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => () => streamRef.current?.getTracks().forEach((tr) => tr.stop()), []);

  async function handle(file: File | null | undefined) {
    if (!file) return;
    setError(null);
    setFileName(null);
    try {
      await sniffPhoto(file); // cheap checks first: empty, too large, not an image
      if (onCapture) await onCapture(file);
      else (await loadPhoto(file)).bitmap.close(); // no consumer: still confirm the photo opens
      setFileName(file.name || file.type);
    } catch (err) {
      if (err instanceof PhotoError) setError(err.kind);
      // other errors are shown by the flow itself
    }
  }

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ''; // lets the same photo be chosen again after "Retake"
    void handle(file);
  }

  function imageFrom(items: DataTransferItemList | undefined, files: FileList | undefined) {
    const fromFiles = files && Array.from(files).find((f) => f.type.startsWith('image/') || !f.type);
    if (fromFiles) return fromFiles;
    const item = items && Array.from(items).find((i) => i.kind === 'file' && i.type.startsWith('image/'));
    return item?.getAsFile() ?? (files?.[0] ?? null);
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragging(false);
    void handle(imageFrom(e.dataTransfer.items, e.dataTransfer.files));
  }

  function onPaste(e: ClipboardEvent<HTMLDivElement>) {
    const file = imageFrom(e.clipboardData.items, e.clipboardData.files);
    if (!file) return;
    e.preventDefault();
    void handle(file);
  }

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
  const button = `flex cursor-pointer flex-col items-center justify-center gap-2 rounded-3xl px-2 py-2 text-center font-bold shadow-md focus-within:outline-4 focus-within:outline-teal-950 ${
    big ? 'min-h-44 text-xl' : 'min-h-16 text-base'
  }`;
  return (
    <div className="space-y-3">
      <div
        data-testid="photo-drop"
        tabIndex={0}
        aria-label={t('dropZone')}
        onPaste={onPaste}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`space-y-2 rounded-3xl outline-offset-4 focus:outline-2 focus:outline-teal-700 ${dragging ? 'outline-4 outline-dashed outline-teal-600' : ''}`}
      >
        <div className="grid grid-cols-2 gap-3">
          <label data-testid="camera-button" className={`${button} bg-teal-800 text-white hover:bg-teal-900`}>
            <Icon name="camera" size={big ? 48 : 28} />
            <span>{label ?? t('takePhoto')}</span>
            <input data-testid="camera-input" type="file" accept="image/*" capture="environment" className="sr-only" onChange={onPick} />
          </label>
          <label data-testid="gallery-button" className={`${button} border-2 border-teal-800 bg-white text-teal-900 hover:bg-teal-50`}>
            <Icon name="image" size={big ? 48 : 28} />
            <span>{t('gallery')}</span>
            <input data-testid="gallery-input" type="file" accept="image/*" className="sr-only" onChange={onPick} />
          </label>
        </div>
        <p className="hidden text-center text-sm text-slate-700 md:block">{t('dropHint')}</p>
      </div>
      {error && (
        <p role="alert" data-testid="photo-error" data-kind={error} className="rounded-xl border-2 border-amber-600 bg-amber-50 p-3 font-semibold text-amber-950">
          {t(error)}
        </p>
      )}
      {fileName && !error && (
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
