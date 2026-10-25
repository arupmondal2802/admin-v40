import React, { useRef, useState, useEffect, useCallback } from 'react';
import { IconPencil, IconRefresh, IconCheck, IconX, IconAlertTriangle } from './Icon';
import Button from './Button';

interface SignaturePadProps {
  value?: string;
  onChange: (signatureDataUrl: string) => void;
  label?: string;
  required?: boolean;
  customerName?: string;
}

export const SignaturePad: React.FC<SignaturePadProps> = ({
  value,
  onChange,
  label = 'Customer Digital Signature',
  required = false,
  customerName = '',
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [isEmpty, setIsEmpty] = useState(!value);
  const [isEditing, setIsEditing] = useState(!value);

  // Initialize and handle canvas drawing
  const getCoordinates = (e: MouseEvent | TouchEvent | React.MouseEvent | React.TouchEvent, canvas: HTMLCanvasElement) => {
    const rect = canvas.getBoundingClientRect();
    let clientX = 0;
    let clientY = 0;

    if ('touches' in e && e.touches.length > 0) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else if ('clientX' in e) {
      clientX = (e as MouseEvent).clientX;
      clientY = (e as MouseEvent).clientY;
    }

    return {
      x: clientX - rect.left,
      y: clientY - rect.top,
    };
  };

  const setupCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;

    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;

    ctx.scale(dpr, dpr);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = '#0f172a'; // slate-900

    // Fill background with clean white for clear data URL export
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, rect.width, rect.height);
  }, []);

  useEffect(() => {
    if (isEditing) {
      setupCanvas();
    }
  }, [isEditing, setupCanvas]);

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const coords = getCoordinates(e, canvas);
    ctx.beginPath();
    ctx.moveTo(coords.x, coords.y);
    setIsDrawing(true);
    setIsEmpty(false);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    e.preventDefault();

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const coords = getCoordinates(e, canvas);
    ctx.lineTo(coords.x, coords.y);
    ctx.stroke();
  };

  const stopDrawing = () => {
    if (!isDrawing) return;
    setIsDrawing(false);

    const canvas = canvasRef.current;
    if (!canvas) return;

    const dataUrl = canvas.toDataURL('image/png');
    onChange(dataUrl);
  };

  const handleClear = () => {
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        const rect = canvas.getBoundingClientRect();
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, rect.width, rect.height);
      }
    }
    setIsEmpty(true);
    setIsEditing(true);
    onChange('');
  };

  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center space-x-2">
          <IconPencil className="w-4 h-4 text-slate-700" />
          <label className="text-sm font-semibold text-slate-800">{label}</label>
          {value && !isEditing ? (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
              <IconCheck className="w-3.5 h-3.5 mr-1 text-emerald-600" /> Signature Signed
            </span>
          ) : required ? (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
              <IconAlertTriangle className="w-3.5 h-3.5 mr-1 text-amber-600" /> Sign Off Required
            </span>
          ) : (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 text-slate-600 border border-slate-200">
              Optional
            </span>
          )}
        </div>

        {value && !isEditing ? (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={handleClear}
            className="no-print text-xs"
          >
            <IconRefresh className="w-3.5 h-3.5 mr-1" /> Clear & Re-sign
          </Button>
        ) : (
          <button
            type="button"
            onClick={handleClear}
            disabled={isEmpty}
            className={`no-print text-xs font-medium flex items-center space-x-1 px-2.5 py-1 rounded-md transition-colors ${
              isEmpty
                ? 'text-slate-300 cursor-not-allowed'
                : 'text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200'
            }`}
          >
            <IconX className="w-3.5 h-3.5" />
            <span>Clear</span>
          </button>
        )}
      </div>

      {value && !isEditing ? (
        <div className="relative border-2 border-emerald-300 rounded-lg bg-white p-3 shadow-2xs transition-all">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2 mb-2 text-xs text-slate-500">
            <span>Customer Sign-off: <strong className="text-slate-800">{customerName || 'Customer'}</strong></span>
            <span>Verified Digital Signature</span>
          </div>
          <div className="flex items-center justify-center min-h-[120px] bg-slate-50/50 rounded-md p-2">
            <img
              src={value}
              alt="Customer Digital Signature"
              className="max-h-28 object-contain"
            />
          </div>
        </div>
      ) : (
        <div className="relative border-2 border-dashed border-slate-300 rounded-lg bg-white overflow-hidden focus-within:border-brand-accent transition-all shadow-2xs">
          <canvas
            ref={canvasRef}
            onMouseDown={startDrawing}
            onMouseMove={draw}
            onMouseUp={stopDrawing}
            onMouseLeave={stopDrawing}
            onTouchStart={startDrawing}
            onTouchMove={draw}
            onTouchEnd={stopDrawing}
            className="w-full h-36 touch-none cursor-crosshair bg-white"
          />

          {isEmpty && (
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-slate-400 select-none">
              <IconPencil className="w-6 h-6 mb-1 opacity-50" />
              <p className="text-xs font-medium">Draw customer signature here with finger or stylus</p>
              {customerName && <p className="text-[11px] text-slate-400 mt-0.5">Signed by {customerName}</p>}
            </div>
          )}

          <div className="pointer-events-none absolute bottom-1 right-2 text-[10px] text-slate-400 font-mono">
            X _____________________________
          </div>
        </div>
      )}
    </div>
  );
};

export default SignaturePad;
