import {PcbLayerSettings, PcbSettings, PcbSide} from '../types/pcb';
import {PcbFrame, PcbSideFrames, PcbTextureView} from '../types/pcbWorker';
import {PcbBoard, PcbScene, RasterPixels, getPcbLayerSettings} from './pcbProcessing';
import {pcbOptionsKey} from './pcbProcessingCache';
import {pcbPalette} from './pcbRaster';
import {pcbGpuVertex, pcbGpuTone, pcbGpuSmooth, pcbGpuClassify, pcbGpuExpand, pcbGpuCompose, pcbGpuView} from './pcbGpuShaders';

interface Target {texture: WebGLTexture; framebuffer: WebGLFramebuffer; width: number; height: number}
interface Program {handle: WebGLProgram; uniforms: Map<string, WebGLUniformLocation | null>}
interface Layer {
  pixels: RasterPixels; source: WebGLTexture; classified: Target;
  tones?: Target; smooth?: Target; expanded?: Target;
  toneKey?: string; smoothKey?: string; classKey?: string; key?: string;
  output: Target; revision: number;
}
interface Board {
  width: number; height: number; mask: Uint8Array; maskTexture: WebGLTexture;
  targets: [Target, Target]; output: Target; key?: string;
  saved?: PcbBoard;
}
const modes = ['auto','silk','gold','copper','mask','fr4'];
const views: PcbTextureView[] = ['appearance','silk','copper','mask','metal','coveredCopper','substrate','surface','height'];

/** Full-resolution WebGL2 processing in the worker. No pixel readback is used
 * during previews; only immutable image sources are uploaded on replacement. */
export class PcbGpuProcessor {
  private readonly gl: WebGL2RenderingContext;
  private readonly programs = new Set<Program>();
  private readonly textures = new Set<WebGLTexture>();
  private readonly targets = new Set<Target>();
  private readonly layers = new Map<string, Layer>();
  private readonly boards = new Map<PcbSide, Board>();
  private readonly vertexArray: WebGLVertexArrayObject;
  private readonly limit: number;
  private readonly toneProgram: Program;
  private readonly smoothProgram: Program;
  private readonly classifyProgram: Program;
  private readonly expandProgram: Program;
  private readonly composeProgram: Program;
  private readonly viewProgram: Program;
  private revision = 0;
  private disposed = false;
  stats = {uploadedSources: 0, processedLayers: 0, reusedLayers: 0, tonePasses: 0, smoothingPasses: 0, composed: false, readbacks: 0};

  constructor(private readonly canvas = new OffscreenCanvas(590,1180)) {
    const gl = canvas.getContext('webgl2', {alpha:true, premultipliedAlpha:false, antialias:false, depth:false, stencil:false, preserveDrawingBuffer:false, powerPreference:'high-performance'});
    if (!gl) throw new Error('WebGL2 后台计算不可用');
    this.gl = gl;
    this.limit = gl.getParameter(gl.MAX_TEXTURE_SIZE);
    this.vertexArray = gl.createVertexArray()!;
    try {
      gl.disable(gl.BLEND); gl.disable(gl.DITHER); gl.disable(gl.DEPTH_TEST);
      gl.pixelStorei(gl.UNPACK_ALIGNMENT,1);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,false);
      gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL,gl.NONE);
      this.toneProgram = this.program(pcbGpuTone);
      this.smoothProgram = this.program(pcbGpuSmooth);
      this.classifyProgram = this.program(pcbGpuClassify);
      this.expandProgram = this.program(pcbGpuExpand);
      this.composeProgram = this.program(pcbGpuCompose);
      this.viewProgram = this.program(pcbGpuView);
    } catch (error) {this.dispose(); throw error;}
  }

  get resourceCounts() {return {textures:this.textures.size, targets:this.targets.size, programs:this.programs.size};}

  private assertReady() {
    if (this.disposed || this.gl.isContextLost()) throw new Error('PCB GPU 计算上下文已失效');
  }

  private program(fragment: string): Program {
    const gl = this.gl;
    const shaders: WebGLShader[] = [];
    const handle = gl.createProgram();
    if (!handle) throw new Error('无法创建 PCB GPU 程序');
    try {
      for (const [type, source] of [[gl.VERTEX_SHADER,pcbGpuVertex],[gl.FRAGMENT_SHADER,fragment]] as const) {
        const shader = gl.createShader(type);
        if (!shader) throw new Error('无法创建 PCB GPU 着色器');
        shaders.push(shader); gl.shaderSource(shader,source); gl.compileShader(shader);
        if (!gl.getShaderParameter(shader,gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader)||'PCB 着色器编译失败');
        gl.attachShader(handle,shader);
      }
      gl.linkProgram(handle);
      if (!gl.getProgramParameter(handle,gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(handle)||'PCB 着色器链接失败');
      const program = {handle,uniforms:new Map<string,WebGLUniformLocation|null>()};
      this.programs.add(program); return program;
    } catch (error) {gl.deleteProgram(handle); throw error;}
    finally {for (const shader of shaders) gl.deleteShader(shader);}
  }

  private uniform(program: Program, name: string) {
    if (!program.uniforms.has(name)) program.uniforms.set(name,this.gl.getUniformLocation(program.handle,name));
    return program.uniforms.get(name)!;
  }

  private texture(width: number, height: number, data?: Uint8Array | Uint8ClampedArray, format: 'rgba' | 'integer' | 'mask' = 'rgba') {
    const gl = this.gl;
    if (width<1 || height<1 || width>this.limit || height>this.limit) throw new Error('PCB 图片超出 GPU 纹理尺寸限制');
    const texture = gl.createTexture();
    if (!texture) throw new Error('无法分配 PCB GPU 纹理');
    this.textures.add(texture);
    gl.bindTexture(gl.TEXTURE_2D,texture);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
    const internal = format==='integer'?gl.RGBA8UI:format==='mask'?gl.R8:gl.RGBA8;
    gl.texStorage2D(gl.TEXTURE_2D,1,internal,width,height);
    if (data) gl.texSubImage2D(gl.TEXTURE_2D,0,0,0,width,height,format==='mask'?gl.RED:gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array(data.buffer,data.byteOffset,data.byteLength));
    return texture;
  }

  private target(width: number, height: number, integer = false): Target {
    const gl = this.gl, texture = this.texture(width,height,undefined,integer?'integer':'rgba');
    const framebuffer = gl.createFramebuffer();
    if (!framebuffer) {this.deleteTexture(texture); throw new Error('无法分配 PCB GPU 目标');}
    gl.bindFramebuffer(gl.FRAMEBUFFER,framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,texture,0);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE) {
      gl.deleteFramebuffer(framebuffer);this.deleteTexture(texture);throw new Error('PCB GPU 目标不可用');
    }
    const target = {texture,framebuffer,width,height};this.targets.add(target);return target;
  }

  private deleteTexture(texture: WebGLTexture) {this.gl.deleteTexture(texture);this.textures.delete(texture);}
  private deleteTarget(target?: Target) {
    if (!target) return;
    this.gl.deleteFramebuffer(target.framebuffer);this.deleteTexture(target.texture);this.targets.delete(target);
  }
  private deleteLayer(layer: Layer) {
    this.deleteTexture(layer.source);
    for (const target of [layer.classified,layer.tones,layer.smooth,layer.expanded]) this.deleteTarget(target);
  }
  private deleteBoard(board: Board) {
    this.deleteTexture(board.maskTexture);
    for (const target of board.targets) this.deleteTarget(target);
  }

  private begin(program: Program, target: Target | null) {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER,target?.framebuffer||null);
    gl.viewport(0,0,target?.width||this.canvas.width,target?.height||this.canvas.height);
    gl.bindVertexArray(this.vertexArray);gl.useProgram(program.handle);
  }
  private bind(program: Program, name: string, texture: WebGLTexture, unit: number) {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0+unit);gl.bindTexture(gl.TEXTURE_2D,texture);gl.uniform1i(this.uniform(program,name),unit);
  }
  private draw() {this.gl.drawArrays(this.gl.TRIANGLES,0,3);}

  private convert(key: string, pixels: RasterPixels, options: PcbLayerSettings): Layer {
    const gl = this.gl;
    let layer = this.layers.get(key);
    if (layer?.pixels!==pixels) {
      if (layer) this.deleteLayer(layer);
      const classified = this.target(pixels.width,pixels.height);
      layer = {pixels,source:this.texture(pixels.width,pixels.height,pixels.data),classified,output:classified,revision:0};
      this.layers.set(key,layer);this.stats.uploadedSources++;
    }
    const signature = pcbOptionsKey(options);
    if (layer.key===signature) {this.stats.reusedLayers++;return layer;}
    const radius = Math.round(options.edgeExpansion), smoothing = Math.round(options.smoothing);
    if (radius<0 || radius>4 || smoothing<0 || smoothing>3) throw new Error('PCB 参数超出 GPU 计算范围');
    const fixed = ['mask','copper','fr4'].includes(options.mode);
    // The same integer sampler must always have a complete, correctly typed
    // texture bound, including fixed-material branches which do not sample it.
    layer.tones ||= this.target(pixels.width,pixels.height,true);
    const toneKey = JSON.stringify([options.brightness,options.contrast,options.invert]);
    const toneChanged = !fixed && layer.toneKey!==toneKey;
    if (toneChanged) {
      const program = this.toneProgram;this.begin(program,layer.tones);this.bind(program,'uSource',layer.source,0);
      gl.uniform3f(this.uniform(program,'uTone'),options.brightness,options.contrast,Number(options.invert));this.draw();
      layer.toneKey=toneKey;layer.smoothKey=undefined;this.stats.tonePasses++;
    }
    let tones = layer.tones;
    if (!fixed && smoothing) {
      layer.smooth ||= this.target(pixels.width,pixels.height,true);
      const smoothKey = `${toneKey}:${smoothing}`;
      if (layer.smoothKey!==smoothKey) {
        const program=this.smoothProgram;this.begin(program,layer.smooth);
        this.bind(program,'uSource',layer.source,0);this.bind(program,'uTones',layer.tones.texture,1);
        gl.uniform1i(this.uniform(program,'uRadius'),smoothing);this.draw();
        layer.smoothKey=smoothKey;this.stats.smoothingPasses++;
      }
      tones=layer.smooth;
    }
    const classKey = pcbOptionsKey({...options,edgeExpansion:0});
    if (layer.classKey!==classKey) {
      const program=this.classifyProgram;this.begin(program,layer.classified);
      this.bind(program,'uSource',layer.source,0);this.bind(program,'uTones',tones.texture,1);
      gl.uniform1i(this.uniform(program,'uMode'),modes.indexOf(options.mode));
      gl.uniform4i(this.uniform(program,'uFlags'),Number(options.processingMode==='color'),Number(options.darkInk),Number(options.preserveDetails),Number(options.maskIsLight));
      gl.uniform3f(this.uniform(program,'uTone'),options.brightness,options.contrast,Number(options.invert));
      gl.uniform4f(this.uniform(program,'uThresholds'),options.silkThreshold,options.maskThreshold,options.copperThreshold,options.detailThreshold);
      gl.uniform4f(this.uniform(program,'uMetal'),options.metalHue,options.hueTolerance,options.saturationThreshold,options.metalBrightness);
      gl.uniform1i(this.uniform(program,'uFinish'),['enig','hasl','osp'].indexOf(options.finish));
      gl.uniform1f(this.uniform(program,'uSilver'),options.silverThreshold);
      gl.uniform2i(this.uniform(program,'uBareFlags'),Number(options.bareEnabled),Number(options.bareMethod==='gray'));
      const bare=[1,3,5].map(index=>parseInt(options.bareColor.slice(index,index+2),16));
      gl.uniform4f(this.uniform(program,'uBare'),bare[0],bare[1],bare[2],options.bareSimilarity);
      gl.uniform2f(this.uniform(program,'uBareRange'),options.bareGrayMin,options.bareGrayMax);this.draw();
      layer.classKey=classKey;
    }
    layer.output=layer.classified;
    if (!fixed && radius) {
      layer.expanded ||= this.target(pixels.width,pixels.height);
      const program=this.expandProgram;this.begin(program,layer.expanded);this.bind(program,'uSource',layer.classified.texture,0);
      gl.uniform1i(this.uniform(program,'uRadius'),radius);this.draw();layer.output=layer.expanded;
    }
    layer.key=signature;layer.revision=++this.revision;this.stats.processedLayers++;
    return layer;
  }

  private compose(scene: PcbScene, settings: PcbSettings): Board {
    this.assertReady();
    this.stats={uploadedSources:0,processedLayers:0,reusedLayers:0,tonePasses:0,smoothingPasses:0,composed:false,readbacks:0};
    const gl = this.gl;
    const present = new Set(scene.layers.map(layer=>`${scene.side}:${layer.id}`));
    for (const [key,layer] of this.layers) if (key.startsWith(`${scene.side}:`)&&!present.has(key)) {this.deleteLayer(layer);this.layers.delete(key);}
    let board = this.boards.get(scene.side);
    if (!board || board.mask!==scene.boardMask || board.width!==scene.width || board.height!==scene.height) {
      if (board) this.deleteBoard(board);
      const targets:[Target,Target]=[this.target(scene.width,scene.height),this.target(scene.width,scene.height)];
      board={width:scene.width,height:scene.height,mask:scene.boardMask,maskTexture:this.texture(scene.width,scene.height,scene.boardMask,'mask'),targets,output:targets[0]};
      this.boards.set(scene.side,board);
    }
    if (scene.board) {
      if (board.saved!==scene.board) {
        const saved=scene.board,data=new Uint8Array(scene.width*scene.height*4);
        for(let i=0;i<saved.materials.length;i++) {
          data[i*4]=saved.materials[i];data[i*4+1]=saved.silk[i]?255:0;
          data[i*4+2]=saved.copper[i]?255:0;data[i*4+3]=saved.mask[i]?255:0;
        }
        gl.bindTexture(gl.TEXTURE_2D,board.targets[0].texture);
        gl.texSubImage2D(gl.TEXTURE_2D,0,0,0,scene.width,scene.height,gl.RGBA,gl.UNSIGNED_BYTE,data);
        board.saved=saved;board.output=board.targets[0];board.key=undefined;this.stats.uploadedSources++;
      }
      return board;
    }
    board.saved=undefined;
    const converted=scene.layers.flatMap(source=>{
      const options=getPcbLayerSettings(settings,scene.side,source);
      return options.enabled?[{source,layer:this.convert(`${scene.side}:${source.id}`,source.pixels,options)}]:[];
    });
    const key=JSON.stringify(converted.map(({source,layer})=>[source.id,source.x,source.y,layer.revision]));
    if (board.key===key) return board;
    this.begin(this.composeProgram,board.targets[0]);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);
    let index=0;
    for (const {source,layer} of converted) {
      const next=1-index,program=this.composeProgram;this.begin(program,board.targets[next]);
      this.bind(program,'uPrevious',board.targets[index].texture,0);this.bind(program,'uLayer',layer.output.texture,1);this.bind(program,'uMask',board.maskTexture,2);
      gl.uniform2i(this.uniform(program,'uOffset'),source.x,source.y);this.draw();index=next;
    }
    board.output=board.targets[index];board.key=key;this.stats.composed=true;
    return board;
  }

  preview(scene: PcbScene, settings: PcbSettings, requested: PcbTextureView[]): PcbSideFrames {
    const board=this.compose(scene,settings),gl=this.gl,frames:PcbSideFrames={};
    if (this.canvas.width!==board.width) this.canvas.width=board.width;
    if (this.canvas.height!==board.height) this.canvas.height=board.height;
    const finish=settings.processingMode==='color'?settings.color.finish:'enig';
    try {
      const program=this.viewProgram;
      for (const view of requested) {
        this.begin(program,null);this.bind(program,'uBoard',board.output.texture,0);this.bind(program,'uMask',board.maskTexture,1);
        gl.uniform3fv(this.uniform(program,'uPalette[0]'),pcbPalette(settings.maskColor,finish).flat());
        gl.uniform1i(this.uniform(program,'uView'),views.indexOf(view));
        gl.uniform1f(this.uniform(program,'uMetalRoughness'),{enig:72,hasl:100,osp:125}[finish]);this.draw();
        const frame:PcbFrame={width:board.width,height:board.height,bitmap:this.canvas.transferToImageBitmap(),backend:'gpu'};
        frames[view]=frame;
      }
      this.assertReady();return frames;
    } catch (error) {for (const frame of Object.values(frames)) frame.bitmap?.close();throw error;}
  }

  /** Explicit diagnostic readback for parity tests; never used by previews. */
  readBoard(scene: PcbScene, settings: PcbSettings): PcbBoard {
    const board=this.compose(scene,settings),gl=this.gl;
    const count=board.width*board.height,data=new Uint8Array(count*4);
    gl.bindFramebuffer(gl.FRAMEBUFFER,board.output.framebuffer);gl.readPixels(0,0,board.width,board.height,gl.RGBA,gl.UNSIGNED_BYTE,data);this.stats.readbacks++;
    const materials=new Uint8Array(count),silk=new Uint8Array(count),copper=new Uint8Array(count),mask=new Uint8Array(count);
    for (let i=0;i<count;i++) {materials[i]=data[i*4];silk[i]=data[i*4+1]?1:0;copper[i]=data[i*4+2]?1:0;mask[i]=data[i*4+3]?1:0;}
    return {side:scene.side,width:board.width,height:board.height,boardMask:scene.boardMask,materials,silk,copper,mask};
  }

  dispose() {
    if (this.disposed) return;this.disposed=true;
    for (const target of [...this.targets]) this.deleteTarget(target);
    for (const texture of this.textures) this.gl.deleteTexture(texture);
    for (const program of this.programs) this.gl.deleteProgram(program.handle);
    this.gl.deleteVertexArray(this.vertexArray);
    this.targets.clear();this.textures.clear();this.programs.clear();this.layers.clear();this.boards.clear();
    this.gl.getExtension('WEBGL_lose_context')?.loseContext();
  }
}
