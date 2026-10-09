export function fetchPreview(value: string): Promise<{
  status: number
  contentType: string
  body: Buffer
} | null>
