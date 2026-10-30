import React, { useEffect, useRef } from 'react';
import * as api from 'vgpu';
import shader from './world.wgsl';
import { createWorld } from './createWorld.js';

export default function VgpuWorld({game,advanceGame,onUpdate,quality,onReady,onFailure}) {
  const canvasRef=useRef(null),latest=useRef({quality,onReady,onFailure});
  latest.current={quality,onReady,onFailure};
  useEffect(()=>{
    let disposed=false,failed=false,gpu,world,output,loop,unsubscribe,observer;
    let w=1,h=1,currentQuality=latest.current.quality,hud=0;
    const canvas=canvasRef.current;
    const cleanup=()=>{loop?.stop();observer?.disconnect();unsubscribe?.();world?.destroy();gpu?.dispose();};
    function fail(error){if(disposed||failed)return;failed=true;clearTimeout(timeout);loop?.stop();queueMicrotask(()=>{if(!disposed)latest.current.onFailure(error);});}
    const timeout=setTimeout(()=>fail(new Error('vgpu WebGPU initialization timed out after 15 seconds.')),15000);
    function resize(){if(!output||disposed||failed)return;const rect=canvas.getBoundingClientRect();w=Math.max(1,rect.width);h=Math.max(1,rect.height);const ratio=latest.current.quality==='pixel'?.55:Math.min(devicePixelRatio||1,1.5);output.resize([Math.max(1,Math.round(w*ratio)),Math.max(1,Math.round(h*ratio))]);currentQuality=latest.current.quality;}
    void (async()=>{
      if(!navigator.gpu)throw new Error('WebGPU is unavailable in this browser or preview context.');
      gpu=await api.init();
      if(disposed||failed){gpu.dispose();return;}
      unsubscribe=gpu.onError(error=>fail(error));
      gpu.lost.then(info=>fail(new Error(`vgpu WebGPU device lost: ${info.message||info.reason}`)));
      output=api.surface(gpu,canvas,{depth:true,autoResize:false,dpr:.55,alphaMode:'opaque'});
      resize();observer=new ResizeObserver(resize);observer.observe(canvas);
      world=createWorld(api,gpu,shader,game);
      world.update(game,0,w,h,1/60);
      await world.prepare(output);
      if(disposed||failed)return;
      api.frame(gpu,f=>world.render(f,output));
      await gpu.settled();
      if(disposed||failed)return;
      clearTimeout(timeout);
      const info=gpu.gpu.adapterInfo;
      const name=info?[info.vendor,info.architecture,info.device,info.description].filter(Boolean).join(' · '):'Browser WebGPU device (adapter identity not exposed)';
      latest.current.onReady({kind:'vgpu 0.6.0 · WebGPU 3D',name:name||'Browser WebGPU device',software:/swiftshader|llvmpipe|lavapipe|software/i.test(name),exposed:!!info});
      const clock=api.clock(gpu);
      loop=api.frameLoop(gpu,f=>{
        if(disposed||failed)return;
        try{
          if(currentQuality!==latest.current.quality)resize();
          const dt=Math.min(clock.deltaTime,.04);advanceGame(dt);
          world.update(game,clock.time,w,h,dt);world.render(f,output);
          hud+=dt;if(hud>.09){hud=0;onUpdate({...game,keys:undefined});}
        }catch(error){f.cancel();fail(error);}
      });
    })().catch(error=>fail(error));
    return()=>{disposed=true;clearTimeout(timeout);cleanup();};
  },[game,advanceGame,onUpdate]);
  return <canvas ref={canvasRef} aria-label="Pinefall vgpu WebGPU 3D renderer" style={{width:'100%',height:'100%',display:'block'}}/>;
}
