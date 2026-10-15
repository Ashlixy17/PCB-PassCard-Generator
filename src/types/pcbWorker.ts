import {PcbSettings, PcbSide, PcbView} from './pcb';
import {PcbBoard, PcbScene, PcbSourceLayer, RasterPixels} from '../utils/pcbProcessing';
import {PcbQuality} from '../utils/pcbProcessingCache';

export type PcbScenes = Record<PcbSide, PcbScene>;
export interface PcbScenePatch extends Omit<PcbScene, 'layers' | 'boardMask' | 'board'> {
  boardMask?: Uint8Array;
  board?: PcbBoard | null;
  layers: (Omit<PcbSourceLayer, 'pixels'> & {pixels?: RasterPixels})[];
}
export interface PcbFrame {width: number; height: number; bitmap?: ImageBitmap; pixels?: Uint8ClampedArray; backend?: 'gpu' | 'cpu'}
export type PcbTextureView = PcbView | 'surface' | 'height';
export type PcbSideFrames = Partial<Record<PcbTextureView, PcbFrame>>;
export type PcbFrames = Partial<Record<PcbSide, PcbSideFrames>>;
export interface PcbExportPlan {sides: PcbSide[]; views: PcbView[]; outline: boolean}
export interface PcbExportImage {side: PcbSide; view: PcbView | 'outline'; blob?: Blob; raster?: RasterPixels}
export interface PcbWorkerJob {
  scenes: PcbScenes; settings: PcbSettings; side: PcbSide; quality: PcbQuality;
  plan?: PcbExportPlan;
  include3d?: boolean;
  onSide?: (side: PcbSide, frames: PcbSideFrames) => void;
}
export type PcbWorkerRequest = {type: 'cancel'; id: number} | {
  type: 'process'; id: number; kind: 'preview' | 'export'; scenes: Record<PcbSide, PcbScenePatch>;
  settings: PcbSettings; side: PcbSide; quality: PcbQuality; plan?: PcbExportPlan; include3d?: boolean;
};
export type PcbWorkerResponse =
  | {type: 'side'; id: number; side: PcbSide; frames: PcbSideFrames}
  | {type: 'done'; id: number; images?: PcbExportImage[]}
  | {type: 'error'; id: number; message: string};
