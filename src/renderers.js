import * as THREE from 'three';

// Performance caveats are allowed: SwiftShader, llvmpipe and virtual adapters
// must not be rejected merely for being slow. The browser still chooses the GPU.
const PROFILES = ['default', 'low-power'];
export function inspectContext(gl) {
  let name='Browser-provided WebGL 2 adapter';
  let exposed=false;
  try {
    const extension=gl.getExtension('WEBGL_debug_renderer_info');
    if(extension){name=String(gl.getParameter(extension.UNMASKED_RENDERER_WEBGL));exposed=true;}
  } catch {}
  const software=/swiftshader|llvmpipe|softpipe|software|lavapipe|warp|basic render driver/i.test(name);
  const virtual=/virgl|virtio|vmware|svga|virtualbox|parallels|vgpu|virtual gpu/i.test(name);
  return {name,kind:software?'Software WebGL (CPU)':virtual?'Virtual GPU (reported)':'WebGL 2 (browser adapter)',software,virtual,exposed};
}
export function requestContext(canvas) {
  for (const powerPreference of PROFILES) {
    try {
      const gl=canvas.getContext('webgl2',{alpha:false,antialias:false,depth:true,stencil:false,powerPreference,failIfMajorPerformanceCaveat:false,preserveDrawingBuffer:false});
      if(gl)return gl;
    } catch {}
  }
  return null;
}
export function probeRenderer() {
  const canvas=document.createElement('canvas');
  const gl=requestContext(canvas);
  if(!gl)return {available:false,info:{name:'The browser refused WebGL 2 with both compatibility profiles.',kind:'CPU Canvas 2D',software:true,virtual:false}};
  const info=inspectContext(gl);
  gl.getExtension('WEBGL_lose_context')?.loseContext();
  return {available:true,info};
}
export const CPU_INFO={name:'Isometric Canvas 2D; no WebGL context required. The browser controls Canvas acceleration.',kind:'CPU-compatible Canvas 2D',software:true,virtual:false};
export function initialRenderer() {
  const forced=new URLSearchParams(location.search).get('renderer');
  if(forced==='vgpu')return {mode:'vgpu',info:{kind:'vgpu · initializing WebGPU',name:'Requesting adapter…',software:false}};
  if(forced==='cpu'||forced==='2d')return {mode:'2d',info:CPU_INFO};
  const result=probeRenderer();
  if(result.available)return {mode:'3d',info:result.info};
  if(navigator.gpu)return {mode:'vgpu',info:{kind:'vgpu · initializing WebGPU',name:'WebGL unavailable; trying WebGPU…',software:false}};
  return {mode:'2d',info:CPU_INFO};
}
export function createCompatibleRenderer(props) {
  const context=requestContext(props.canvas);
  if(!context)throw new Error('WebGL 2 unavailable, including browser-provided software or virtual adapters. Switching to CPU-compatible Canvas.');
  return new THREE.WebGLRenderer({...props,canvas:props.canvas,context,antialias:false,alpha:false});
}
