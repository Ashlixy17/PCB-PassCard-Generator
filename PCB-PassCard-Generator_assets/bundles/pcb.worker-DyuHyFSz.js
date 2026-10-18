(function(){"use strict";const I={finish:"enig",metalHue:45,hueTolerance:25,saturationThreshold:20,metalBrightness:70,silverThreshold:180,silkThreshold:200,copperThreshold:100,edgeExpansion:0,smoothing:0,bareEnabled:!1,bareMethod:"color",bareColor:"#af9d68",bareSimilarity:90,bareGrayMin:80,bareGrayMax:130,overrides:{}},F=t=>t.processingMode==="color"?["appearance","silk","metal","coveredCopper","substrate","copper","mask"]:["appearance","silk","copper","mask"],N=t=>t.processingMode==="color"?t.color.overrides:t.overrides,O=t=>t.processingMode==="color"?t.color:t,$=(t,r)=>`${t}:${r}`;function U(t,r,s){const i=[1,3,5].map(a=>parseInt(t.maskColor.slice(a,a+2),16));return{...I,enabled:!0,mode:"auto",invert:!1,darkInk:!1,preserveDetails:!1,detailThreshold:24,brightness:0,contrast:100,silkThreshold:t.silkThreshold,maskThreshold:t.maskThreshold,edgeExpansion:t.edgeExpansion,smoothing:t.smoothing,...t.processingMode==="color"?O(t):{},...s.defaults,...N(t)[$(r,s.id)],processingMode:t.processingMode,maskIsLight:.2126*i[0]+.7152*i[1]+.0722*i[2]>210}}function z(t,r,s,i){const a=Math.max(t,r,s),e=Math.min(t,r,s),h=a-e,l=a?h/a*100:0;let o=h===0?0:a===t?(r-s)/h:a===r?(s-t)/h+2:(t-r)/h+4;if(o=(o*60+360)%360,i.finish==="hasl")return a>=i.silverThreshold&&(l<16||o>160&&o<260);const n=Math.abs(o-i.metalHue);return Math.min(n,360-n)<=i.hueTolerance&&l>=i.saturationThreshold&&a>=i.metalBrightness}function V(t,r,s){if(!s)return t;const{width:i,height:a,data:e}=r,h=i+1,l=new Float64Array(h*(a+1)),o=new Float64Array(l.length);for(let c=0;c<a;c++){let u=0,g=0;for(let f=0;f<i;f++){const d=c*i+f,m=e[d*4+3]/255,p=(c+1)*h+f+1;u+=t[d]*m,g+=m,l[p]=l[p-h]+u,o[p]=o[p-h]+g}}const n=new Float32Array(t.length);for(let c=0;c<a;c++)for(let u=0;u<i;u++){const g=Math.max(0,u-s),f=Math.min(i,u+s+1),d=Math.max(0,c-s),m=Math.min(a,c+s+1),p=d*h+g,b=d*h+f,y=m*h+g,x=m*h+f,w=o[x]-o[b]-o[y]+o[p];n[c*i+u]=w>0?(l[x]-l[b]-l[y]+l[p])/w:t[c*i+u]}return n}function X(t,r,s=!1){const{width:i,height:a,data:e}=t,h=i*a,l=new Uint8Array(h).fill(255);if(!r.enabled)return l;let o=new Float32Array(h);for(let f=0;f<h;f++){const d=f*4;let m=(.2126*e[d]+.7152*e[d+1]+.0722*e[d+2]-128)*r.contrast/100+128+r.brightness;r.invert&&(m=255-m),o[f]=Math.max(0,Math.min(255,m))}o=V(o,t,Math.round(r.smoothing));const n=new Uint8Array(h),c=[1,3,5].map(f=>parseInt(r.bareColor.slice(f,f+2),16));for(let f=0;f<h;f++){const d=f*4;if(e[d+3]<32)continue;const m=o[f];if(r.mode==="mask"){l[f]=0;continue}if(r.mode==="copper"){l[f]=3;continue}if(r.mode==="fr4"){l[f]=4;continue}if(r.mode==="silk"||r.mode==="gold"){if(r.preserveDetails&&(r.darkInk?m>r.detailThreshold:255-m>r.detailThreshold)){n[f]=1;continue}l[f]=r.mode==="silk"?1:2;continue}if(r.processingMode==="color"){let b=Math.max(0,Math.min(255,(e[d]-128)*r.contrast/100+128+r.brightness)),y=Math.max(0,Math.min(255,(e[d+1]-128)*r.contrast/100+128+r.brightness)),x=Math.max(0,Math.min(255,(e[d+2]-128)*r.contrast/100+128+r.brightness));if(r.invert&&(b=255-b,y=255-y,x=255-x),z(b,y,x,r)){l[f]=2;continue}if(r.bareEnabled&&(r.bareMethod==="gray"?m>=Math.min(r.bareGrayMin,r.bareGrayMax)&&m<=Math.max(r.bareGrayMin,r.bareGrayMax):100*(1-Math.hypot(b-c[0],y-c[1],x-c[2])/(255*Math.sqrt(3)))>=r.bareSimilarity)){l[f]=4;continue}const w=r.darkInk||r.maskIsLight?255-m:m;l[f]=w>=r.silkThreshold?1:w>=r.copperThreshold?3:0;continue}const p=r.darkInk?255-m:m;p>=r.silkThreshold?l[f]=1:p>=r.maskThreshold?l[f]=2:l[f]=0}const u=Math.round(r.edgeExpansion);if(!u)return l;const g=l.slice();for(let f=0;f<a;f++)for(let d=0;d<i;d++){const m=f*i+d,p=l[m];if(!(p!==1&&p!==2))for(let b=-u;b<=u;b++)for(let y=-u;y<=u;y++){if(y*y+b*b>u*u)continue;const x=d+y,w=f+b;if(x<0||x>=i||w<0||w>=a)continue;const v=w*i+x;!n[v]&&l[v]!==1&&l[v]!==2&&(g[v]=p)}}return g}function K(t,r){const{width:s,height:i,side:a,boardMask:e}=t,h=s*i,l=new Uint8Array(h),o=new Uint8Array(h),n=new Uint8Array(h),c=new Uint8Array(h);for(let u=0;u<t.layers.length;u++){const g=t.layers[u],f=r[u];for(let d=0;d<g.pixels.height;d++)for(let m=0;m<g.pixels.width;m++){const p=f[d*g.pixels.width+m];if(p===255)continue;const b=g.x+m,y=g.y+d;if(b<0||b>=s||y<0||y>=i)continue;const x=y*s+b;e[x]&&(l[x]=p,o[x]=p===1?1:0,c[x]=p===2||p===4?1:0,p!==1&&(n[x]=p===2||p===3?1:0))}}return{side:a,width:s,height:i,boardMask:e,materials:l,silk:o,copper:n,mask:c}}const W=.4;function R(t){if(!t.enabled)return"hidden";if(["mask","copper","fr4"].includes(t.mode))return t.mode;const r=[t.mode,t.edgeExpansion];if(t.mode!=="auto"&&!t.preserveDetails)return r.join(":");const s=r.concat([t.smoothing,t.brightness,t.contrast,Number(t.invert),Number(t.darkInk),...t.mode==="auto"?[t.processingMode,t.silkThreshold]:[t.detailThreshold]]);return t.mode==="auto"&&s.push(...t.processingMode==="color"?[t.finish,t.metalHue,t.hueTolerance,t.saturationThreshold,t.metalBrightness,t.silverThreshold,t.copperThreshold,Number(t.maskIsLight),Number(t.bareEnabled),t.bareMethod,t.bareColor,t.bareSimilarity,t.bareGrayMin,t.bareGrayMax]:[t.maskThreshold]),s.join(":")}function H(t,r){const s=Math.max(1,Math.round(t.width*r)),i=Math.max(1,Math.round(t.height*r)),a=new Uint8ClampedArray(s*i*4),e=new Uint32Array(t.data.buffer,t.data.byteOffset,t.width*t.height),h=new Uint32Array(a.buffer);for(let l=0;l<i;l++)for(let o=0;o<s;o++)h[l*s+o]=e[Math.min(t.height-1,Math.floor(l/r))*t.width+Math.min(t.width-1,Math.floor(o/r))];return{width:s,height:i,data:a}}class j{constructor(){this.resized=new Map,this.masks=new WeakMap,this.layers=new Map,this.boards=new Map,this.stats={processedLayers:0,reusedLayers:0,composed:!1}}compose(r,s,i="full"){if(this.stats={processedLayers:0,reusedLayers:0,composed:!1},r.board)return r.board;const a=i==="draft"?W:1;let e=r;if(a!==1){const c=Math.round(r.width*a),u=Math.round(r.height*a);let g=this.masks.get(r.boardMask);if(!g){g=new Uint8Array(c*u);for(let f=0;f<u;f++)for(let d=0;d<c;d++)g[f*c+d]=r.boardMask[Math.min(r.height-1,Math.floor(f/a))*r.width+Math.min(r.width-1,Math.floor(d/a))];this.masks.set(r.boardMask,g)}e={...r,width:c,height:u,boardMask:g,layers:r.layers.map(f=>{const d=`${r.side}:${f.id}`;let m=this.resized.get(d);return(!m||m.source!==f.pixels)&&(m={source:f.pixels,pixels:H(f.pixels,a)},this.resized.set(d,m)),{...f,x:Math.round(f.x*a),y:Math.round(f.y*a),pixels:m.pixels}})}}const h=e.layers.map(c=>{const u=U(s,e.side,c);a!==1&&(u.edgeExpansion=Math.round(u.edgeExpansion*a),u.smoothing=Math.round(u.smoothing*a));const g=`${e.side}:${i}:${c.id}`,f=R(u),d=!!c.photo,m=this.layers.get(g);if(m&&m.pixels===c.pixels&&m.options===f&&m.photo===d)return this.stats.reusedLayers++,m.data;const p=X(c.pixels,u,d);return this.layers.set(g,{pixels:c.pixels,options:f,photo:d,data:p}),this.stats.processedLayers++,p}),l=`${e.side}:${i}`,o=this.boards.get(l);if(o&&o.scene.boardMask===e.boardMask&&o.scene.width===e.width&&o.scene.height===e.height&&o.converted.length===h.length&&h.every((c,u)=>c===o.converted[u]&&e.layers[u].id===o.scene.layers[u].id&&e.layers[u].x===o.scene.layers[u].x&&e.layers[u].y===o.scene.layers[u].y))return o.board;const n=K(e,h);return this.boards.set(l,{scene:e,converted:h,board:n}),this.stats.composed=!0,n}}function B(t,r="enig"){const s=[1,3,5].map(l=>parseInt(t.slice(l,l+2),16)),i=.2126*s[0]+.7152*s[1]+.0722*s[2],a=i>210?[20,23,26]:[247,246,237],e=i<35||i>210?.025:.14,h={enig:[201,164,77],hasl:[200,205,215],osp:[226,154,126]}[r];return[s,a,h,s.map(l=>Math.round(l+(255-l)*e)),[175,157,104]]}function Y(t,r,s="appearance",i=!1){var o;const a=new Uint8ClampedArray(t.width*t.height*4),e=new Uint32Array(a.buffer),h=B(r.maskColor,r.processingMode==="color"?(o=r.color)==null?void 0:o.finish:"enig").concat([[235,239,244],[25,33,44],[0,0,0]]),l=new Uint32Array(Uint8Array.from(h.flatMap(n=>[...n,255])).buffer);for(let n=0;n<e.length;n++){if(!t.boardMask[n])continue;if(s==="outline"){e[n]=l[7];continue}if(s==="appearance"){e[n]=l[t.materials[n]];continue}const c=s==="metal"?t.copper[n]&&t.mask[n]&&!t.silk[n]:s==="coveredCopper"?t.copper[n]&&!t.mask[n]&&!t.silk[n]:s==="substrate"?t.mask[n]&&!t.copper[n]&&!t.silk[n]:t[s][n];i&&!c||(e[n]=l[i?7:c?5:6])}return{width:t.width,height:t.height,data:a}}function J(t,r="enig"){const s=new Uint8ClampedArray(t.width*t.height*4),i=new Uint8ClampedArray(s.length),a={enig:72,hasl:100,osp:125}[r];for(let e=0;e<t.materials.length;e++){if(!t.boardMask[e])continue;const h=e*4,l=!!t.silk[e],o=!!t.copper[e]&&!!t.mask[e]&&!l,n=!!t.mask[e]&&!t.copper[e]&&!l,c=l?176:o?140:n?96:t.copper[e]?144:128;s[h]=255,s[h+1]=l?210:o?a:n?230:125,s[h+2]=o?255:0,s[h+3]=255,i[h]=i[h+1]=i[h+2]=c,i[h+3]=255}return{surface:{width:t.width,height:t.height,data:s},height:{width:t.width,height:t.height,data:i}}}const Z=`#version 300 es
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`,T=`#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;
precision highp usampler2D;
`,S=`
uvec4 packTone(float value) {
  uint bits = floatBitsToUint(value);
  return uvec4(bits & 255u, (bits >> 8) & 255u, (bits >> 16) & 255u, bits >> 24);
}
float unpackTone(uvec4 value) {
  return uintBitsToFloat(value.r | (value.g << 8) | (value.b << 16) | (value.a << 24));
}
`,Q=T+S+`
uniform sampler2D uSource;
uniform vec3 uTone; // brightness, contrast (%), invert
layout(location = 0) out uvec4 result;
void main() {
  vec3 rgb = floor(texelFetch(uSource, ivec2(gl_FragCoord.xy), 0).rgb * 255.0 + 0.5);
  float luminance = dot(rgb, vec3(0.2126, 0.7152, 0.0722));
  float value = (luminance - 128.0) * uTone.y / 100.0 + 128.0 + uTone.x;
  if (uTone.z > 0.5) value = 255.0 - value;
  result = packTone(clamp(value, 0.0, 255.0));
}`,q=T+S+`
uniform sampler2D uSource;
uniform usampler2D uTones;
uniform int uRadius;
layout(location = 0) out uvec4 result;
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy), size = textureSize(uSource, 0);
  float sum = 0.0, weight = 0.0;
  for (int y = -3; y <= 3; y++) for (int x = -3; x <= 3; x++) {
    if (abs(x) > uRadius || abs(y) > uRadius) continue;
    ivec2 q = p + ivec2(x, y);
    if (any(lessThan(q, ivec2(0))) || any(greaterThanEqual(q, size))) continue;
    float alpha = floor(texelFetch(uSource, q, 0).a * 255.0 + 0.5);
    sum += unpackTone(texelFetch(uTones, q, 0)) * alpha;
    weight += alpha;
  }
  result = packTone(weight > 0.0 ? sum / weight : unpackTone(texelFetch(uTones, p, 0)));
}`,ee=T+S+`
uniform sampler2D uSource;
uniform usampler2D uTones;
uniform int uMode; // auto, silk, gold, copper, mask, fr4
uniform ivec4 uFlags; // color, dark ink, preserve details, light mask
uniform vec3 uTone;
uniform vec4 uThresholds; // silk, mask, copper, detail
uniform vec4 uMetal; // hue, tolerance, saturation, brightness
uniform int uFinish; // ENIG, HASL, OSP
uniform float uSilver;
uniform ivec2 uBareFlags; // enabled, grayscale method
uniform vec4 uBare; // RGB, similarity
uniform vec2 uBareRange;
out vec4 result;
bool metal(vec3 rgb) {
  float high = max(rgb.r, max(rgb.g, rgb.b)), low = min(rgb.r, min(rgb.g, rgb.b));
  float difference = high - low;
  float saturation = high > 0.0 ? difference / high * 100.0 : 0.0;
  float hue = difference == 0.0 ? 0.0 : high == rgb.r ? (rgb.g-rgb.b)/difference : high == rgb.g ? (rgb.b-rgb.r)/difference+2.0 : (rgb.r-rgb.g)/difference+4.0;
  hue = mod(hue * 60.0 + 360.0, 360.0);
  if (uFinish == 1) return high >= uSilver && (saturation < 16.0 || (hue > 160.0 && hue < 260.0));
  float distance = abs(hue - uMetal.x);
  return min(distance, 360.0-distance) <= uMetal.y && saturation >= uMetal.z && high >= uMetal.w;
}
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  vec4 rgba = floor(texelFetch(uSource, p, 0) * 255.0 + 0.5);
  int material = 255;
  bool protect = false;
  if (rgba.a >= 32.0) {
    if (uMode == 3) material = 3;
    else if (uMode == 4) material = 0;
    else if (uMode == 5) material = 4;
    else {
      float tone = unpackTone(texelFetch(uTones, p, 0));
      if (uMode == 1 || uMode == 2) {
        protect = uFlags.z != 0 && (uFlags.y != 0 ? tone > uThresholds.w : 255.0-tone > uThresholds.w);
        if (!protect) material = uMode;
      } else if (uFlags.x != 0) {
        vec3 rgb = clamp((rgba.rgb - 128.0) * uTone.y / 100.0 + 128.0 + uTone.x, 0.0, 255.0);
        if (uTone.z > 0.5) rgb = 255.0 - rgb;
        bool bare = uBareFlags.x != 0 && (uBareFlags.y != 0
          ? tone >= min(uBareRange.x,uBareRange.y) && tone <= max(uBareRange.x,uBareRange.y)
          : 100.0 * (1.0 - length(rgb-uBare.rgb) / (255.0*sqrt(3.0))) >= uBare.w);
        float value = uFlags.y != 0 || uFlags.w != 0 ? 255.0-tone : tone;
        material = metal(rgb) ? 2 : bare ? 4 : value >= uThresholds.x ? 1 : value >= uThresholds.z ? 3 : 0;
      } else {
        float value = uFlags.y != 0 ? 255.0-tone : tone;
        material = value >= uThresholds.x ? 1 : value >= uThresholds.y ? 2 : 0;
      }
    }
  }
  result = vec4(float(material)/255.0, protect ? 1.0 : 0.0, 0.0, 1.0);
}`,te=T+`
uniform sampler2D uSource;
uniform int uRadius;
out vec4 result;
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy), size = textureSize(uSource, 0);
  vec4 original = texelFetch(uSource, p, 0);
  int material = int(round(original.r * 255.0));
  result = original;
  if (original.g > 0.5 || material == 1 || material == 2) return;
  // CPU expansion visits source pixels in row order; the last overlapping
  // source wins. Gather in that same order, including at transparent edges.
  for (int y = -4; y <= 4; y++) for (int x = -4; x <= 4; x++) {
    if (x*x + y*y > uRadius*uRadius) continue;
    ivec2 q = p + ivec2(x, y);
    if (any(lessThan(q, ivec2(0))) || any(greaterThanEqual(q, size))) continue;
    vec4 candidate = texelFetch(uSource, q, 0);
    int m = int(round(candidate.r * 255.0));
    if (m == 1 || m == 2) result.r = candidate.r;
  }
}`,re=T+`
uniform sampler2D uPrevious;
uniform sampler2D uLayer;
uniform sampler2D uMask;
uniform ivec2 uOffset;
out vec4 result; // material / 255, silk, copper, mask opening
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy), q = p - uOffset;
  result = texelFetch(uPrevious, p, 0);
  if (texelFetch(uMask, p, 0).r == 0.0 || any(lessThan(q,ivec2(0))) || any(greaterThanEqual(q,textureSize(uLayer,0)))) return;
  int material = int(round(texelFetch(uLayer,q,0).r * 255.0));
  if (material == 255) return;
  result.r = float(material)/255.0;
  result.g = material == 1 ? 1.0 : 0.0;
  result.a = material == 2 || material == 4 ? 1.0 : 0.0;
  if (material != 1) result.b = material == 2 || material == 3 ? 1.0 : 0.0;
}`,se=T+`
uniform sampler2D uBoard;
uniform sampler2D uMask;
uniform vec3 uPalette[5];
uniform int uView; // appearance, silk, copper, mask, metal, covered copper, substrate, surface, height
uniform float uMetalRoughness;
out vec4 result;
void main() {
  // Uploaded pixels and intermediate targets use top-to-bottom image rows.
  // Only presentation flips Y into WebGL's bottom-to-top framebuffer.
  ivec2 size = textureSize(uBoard,0);
  ivec2 p = ivec2(int(gl_FragCoord.x), size.y-1-int(gl_FragCoord.y));
  if (texelFetch(uMask,p,0).r == 0.0) { result = vec4(0.0); return; }
  vec4 board = texelFetch(uBoard,p,0);
  bool silk = board.g > 0.5, copper = board.b > 0.5, opening = board.a > 0.5;
  bool metal = copper && opening && !silk, substrate = opening && !copper && !silk;
  vec3 rgb;
  if (uView == 0) rgb = uPalette[int(round(board.r * 255.0))];
  else if (uView == 7) rgb = vec3(255.0,silk ? 210.0 : metal ? uMetalRoughness : substrate ? 230.0 : 125.0,metal ? 255.0 : 0.0);
  else if (uView == 8) rgb = vec3(silk ? 176.0 : metal ? 140.0 : substrate ? 96.0 : copper ? 144.0 : 128.0);
  else {
    bool isActive = uView == 1 ? silk : uView == 2 ? copper : uView == 3 ? opening : uView == 4 ? metal : uView == 5 ? copper && !opening && !silk : substrate;
    rgb = isActive ? vec3(235.0,239.0,244.0) : vec3(25.0,33.0,44.0);
  }
  result = vec4(rgb/255.0,1.0);
}`,ie=["auto","silk","gold","copper","mask","fr4"],ae=["appearance","silk","copper","mask","metal","coveredCopper","substrate","surface","height"];class oe{constructor(r=new OffscreenCanvas(590,1180)){this.canvas=r,this.programs=new Set,this.textures=new Set,this.targets=new Set,this.layers=new Map,this.boards=new Map,this.revision=0,this.disposed=!1,this.stats={uploadedSources:0,processedLayers:0,reusedLayers:0,tonePasses:0,smoothingPasses:0,composed:!1,readbacks:0};const s=r.getContext("webgl2",{alpha:!0,premultipliedAlpha:!1,antialias:!1,depth:!1,stencil:!1,preserveDrawingBuffer:!1,powerPreference:"high-performance"});if(!s)throw new Error("WebGL2 后台计算不可用");this.gl=s,this.limit=s.getParameter(s.MAX_TEXTURE_SIZE),this.vertexArray=s.createVertexArray();try{s.disable(s.BLEND),s.disable(s.DITHER),s.disable(s.DEPTH_TEST),s.pixelStorei(s.UNPACK_ALIGNMENT,1),s.pixelStorei(s.UNPACK_PREMULTIPLY_ALPHA_WEBGL,!1),s.pixelStorei(s.UNPACK_COLORSPACE_CONVERSION_WEBGL,s.NONE),this.toneProgram=this.program(Q),this.smoothProgram=this.program(q),this.classifyProgram=this.program(ee),this.expandProgram=this.program(te),this.composeProgram=this.program(re),this.viewProgram=this.program(se)}catch(i){throw this.dispose(),i}}get resourceCounts(){return{textures:this.textures.size,targets:this.targets.size,programs:this.programs.size}}assertReady(){if(this.disposed||this.gl.isContextLost())throw new Error("PCB GPU 计算上下文已失效")}program(r){const s=this.gl,i=[],a=s.createProgram();if(!a)throw new Error("无法创建 PCB GPU 程序");try{for(const[h,l]of[[s.VERTEX_SHADER,Z],[s.FRAGMENT_SHADER,r]]){const o=s.createShader(h);if(!o)throw new Error("无法创建 PCB GPU 着色器");if(i.push(o),s.shaderSource(o,l),s.compileShader(o),!s.getShaderParameter(o,s.COMPILE_STATUS))throw new Error(s.getShaderInfoLog(o)||"PCB 着色器编译失败");s.attachShader(a,o)}if(s.linkProgram(a),!s.getProgramParameter(a,s.LINK_STATUS))throw new Error(s.getProgramInfoLog(a)||"PCB 着色器链接失败");const e={handle:a,uniforms:new Map};return this.programs.add(e),e}catch(e){throw s.deleteProgram(a),e}finally{for(const e of i)s.deleteShader(e)}}uniform(r,s){return r.uniforms.has(s)||r.uniforms.set(s,this.gl.getUniformLocation(r.handle,s)),r.uniforms.get(s)}texture(r,s,i,a="rgba"){const e=this.gl;if(r<1||s<1||r>this.limit||s>this.limit)throw new Error("PCB 图片超出 GPU 纹理尺寸限制");const h=e.createTexture();if(!h)throw new Error("无法分配 PCB GPU 纹理");this.textures.add(h),e.bindTexture(e.TEXTURE_2D,h),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MIN_FILTER,e.NEAREST),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MAG_FILTER,e.NEAREST),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_S,e.CLAMP_TO_EDGE),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_T,e.CLAMP_TO_EDGE);const l=a==="integer"?e.RGBA8UI:a==="mask"?e.R8:e.RGBA8;return e.texStorage2D(e.TEXTURE_2D,1,l,r,s),i&&e.texSubImage2D(e.TEXTURE_2D,0,0,0,r,s,a==="mask"?e.RED:e.RGBA,e.UNSIGNED_BYTE,new Uint8Array(i.buffer,i.byteOffset,i.byteLength)),h}target(r,s,i=!1){const a=this.gl,e=this.texture(r,s,void 0,i?"integer":"rgba"),h=a.createFramebuffer();if(!h)throw this.deleteTexture(e),new Error("无法分配 PCB GPU 目标");if(a.bindFramebuffer(a.FRAMEBUFFER,h),a.framebufferTexture2D(a.FRAMEBUFFER,a.COLOR_ATTACHMENT0,a.TEXTURE_2D,e,0),a.checkFramebufferStatus(a.FRAMEBUFFER)!==a.FRAMEBUFFER_COMPLETE)throw a.deleteFramebuffer(h),this.deleteTexture(e),new Error("PCB GPU 目标不可用");const l={texture:e,framebuffer:h,width:r,height:s};return this.targets.add(l),l}deleteTexture(r){this.gl.deleteTexture(r),this.textures.delete(r)}deleteTarget(r){r&&(this.gl.deleteFramebuffer(r.framebuffer),this.deleteTexture(r.texture),this.targets.delete(r))}deleteLayer(r){this.deleteTexture(r.source);for(const s of[r.classified,r.tones,r.smooth,r.expanded])this.deleteTarget(s)}deleteBoard(r){this.deleteTexture(r.maskTexture);for(const s of r.targets)this.deleteTarget(s)}begin(r,s){const i=this.gl;i.bindFramebuffer(i.FRAMEBUFFER,(s==null?void 0:s.framebuffer)||null),i.viewport(0,0,(s==null?void 0:s.width)||this.canvas.width,(s==null?void 0:s.height)||this.canvas.height),i.bindVertexArray(this.vertexArray),i.useProgram(r.handle)}bind(r,s,i,a){const e=this.gl;e.activeTexture(e.TEXTURE0+a),e.bindTexture(e.TEXTURE_2D,i),e.uniform1i(this.uniform(r,s),a)}draw(){this.gl.drawArrays(this.gl.TRIANGLES,0,3)}convert(r,s,i){const a=this.gl;let e=this.layers.get(r);if((e==null?void 0:e.pixels)!==s){e&&this.deleteLayer(e);const d=this.target(s.width,s.height);e={pixels:s,source:this.texture(s.width,s.height,s.data),classified:d,output:d,revision:0},this.layers.set(r,e),this.stats.uploadedSources++}const h=R(i);if(e.key===h)return this.stats.reusedLayers++,e;const l=Math.round(i.edgeExpansion),o=Math.round(i.smoothing);if(l<0||l>4||o<0||o>3)throw new Error("PCB 参数超出 GPU 计算范围");const n=["mask","copper","fr4"].includes(i.mode);e.tones||(e.tones=this.target(s.width,s.height,!0));const c=JSON.stringify([i.brightness,i.contrast,i.invert]);if(!n&&e.toneKey!==c){const d=this.toneProgram;this.begin(d,e.tones),this.bind(d,"uSource",e.source,0),a.uniform3f(this.uniform(d,"uTone"),i.brightness,i.contrast,Number(i.invert)),this.draw(),e.toneKey=c,e.smoothKey=void 0,this.stats.tonePasses++}let g=e.tones;if(!n&&o){e.smooth||(e.smooth=this.target(s.width,s.height,!0));const d=`${c}:${o}`;if(e.smoothKey!==d){const m=this.smoothProgram;this.begin(m,e.smooth),this.bind(m,"uSource",e.source,0),this.bind(m,"uTones",e.tones.texture,1),a.uniform1i(this.uniform(m,"uRadius"),o),this.draw(),e.smoothKey=d,this.stats.smoothingPasses++}g=e.smooth}const f=R({...i,edgeExpansion:0});if(e.classKey!==f){const d=this.classifyProgram;this.begin(d,e.classified),this.bind(d,"uSource",e.source,0),this.bind(d,"uTones",g.texture,1),a.uniform1i(this.uniform(d,"uMode"),ie.indexOf(i.mode)),a.uniform4i(this.uniform(d,"uFlags"),+(i.processingMode==="color"),Number(i.darkInk),Number(i.preserveDetails),Number(i.maskIsLight)),a.uniform3f(this.uniform(d,"uTone"),i.brightness,i.contrast,Number(i.invert)),a.uniform4f(this.uniform(d,"uThresholds"),i.silkThreshold,i.maskThreshold,i.copperThreshold,i.detailThreshold),a.uniform4f(this.uniform(d,"uMetal"),i.metalHue,i.hueTolerance,i.saturationThreshold,i.metalBrightness),a.uniform1i(this.uniform(d,"uFinish"),["enig","hasl","osp"].indexOf(i.finish)),a.uniform1f(this.uniform(d,"uSilver"),i.silverThreshold),a.uniform2i(this.uniform(d,"uBareFlags"),Number(i.bareEnabled),+(i.bareMethod==="gray"));const m=[1,3,5].map(p=>parseInt(i.bareColor.slice(p,p+2),16));a.uniform4f(this.uniform(d,"uBare"),m[0],m[1],m[2],i.bareSimilarity),a.uniform2f(this.uniform(d,"uBareRange"),i.bareGrayMin,i.bareGrayMax),this.draw(),e.classKey=f}if(e.output=e.classified,!n&&l){e.expanded||(e.expanded=this.target(s.width,s.height));const d=this.expandProgram;this.begin(d,e.expanded),this.bind(d,"uSource",e.classified.texture,0),a.uniform1i(this.uniform(d,"uRadius"),l),this.draw(),e.output=e.expanded}return e.key=h,e.revision=++this.revision,this.stats.processedLayers++,e}compose(r,s){this.assertReady(),this.stats={uploadedSources:0,processedLayers:0,reusedLayers:0,tonePasses:0,smoothingPasses:0,composed:!1,readbacks:0};const i=this.gl,a=new Set(r.layers.map(n=>`${r.side}:${n.id}`));for(const[n,c]of this.layers)n.startsWith(`${r.side}:`)&&!a.has(n)&&(this.deleteLayer(c),this.layers.delete(n));let e=this.boards.get(r.side);if(!e||e.mask!==r.boardMask||e.width!==r.width||e.height!==r.height){e&&this.deleteBoard(e);const n=[this.target(r.width,r.height),this.target(r.width,r.height)];e={width:r.width,height:r.height,mask:r.boardMask,maskTexture:this.texture(r.width,r.height,r.boardMask,"mask"),targets:n,output:n[0]},this.boards.set(r.side,e)}if(r.board){if(e.saved!==r.board){const n=r.board,c=new Uint8Array(r.width*r.height*4);for(let u=0;u<n.materials.length;u++)c[u*4]=n.materials[u],c[u*4+1]=n.silk[u]?255:0,c[u*4+2]=n.copper[u]?255:0,c[u*4+3]=n.mask[u]?255:0;i.bindTexture(i.TEXTURE_2D,e.targets[0].texture),i.texSubImage2D(i.TEXTURE_2D,0,0,0,r.width,r.height,i.RGBA,i.UNSIGNED_BYTE,c),e.saved=n,e.output=e.targets[0],e.key=void 0,this.stats.uploadedSources++}return e}e.saved=void 0;const h=r.layers.flatMap(n=>{const c=U(s,r.side,n);return c.enabled?[{source:n,layer:this.convert(`${r.side}:${n.id}`,n.pixels,c)}]:[]}),l=JSON.stringify(h.map(({source:n,layer:c})=>[n.id,n.x,n.y,c.revision]));if(e.key===l)return e;this.begin(this.composeProgram,e.targets[0]),i.clearColor(0,0,0,0),i.clear(i.COLOR_BUFFER_BIT);let o=0;for(const{source:n,layer:c}of h){const u=1-o,g=this.composeProgram;this.begin(g,e.targets[u]),this.bind(g,"uPrevious",e.targets[o].texture,0),this.bind(g,"uLayer",c.output.texture,1),this.bind(g,"uMask",e.maskTexture,2),i.uniform2i(this.uniform(g,"uOffset"),n.x,n.y),this.draw(),o=u}return e.output=e.targets[o],e.key=l,this.stats.composed=!0,e}preview(r,s,i){var o;const a=this.compose(r,s),e=this.gl,h={};this.canvas.width!==a.width&&(this.canvas.width=a.width),this.canvas.height!==a.height&&(this.canvas.height=a.height);const l=s.processingMode==="color"?s.color.finish:"enig";try{const n=this.viewProgram;for(const c of i){this.begin(n,null),this.bind(n,"uBoard",a.output.texture,0),this.bind(n,"uMask",a.maskTexture,1),e.uniform3fv(this.uniform(n,"uPalette[0]"),B(s.maskColor,l).flat()),e.uniform1i(this.uniform(n,"uView"),ae.indexOf(c)),e.uniform1f(this.uniform(n,"uMetalRoughness"),{enig:72,hasl:100,osp:125}[l]),this.draw();const u={width:a.width,height:a.height,bitmap:this.canvas.transferToImageBitmap(),backend:"gpu"};h[c]=u}return this.assertReady(),h}catch(n){for(const c of Object.values(h))(o=c.bitmap)==null||o.close();throw n}}readBoard(r,s){const i=this.compose(r,s),a=this.gl,e=i.width*i.height,h=new Uint8Array(e*4);a.bindFramebuffer(a.FRAMEBUFFER,i.output.framebuffer),a.readPixels(0,0,i.width,i.height,a.RGBA,a.UNSIGNED_BYTE,h),this.stats.readbacks++;const l=new Uint8Array(e),o=new Uint8Array(e),n=new Uint8Array(e),c=new Uint8Array(e);for(let u=0;u<e;u++)l[u]=h[u*4],o[u]=h[u*4+1]?1:0,n[u]=h[u*4+2]?1:0,c[u]=h[u*4+3]?1:0;return{side:r.side,width:i.width,height:i.height,boardMask:r.boardMask,materials:l,silk:o,copper:n,mask:c}}dispose(){var r;if(!this.disposed){this.disposed=!0;for(const s of[...this.targets])this.deleteTarget(s);for(const s of this.textures)this.gl.deleteTexture(s);for(const s of this.programs)this.gl.deleteProgram(s.handle);this.gl.deleteVertexArray(this.vertexArray),this.targets.clear(),this.textures.clear(),this.programs.clear(),this.layers.clear(),this.boards.clear(),(r=this.gl.getExtension("WEBGL_lose_context"))==null||r.loseContext()}}}const k=self,C=new j;let M;function ne(){if(M===void 0)try{M=new oe}catch(t){M=null,console.info("PCB 预览使用完整精度 CPU 后台计算",t)}return M}const A=new Map,E=new Map;let P=0;const _=new Map,L=new WeakMap;function D(t){var h,l;const r=t.boardMask||((h=A.get(t.side))==null?void 0:h.boardMask);if(!r)throw new Error("缺少 PCB 板形");const s=t.layers.map(o=>{const n=`${t.side}:${o.id}`;o.pixels&&E.set(n,o.pixels);const c=E.get(n);if(!c)throw new Error(`缺少 PCB 素材：${o.label}`);return{...o,pixels:c}}),i=t.board===void 0?(l=A.get(t.side))==null?void 0:l.board:t.board||void 0,a={...t,boardMask:r,layers:s,board:i},e=new Set(s.map(o=>`${t.side}:${o.id}`));for(const o of E.keys())o.startsWith(`${t.side}:`)&&!e.has(o)&&E.delete(o);return A.set(t.side,a),a}function G(t,r,s,i,a=!1){const e=`${t.side}:${i}:${s}:${a}`,h=r.processingMode==="color"?r.color.finish:"enig",l=s==="appearance"?`${r.maskColor}:${h}`:s==="surface"?h:"",o=_.get(e);if((o==null?void 0:o.board)===t&&o.color===l)return o;let n;if(s==="surface"||s==="height"){let g=L.get(t);(!g||g.finish!==h)&&(g={finish:h,maps:J(t,h)},L.set(t,g)),n=g.maps[s]}else n=Y(t,r,s,a);let c;if(typeof OffscreenCanvas<"u"){c=(o==null?void 0:o.canvas)||new OffscreenCanvas(t.width,t.height),c.width=t.width,c.height=t.height;const g=c.getContext("2d");if(!g)throw new Error("无法创建后台 PCB 画布");g.putImageData(new ImageData(n.data,t.width,t.height),0,0)}const u={board:t,color:l,raster:n,canvas:c};return _.set(e,u),u}async function he(t){const{width:r,height:s,data:i}=t.raster;return t.canvas&&typeof createImageBitmap<"u"?{width:r,height:s,bitmap:await createImageBitmap(t.canvas),backend:"cpu"}:{width:r,height:s,pixels:i.slice(),backend:"cpu"}}async function le(t){var r;try{const s={front:D(t.scenes.front),back:D(t.scenes.back)};if(t.kind==="export"){const a=[];for(const e of t.plan.sides){const h=C.compose(s[e],t.settings,"full"),l=[...t.plan.views.filter(o=>F(t.settings).includes(o)),...t.plan.outline?["outline"]:[]];for(const o of l){const n=G(h,t.settings,o,"full",o!=="appearance");a.push(n.canvas?{side:e,view:o,blob:await n.canvas.convertToBlob({type:"image/png"})}:{side:e,view:o,raster:n.raster})}}k.postMessage({type:"done",id:t.id,images:a});return}const i=[t.side,t.side==="front"?"back":"front"];for(const a of i){if(t.id<=P)break;let e;const h=[...F(t.settings),...t.include3d?["surface","height"]:[]];if(t.quality==="full"){const o=ne();if(o)try{e=o.preview(s[a],t.settings,h)}catch(n){o.dispose(),M=null,console.warn("PCB GPU 计算不可用，已切换至完整精度后台计算",n)}}if(!e){e={};const o=C.compose(s[a],t.settings,t.quality);for(const n of h)e[n]=await he(G(o,t.settings,n,t.quality))}if(t.id<=P){for(const o of Object.values(e))(r=o.bitmap)==null||r.close();break}const l=Object.values(e).map(o=>o.bitmap||o.pixels.buffer);k.postMessage({type:"side",id:t.id,side:a,frames:e},l),await new Promise(o=>setTimeout(o,0))}k.postMessage({type:"done",id:t.id})}catch(s){k.postMessage({type:"error",id:t.id,message:s instanceof Error?s.message:"PCB 后台处理失败"})}}k.onmessage=t=>{t.data.type==="cancel"?P=Math.max(P,t.data.id):le(t.data)}})();
