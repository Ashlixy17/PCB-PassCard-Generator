export type PcbSide = 'front' | 'back';
export type PcbView = 'appearance' | 'silk' | 'copper' | 'mask';
export type PcbMaterialMode = 'auto' | 'silk' | 'gold' | 'copper' | 'mask' | 'fr4';

export interface PcbProcessingSettings {
  silkThreshold: number;
  maskThreshold: number;
  edgeExpansion: number;
  smoothing: number;
}

export interface PcbLayerSettings extends PcbProcessingSettings {
  enabled: boolean;
  mode: PcbMaterialMode;
  invert: boolean;
  darkInk: boolean;
  preserveDetails: boolean;
  detailThreshold: number;
  brightness: number;
  contrast: number;
}

export interface PcbSettings extends PcbProcessingSettings {
  maskColor: string;
  overrides: Record<string, Partial<PcbLayerSettings>>;
}

export const PCB_DEFAULTS: PcbSettings = {
  maskColor: '#174d7c',
  silkThreshold: 180,
  maskThreshold: 100,
  edgeExpansion: 0,
  smoothing: 0,
  overrides: {},
};

export const PCB_MASK_COLORS = [
  { name: '绿色', color: '#126d3a' },
  { name: '蓝色', color: '#174d7c' },
  { name: '紫色', color: '#643d82' },
  { name: '红色', color: '#962e38' },
  { name: '黄色', color: '#c19e37' },
  { name: '黑色', color: '#151a20' },
  { name: '白色', color: '#eeece0' },
] as const;

export const PCB_VIEW_LABELS: Record<PcbView, string> = {
  appearance: 'PCB 成品', silk: '丝印层', copper: '铜层', mask: '阻焊开窗',
};

const clamp = (value: unknown, fallback: number, min: number, max: number) =>
  typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;

export function normalizePcbSettings(value: unknown): PcbSettings {
  const input = value && typeof value === 'object' ? value as Partial<PcbSettings> : {};
  const overrides: PcbSettings['overrides'] = {};
  if (input.overrides && typeof input.overrides === 'object') {
    for (const [key, entry] of Object.entries(input.overrides)) {
      if (!/^(front|back):[A-Za-z]+$/.test(key) || !entry || typeof entry !== 'object') continue;
      const item: Partial<PcbLayerSettings> = {};
      for (const flag of ['enabled', 'invert', 'darkInk', 'preserveDetails'] as const) {
        if (typeof entry[flag] === 'boolean') item[flag] = entry[flag];
      }
      if (['auto','silk','gold','copper','mask','fr4'].includes(entry.mode)) item.mode = entry.mode;
      const limits = {silkThreshold:[0,255], maskThreshold:[0,255], edgeExpansion:[0,4], smoothing:[0,3], detailThreshold:[0,255], brightness:[-100,100], contrast:[25,250]} as const;
      for (const field of Object.keys(limits) as (keyof typeof limits)[]) {
        if (typeof entry[field] === 'number' && Number.isFinite(entry[field])) {
          item[field] = Math.min(limits[field][1], Math.max(limits[field][0], entry[field]));
        }
      }
      overrides[key] = item;
    }
  }
  return {
    maskColor: typeof input.maskColor === 'string' && /^#[\da-f]{6}$/i.test(input.maskColor) ? input.maskColor : PCB_DEFAULTS.maskColor,
    silkThreshold: clamp(input.silkThreshold, 180, 0, 255),
    maskThreshold: clamp(input.maskThreshold, 100, 0, 255),
    edgeExpansion: clamp(input.edgeExpansion, 0, 0, 4),
    smoothing: clamp(input.smoothing, 0, 0, 3),
    overrides,
  };
}
