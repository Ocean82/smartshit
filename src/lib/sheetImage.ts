/**
 * Read an image File/Blob into a data URL with a size cap.
 * ponytail: data URL storage; IndexedDB assets if workbooks get heavy.
 */
export const MAX_SHEET_IMAGE_BYTES = 2 * 1024 * 1024
export const DEFAULT_SHEET_IMAGE_WIDTH = 280

export function readImageAsDataUrl(file: Blob): Promise<string> {
  if (!file.type.startsWith('image/')) {
    return Promise.reject(new Error('Not an image'))
  }
  if (file.size > MAX_SHEET_IMAGE_BYTES) {
    return Promise.reject(new Error('Image must be under 2 MB'))
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result
      if (typeof result !== 'string') reject(new Error('Failed to read image'))
      else resolve(result)
    }
    reader.onerror = () => reject(new Error('Failed to read image'))
    reader.readAsDataURL(file)
  })
}

/** Natural size capped to DEFAULT_SHEET_IMAGE_WIDTH (keeps aspect). */
export function defaultImageBox(
  naturalWidth: number,
  naturalHeight: number,
): { width: number; height: number } {
  const w = Math.max(1, naturalWidth || DEFAULT_SHEET_IMAGE_WIDTH)
  const h = Math.max(1, naturalHeight || Math.round(DEFAULT_SHEET_IMAGE_WIDTH * 0.75))
  if (w <= DEFAULT_SHEET_IMAGE_WIDTH) return { width: w, height: h }
  const scale = DEFAULT_SHEET_IMAGE_WIDTH / w
  return { width: DEFAULT_SHEET_IMAGE_WIDTH, height: Math.max(40, Math.round(h * scale)) }
}
