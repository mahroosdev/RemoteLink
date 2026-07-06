import React, { useCallback, useEffect, useState } from 'react';
import { ImageOff, Maximize2, RotateCw, ScreenShare, SignalHigh, Smartphone, X } from 'lucide-react';
import { Card, StatusPill } from '../components/Common';

type ViewerSize = 'fit' | 'small' | 'medium' | 'large' | 'custom';

const viewerSizeOptions: Array<{ value: ViewerSize; label: string }> = [
  { value: 'fit', label: 'Fit' },
  { value: 'small', label: 'Small' },
  { value: 'medium', label: 'Medium' },
  { value: 'large', label: 'Large' },
  { value: 'custom', label: 'Custom' },
];

const previewHeightBySize: Record<Exclude<ViewerSize, 'custom'>, string> = {
  fit: 'clamp(340px, calc(100vh - 292px), 640px)',
  small: 'min(360px, calc(100vh - 292px))',
  medium: 'min(500px, calc(100vh - 292px))',
  large: 'min(640px, calc(100vh - 292px))',
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const clampZoom = (value: number) => clamp(value, 1, 4);
const zeroPan = { x: 0, y: 0 };

const MobileControlPageLive = ({ state, onAction }: any) => {
  const [viewerSize, setViewerSize] = useState<ViewerSize>('fit');
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState(zeroPan);
  const [customFrameHeight, setCustomFrameHeight] = useState(560);
  const [rotation, setRotation] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [viewerElement, setViewerElement] = useState<HTMLDivElement | null>(null);
  const [viewerBounds, setViewerBounds] = useState({ width: 0, height: 0 });
  const [dragStart, setDragStart] = useState<{
    pointerId: number;
    x: number;
    y: number;
    panX: number;
    panY: number;
  } | null>(null);
  const mobileStream = state.mobileScreenShare ?? {
    status: 'off',
    width: 0,
    height: 0,
    format: 'unknown',
    data: null,
    lastFrameAt: null,
  };
  const connectedDevice = state.connectedDevice;
  const hasFrame = Boolean(mobileStream.data);
  const imgSrc = hasFrame ? `data:image/${mobileStream.format};base64,${mobileStream.data}` : null;
  const frameWidth = Number(mobileStream.width) || 0;
  const frameHeight = Number(mobileStream.height) || 0;
  const isQuarterTurn = rotation % 180 !== 0;
  const isPortraitFrame = isQuarterTurn ? frameWidth >= frameHeight : frameHeight >= frameWidth;
  const previewHeight = viewerSize === 'custom'
    ? `min(${customFrameHeight}px, calc(100vh - 292px))`
    : previewHeightBySize[viewerSize];
  const selectedViewerSizeLabel = viewerSizeOptions.find((option) => option.value === viewerSize)?.label ?? 'Fit';
  const viewerSizeLabel = viewerSize === 'custom' ? `Custom ${customFrameHeight}px` : selectedViewerSizeLabel;
  const stopShareDisabled = !connectedDevice || mobileStream.status === 'stopping';
  const showStopShare = hasFrame || mobileStream.status === 'starting' || mobileStream.status === 'sharing' || mobileStream.status === 'stopping';

  const resetViewer = useCallback(() => {
    setZoom(1);
    setPan(zeroPan);
    setDragStart(null);
  }, []);

  const clampPanToViewer = useCallback((nextPan: { x: number; y: number }, nextZoom: number) => {
    if (nextZoom <= 1) return zeroPan;
    const bounds = viewerElement?.getBoundingClientRect();
    if (!bounds) return nextPan;
    return {
      x: clamp(nextPan.x, -(bounds.width * (nextZoom - 1)) / 2, (bounds.width * (nextZoom - 1)) / 2),
      y: clamp(nextPan.y, -(bounds.height * (nextZoom - 1)) / 2, (bounds.height * (nextZoom - 1)) / 2),
    };
  }, [viewerElement]);

  const handleWheel = useCallback((event: React.WheelEvent<HTMLDivElement>) => {
    if (!hasFrame) return;
    event.preventDefault();
    const zoomFactor = event.deltaY > 0 ? 0.9 : 1.1;
    setZoom((currentZoom) => {
      const nextZoom = clampZoom(currentZoom * zoomFactor);
      setPan((currentPan) => clampPanToViewer(currentPan, nextZoom));
      return nextZoom;
    });
  }, [clampPanToViewer, hasFrame]);

  const handlePointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (!hasFrame || zoom <= 1) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragStart({
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      panX: pan.x,
      panY: pan.y,
    });
  }, [hasFrame, pan.x, pan.y, zoom]);

  const handlePointerMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragStart || event.pointerId !== dragStart.pointerId) return;
    setPan(clampPanToViewer({
      x: dragStart.panX + event.clientX - dragStart.x,
      y: dragStart.panY + event.clientY - dragStart.y,
    }, zoom));
  }, [clampPanToViewer, dragStart, zoom]);

  const handlePointerEnd = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (dragStart && event.pointerId === dragStart.pointerId) {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      setDragStart(null);
    }
  }, [dragStart]);

  const rotateViewer = useCallback(() => {
    setRotation((currentRotation) => (currentRotation + 90) % 360);
    resetViewer();
  }, [resetViewer]);

  useEffect(() => {
    resetViewer();
  }, [customFrameHeight, frameWidth, frameHeight, mobileStream.status, resetViewer, rotation, viewerSize]);

  useEffect(() => {
    if (!hasFrame) resetViewer();
  }, [hasFrame, resetViewer]);

  useEffect(() => {
    if (!viewerElement) return;
    const updateBounds = () => {
      const bounds = viewerElement.getBoundingClientRect();
      setViewerBounds({ width: bounds.width, height: bounds.height });
    };
    updateBounds();
    const observer = new ResizeObserver(updateBounds);
    observer.observe(viewerElement);
    window.addEventListener('resize', updateBounds);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', updateBounds);
    };
  }, [viewerElement]);

  useEffect(() => {
    if (!isFullscreen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsFullscreen(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isFullscreen]);

  const statusLabel = (() => {
    switch (mobileStream.status) {
      case 'starting':
        return 'Starting';
      case 'sharing':
        return hasFrame ? 'Live' : 'Starting';
      case 'stopping':
        return 'Stopping';
      case 'stopped':
        return 'Stopped';
      case 'error':
        return 'Error';
      case 'off':
      default:
        return 'Off';
    }
  })();

  const imageFitLimits = {
    maxWidth: isQuarterTurn && viewerBounds.height > 0
      ? `${Math.max(120, viewerBounds.height - 36)}px`
      : '100%',
    maxHeight: isQuarterTurn && viewerBounds.width > 0
      ? `${Math.max(120, viewerBounds.width - 36)}px`
      : '100%',
  };

  const renderViewerControls = (fullscreen = false) => (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: '12px',
        flexWrap: 'wrap',
        marginBottom: fullscreen ? '12px' : '14px',
      }}
    >
      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
        {viewerSizeOptions.map((option) => {
          const isActive = viewerSize === option.value;
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={isActive}
              className="btn btn-secondary"
              onClick={() => setViewerSize(option.value)}
              style={{
                padding: '7px 11px',
                fontSize: '12px',
                background: isActive ? 'var(--bg-hover)' : 'transparent',
                borderColor: isActive ? 'var(--border-focus)' : 'var(--border-subtle)',
              }}
            >
              {option.label}
            </button>
          );
        })}
        {viewerSize === 'custom' && (
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              minWidth: '220px',
              color: 'var(--text-secondary)',
              fontSize: '12px',
              fontWeight: 600,
            }}
          >
            <span style={{ whiteSpace: 'nowrap' }}>{customFrameHeight}px</span>
            <input
              type="range"
              min={300}
              max={900}
              step={20}
              value={customFrameHeight}
              onChange={(event) => setCustomFrameHeight(Number(event.currentTarget.value))}
              style={{ width: '150px' }}
            />
          </label>
        )}
      </div>
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={rotateViewer}
          disabled={!hasFrame}
          style={{ padding: '7px 11px', fontSize: '12px' }}
        >
          <RotateCw size={14} />
          Rotate {rotation}°
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={resetViewer}
          disabled={!hasFrame && zoom === 1}
          style={{ padding: '7px 11px', fontSize: '12px' }}
        >
          Reset Fit
        </button>
        {fullscreen ? (
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => setIsFullscreen(false)}
            style={{ padding: '7px 11px', fontSize: '12px' }}
          >
            <X size={14} />
            Close
          </button>
        ) : (
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => setIsFullscreen(true)}
            style={{ padding: '7px 11px', fontSize: '12px' }}
          >
            <Maximize2 size={14} />
            Fullscreen
          </button>
        )}
      </div>
    </div>
  );

  const renderViewerSurface = (fullscreen = false) => (
    <div
      ref={setViewerElement}
      onWheel={handleWheel}
      onDoubleClick={resetViewer}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerEnd}
      onPointerCancel={handlePointerEnd}
      style={{
        background: 'var(--bg-sidebar)',
        borderRadius: fullscreen ? '14px' : '16px',
        border: '1px solid var(--border-subtle)',
        height: fullscreen ? 'calc(100vh - 142px)' : previewHeight,
        maxHeight: fullscreen ? 'none' : viewerSize === 'custom' ? 'min(900px, calc(100vh - 292px))' : '640px',
        minHeight: fullscreen ? '0' : '300px',
        padding: fullscreen ? '22px' : '18px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        boxSizing: 'border-box',
        touchAction: zoom > 1 ? 'none' : 'auto',
        cursor: hasFrame ? (zoom > 1 ? (dragStart ? 'grabbing' : 'grab') : 'zoom-in') : 'default',
        userSelect: 'none',
      }}
    >
      {hasFrame && imgSrc ? (
        <div
          style={{
            width: '100%',
            height: '100%',
            maxWidth: '100%',
            maxHeight: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom}) rotate(${rotation}deg)`,
            transformOrigin: 'center center',
            transition: dragStart ? 'none' : 'transform 120ms ease-out',
            willChange: 'transform',
          }}
        >
          <img
            draggable={false}
            src={imgSrc}
            alt="Live mobile screen"
            style={{
              width: 'auto',
              height: 'auto',
              maxWidth: imageFitLimits.maxWidth,
              maxHeight: imageFitLimits.maxHeight,
              objectFit: 'contain',
              display: 'block',
              boxSizing: 'border-box',
              padding: '6px',
              background: '#050607',
              border: '1px solid rgba(255, 255, 255, 0.14)',
              borderRadius: isPortraitFrame ? '24px' : '16px',
              boxShadow: '0 18px 48px rgba(0, 0, 0, 0.35)',
              userSelect: 'none',
            }}
          />
        </div>
      ) : (
        <div style={{ textAlign: 'center', padding: '32px', color: 'var(--text-muted)' }}>
          <ImageOff size={48} strokeWidth={1.4} style={{ marginBottom: '14px', opacity: 0.55 }} />
          <p style={{ margin: 0, fontSize: '15px', fontWeight: 500 }}>
            {mobileStream.status === 'sharing'
              ? 'Waiting for first phone frame'
              : mobileStream.status === 'starting'
              ? 'Waiting for Android capture consent'
              : 'Waiting for phone screen share'}
          </p>
          <p style={{ margin: '8px 0 0 0', fontSize: '13px' }}>
            Tap Start Mobile Screen Share on the mobile app to begin.
          </p>
        </div>
      )}
    </div>
  );

  return (
    <div className="grid">
      <div className="col-12" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ fontSize: '24px', fontWeight: 600 }}>Mobile Screen Stream</h2>
          <p className="text-muted">Live view of the paired Android phone screen.</p>
        </div>
        <StatusPill
          label={statusLabel.toUpperCase()}
          type={mobileStream.status === 'sharing' && hasFrame ? 'success' : mobileStream.status === 'error' ? 'error' : 'info'}
        />
      </div>

      <Card className="col-8" title="Phone Preview" icon={ScreenShare}>
        {!isFullscreen && (
          <>
            {renderViewerControls()}
            {renderViewerSurface()}
          </>
        )}
      </Card>

      <Card className="col-4" title="Stream Status" icon={SignalHigh}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <Fact label="Connected Device" value={connectedDevice?.name ?? 'None'} />
          <Fact label="Status" value={statusLabel} />
          <Fact label="Viewer" value={`${viewerSizeLabel} / ${Math.round(zoom * 100)}% / ${rotation}°`} />
          <Fact label="Resolution" value={mobileStream.width && mobileStream.height ? `${mobileStream.width} x ${mobileStream.height}` : '--'} />
          <Fact label="Last Frame" value={mobileStream.lastFrameAt ? new Date(mobileStream.lastFrameAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '--'} />
          {mobileStream.error && <p style={{ color: 'var(--accent-red)', margin: 0, fontSize: '12px' }}>{mobileStream.error}</p>}
          {showStopShare && (
            <button
              type="button"
              className="btn btn-danger"
              onClick={() => onAction('STOP_PHONE_SCREEN')}
              disabled={stopShareDisabled}
              style={{ justifyContent: 'center', width: '100%' }}
            >
              <X size={16} />
              {mobileStream.status === 'stopping' ? 'Stopping...' : 'Stop Phone Screen'}
            </button>
          )}
        </div>
      </Card>

      {isFullscreen && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 1000,
            background: 'rgba(0, 0, 0, 0.92)',
            padding: '24px',
            display: 'flex',
            flexDirection: 'column',
            boxSizing: 'border-box',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: '16px',
              marginBottom: '14px',
            }}
          >
            <div>
              <h2 style={{ fontSize: '18px', fontWeight: 600, margin: 0 }}>Phone Preview</h2>
              <p className="text-muted" style={{ margin: '4px 0 0 0' }}>
                {mobileStream.width && mobileStream.height ? `${mobileStream.width} x ${mobileStream.height}` : 'No frame'}
              </p>
            </div>
            <StatusPill
              label={statusLabel.toUpperCase()}
              type={mobileStream.status === 'sharing' && hasFrame ? 'success' : mobileStream.status === 'error' ? 'error' : 'info'}
            />
          </div>
          {renderViewerControls(true)}
          {renderViewerSurface(true)}
        </div>
      )}

      <Card className="col-12" title="Session Notes" icon={Smartphone}>
        <p className="text-muted" style={{ margin: 0, fontSize: '13px', lineHeight: 1.6 }}>
          This page is view-only. The phone captures its own screen after you allow screen capture on Android and sends
          it to this PC over your local connection.
        </p>
      </Card>
    </div>
  );
};

const Fact = ({ label, value }: { label: string; value: string }) => (
  <div style={{ padding: '14px 16px', background: 'var(--bg-sidebar)', borderRadius: '12px', border: '1px solid var(--border-subtle)' }}>
    <div className="text-muted" style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: '6px' }}>
      {label}
    </div>
    <div style={{ fontSize: '13px', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={value}>
      {value}
    </div>
  </div>
);

export default MobileControlPageLive;

