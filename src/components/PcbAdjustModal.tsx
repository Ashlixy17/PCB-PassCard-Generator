import {useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {ArrowLeft,Download,RotateCcw,SlidersHorizontal} from 'lucide-react';
import {E1Options} from '../types';
import {PcbSettings,PcbLayerSettings,PcbSide,PcbView,PCB_DEFAULTS,PCB_VIEW_LABELS} from '../types/pcb';
import {PcbScene,getPcbLayerSettings,pcbLayerKey} from '../utils/pcbProcessing';
import {PcbFrames} from '../types/pcbWorker';
import {PcbCanvas} from './PcbCanvas';
import {PcbColorPicker} from './PcbColorPicker';

interface Props {
  open:boolean;onClose:()=>void;side:PcbSide;onSideChange:(side:PcbSide)=>void;
  settings:PcbSettings;onChange:(settings:PcbSettings)=>void;
  scenes:Record<PcbSide,PcbScene>|null;frames:PcbFrames;
  e1Opts:E1Options;onE1OptsChange:(value:E1Options)=>void;
  focusLayer?:string;busy:boolean;interacting:boolean;onInteractionChange:(active:boolean)=>void;
  onDownload:(view:PcbView)=>Promise<void>;error?:string;
}

const processingFields=[
  {key:'silkThreshold',label:'丝印层阈值',min:0,max:255,step:1},
  {key:'maskThreshold',label:'阻焊开窗阈值',min:0,max:255,step:1},
  {key:'edgeExpansion',label:'边缘线条加粗',min:0,max:4,step:1,unit:' px'},
  {key:'smoothing',label:'抗锯齿平滑度',min:0,max:3,step:1},
] as const;

function Range({label,value,min,max,step=1,unit='',onChange,disabled=false}:{key?:string;label:string;value:number;min:number;max:number;step?:number;unit?:string;onChange:(value:number)=>void;disabled?:boolean}) {
  return <label className={`pcb-range ${disabled?'pcb-control-disabled':''}`}>
    <span>{label}<output>{value}{unit}</output></span>
    <input aria-label={label} type="range" min={min} max={max} step={step} value={value} disabled={disabled} onChange={event=>onChange(Number(event.target.value))}/>
  </label>;
}

export function PcbAdjustModal(props:Props) {
  const {open,onClose,side,onSideChange,settings,onChange,scenes,frames,e1Opts,onE1OptsChange,busy}=props;
  const [selected,setSelected]=useState('global');
  const [view,setView]=useState<PcbView>('appearance');
  const dialog=useRef<HTMLDivElement|null>(null);
  useEffect(()=>{
    if(!open)return;
    setSelected(props.focusLayer||'global');setView('appearance');
    const overflow=document.body.style.overflow;document.body.style.overflow='hidden';
    return()=>{document.body.style.overflow=overflow;};
  },[open,props.focusLayer]);
  useEffect(()=>{if(selected!=='global'&&scenes&&!scenes[side].layers.some(layer=>layer.id===selected))setSelected('global');},[side,scenes,selected]);
  useEffect(()=>{
    if(!open)return;
    const finish=()=>props.onInteractionChange(false);
    document.addEventListener('pointerup',finish,true);
    document.addEventListener('pointercancel',finish,true);
    document.addEventListener('keyup',finish,true);
    window.addEventListener('blur',finish);
    return()=>{
      document.removeEventListener('pointerup',finish,true);
      document.removeEventListener('pointercancel',finish,true);
      document.removeEventListener('keyup',finish,true);
      window.removeEventListener('blur',finish);
    };
  },[open,props.onInteractionChange]);
  if(!open)return null;
  const scene=scenes?.[side];
  const layer=scene?.layers.find(item=>item.id===selected);
  const values=layer?getPcbLayerSettings(settings,side,layer):settings;
  const update=(patch:Partial<PcbLayerSettings>)=>{
    if(!layer){onChange({...settings,...patch});return;}
    const key=pcbLayerKey(side,layer.id);
    onChange({...settings,overrides:{...settings.overrides,[key]:{...settings.overrides[key],...patch}}});
  };
  const reset=()=>{
    if(!layer){onChange({...settings,silkThreshold:PCB_DEFAULTS.silkThreshold,maskThreshold:PCB_DEFAULTS.maskThreshold,edgeExpansion:0,smoothing:0});return;}
    const overrides={...settings.overrides};delete overrides[pcbLayerKey(side,layer.id)];onChange({...settings,overrides});
  };
  const local=layer?values as PcbLayerSettings:null;
  return createPortal(<div className="passcard-app pcb-adjust-overlay">
    <div ref={dialog} className="pcb-adjust-dialog" role="dialog" aria-modal="true" aria-labelledby="pcb-adjust-title"
    onPointerDownCapture={event=>{if(event.target instanceof HTMLInputElement&&event.target.type==='range')props.onInteractionChange(true);}}
    onKeyDownCapture={event=>{if(event.target instanceof HTMLInputElement&&event.target.type==='range'&&['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End','PageUp','PageDown'].includes(event.key))props.onInteractionChange(true);}}
    onKeyDown={event=>{
      if(event.key==='Escape')onClose();
      if(event.key==='Tab'){
        const controls=(Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),summary')||[]) as HTMLElement[]).filter(item=>item.offsetParent!==null);
        const first=controls[0],last=controls[controls.length-1];
        if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}
        if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
      }
    }}>
      <header className="pcb-adjust-header">
        <div><h2 id="pcb-adjust-title"><SlidersHorizontal size={18}/>PCB 详细调整</h2><p>按素材单独调整，保留图标内部结构。</p></div>
        <button type="button" className="pcg-primary" onClick={onClose} autoFocus><ArrowLeft size={16}/>完成调整</button>
      </header>
      <div className="pcb-adjust-layout">
        <aside className="pcb-adjust-controls">
          <label className="pcb-field">调整对象
            <select aria-label="调整对象" value={selected} onChange={event=>setSelected(event.target.value)}>
              <option value="global">全局参数</option>
              {scene?.layers.map(item=><option key={item.id} value={item.id}>{item.label}</option>)}
            </select>
          </label>
          <details open className="pcb-settings-section"><summary>基础参数：{layer?.label||'全局'}</summary>
            <div className="pcb-settings-body">
              <PcbColorPicker color={settings.maskColor} context="details" onChange={maskColor=>onChange({...settings,maskColor})}/>
              {local&&<>
                <label className="pcb-checkbox"><input type="checkbox" checked={local.enabled} onChange={event=>update({enabled:event.target.checked})}/>显示这个素材</label>
                <label className="pcb-field">材料分配
                  <select aria-label="材料分配" value={local.mode} onChange={event=>update({mode:event.target.value as PcbLayerSettings['mode']})}>
                    <option value="auto">自动分色</option><option value="silk">丝印</option><option value="gold">沉金（铜＋开窗）</option><option value="copper">阻焊下覆铜</option><option value="mask">阻焊底色</option><option value="fr4">裸基材开窗</option>
                  </select>
                </label>
              </>}
              {processingFields.map(field=><Range key={field.key} label={field.label} value={values[field.key]} min={field.min} max={field.max} step={field.step} unit={'unit' in field?field.unit:''} disabled={!!local&&local.mode!=='auto'&&(field.key==='silkThreshold'||field.key==='maskThreshold')} onChange={value=>update({[field.key]:value})}/>)}
              <p className="pcb-help">丝印和开窗阈值用于自动分色。加粗和平滑按原图像素调整。</p>
            </div>
          </details>
          {local&&<details open className="pcb-settings-section"><summary>原图与内部细节</summary>
            <div className="pcb-settings-body">
              <Range label="亮度" value={local.brightness} min={-100} max={100} onChange={brightness=>update({brightness})}/>
              <Range label="对比度" value={local.contrast} min={25} max={250} unit="%" onChange={contrast=>update({contrast})}/>
              <label className="pcb-checkbox"><input type="checkbox" checked={local.invert} onChange={event=>update({invert:event.target.checked})}/>反相明暗</label>
              <label className="pcb-checkbox"><input type="checkbox" checked={local.darkInk} onChange={event=>update({darkInk:event.target.checked})}/>原图深色作为主体</label>
              <label className="pcb-checkbox"><input type="checkbox" checked={local.preserveDetails} onChange={event=>update({preserveDetails:event.target.checked})}/>保留内部结构留空</label>
              {local.preserveDetails&&<Range label="内部细节阈值" value={local.detailThreshold} min={0} max={255} onChange={detailThreshold=>update({detailThreshold})}/>}
              <p className="pcb-help">指定丝印或沉金时，内部细节阈值决定哪些原始明暗纹理留空。</p>
            </div>
          </details>}
          {selected==='faction'&&<details open className="pcb-settings-section"><summary>标志位置与尺寸</summary>
            <div className="pcb-settings-body">
              <Range label="水平偏移" value={e1Opts.iconX} min={-150} max={150} unit=" px" onChange={iconX=>onE1OptsChange({...e1Opts,iconX})}/>
              <Range label="垂直偏移" value={e1Opts.iconY} min={-150} max={150} unit=" px" onChange={iconY=>onE1OptsChange({...e1Opts,iconY})}/>
              <Range label="标志缩放" value={Math.round(e1Opts.iconScale*100)} min={30} max={250} unit="%" onChange={value=>onE1OptsChange({...e1Opts,iconScale:value/100})}/>
            </div>
          </details>}
          <details open className="pcb-settings-section"><summary>图纸操作</summary><div className="pcb-settings-body pcb-adjust-actions">
            <button type="button" onClick={reset}><RotateCcw size={15}/>重置{layer?'这个素材':'全局参数'}</button>
            <button type="button" disabled={!scene||busy} onClick={()=>void props.onDownload(view)}><Download size={15}/>下载当前视图</button>
          </div></details>
        </aside>
        <section className="pcb-adjust-preview">
          <div className="pcb-preview-toolbar">
            <div className="mode-switch mode-switch-preview" role="group" aria-label="详细调整正反面">
              <button type="button" className={side==='front'?'active':''} aria-pressed={side==='front'} onClick={()=>onSideChange('front')}>PCB 正面</button>
              <button type="button" className={side==='back'?'active':''} aria-pressed={side==='back'} onClick={()=>onSideChange('back')}>PCB 背面</button>
            </div>
            <label className="pcb-view-control">查看图层<select aria-label="查看图层" value={view} onChange={event=>setView(event.target.value as PcbView)}>{Object.entries(PCB_VIEW_LABELS).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>
          </div>
          <div className="pcb-adjust-board"><PcbCanvas frames={frames} side={side} view={view} selection={layer} large/>
            {busy&&<div className={`pcb-render-status ${frames[side]?'pcb-render-progress':''}`} role="status">{props.interacting?'调整中，松手后细化…':'正在更新 PCB 预览…'}</div>}
          </div>
          {props.error&&<p className="pcb-error" role="alert">{props.error}</p>}
          <p className="pcb-help">蓝色框标出当前素材范围。单层视图中，亮色区域表示有效图形；开窗表示去除阻焊。</p>
        </section>
      </div>
    </div>
  </div>,document.body);
}
