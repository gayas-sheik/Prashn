import { useEffect, useRef, useState } from 'react';
import { getOriginalBlob } from '../../services/api/documentService';

export function OriginalDocumentPreview({ id, name, mimeType, page = 1, zoom }: { id: string; name: string; mimeType: string; page?: number; zoom?: number }) {
  const original = useRef<{ id: string; blob: Promise<Blob> } | null>(null);
  const [preview, setPreview] = useState<{ id: string; url: string } | null>(null);
  const [error, setError] = useState<{ id: string; message: string } | null>(null);
  useEffect(() => {
    let disposed = false;
    let objectUrl = '';
    if (!original.current || original.current.id !== id) original.current = { id, blob: getOriginalBlob(id) };
    original.current.blob.then(blob => {
      if (disposed) return;
      // A new blob URL triggers real PDF navigation. Fragment-only changes
      // are ignored by Chrome's viewer; reuse the Blob to avoid another download.
      objectUrl = URL.createObjectURL(blob);
      setPreview({ id, url: objectUrl });
      setError(null);
    }).catch(err => { if (!disposed) setError({ id, message: err instanceof Error ? err.message : 'Preview unavailable' }); });
    return () => { disposed = true; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [id, page, zoom]);
  if (error?.id === id) return <p role="alert" className="p-4 text-sm text-red-600">{error.message}</p>;
  if (!preview || preview.id !== id) return <p className="p-4 text-sm text-slate-500">Loading original document...</p>;
  const { url } = preview;
  return mimeType.startsWith('image/') ? <img src={url} alt={name} className="max-w-full max-h-full object-contain" style={{ width: `${zoom ?? 100}%` }} /> :
    <iframe title={name} src={`${url}#page=${page}&${zoom === undefined ? 'view=FitH' : `zoom=${zoom}`}`} className="w-full h-full min-h-0 border-0" />;
}
