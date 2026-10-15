import {lazy,Suspense,useEffect,useState} from 'react';
import {CircuitBoard,Download,SlidersHorizontal,Loader2} from 'lucide-react';
import {E1Options} from '../types';
import {PcbSettings,PcbSide,PcbView,PCB_FINISH_LABELS,getPcbViews,getPcbViewLabel} from '../types/pcb';
import {PcbInputs} from '../utils/pcbRenderer';
import {downloadPcbPreview} from '../utils/pcbWorkerClient';
import {usePcbBoards} from '../hooks/usePcbBoards';
import {PcbCanvas} from './PcbCanvas';
import {PcbColorPicker} from './PcbColorPicker';
import {PcbAdjustModal} from './PcbAdjustModal';
import {PcbModeSwitch} from './PcbModeSwitch';
import {PcbModelSize} from '../types/pcbProject';

interface Props {key?:number;inputs:PcbInputs;settings:PcbSettings;onChange:(settings:PcbSettings)=>void;onE1OptsChange:(value:E1Options)=>void;detailRequest:number;onExport:()=>void;modelSize:PcbModelSize;onModelSizeChange:(value:PcbModelSize)=>void}
const PcbPreview3D=lazy(()=>import('./PcbPreview3D'));

export function PcbPreview({inputs,settings,onChange,onE1OptsChange,detailRequest,onExport,modelSize,onModelSizeChange}:Props) {
  const [side,setSide]=useState<PcbSide>('front');
  const [displayMode,setDisplayMode]=useState<'2d'|'3d'>('2d');
  const [faceRequest,setFaceRequest]=useState(0);
  const changeSize=(width:number,thickness:number)=>onModelSizeChange({width,thickness});
  const boardOnly=!!inputs.savedBoards;
  const selectSide=(next:PcbSide)=>{setSide(next);setFaceRequest(value=>value+1);};
  const [view,setView]=useState<PcbView>('appearance');
  const [open,setOpen]=useState(false);
  const [focusLayer,setFocusLayer]=useState<string|undefined>();
  const [interacting,setInteracting]=useState(false);
  const [downloading,setDownloading]=useState(false);
  const [downloadError,setDownloadError]=useState('');
  const {scenes,frames,busy,error}=usePcbBoards(inputs,settings,side,interacting,displayMode==='3d');
  const download=async(view:PcbView)=>{
    setDownloading(true);setDownloadError('');
    try {await downloadPcbPreview(inputs,settings,side,view,`PCB_${inputs.info.english_name||'card'}_${side==='front'?'正面':'背面'}_${view}.png`);}
    catch(error){setDownloadError(error instanceof Error?error.message:'图片导出失败');}
    finally{setDownloading(false);}
  };
  useEffect(()=>{if(detailRequest>0){setSide('front');setFaceRequest(value=>value+1);setFocusLayer('faction');setOpen(true);}},[detailRequest]);
  const activeView=getPcbViews(settings).includes(view)?view:'appearance';
  return <section className="pcb-preview-panel" aria-labelledby="pcb-preview-title">
    <div className="pcb-preview-header"><h2 id="pcb-preview-title"><CircuitBoard size={19}/>PCB 板预览</h2><div className="mode-switch mode-switch-preview" role="group" aria-label="预览方式"><button type="button" className={displayMode==='2d'?'active':''} aria-pressed={displayMode==='2d'} onClick={()=>setDisplayMode('2d')}>2D 平面</button><button type="button" className={displayMode==='3d'?'active':''} aria-pressed={displayMode==='3d'} onClick={()=>setDisplayMode('3d')}>3D 实物</button></div><span className="pcb-finish-label">{settings.processingMode==='color'?PCB_FINISH_LABELS[settings.color.finish]:'灰度三分'}</span></div>
    {boardOnly?<p className="pcb-help">已恢复保存的制造图层，可切换正反面、图层和 3D 查看。</p>:<PcbModeSwitch mode={settings.processingMode} onChange={processingMode=>{setView('appearance');setInteracting(false);onChange({...settings,processingMode});}}/>}
    <div className="pcb-preview-toolbar">
      <div className="mode-switch mode-switch-preview" role="group" aria-label="PCB 正反面">
        <button type="button" className={side==='front'?'active':''} aria-pressed={side==='front'} onClick={()=>selectSide('front')}>正面</button>
        <button type="button" className={side==='back'?'active':''} aria-pressed={side==='back'} onClick={()=>selectSide('back')}>背面</button>
      </div>
      {displayMode==='2d'&&<label className="pcb-view-control">图层<select aria-label="预览图层" value={activeView} onChange={event=>setView(event.target.value as PcbView)}>{getPcbViews(settings).map(key=><option key={key} value={key}>{getPcbViewLabel(key,settings)}</option>)}</select></label>}
      <button type="button" onClick={()=>{setFocusLayer(undefined);setOpen(true);}} data-testid="pcb-detail-open"><SlidersHorizontal size={15}/>{boardOnly?'图层查看':'详细调整'}</button>
    </div>
    <PcbColorPicker color={settings.maskColor} onChange={maskColor=>onChange({...settings,maskColor})}/>
    <div className={`pcb-preview-board ${displayMode==='3d'?'pcb-preview-board-3d':''}`}>{!open&&(displayMode==='2d'?<PcbCanvas frames={frames} side={side} view={activeView}/>:<Suspense fallback={<div className="pcb-3d-loading"><Loader2 className="animate-spin" size={18}/>正在建立 3D 模型…</div>}><PcbPreview3D frames={frames} scenes={scenes} side={side} faceRequest={faceRequest} widthMm={modelSize.width} thicknessMm={modelSize.thickness} onSizeChange={changeSize} onFallback={()=>setDisplayMode('2d')}/></Suspense>)}
      {busy&&<div className={`pcb-render-status ${frames[side]?'pcb-render-progress':''}`} role="status"><Loader2 size={15} className="animate-spin"/>正在更新高清 PCB 预览…</div>}
    </div>
    {(error||downloadError)&&<p className="pcb-error" role="alert">{error||downloadError}</p>}
    <div className="pcb-preview-footer"><span>590 × 1180 px · {side==='front'?'正面':'背面'}</span><span>正反面共用阻焊配色</span></div>
    <div className="pcb-preview-actions">
      <button type="button" disabled={!scenes||busy||downloading} onClick={()=>void download(displayMode==='3d'?'appearance':activeView)}><Download size={15}/>{downloading?'正在导出…':displayMode==='3d'?'下载平面效果图':activeView==='appearance'?'下载 PCB 效果图':'下载当前图层'}</button>
      <button type="button" className="pcg-primary" onClick={onExport}>导出分层</button>
    </div>
    <PcbAdjustModal open={open} onClose={()=>{setOpen(false);setInteracting(false);}} side={side} onSideChange={selectSide} settings={settings} onChange={onChange} scenes={scenes} frames={frames} e1Opts={inputs.e1Opts} onE1OptsChange={onE1OptsChange} focusLayer={focusLayer} busy={busy||downloading} interacting={interacting} onInteractionChange={setInteracting} onDownload={download} error={error||downloadError} displayMode={displayMode} onDisplayModeChange={mode=>{setInteracting(false);setDisplayMode(mode);}} faceRequest={faceRequest} widthMm={modelSize.width} thicknessMm={modelSize.thickness} onSizeChange={changeSize} boardOnly={boardOnly}/>
  </section>;
}
