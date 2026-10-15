import {useEffect, useLayoutEffect, useRef, useState} from 'react';
import {PcbSettings, PcbSide} from '../types/pcb';
import {PcbFrame, PcbFrames, PcbScenes} from '../types/pcbWorker';
import {PcbInputs, buildPcbScenes} from '../utils/pcbRenderer';
import {getPcbWorkerClient, closePcbFrames} from '../utils/pcbWorkerClient';
import {SupersededTaskError} from '../utils/latestTaskQueue';
import {PcbQuality} from '../utils/pcbProcessingCache';

export function usePcbBoards(inputs: PcbInputs, settings: PcbSettings, side: PcbSide, interacting: boolean) {
  const [scenes, setScenes] = useState<PcbScenes | null>(null);
  const [frames, setFrames] = useState<PcbFrames>({});
  const [sourceLoading, setSourceLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');
  const priority = useRef(side); priority.current = side;
  const generation = useRef(0);
  const ownedFrames = useRef(new Set<PcbFrame>());
  const currentFrames = useRef(frames);
  const previous = useRef<{scenes: PcbScenes; parameters: string} | null>(null);

  // Child canvas layout effects copy the bitmaps before old versions are closed.
  useLayoutEffect(() => {
    currentFrames.current = frames;
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
    buildPcbScenes(inputs, controller.signal).then(value => {
      if (!controller.signal.aborted) setScenes(value);
    }).catch(error => {
      if (!controller.signal.aborted) {
        setScenes(null); setProcessing(false);
        setError(error instanceof Error ? error.message : '无法加载 PCB 素材');
      }
    }).finally(() => { if (!controller.signal.aborted) setSourceLoading(false); });
    return () => controller.abort();
  }, [inputs.info, inputs.e1Opts, inputs.frontPhotoUrl, inputs.cutoutPhotoUrl, inputs.customIconUrl]);

  useEffect(() => {
    if (!scenes || sourceLoading) return;
    const version = ++generation.current;
    const parameters = JSON.stringify([settings.processingMode, settings.processingMode === 'color' ? settings.color : [settings.silkThreshold,settings.maskThreshold,settings.edgeExpansion,settings.smoothing,settings.overrides]]);
    const paletteOnly = previous.current?.scenes === scenes && previous.current.parameters === parameters;
    previous.current = {scenes, parameters};
    let client: ReturnType<typeof getPcbWorkerClient> | undefined;
    let refine: ReturnType<typeof setTimeout> | undefined;
    let active = true;
    setProcessing(true); setError('');
    const render = (quality: PcbQuality) => {
      try {
        client ||= getPcbWorkerClient();
        void client.preview({scenes, settings, side: priority.current, quality, onSide: (face, update) => {
          if (!active || version !== generation.current) { closePcbFrames(update); return; }
          for (const frame of Object.values(update)) ownedFrames.current.add(frame);
          setFrames(previous => ({...previous, [face]: update}));
        }}).then(() => {
          if (active && version === generation.current && quality === 'full') setProcessing(false);
        }).catch(error => {
          if (!(error instanceof SupersededTaskError) && active && version === generation.current) {
            setError(error instanceof Error ? error.message : 'PCB 分层处理失败'); setProcessing(false);
          }
        });
      } catch (error) {
        if (active) { setError(error instanceof Error ? error.message : '无法启动后台处理器'); setProcessing(false); }
      }
    };
    const scheduled = requestAnimationFrame(() => {
      if (interacting) render('draft');
      else if (paletteOnly || !currentFrames.current.front) render('full');
      else {
        render('draft');
        refine = setTimeout(() => render('full'), 100);
      }
    });
    return () => {
      active = false;
      cancelAnimationFrame(scheduled); clearTimeout(refine);
      client?.cancelPreview();
    };
    // Side changes select cached canvases without scheduling pixel work.
  }, [scenes, sourceLoading, settings, interacting]);

  return {scenes, frames, busy: sourceLoading || processing || interacting, error};
}
