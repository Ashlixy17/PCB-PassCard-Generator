import {useEffect,useState} from 'react';
import {CircuitBoard,Download,SlidersHorizontal,Loader2} from 'lucide-react';
import {E1Options} from '../types';
import {PcbSettings,PcbSide,PcbView} from '../types/pcb';
import {PcbInputs} from '../utils/pcbRenderer';
import {downloadPcbPreview} from '../utils/pcbWorkerClient';
import {usePcbBoards} from '../hooks/usePcbBoards';
import {PcbCanvas} from './PcbCanvas';
import {PcbColorPicker} from './PcbColorPicker';
import {PcbAdjustModal} from './PcbAdjustModal';

interface Props {inputs:PcbInputs;settings:PcbSettings;onChange:(settings:PcbSettings)=>void;onE1OptsChange:(value:E1Options)=>void;detailRequest:number;onExport:()=>void}

export function PcbPreview({inputs,settings,onChange,onE1OptsChange,detailRequest,onExport}:Props) {
  const [side,setSide]=useState<PcbSide>('front');
  const [open,setOpen]=useState(false);
  const [focusLayer,setFocusLayer]=useState<string|undefined>();
  const [interacting,setInteracting]=useState(false);
  const [downloading,setDownloading]=useState(false);
  const [downloadError,setDownloadError]=useState('');
  const {scenes,frames,busy,error}=usePcbBoards(inputs,settings,side,interacting);
  const download=async(view:PcbView)=>{
    setDownloading(true);setDownloadError('');
    try {await downloadPcbPreview(inputs,settings,side,view,`PCB_${inputs.info.english_name||'card'}_${side==='front'?'正面':'背面'}_${view}.png`);}
    catch(error){setDownloadError(error instanceof Error?error.message:'图片导出失败');}
    finally{setDownloading(false);}
  };
  useEffect(()=>{if(detailRequest>0){setSide('front');setFocusLayer('faction');setOpen(true);}},[detailRequest]);
  return <section className="pcb-preview-panel" aria-labelledby="pcb-preview-title">
    <div className="pcb-preview-header"><h2 id="pcb-preview-title"><CircuitBoard size={19}/>PCB 板预览</h2><span className="pcb-finish-label">沉金 · ENIG</span></div>
    <div className="pcb-preview-toolbar">
      <div className="mode-switch mode-switch-preview" role="group" aria-label="PCB 正反面">
        <button type="button" className={side==='front'?'active':''} aria-pressed={side==='front'} onClick={()=>setSide('front')}>正面</button>
        <button type="button" className={side==='back'?'active':''} aria-pressed={side==='back'} onClick={()=>setSide('back')}>背面</button>
      </div>
      <button type="button" onClick={()=>{setFocusLayer(undefined);setOpen(true);}} data-testid="pcb-detail-open"><SlidersHorizontal size={15}/>详细调整</button>
    </div>
    <PcbColorPicker color={settings.maskColor} onChange={maskColor=>onChange({...settings,maskColor})}/>
    <div className="pcb-preview-board"><PcbCanvas frames={frames} side={side}/>
      {busy&&<div className={`pcb-render-status ${frames[side]?'pcb-render-progress':''}`} role="status"><Loader2 size={15} className="animate-spin"/>{interacting?'调整中，松手后细化…':'正在更新 PCB 预览…'}</div>}
    </div>
    {(error||downloadError)&&<p className="pcb-error" role="alert">{error||downloadError}</p>}
    <div className="pcb-preview-footer"><span>590 × 1180 px · {side==='front'?'正面':'背面'}</span><span>正反面共用阻焊配色</span></div>
    <div className="pcb-preview-actions">
      <button type="button" disabled={!scenes||busy||downloading} onClick={()=>void download('appearance')}><Download size={15}/>{downloading?'正在导出…':'下载 PCB 效果图'}</button>
      <button type="button" className="pcg-primary" onClick={onExport}>导出分层</button>
    </div>
    <PcbAdjustModal open={open} onClose={()=>{setOpen(false);setInteracting(false);}} side={side} onSideChange={setSide} settings={settings} onChange={onChange} scenes={scenes} frames={frames} e1Opts={inputs.e1Opts} onE1OptsChange={onE1OptsChange} focusLayer={focusLayer} busy={busy||downloading} interacting={interacting} onInteractionChange={setInteracting} onDownload={download} error={downloadError}/>
  </section>;
}
