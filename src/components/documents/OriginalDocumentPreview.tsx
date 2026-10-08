import { useEffect, useState } from 'react';
import { getOriginalBlob } from '../../services/api/documentService';

export function OriginalDocumentPreview({ id, name, mimeType, page = 1, zoom = 100 }: { id: string; name: string; mimeType: string; page?: number; zoom?: number }) {
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    let disposed = false;
    let objectUrl = '';
    setUrl(''); setError('');
    getOriginalBlob(id).then(blob => {
      if (!disposed) { objectUrl = URL.createObjectURL(blob); setUrl(objectUrl); }
    }).catch(err => { if (!disposed) setError(err instanceof Error ? err.message : 'Preview unavailable'); });
    return () => { disposed = true; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [id]);
  if (error) return <p role="alert" className="p-4 text-sm text-red-600">{error}</p>;
  if (!url) return <p className="p-4 text-sm text-slate-500">Loading original document...</p>;
  return mimeType.startsWith('image/') ? <img src={url} alt={name} className="max-w-full object-contain" style={{ width: `${zoom}%` }} /> :
    <iframe title={name} src={`${url}#page=${page}&zoom=${zoom}`} className="w-full h-full min-h-[500px] border-0" />;
}
