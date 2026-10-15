import {lazy,Suspense,useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {ArrowLeft,Download,RotateCcw,SlidersHorizontal,Loader2} from 'lucide-react';
import {E1Options} from '../types';
import {PcbSettings,PcbLayerSettings,PcbSide,PcbView,PcbFinish,PCB_FINISH_LABELS,PCB_COLOR_DEFAULTS,PCB_BACK_LOGO_DEFAULTS,getPcbViews,getPcbViewLabel,getPcbModeLabel,getPcbParameters,patchPcbSettings,resetPcbParameters} from '../types/pcb';
import {PcbScene,getPcbLayerSettings,pcbLayerKey} from '../utils/pcbProcessing';
import {PcbFrames} from '../types/pcbWorker';
import {PcbCanvas} from './PcbCanvas';
import {PcbColorPicker} from './PcbColorPicker';
import {PcbModeSwitch} from './PcbModeSwitch';

interface Props {
  open:boolean;onClose:()=>void;side:PcbSide;onSideChange:(side:PcbSide)=>void;
  settings:PcbSettings;onChange:(settings:PcbSettings)=>void;
  scenes:Record<PcbSide,PcbScene>|null;frames:PcbFrames;
  e1Opts:E1Options;onE1OptsChange:(value:E1Options)=>void;
  focusLayer?:string;busy:boolean;interacting:boolean;onInteractionChange:(active:boolean)=>void;
  onDownload:(view:PcbView)=>Promise<void>;error?:string;
  displayMode:'2d'|'3d';onDisplayModeChange:(mode:'2d'|'3d')=>void;
  faceRequest:number;widthMm:number;thicknessMm:number;onSizeChange:(width:number,thickness:number)=>void;
}

const PcbPreview3D=lazy(()=>import('./PcbPreview3D'));

const processingFields=[
  {key:'silkThreshold',label:'丝印层阈值',min:0,max:255,step:1},
  {key:'maskThreshold',label:'阻焊开窗阈值',min:0,max:255,step:1},
  {key:'edgeExpansion',label:'边缘线条加粗',min:0,max:4,step:1,unit:' px'},
  {key:'smoothing',label:'抗锯齿平滑度',min:0,max:3,step:1},
] as const;
const colorFields=[
  {key:'metalHue',label:'金属目标色相',min:0,max:359,unit:'°'},
  {key:'hueTolerance',label:'金属色相容差',min:0,max:90,unit:'°'},
  {key:'saturationThreshold',label:'金属最低饱和度',min:0,max:100,unit:'%'},
  {key:'metalBrightness',label:'金属最低亮度',min:0,max:255},
  {key:'silverThreshold',label:'银色亮度阈值',min:0,max:255},
  {key:'silkThreshold',label:'彩色识别丝印阈值',min:0,max:255},
  {key:'copperThreshold',label:'阻焊下覆铜阈值',min:0,max:255},
  {key:'edgeExpansion',label:'边缘线条加粗',min:0,max:4,unit:' px'},
  {key:'smoothing',label:'抗锯齿平滑度',min:0,max:3},
] as const;

function Range({label,value,min,max,step=1,unit='',onChange,disabled=false}:{key?:string;label:string;value:number;min:number;max:number;step?:number;unit?:string;onChange:(value:number)=>void;disabled?:boolean}) {
  return <label className={`pcb-range ${disabled?'pcb-control-disabled':''}`}>
    <span>{label}<output>{value}{unit}</output></span>
    <input aria-label={label} type="range" min={min} max={max} step={step} value={value} disabled={disabled} onChange={event=>onChange(Number(event.target.value))}/>
  </label>;
}

export function PcbAdjustModal(props:Props) {
  const {open,onClose,side,onSideChange,settings,onChange,scenes,frames,e1Opts,onE1OptsChange,busy}=props;
  const [selectedBySide,setSelectedBySide]=useState<Record<PcbSide,string>>({front:'global',back:'faction'});
  const selected=selectedBySide[side];
  const setSelected=(value:string)=>setSelectedBySide(previous=>({...previous,[side]:value}));
  const [view,setView]=useState<PcbView>('appearance');
  const dialog=useRef<HTMLDivElement|null>(null);
  useEffect(()=>setView('appearance'),[settings.processingMode]);
  useEffect(()=>{
    if(!open)return;
    setSelected(props.focusLayer||(side==='back'?'faction':'global'));setView('appearance');
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
  const colorMode=settings.processingMode==='color';
  const values=(layer?getPcbLayerSettings(settings,side,layer):{...PCB_COLOR_DEFAULTS,...getPcbParameters(settings)}) as PcbLayerSettings;
  const update=(patch:Partial<PcbLayerSettings>)=>{
    onChange(patchPcbSettings(settings,patch,layer?pcbLayerKey(side,layer.id):undefined));
  };
  const reset=()=>{
    onChange(resetPcbParameters(settings,layer?pcbLayerKey(side,layer.id):undefined));
  };
  const local=layer?values as PcbLayerSettings:null;
  return createPortal(<div className="passcard-app pcb-adjust-overlay">
    <div ref={dialog} className="pcb-adjust-dialog" role="dialog" aria-modal="true" aria-labelledby="pcb-adjust-title"
    onPointerDownCapture={event=>{if(event.target instanceof HTMLInputElement&&event.target.type==='range')props.onInteractionChange(true);}}
    onKeyDownCapture={event=>{if(event.target instanceof HTMLInputElement&&event.target.type==='range'&&['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End','PageUp','PageDown'].includes(event.key))props.onInteractionChange(true);}}
    onKeyDown={event=>{
      if(event.key==='Escape')onClose();
      if(event.key==='Tab'){
        const controls=(Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),summary,[tabindex="0"]')||[]) as HTMLElement[]).filter(item=>item.offsetParent!==null);
        const first=controls[0],last=controls[controls.length-1];
        if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}
        if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
      }
    }}>
      <header className="pcb-adjust-header">
        <div><h2 id="pcb-adjust-title"><SlidersHorizontal size={18}/>PCB 详细调整 · {side==='back'?'背面':'正面'}</h2><p>{getPcbModeLabel(settings)} · 素材参数按正反面分别保存</p></div>
        <button type="button" className="pcg-primary" onClick={onClose} autoFocus><ArrowLeft size={16}/>完成调整</button>
      </header>
      <div className="pcb-adjust-layout">
        <aside className="pcb-adjust-controls">
          <div className="mode-switch mode-switch-preview pcb-adjust-side-switch" role="group" aria-label="调整版面">
            <button type="button" className={side==='front'?'active':''} aria-pressed={side==='front'} onClick={()=>{props.onInteractionChange(false);onSideChange('front');}}>正面调整</button>
            <button type="button" className={side==='back'?'active':''} aria-pressed={side==='back'} onClick={()=>{props.onInteractionChange(false);onSideChange('back');}}>背面调整</button>
          </div>
          <PcbModeSwitch mode={settings.processingMode} onChange={processingMode=>{props.onInteractionChange(false);onChange({...settings,processingMode});}}/>
          <label className="pcb-field">调整对象
            <select aria-label="调整对象" value={selected} onChange={event=>setSelected(event.target.value)}>
              <option value="global">全局参数</option>
              {scene?.layers.map(item=><option key={item.id} value={item.id}>{item.label}</option>)}
            </select>
          </label>
          {side==='back'&&selected==='faction'&&<details open className="pcb-settings-section"><summary>背面 Logo 位置与尺寸</summary>
            <div className="pcb-settings-body">
              <Range label="背面水平位置" value={settings.backLogo.x} min={0} max={100} unit="%" onChange={x=>onChange({...settings,backLogo:{...settings.backLogo,x}})}/>
              <Range label="背面垂直位置" value={settings.backLogo.y} min={0} max={100} unit="%" onChange={y=>onChange({...settings,backLogo:{...settings.backLogo,y}})}/>
              <Range label="背面 Logo 缩放" value={Math.round(settings.backLogo.scale*100)} min={10} max={200} unit="%" onChange={value=>onChange({...settings,backLogo:{...settings.backLogo,scale:value/100}})}/>
              <button type="button" onClick={()=>onChange({...settings,backLogo:{...PCB_BACK_LOGO_DEFAULTS}})}>恢复背面居中</button>
              <p className="pcb-help">位置以 Logo 中心为准，50%／50% 表示板面正中央。背面布局独立保存。</p>
            </div>
          </details>}
          <details open className="pcb-settings-section"><summary>{colorMode?'彩色识别参数':'纯灰度三分参数'}：{layer?.label||'全局'}</summary>
            <div className="pcb-settings-body">
              <PcbColorPicker color={settings.maskColor} context="details" onChange={maskColor=>onChange({...settings,maskColor})}/>
              {colorMode&&<label className="pcb-field">表面处理工艺<select aria-label="表面处理工艺" value={settings.color.finish} onChange={event=>onChange({...settings,color:{...settings.color,finish:event.target.value as PcbFinish,metalHue:event.target.value==='osp'?15:45}})}>{Object.entries(PCB_FINISH_LABELS).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>}
              {local&&<>
                <label className="pcb-checkbox"><input type="checkbox" checked={local.enabled} onChange={event=>update({enabled:event.target.checked})}/>显示这个素材</label>
                <label className="pcb-field">材料分配
                  <select aria-label="材料分配" value={local.mode} onChange={event=>update({mode:event.target.value as PcbLayerSettings['mode']})}>
                    <option value="auto">{colorMode?'按颜色自动识别':'按灰度自动三分'}</option><option value="silk">丝印</option><option value="gold">{colorMode?getPcbViewLabel('metal',settings):'沉金'}（铜＋开窗）</option><option value="copper">阻焊下覆铜</option><option value="mask">阻焊底色</option><option value="fr4">裸基材开窗</option>
                  </select>
                </label>
              </>}
              {(colorMode?colorFields.filter(field=>settings.color.finish==='hasl'? !['metalHue','hueTolerance','saturationThreshold','metalBrightness'].includes(field.key):field.key!=='silverThreshold'):processingFields).map(field=><Range key={field.key} label={field.label} value={values[field.key]} min={field.min} max={field.max} unit={'unit' in field?field.unit:''} disabled={!!local&&local.mode!=='auto'&&field.key!=='edgeExpansion'&&field.key!=='smoothing'} onChange={value=>update({[field.key]:value})}/>)}
              <p className="pcb-help">{colorMode?'先识别金属颜色，再按明暗区分丝印、阻焊下覆铜和阻焊底色。':'按灰度阈值区分丝印、沉金与阻焊底色。'}加粗和平滑按原图像素调整。</p>
            </div>
          </details>
          {colorMode&&(!local||local.mode==='auto')&&<details open className="pcb-settings-section"><summary>裸基材识别</summary><div className="pcb-settings-body">
            <label className="pcb-checkbox"><input type="checkbox" checked={values.bareEnabled} onChange={event=>update({bareEnabled:event.target.checked})}/>启用裸基材开窗</label>
            {values.bareEnabled&&<>
              <label className="pcb-field">基材识别方式<select aria-label="基材识别方式" value={values.bareMethod} onChange={event=>update({bareMethod:event.target.value as 'color'|'gray'})}><option value="color">按相似颜色</option><option value="gray">按灰度区间</option></select></label>
              {values.bareMethod==='color'?<><label className="pcb-field">基材参考颜色<input aria-label="基材参考颜色" type="color" value={values.bareColor} onChange={event=>update({bareColor:event.target.value})}/></label><Range label="基材颜色相似度" value={values.bareSimilarity} min={0} max={100} unit="%" onChange={bareSimilarity=>update({bareSimilarity})}/></>:<><Range label="基材灰度下限" value={values.bareGrayMin} min={0} max={255} onChange={bareGrayMin=>update({bareGrayMin})}/><Range label="基材灰度上限" value={values.bareGrayMax} min={0} max={255} onChange={bareGrayMax=>update({bareGrayMax})}/></>}
            </>}
            <p className="pcb-help">裸基材区域去除铜并开窗，金属识别优先。</p>
          </div></details>}
          {local&&<details open className="pcb-settings-section"><summary>原图与内部细节</summary>
            <div className="pcb-settings-body">
              <Range label="亮度" value={local.brightness} min={-100} max={100} onChange={brightness=>update({brightness})}/>
              <Range label="对比度" value={local.contrast} min={25} max={250} unit="%" onChange={contrast=>update({contrast})}/>
              <label className="pcb-checkbox"><input type="checkbox" checked={local.invert} onChange={event=>update({invert:event.target.checked})}/>反相明暗</label>
              <label className="pcb-checkbox"><input type="checkbox" checked={local.darkInk} onChange={event=>update({darkInk:event.target.checked})}/>原图深色作为主体</label>
              <label className="pcb-checkbox"><input type="checkbox" checked={local.preserveDetails} onChange={event=>update({preserveDetails:event.target.checked})}/>保留内部结构留空</label>
              {local.preserveDetails&&<Range label="内部细节阈值" value={local.detailThreshold} min={0} max={255} onChange={detailThreshold=>update({detailThreshold})}/>}
              <p className="pcb-help">指定丝印或金属时，内部细节阈值决定哪些原始明暗纹理留空。</p>
            </div>
          </details>}
          {side==='front'&&selected==='faction'&&<details open className="pcb-settings-section"><summary>标志位置与尺寸</summary>
            <div className="pcb-settings-body">
              <Range label="水平偏移" value={e1Opts.iconX} min={-150} max={150} unit=" px" onChange={iconX=>onE1OptsChange({...e1Opts,iconX})}/>
              <Range label="垂直偏移" value={e1Opts.iconY} min={-150} max={150} unit=" px" onChange={iconY=>onE1OptsChange({...e1Opts,iconY})}/>
              <Range label="标志缩放" value={Math.round(e1Opts.iconScale*100)} min={30} max={250} unit="%" onChange={value=>onE1OptsChange({...e1Opts,iconScale:value/100})}/>
            </div>
          </details>}
          <details open className="pcb-settings-section"><summary>图纸操作</summary><div className="pcb-settings-body pcb-adjust-actions">
            <button type="button" onClick={reset}><RotateCcw size={15}/>重置{layer?'这个素材':'全局参数'}</button>
            <button type="button" disabled={!scene||busy} onClick={()=>void props.onDownload(props.displayMode==='3d'?'appearance':getPcbViews(settings).includes(view)?view:'appearance')}><Download size={15}/>{props.displayMode==='3d'?'下载平面效果图':'下载当前视图'}</button>
          </div></details>
        </aside>
        <section className="pcb-adjust-preview">
          <div className="pcb-preview-toolbar">
            <span className="pcb-finish-label">{side==='back'?'独立背面 · 阵营 Logo':'正面通行证'}</span>
            <div className="mode-switch mode-switch-preview" role="group" aria-label="详细调整预览方式">
              <button type="button" className={props.displayMode==='2d'?'active':''} aria-pressed={props.displayMode==='2d'} onClick={()=>props.onDisplayModeChange('2d')}>2D 平面</button>
              <button type="button" className={props.displayMode==='3d'?'active':''} aria-pressed={props.displayMode==='3d'} onClick={()=>props.onDisplayModeChange('3d')}>3D 实物</button>
            </div>
            {props.displayMode==='2d'&&<label className="pcb-view-control">查看图层<select aria-label="查看图层" value={getPcbViews(settings).includes(view)?view:'appearance'} onChange={event=>setView(event.target.value as PcbView)}>{getPcbViews(settings).map(key=><option key={key} value={key}>{getPcbViewLabel(key,settings)}</option>)}</select></label>}
          </div>
          <div className={`pcb-adjust-board ${props.displayMode==='3d'?'pcb-adjust-board-3d':''}`}>
            {props.displayMode==='2d'?<PcbCanvas frames={frames} side={side} view={getPcbViews(settings).includes(view)?view:'appearance'} selection={layer} large/>:<Suspense fallback={<div className="pcb-3d-loading"><Loader2 className="animate-spin" size={18}/>正在建立 3D 模型…</div>}><PcbPreview3D frames={frames} scenes={scenes} side={side} faceRequest={props.faceRequest} widthMm={props.widthMm} thicknessMm={props.thicknessMm} onSizeChange={props.onSizeChange} onFallback={()=>props.onDisplayModeChange('2d')}/></Suspense>}
            {busy&&<div className={`pcb-render-status ${frames[side]?'pcb-render-progress':''}`} role="status">{props.interacting?'调整中，松手后细化…':'正在更新 PCB 预览…'}</div>}
          </div>
          {props.error&&<p className="pcb-error" role="alert">{props.error}</p>}
          <p className="pcb-help">{props.displayMode==='3d'?'修改左侧参数可同步查看 3D 效果。':'蓝色框标出当前素材范围。单层视图中，亮色区域表示有效图形；开窗表示去除阻焊。'}</p>
        </section>
      </div>
    </div>
  </div>,document.body);
}
