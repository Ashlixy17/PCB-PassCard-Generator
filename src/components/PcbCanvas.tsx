import {useLayoutEffect, useRef} from 'react';
import {PcbSide, PcbView} from '../types/pcb';
import {PcbFrame, PcbFrames} from '../types/pcbWorker';
import {PcbSourceLayer} from '../utils/pcbProcessing';

function FaceCanvas({frame, side, view, visible}: {key?: string; frame?: PcbFrame; side: PcbSide; view: PcbView; visible: boolean}) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  useLayoutEffect(() => {
    const canvas = ref.current;
    if (!canvas || !frame) return;
    canvas.width = frame.width; canvas.height = frame.height;
    const ctx = canvas.getContext('2d');
    if (frame.bitmap) ctx?.drawImage(frame.bitmap, 0, 0);
    else if (frame.pixels) ctx?.putImageData(new ImageData(frame.pixels, frame.width, frame.height), 0, 0);
  }, [frame]);
  return <canvas ref={ref} width={590} height={1180} hidden={!visible} aria-label={`${side === 'back' ? 'PCB 背面' : 'PCB 正面'}${view === 'appearance' ? '效果图' : '分层图'}`} data-testid={`pcb-canvas-${side}`} data-quality={frame?.width === 590 ? 'full' : frame ? 'draft' : 'loading'} data-backend={frame?.backend}/>;
}

export function PcbCanvas({frames, side, view = 'appearance', selection, large = false}: {frames: PcbFrames; side: PcbSide; view?: PcbView; selection?: PcbSourceLayer; large?: boolean}) {
  return <div className={`pcb-board-art ${large ? 'pcb-board-art-large' : ''}`}>
    {/* Both faces stay mounted. Changing side is a visibility update only. */}
    {(['front', 'back'] as const).map(face => <FaceCanvas key={face} side={face} view={view} frame={frames[face]?.[view]} visible={side === face}/>)}
    {selection && <div className="pcb-source-highlight" aria-hidden="true" style={{left: `${selection.x / 590 * 100}%`, top: `${selection.y / 1180 * 100}%`, width: `${selection.pixels.width / 590 * 100}%`, height: `${selection.pixels.height / 1180 * 100}%`}}/>}
  </div>;
}
