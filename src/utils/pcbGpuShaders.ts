// Material IDs and compositing rules match pcbProcessing.ts. Intermediate
// textures use byte/integer formats so WebGL2 needs no float-buffer extension.
export const pcbGpuVertex = `#version 300 es
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

const header = `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;
precision highp usampler2D;
`;
const floatBytes = `
uvec4 packTone(float value) {
  uint bits = floatBitsToUint(value);
  return uvec4(bits & 255u, (bits >> 8) & 255u, (bits >> 16) & 255u, bits >> 24);
}
float unpackTone(uvec4 value) {
  return uintBitsToFloat(value.r | (value.g << 8) | (value.b << 16) | (value.a << 24));
}
`;

export const pcbGpuTone = header + floatBytes + `
uniform sampler2D uSource;
uniform vec3 uTone; // brightness, contrast (%), invert
layout(location = 0) out uvec4 result;
void main() {
  vec3 rgb = floor(texelFetch(uSource, ivec2(gl_FragCoord.xy), 0).rgb * 255.0 + 0.5);
  float luminance = dot(rgb, vec3(0.2126, 0.7152, 0.0722));
  float value = (luminance - 128.0) * uTone.y / 100.0 + 128.0 + uTone.x;
  if (uTone.z > 0.5) value = 255.0 - value;
  result = packTone(clamp(value, 0.0, 255.0));
}`;

export const pcbGpuSmooth = header + floatBytes + `
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
}`;

export const pcbGpuClassify = header + floatBytes + `
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
}`;

export const pcbGpuExpand = header + `
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
}`;

export const pcbGpuCompose = header + `
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
}`;

export const pcbGpuView = header + `
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
}`;
