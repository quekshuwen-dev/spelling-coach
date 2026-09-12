/**
 * Image handling — ported from the calories app, which is the camera/scan
 * behaviour this project was asked to reuse.
 *
 * The photo exists only in memory (and in a transient object URL) for as long
 * as the OCR call takes. It is never uploaded to storage and never written to
 * Firestore. `discardImage` revokes the object URL and drops the base64 payload
 * so the browser can reclaim it immediately.
 */
import { appConfig } from '../config/env'

export interface PreparedImage {
  /** JPEG data URL, downscaled — sent to the server, then discarded. */
  dataUrl: string
  mimeType: string
  width: number
  height: number
  /** Local preview URL. Must be released with discardImage(). */
  previewUrl: string
  approxBytes: number
  /** Random id so an attempt can be traced back to the scan it came from. */
  imageId: string
}

export class ImageTooDarkError extends Error {}
export class ImageUnreadableError extends Error {}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new ImageUnreadableError('The photo could not be read.'))
    img.src = src
  })
}

/**
 * Downscales the photo, checks it is not hopelessly dark, and returns a JPEG
 * data URL. Rejecting an unusable photo here saves a pointless OCR call.
 *
 * Note the larger edge than the calories app uses (1600 vs 1024): OCR needs
 * the letter strokes to survive the downscale, where food recognition does not.
 */
export async function prepareImage(file: File | Blob): Promise<PreparedImage> {
  const previewUrl = URL.createObjectURL(file)
  let img: HTMLImageElement
  try {
    img = await loadImage(previewUrl)
  } catch (err) {
    URL.revokeObjectURL(previewUrl)
    throw err
  }

  const max = appConfig.maxImageEdge
  const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight))
  const width = Math.round(img.naturalWidth * scale)
  const height = Math.round(img.naturalHeight * scale)

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) {
    URL.revokeObjectURL(previewUrl)
    throw new ImageUnreadableError('This browser could not process the photo.')
  }
  ctx.drawImage(img, 0, 0, width, height)

  if (isTooDark(ctx, width, height)) {
    URL.revokeObjectURL(previewUrl)
    throw new ImageTooDarkError('The photo looks very dark.')
  }

  const dataUrl = canvas.toDataURL('image/jpeg', appConfig.imageQuality)

  // Wipe the working canvas straight away.
  ctx.clearRect(0, 0, width, height)
  canvas.width = 0
  canvas.height = 0

  return {
    dataUrl,
    mimeType: 'image/jpeg',
    width,
    height,
    previewUrl,
    approxBytes: Math.round((dataUrl.length - 'data:image/jpeg;base64,'.length) * 0.75),
    imageId: `img_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
  }
}

function isTooDark(ctx: CanvasRenderingContext2D, width: number, height: number): boolean {
  try {
    const sample = ctx.getImageData(0, 0, width, height)
    let sum = 0
    let count = 0
    // Sample every 40th pixel — plenty for a brightness check.
    for (let i = 0; i < sample.data.length; i += 4 * 40) {
      sum += 0.299 * sample.data[i] + 0.587 * sample.data[i + 1] + 0.114 * sample.data[i + 2]
      count += 1
    }
    return count > 0 && sum / count < 22
  } catch {
    return false
  }
}

/**
 * Releases every reference to the photo. Call this as soon as OCR finishes
 * (successfully or not) and whenever the user leaves the flow.
 */
export function discardImage(image: PreparedImage | null | undefined): null {
  if (image?.previewUrl) {
    try {
      URL.revokeObjectURL(image.previewUrl)
    } catch {
      /* already revoked */
    }
  }
  if (image) {
    ;(image as { dataUrl: string }).dataUrl = ''
  }
  return null
}

export const imageProcessingService = { prepareImage, discardImage }
export default imageProcessingService
