import { useId, useRef, useState, type DragEvent } from 'react';
import { toast } from 'sonner';
import { CloudUpload, Link2, Loader2, Trash2 } from 'lucide-react';
import { useUploadImage } from '@/features/catalog/hooks';
import { ACCEPTED_IMAGE_TYPES, compressImage } from '@/lib/image';
import { errorMessage } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';

/**
 * Drag-and-drop / click-to-upload for one catalog image. Files are compressed in the browser, uploaded,
 * and the resulting URL is handed to `onChange`. An external image URL can be pasted instead.
 */
export function ImageUpload({
  value,
  onChange,
  disabled,
  compact,
}: {
  value: string | null;
  onChange: (url: string | null) => void;
  disabled?: boolean;
  compact?: boolean;
}) {
  const inputId = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  const upload = useUploadImage();
  const [dragging, setDragging] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [urlMode, setUrlMode] = useState(false);
  const [url, setUrl] = useState('');
  const busy = preparing || upload.isPending;

  const handleFile = async (file: File | undefined) => {
    if (!file || disabled) return;
    try {
      setPreparing(true);
      const blob = await compressImage(file);
      setPreparing(false);
      const res = await upload.mutateAsync(blob);
      onChange(res.url);
    } catch (err) {
      toast.error('Image upload failed', { description: errorMessage(err) });
    } finally {
      setPreparing(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    void handleFile(e.dataTransfer.files[0]);
  };

  const applyUrl = () => {
    const v = url.trim();
    if (!/^https?:\/\/\S+$/i.test(v)) {
      toast.error('Enter a full image URL starting with http:// or https://');
      return;
    }
    onChange(v);
    setUrl('');
    setUrlMode(false);
  };

  return (
    <div className="space-y-3">
      {value ? (
        <div className={cn('group relative overflow-hidden rounded-xl border border-slate-200 bg-slate-50', compact ? 'h-40' : 'aspect-[4/3]')}>
          <img src={value} alt="Selected" className="h-full w-full object-contain" />
          {!disabled && (
            <div className="absolute inset-x-0 bottom-0 flex justify-end gap-2 bg-gradient-to-t from-slate-900/50 to-transparent p-3 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100">
              <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()} loading={busy}>
                <CloudUpload className="h-3.5 w-3.5" /> Replace
              </Button>
              <Button size="sm" variant="danger" onClick={() => onChange(null)} disabled={busy}>
                <Trash2 className="h-3.5 w-3.5" /> Remove
              </Button>
            </div>
          )}
        </div>
      ) : (
        <label
          htmlFor={inputId}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={cn(
            'flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-4 text-center transition-colors',
            compact ? 'py-6' : 'py-10',
            dragging ? 'border-blue-500 bg-blue-50' : 'border-blue-200 bg-blue-50/40 hover:border-blue-400 hover:bg-blue-50',
            disabled && 'pointer-events-none opacity-60',
          )}
        >
          {busy ? (
            <Loader2 className="h-7 w-7 animate-spin text-blue-600" />
          ) : (
            <CloudUpload className="h-7 w-7 text-blue-600" strokeWidth={1.8} />
          )}
          <p className="mt-2 text-sm">
            {busy ? (
              <span className="text-slate-600">{preparing ? 'Optimizing image…' : 'Uploading…'}</span>
            ) : (
              <>
                <span className="font-semibold text-blue-600">Click to upload</span>
                <span className="text-slate-500"> or drag and drop</span>
              </>
            )}
          </p>
          <p className="mt-1 text-xs text-slate-400">Supports: JPG, PNG, WebP, GIF · resized automatically</p>
        </label>
      )}
      <input
        ref={fileRef}
        id={inputId}
        type="file"
        accept={ACCEPTED_IMAGE_TYPES.join(',')}
        className="sr-only"
        disabled={disabled || busy}
        onChange={(e) => void handleFile(e.target.files?.[0])}
      />
      {!disabled &&
        (urlMode ? (
          <div className="flex gap-2">
            <Input
              autoFocus
              placeholder="https://example.com/photo.jpg"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  applyUrl();
                }
              }}
            />
            <Button variant="outline" onClick={applyUrl}>
              Use
            </Button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setUrlMode(true)}
            className="flex cursor-pointer items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-blue-600"
          >
            <Link2 className="h-3.5 w-3.5" /> Use an image URL instead
          </button>
        ))}
    </div>
  );
}
