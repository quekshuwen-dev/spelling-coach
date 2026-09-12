/**
 * Camera capture — the working camera flow from the calories app, extracted so
 * both scanning and any future photo feature share it.
 *
 * Behaviour that matters and is easy to get wrong:
 *  - a live getUserMedia preview, not just <input capture>, so the parent can
 *    line the worksheet up before shooting;
 *  - `facingMode: { ideal: 'environment' }` (ideal, not exact) so a laptop with
 *    only a front camera still works instead of throwing;
 *  - every track stopped on unmount, or the camera light stays on;
 *  - a gallery fallback for every device and permission state.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { Notice } from './ui'

interface Props {
  onCapture: (blob: Blob) => void
  /** Shown under the viewfinder, e.g. "Fit the whole list in the frame." */
  hint?: string
  disabled?: boolean
}

export default function CameraCapture({ onCapture, hint, disabled }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [ready, setReady] = useState(false)
  const [cameraError, setCameraError] = useState<string | null>(null)

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    setReady(false)
  }, [])

  const startCamera = useCallback(async () => {
    setCameraError(null)
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError('This browser cannot open the camera. You can still choose a photo from your gallery.')
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 } },
        audio: false,
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play().catch(() => {})
      }
      setReady(true)
    } catch (err) {
      const name = (err as Error).name
      setCameraError(
        name === 'NotAllowedError'
          ? 'Camera permission was denied. Allow it in your browser settings, or pick a photo from your gallery instead.'
          : 'We could not open the camera on this device. You can pick a photo from your gallery instead.',
      )
    }
  }, [])

  useEffect(() => {
    void startCamera()
    return stopCamera
  }, [startCamera, stopCamera])

  const takePhoto = () => {
    const video = videoRef.current
    if (!video || !ready) return
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.drawImage(video, 0, 0)
    canvas.toBlob(
      (blob) => {
        if (blob) onCapture(blob)
        canvas.width = 0
        canvas.height = 0
      },
      'image/jpeg',
      0.92,
    )
  }

  return (
    <div className="space-y-3">
      <div className="relative aspect-[4/3] w-full overflow-hidden rounded-xl2 bg-ink">
        <video ref={videoRef} playsInline muted autoPlay className="h-full w-full object-cover" />
        {/* A guide frame, so the parent knows roughly what will be read. */}
        <div className="pointer-events-none absolute inset-6 rounded-2xl border-2 border-dashed border-white/60" />
      </div>

      {hint && <p className="text-center text-sm text-ink-soft">{hint}</p>}
      {cameraError && <Notice tone="warn">{cameraError}</Notice>}

      <button className="btn-primary w-full text-lg" onClick={takePhoto} disabled={!ready || disabled}>
        📸 Take Photo
      </button>
      <button className="btn-ghost w-full" onClick={() => fileInputRef.current?.click()} disabled={disabled}>
        🖼️ Choose a photo instead
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="sr-only"
        onChange={(event) => {
          const file = event.target.files?.[0]
          if (file) onCapture(file)
          // Reset so choosing the same file twice still fires a change event.
          event.target.value = ''
        }}
      />
    </div>
  )
}
