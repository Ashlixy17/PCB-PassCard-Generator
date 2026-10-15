import type {PcbSettings,PcbSide} from './pcb';
import type {PcbInputs} from '../utils/pcbRenderer';

export interface PcbModelSize {width:number;thickness:number}
export interface PcbProjectContext {
  inputs:PcbInputs;
  settings:PcbSettings;
  modelSize:PcbModelSize;
  rawFrontPhotoUrl?:string;
  rawCutoutPhotoUrl?:string;
}
export interface ImportedPcbProject extends PcbProjectContext {
  name:string;
  kind:'template'|'board';
  availableSides:PcbSide[];
  notice:string;
}
