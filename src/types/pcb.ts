export type PcbSide = 'front' | 'back';
export type PcbProcessingMode = 'gray' | 'color';
export type PcbFinish = 'enig' | 'hasl' | 'osp';
export type PcbView = 'appearance' | 'silk' | 'copper' | 'mask' | 'metal' | 'coveredCopper' | 'substrate';
export type PcbMaterialMode = 'auto' | 'silk' | 'gold' | 'copper' | 'mask' | 'fr4';

export interface PcbBackLogoLayout {x: number; y: number; scale: number}
export const PCB_BACK_LOGO_DEFAULTS: PcbBackLogoLayout = {x: 50, y: 50, scale: 1};

export interface PcbProcessingSettings {
  silkThreshold: number;
  maskThreshold: number;
  edgeExpansion: number;
  smoothing: number;
}

export interface PcbColorProcessingSettings extends Omit<PcbProcessingSettings, 'maskThreshold'> {
  finish: PcbFinish;
  metalHue: number;
  hueTolerance: number;
  saturationThreshold: number;
  metalBrightness: number;
  silverThreshold: number;
  copperThreshold: number;
  bareEnabled: boolean;
  bareMethod: 'color' | 'gray';
  bareColor: string;
  bareSimilarity: number;
  bareGrayMin: number;
  bareGrayMax: number;
}

export interface PcbLayerSettings extends PcbProcessingSettings, PcbColorProcessingSettings {
  processingMode: PcbProcessingMode;
  maskIsLight: boolean;
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
  processingMode: PcbProcessingMode;
  maskColor: string;
  backLogo: PcbBackLogoLayout;
  overrides: Record<string, Partial<PcbLayerSettings>>;
  color: PcbColorProcessingSettings & {overrides: Record<string, Partial<PcbLayerSettings>>};
}

export const PCB_COLOR_DEFAULTS: PcbSettings['color'] = {
  finish: 'enig', metalHue: 45, hueTolerance: 25, saturationThreshold: 20,
  metalBrightness: 70, silverThreshold: 180, silkThreshold: 200, copperThreshold: 100,
  edgeExpansion: 0, smoothing: 0, bareEnabled: false, bareMethod: 'color',
  bareColor: '#af9d68', bareSimilarity: 90, bareGrayMin: 80, bareGrayMax: 130, overrides: {},
};

export const PCB_DEFAULTS: PcbSettings = {
  processingMode: 'gray',
  maskColor: '#174d7c',
  backLogo: PCB_BACK_LOGO_DEFAULTS,
  silkThreshold: 180,
  maskThreshold: 100,
  edgeExpansion: 0,
  smoothing: 0,
  overrides: {},
  color: PCB_COLOR_DEFAULTS,
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
  metal: '沉金层', coveredCopper: '阻焊下覆铜', substrate: '裸基材层',
};

export const PCB_FINISH_LABELS: Record<PcbFinish, string> = {enig: '沉金 · ENIG', hasl: '喷锡 · HASL', osp: 'OSP · 有机保焊'};
export const getPcbModeLabel = (settings: PcbSettings) => settings.processingMode === 'color' ? '彩色识别分层' : '纯灰度三分分层';
export const getPcbViews = (settings: PcbSettings): PcbView[] => settings.processingMode === 'color'
  ? ['appearance', 'silk', 'metal', 'coveredCopper', 'substrate', 'copper', 'mask']
  : ['appearance', 'silk', 'copper', 'mask'];
export const getPcbViewLabel = (view: PcbView, settings: PcbSettings) => view === 'metal'
  ? ({enig: '沉金层', hasl: '喷锡层', osp: 'OSP 裸铜层'}[settings.color.finish]) : PCB_VIEW_LABELS[view];
export const getPcbOverrides = (settings: PcbSettings) => settings.processingMode === 'color' ? settings.color.overrides : settings.overrides;
export const getPcbParameters = (settings: PcbSettings) => settings.processingMode === 'color' ? settings.color : settings;

/** Keep the two processes' globals and per-object overrides independent. */
export function patchPcbSettings(settings: PcbSettings, patch: Partial<PcbLayerSettings>, key?: string): PcbSettings {
  if (settings.processingMode === 'color') {
    const color = key ? {...settings.color, overrides: {...settings.color.overrides, [key]: {...settings.color.overrides[key], ...patch}}} : {...settings.color, ...patch};
    return {...settings, color};
  }
  return key ? {...settings, overrides: {...settings.overrides, [key]: {...settings.overrides[key], ...patch}}} : {...settings, ...patch};
}

export function resetPcbParameters(settings: PcbSettings, key?: string): PcbSettings {
  const overrides = {...getPcbOverrides(settings)};
  if (key) delete overrides[key];
  if (settings.processingMode === 'color') return {...settings, color: key ? {...settings.color, overrides} : {...PCB_COLOR_DEFAULTS, overrides}};
  return key ? {...settings, overrides} : {...settings, silkThreshold: 180, maskThreshold: 100, edgeExpansion: 0, smoothing: 0};
}

const clamp = (value: unknown, fallback: number, min: number, max: number) =>
  typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;

const validColor = (value: unknown): value is string => typeof value === 'string' && /^#[\da-f]{6}$/i.test(value);
const limits = {silkThreshold:[0,255], maskThreshold:[0,255], edgeExpansion:[0,4], smoothing:[0,3], detailThreshold:[0,255], brightness:[-100,100], contrast:[25,250], metalHue:[0,359], hueTolerance:[0,90], saturationThreshold:[0,100], metalBrightness:[0,255], silverThreshold:[0,255], copperThreshold:[0,255], bareSimilarity:[0,100], bareGrayMin:[0,255], bareGrayMax:[0,255]} as const;

function normalizeOverrides(input: unknown): PcbSettings['overrides'] {
  const overrides: PcbSettings['overrides'] = {};
  if (input && typeof input === 'object') {
    for (const [key, entry] of Object.entries(input)) {
      if (!/^(front|back):[A-Za-z]+$/.test(key) || !entry || typeof entry !== 'object') continue;
      const item: Partial<PcbLayerSettings> = {};
      for (const flag of ['enabled', 'invert', 'darkInk', 'preserveDetails', 'bareEnabled'] as const) {
        if (typeof entry[flag] === 'boolean') item[flag] = entry[flag];
      }
      if (['auto','silk','gold','copper','mask','fr4'].includes(entry.mode)) item.mode = entry.mode;
      if (entry.bareMethod === 'gray' || entry.bareMethod === 'color') item.bareMethod = entry.bareMethod;
      if (validColor(entry.bareColor)) item.bareColor = entry.bareColor;
      for (const field of Object.keys(limits) as (keyof typeof limits)[]) {
        if (typeof entry[field] === 'number' && Number.isFinite(entry[field])) {
          item[field] = Math.min(limits[field][1], Math.max(limits[field][0], entry[field]));
        }
      }
      overrides[key] = item;
    }
  }
  return overrides;
}

export function normalizePcbSettings(value: unknown): PcbSettings {
  const input = value && typeof value === 'object' ? value as Partial<PcbSettings> : {};
  const savedBack = input.backLogo && typeof input.backLogo === 'object' ? input.backLogo : {} as Partial<PcbBackLogoLayout>;
  const savedColor = input.color && typeof input.color === 'object' ? input.color : {} as Partial<PcbSettings['color']>;
  const color = {...PCB_COLOR_DEFAULTS, overrides: normalizeOverrides(savedColor.overrides)};
  for (const field of Object.keys(PCB_COLOR_DEFAULTS) as (keyof typeof PCB_COLOR_DEFAULTS)[]) {
    if (field in limits) {
      const [min, max] = limits[field as keyof typeof limits];
      (color as unknown as Record<string, unknown>)[field] = clamp(savedColor[field], PCB_COLOR_DEFAULTS[field] as number, min, max);
    }
  }
  if (['enig','hasl','osp'].includes(savedColor.finish)) color.finish = savedColor.finish;
  if (typeof savedColor.bareEnabled === 'boolean') color.bareEnabled = savedColor.bareEnabled;
  if (savedColor.bareMethod === 'color' || savedColor.bareMethod === 'gray') color.bareMethod = savedColor.bareMethod;
  if (validColor(savedColor.bareColor)) color.bareColor = savedColor.bareColor;
  return {
    processingMode: input.processingMode === 'color' ? 'color' : 'gray',
    maskColor: validColor(input.maskColor) ? input.maskColor : PCB_DEFAULTS.maskColor,
    backLogo: {x: clamp(savedBack.x,50,0,100), y: clamp(savedBack.y,50,0,100), scale: clamp(savedBack.scale,1,.1,2)},
    silkThreshold: clamp(input.silkThreshold, 180, 0, 255),
    maskThreshold: clamp(input.maskThreshold, 100, 0, 255),
    edgeExpansion: clamp(input.edgeExpansion, 0, 0, 4),
    smoothing: clamp(input.smoothing, 0, 0, 3),
    overrides: normalizeOverrides(input.overrides), color,
  };
}
