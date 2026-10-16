import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, PointerEvent } from 'react';
import { ImagePlus, Minus, Plus, RotateCcw, X } from 'lucide-react';

type Props = { title: string; aspect: number; shape?: 'circle' | 'banner'; onClose: () => void; onSave: (dataUrl: string) => Promise<void> };
const MAX_BYTES = 8 * 1024 * 1024;
const allowed = new Set(['image/jpeg', 'image/png', 'image/webp']);

export default function ImageCropper({ title, aspect, shape = 'banner', onClose, onSave }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [source, setSource] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [start, setStart] = useState({ x: 0, y: 0 });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const shapeStyle = useMemo(() => ({ aspectRatio: `${aspect}`, '--crop-aspect': `${aspect}` } as CSSProperties), [aspect]);

  useEffect(() => {
    const handle = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handle);
    return () => window.removeEventListener('keydown', handle);
  }, [onClose]);

  const pick = (file?: File) => {
    setError('');
    if (!file) return;
    if (!allowed.has(file.type)) { setError('Choose a JPG, PNG, or WebP image.'); return; }
    if (file.size > MAX_BYTES) { setError('Images must be smaller than 8 MB.'); return; }
    const reader = new FileReader();
    reader.onload = () => { setSource(String(reader.result)); setZoom(1); setOffset({ x: 0, y: 0 }); };
    reader.onerror = () => setError('That image couldn’t be opened. Try another one.');
    reader.readAsDataURL(file);
  };
  const onPointerDown = (event: PointerEvent) => {
    if (!source) return;
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    setDragging(true); setStart({ x: event.clientX - offset.x, y: event.clientY - offset.y });
  };
  const onPointerMove = (event: PointerEvent) => {
    if (dragging) setOffset({ x: event.clientX - start.x, y: event.clientY - start.y });
  };
  const save = async () => {
    if (!source) return;
    setSaving(true); setError('');
    try {
      const image = new Image(); image.src = source;
      await image.decode();
      const width = shape === 'circle' ? 640 : 1200;
      const height = Math.round(width / aspect);
      const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Image editing is unavailable.');
      const box = (document.querySelector('.crop-viewport') as HTMLElement).getBoundingClientRect();
      const ratio = Math.max(box.width / image.width, box.height / image.height) * zoom;
      const drawnWidth = image.width * ratio; const drawnHeight = image.height * ratio;
      const scaleX = width / box.width; const scaleY = height / box.height;
      const left = (box.width - drawnWidth) / 2 + offset.x;
      const top = (box.height - drawnHeight) / 2 + offset.y;
      context.drawImage(image, left * scaleX, top * scaleY, drawnWidth * scaleX, drawnHeight * scaleY);
      await onSave(canvas.toDataURL('image/jpeg', 0.88));
      onClose();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Couldn’t save this image.'); }
    finally { setSaving(false); }
  };

  return <div className="modal-backdrop crop-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="modal-card crop-modal" role="dialog" aria-modal="true" aria-labelledby="crop-title">
      <div className="modal-heading"><div><span className="eyebrow">PERSONALISE CORE</span><h2 id="crop-title">{title}</h2></div><button className="icon-button" aria-label="Close image editor" onClick={onClose}><X size={18} /></button></div>
      <div className="crop-body">
        <div className={`crop-viewport ${shape}`} style={shapeStyle} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={() => setDragging(false)} onPointerCancel={() => setDragging(false)}>
          {source ? <img src={source} alt="Image crop preview" draggable={false} style={{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})` }} /> : <div className="crop-empty"><ImagePlus size={25} /><span>Choose an image to begin</span><small>JPG, PNG or WebP · up to 8 MB</small></div>}
          {source && <span className="crop-hint">Drag to reposition</span>}
        </div>
        <div className="crop-controls"><button className="icon-button" aria-label="Zoom out" onClick={() => setZoom((v) => Math.max(1, +(v - 0.1).toFixed(1)))}><Minus size={16} /></button><input aria-label="Image zoom" type="range" min="1" max="3" step="0.05" value={zoom} onChange={(e) => setZoom(Number(e.target.value))} /><button className="icon-button" aria-label="Zoom in" onClick={() => setZoom((v) => Math.min(3, +(v + 0.1).toFixed(1)))}><Plus size={16} /></button><button className="icon-button" aria-label="Reset crop" onClick={() => { setZoom(1); setOffset({ x: 0, y: 0 }); }}><RotateCcw size={15} /></button></div>
      </div>
      {error && <p className="form-error">{error}</p>}
      <div className="modal-actions"><button className="button subtle" onClick={() => input.current?.click()}>{source ? 'Choose another' : 'Choose image'}</button><div className="action-spacer" /><button className="button subtle" onClick={onClose}>Cancel</button><button className="button primary" disabled={!source || saving} onClick={save}>{saving ? 'Saving…' : 'Save image'}</button></div>
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(event) => pick(event.target.files?.[0])} />
    </section>
  </div>;
}
