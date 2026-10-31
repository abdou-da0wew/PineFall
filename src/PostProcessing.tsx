import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Vector2, WebGLRenderTarget, UnsignedByteType } from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { getGraphics, useGraphics } from "./graphicsSettings";
const shader = {
  uniforms: {
    tDiffuse: { value: null },
    texel: { value: new Vector2() },
    grade: { value: new Vector2(1, 1) },
    saturation: { value: 1 },
    threshold: { value: 0.75 },
    strength: { value: 0 },
  },
  vertexShader:
    "varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}",
  fragmentShader: `uniform sampler2D tDiffuse;uniform vec2 texel;uniform vec2 grade;uniform float saturation;uniform float threshold;uniform float strength;varying vec2 vUv;
vec3 bright(vec2 uv){vec3 c=texture2D(tDiffuse,uv).rgb;float l=dot(c,vec3(.2126,.7152,.0722));return c*smoothstep(threshold,threshold+.25,l);}
void main(){vec3 c=texture2D(tDiffuse,vUv).rgb;if(strength>0.0){vec3 b=bright(vUv);b+=bright(vUv+vec2(texel.x*2.,0.));b+=bright(vUv-vec2(texel.x*2.,0.));b+=bright(vUv+vec2(0.,texel.y*2.));b+=bright(vUv-vec2(0.,texel.y*2.));c+=b*(strength/5.);}c*=grade.x;c=(c-.18)*grade.y+.18;float l=dot(c,vec3(.2126,.7152,.0722));c=mix(vec3(l),c,saturation);gl_FragColor=vec4(max(c,vec3(0.)),1.);}`,
};
export default function PostProcessing() {
  const { gl, scene, camera, invalidate } = useThree();
  const settings = useGraphics();
  const pipeline = useRef<{
    composer: EffectComposer;
    effect: ShaderPass;
    render: RenderPass;
    output: OutputPass;
  } | null>(null);
  const dimensions = useRef(new Vector2());
  const previous = useRef(new Vector2());
  useEffect(() => {
    if (!settings.post) return;
    const composer = new EffectComposer(
        gl,
        new WebGLRenderTarget(1, 1, {
          type: UnsignedByteType,
          depthBuffer: true,
          stencilBuffer: false,
        }),
      ),
      render = new RenderPass(scene, camera),
      effect = new ShaderPass(shader),
      output = new OutputPass();
    composer.setPixelRatio(1);
    composer.addPass(render);
    composer.addPass(effect);
    composer.addPass(output);
    pipeline.current = { composer, render, effect, output };
    previous.current.set(0, 0);
    invalidate();
    return () => {
      pipeline.current = null;
      effect.dispose();
      render.dispose();
      output.dispose();
      composer.dispose();
    };
  }, [settings.post, gl, scene, camera, invalidate]);
  useFrame((_state, delta) => {
    const p = pipeline.current;
    if (!p) {
      gl.render(scene, camera);
      return;
    }
    gl.getDrawingBufferSize(dimensions.current);
    const size = dimensions.current;
    if (!size.equals(previous.current)) {
      p.composer.setSize(size.x, size.y);
      previous.current.copy(size);
      p.effect.uniforms.texel.value.set(1 / size.x, 1 / size.y);
    }
    const s = getGraphics();
    p.effect.uniforms.grade.value.set(s.exposure, s.contrast);
    p.effect.uniforms.saturation.value = s.saturation;
    p.effect.uniforms.threshold.value = s.threshold;
    p.effect.uniforms.strength.value = s.glow ? s.strength : 0;
    p.composer.render(delta);
  }, 1);
  return null;
}
