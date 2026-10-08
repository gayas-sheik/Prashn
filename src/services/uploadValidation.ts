export function getUploadValidationError(file: { type: string; size: number }): string | null {
  if (file.size === 0) return 'The file is empty';
  if (file.size > 10 * 1024 * 1024) return 'File exceeds 10 MB';
  if (!['application/pdf', 'image/png', 'image/jpeg'].includes(file.type)) return 'Choose PDF, PNG or JPEG';
  return null;
}
