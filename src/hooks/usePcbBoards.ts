import {useEffect, useLayoutEffect, useRef, useState} from 'react';
import {PcbSettings, PcbSide} from '../types/pcb';
import {PcbFrame, PcbFrames, PcbScenes} from '../types/pcbWorker';
import {PcbInputs, buildPcbScenes} from '../utils/pcbRenderer';
import {getPcbWorkerClient, closePcbFrames} from '../utils/pcbWorkerClient';
import {SupersededTaskError} from '../utils/latestTaskQueue';

export function usePcbBoards(inputs: PcbInputs, settings: PcbSettings, side: PcbSide, interacting: boolean, include3d=false) {
  const [scenes, setScenes] = useState<PcbScenes | null>(null);
  const [frames, setFrames] = useState<PcbFrames>({});
  const [sourceLoading, setSourceLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');
  const priority = useRef(side); priority.current = side;
  const generation = useRef(0);
  const ownedFrames = useRef(new Set<PcbFrame>());

  // Child canvas layout effects copy the bitmaps before old versions are closed.
  useLayoutEffect(() => {
    const keep = new Set(Object.values(frames).flatMap(face => Object.values(face)));
    for (const frame of ownedFrames.current) if (!keep.has(frame)) {
      frame.bitmap?.close(); ownedFrames.current.delete(frame);
    }
  }, [frames]);
  useEffect(() => () => {
    for (const frame of ownedFrames.current) frame.bitmap?.close();
    ownedFrames.current.clear();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    generation.current++;
    setSourceLoading(true); setError('');
    buildPcbScenes({...inputs,backLogo:settings.backLogo}, controller.signal).then(value => {
      if (!controller.signal.aborted) setScenes(value);
    }).catch(error => {
      if (!controller.signal.aborted) {
        setScenes(null); setProcessing(false);
        setError(error instanceof Error ? error.message : '无法加载 PCB 素材');
      }
    }).finally(() => { if (!controller.signal.aborted) setSourceLoading(false); });
    return () => controller.abort();
  }, [inputs.info, inputs.e1Opts, inputs.frontPhotoUrl, inputs.cutoutPhotoUrl, inputs.customIconUrl,inputs.savedBoards,settings.backLogo]);

  useEffect(() => {
    if (!scenes || sourceLoading) return;
    const version = ++generation.current;
    let client: ReturnType<typeof getPcbWorkerClient> | undefined;
    let active = true;
    setProcessing(true); setError('');
    const render = () => {
      try {
        client ||= getPcbWorkerClient();
        void client.preview({scenes, settings, side: priority.current, quality:'full', include3d, onSide: (face, update) => {
          if (!active || version !== generation.current) { closePcbFrames(update); return; }
          for (const frame of Object.values(update)) ownedFrames.current.add(frame);
          setFrames(previous => ({...previous, [face]: update}));
        }}).then(() => {
          if (active && version === generation.current) setProcessing(false);
        }).catch(error => {
          if (!(error instanceof SupersededTaskError) && active && version === generation.current) {
            setError(error instanceof Error ? error.message : 'PCB 分层处理失败'); setProcessing(false);
          }
        });
      } catch (error) {
        if (active) { setError(error instanceof Error ? error.message : '无法启动后台处理器'); setProcessing(false); }
      }
    };
    // Coalesce input events to one request per animation frame without lowering
    // resolution. Worker/GPU caches reuse everything unaffected by the change.
    const scheduled = requestAnimationFrame(render);
    return () => {
      active = false;
      cancelAnimationFrame(scheduled);
      client?.cancelPreview();
    };
    // Side changes select cached canvases without scheduling pixel work.
  }, [scenes, sourceLoading, settings, include3d]);

  return {scenes, frames, busy: sourceLoading || processing || interacting, error};
}
