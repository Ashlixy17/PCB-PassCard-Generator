import {CanvasTexture,NoColorSpace,SRGBColorSpace} from 'three';
import {PcbFrame,PcbSideFrames} from '../types/pcbWorker';

const kinds=['appearance','surface','height'] as const;
type Kind=typeof kinds[number];
type CanvasFactory=()=>HTMLCanvasElement;
interface TextureSlot {canvas:HTMLCanvasElement;texture:CanvasTexture}

/** GPU storage keeps its full board size while draft sources change resolution. */
export class PcbCanvasTextures {
  readonly maps={} as Record<Kind,TextureSlot>;
  private applied?:PcbSideFrames;
  private scratch?:HTMLCanvasElement;
  private scratchPixels?:ImageData;
  private disposed=false;
  sourceSize?:{width:number;height:number};

  constructor(readonly width:number,readonly height:number,anisotropy=1,private canvasFactory:CanvasFactory=()=>document.createElement('canvas')) {
    if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1)throw new Error('3D 贴图尺寸无效');
    try {
      for(const kind of kinds) {
        const canvas=canvasFactory();canvas.width=width;canvas.height=height;
        const ctx=canvas.getContext('2d');if(!ctx)throw new Error('无法建立 3D 材质贴图');
        ctx.fillStyle=kind==='surface'?'rgb(255,125,0)':kind==='height'?'rgb(128,128,128)':'#174d7c';ctx.fillRect(0,0,width,height);
        const texture=new CanvasTexture(canvas);
        texture.colorSpace=kind==='appearance'?SRGBColorSpace:NoColorSpace;
        texture.anisotropy=anisotropy;
        this.maps[kind]={canvas,texture};
      }
    } catch(error) {this.dispose();throw error;}
  }

  get ready(){return !!this.applied;}

  update(frames?:PcbSideFrames):boolean {
    if(this.disposed||!frames?.appearance)return false;
    const {width,height}=frames.appearance;
    // Hold the previous complete set until color, surface and height agree.
    if(!kinds.every(kind=>{
      const frame=frames[kind];
      return frame?.width===width&&frame.height===height&&(frame.bitmap||frame.pixels?.length===width*height*4);
    }))return false;
    if(kinds.every(kind=>this.applied?.[kind]===frames[kind]))return false;
    for(const kind of kinds) {
      const frame=frames[kind]!,slot=this.maps[kind];
      const source=this.frameSource(frame);
      const ctx=slot.canvas.getContext('2d')!;
      // Clearing also replaces transparent holes; all three copies complete
      // synchronously before any texture is marked for upload or rendered.
      ctx.clearRect(0,0,this.width,this.height);
      ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
      ctx.drawImage(source,0,0,this.width,this.height);
    }
    for(const kind of kinds)this.maps[kind].texture.needsUpdate=true;
    this.applied=frames;this.sourceSize={width,height};
    return true;
  }

  private frameSource(frame:PcbFrame):CanvasImageSource {
    // Worker bitmaps may close immediately after the consumer's layout effect.
    if(frame.bitmap)return frame.bitmap;
    this.scratch ||= this.canvasFactory();
    const ctx=this.scratch.getContext('2d');if(!ctx)throw new Error('无法读取 3D 材质像素');
    if(this.scratch.width!==frame.width||this.scratch.height!==frame.height||!this.scratchPixels) {
      this.scratch.width=frame.width;this.scratch.height=frame.height;
      this.scratchPixels=ctx.createImageData(frame.width,frame.height);
    }
    this.scratchPixels.data.set(frame.pixels!);ctx.putImageData(this.scratchPixels,0,0);
    return this.scratch;
  }

  dispose() {
    if(this.disposed)return;this.disposed=true;
    for(const slot of Object.values(this.maps)){slot.texture.dispose();slot.canvas.width=slot.canvas.height=1;}
    if(this.scratch)this.scratch.width=this.scratch.height=1;
    this.applied=undefined;this.scratchPixels=undefined;
  }
}
