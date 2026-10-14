import {useState} from 'react';
import {X,Download,Archive,Loader2} from 'lucide-react';
import JSZip from 'jszip';
import {E1Options,PassCardInfo} from '../types';
import {PcbSettings,PcbSide,PcbView} from '../types/pcb';
import {getPcbLayerSettings} from '../utils/pcbProcessing';
import {exportPcbImages,pcbImageBlob} from '../utils/pcbWorkerClient';

interface Props {isOpen:boolean;onClose:()=>void;currentInfo:PassCardInfo;e1Opts:E1Options;frontPhotoUrl:string;cutoutPhotoUrl:string;customIconUrl:string;pcbSettings:PcbSettings}

export function PcbExportModal({isOpen,onClose,currentInfo,e1Opts,frontPhotoUrl,cutoutPhotoUrl,customIconUrl,pcbSettings}:Props) {
  const [kinds,setKinds]=useState({front:true,back:true,appearance:true,layers:true,outline:true});
  const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState('');
  if(!isOpen)return null;
  const exportFiles=async()=>{
    setBusy(true);setError('');setMessage('正在准备独立素材…');
    try {
      setMessage('正在后台生成完整精度图层…');
      const views:PcbView[]=[];
      if(kinds.appearance)views.push('appearance');
      if(kinds.layers)views.push('silk','copper','mask');
      const {scenes,images}=await exportPcbImages({info:currentInfo,e1Opts,frontPhotoUrl,cutoutPhotoUrl,customIconUrl},pcbSettings,
        {sides:(['front','back'] as PcbSide[]).filter(side=>kinds[side]),views,outline:kinds.outline});
      const zip=new JSZip();
      const name=`${currentInfo.english_name||currentInfo.id}_${currentInfo.chinese_name||''}`.replace(/[\\/:*?"<>|]/g,'').replace(/^\.+|\.+$/g,'')||'PCB_Card';
      const folder=zip.folder(name)||zip;
      for(const side of ['front','back'] as PcbSide[]) {
        if(!kinds[side])continue;
        const face=side==='front'?'正面':'背面',prefix=side==='front'?'F':'B';
        setMessage(`正在生成 PCB ${face}与制造图层…`);
        const target=folder.folder(face)||folder;
        const names={appearance:'PCB效果.png',silk:`${prefix}.SilkS.png`,copper:`${prefix}.Cu.png`,mask:`${prefix}.Mask.png`,outline:'板形蒙版.png'};
        for(const image of images.filter(image=>image.side===side)) {
          target.file(names[image.view],await (await pcbImageBlob(image)).arrayBuffer());
        }
      }
      folder.file('处理参数.json',JSON.stringify({resolution:{width:590,height:1180,units:'px',origin:'top-left'},surfaceFinish:'ENIG',settings:pcbSettings,layout:e1Opts,
        sources:Object.fromEntries((['front','back'] as const).map(side=>[side,scenes[side].layers.map(layer=>({id:layer.id,label:layer.label,x:layer.x,y:layer.y,width:layer.pixels.width,height:layer.pixels.height,processing:getPcbLayerSettings(pcbSettings,side,layer)}))]))},null,2));
      folder.file('图层说明.txt','PCB 分层图片说明\n\n所有 PNG 使用统一的 590 × 1180 像素坐标。\nSilkS：黑色有效区域表示丝印油墨。\nCu：黑色有效区域表示保留铜。\nMask：黑色有效区域表示去除阻焊、开窗。\n板形蒙版：黑色区域表示板体，透明区域表示板外或孔。\n正背面分别从各自面向观察者的方向显示。\n\n这些文件是效果图与二值分层 PNG，不是 Gerber；用于制造前需在 PCB 工具中指定实际尺寸、生成制造文件并核对线宽与间距。\n');
      setMessage('正在打包分层图片…');
      const blob=await zip.generateAsync({type:'blob'}),url=URL.createObjectURL(blob),link=document.createElement('a');
      link.href=url;link.download=`PCB_${name}.zip`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);onClose();
    } catch(err) {setError(err instanceof Error?err.message:'导出失败');}
    finally {setBusy(false);setMessage('');}
  };
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
    <div className="relative w-full max-w-2xl rounded-xl bg-slate-900 p-6 border border-slate-800 text-white" role="dialog" aria-modal="true" aria-labelledby="pcb-export-title">
      <div className="flex items-center justify-between pb-4 border-b border-slate-800"><h2 id="pcb-export-title" className="flex items-center gap-2"><Archive size={18}/>PCB 图片与分层导出</h2><button type="button" aria-label="关闭导出" disabled={busy} onClick={onClose}><X size={18}/></button></div>
      <div className="my-5 space-y-4">
        <p className="text-sm text-slate-400">导出当前配色和素材参数下的正反面效果，以及丝印、铜和阻焊开窗图片。</p>
        <div className="grid grid-cols-2 gap-3 text-sm">{[{key:'front',label:'PCB 正面'},{key:'back',label:'PCB 背面'},{key:'appearance',label:'成品效果图'},{key:'layers',label:'丝印／铜／开窗分层'},{key:'outline',label:'板形蒙版'}].map(item=><label key={item.key} className="pcb-checkbox"><input type="checkbox" disabled={busy} checked={kinds[item.key as keyof typeof kinds]} onChange={event=>setKinds({...kinds,[item.key]:event.target.checked})}/>{item.label}</label>)}</div>
        <p className="pcb-help">分层文件为 PNG，实际尺寸与制造规则需在 PCB 工具中确认。</p>
        {busy&&<p className="flex items-center gap-2 text-blue-400" role="status"><Loader2 size={16} className="animate-spin"/>{message}</p>}
        {error&&<p className="pcb-error" role="alert">{error}</p>}
      </div>
      <div className="flex justify-end gap-3 pt-4 border-t border-slate-800"><button type="button" disabled={busy} onClick={onClose} className="px-4 py-2">取消</button><button type="button" disabled={busy||(!kinds.front&&!kinds.back)||(!kinds.appearance&&!kinds.layers&&!kinds.outline)} onClick={exportFiles} className="pcg-primary flex items-center gap-2 px-4 py-2"><Download size={16}/>打包下载 ZIP</button></div>
    </div>
  </div>;
}
