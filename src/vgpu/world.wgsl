import { instanceWorldMatrix, transformNormal, transformPosition } from "@vgpu/wgsl-std/scene";
struct Camera {
  viewProjection: mat4x4f,
  position: vec3f,
  time: f32,
  car: vec4f,
}
@group(0) @binding(0) var<uniform> camera: Camera;
struct VertexIn {
  @location(0) position: vec3f,
  @location(1) normal: vec3f,
  @location(3) world0: vec4f,
  @location(4) world1: vec4f,
  @location(5) world2: vec4f,
  @location(6) world3: vec4f,
  @location(7) tint: vec4f,
}
struct VertexOut {
  @builtin(position) clip: vec4f,
  @location(0) normal: vec3f,
  @location(1) tint: vec4f,
  @location(2) world: vec3f,
}
@vertex fn vs_main(input: VertexIn) -> VertexOut {
  let model = instanceWorldMatrix(input.world0, input.world1, input.world2, input.world3);
  var out: VertexOut;
  out.world = transformPosition(model, input.position);
  out.clip = camera.viewProjection * vec4f(out.world, 1.0);
  out.normal = transformNormal(model, input.normal);
  out.tint = input.tint;
  return out;
}
@fragment fn fs_main(input: VertexOut) -> @location(0) vec4f {
  let normal = normalize(input.normal);
  let sun = max(dot(normal, normalize(vec3f(-0.5,0.8,0.3))),0.0);
  var rgb = input.tint.rgb * (vec3f(0.44,0.55,0.6) + sun*vec3f(0.65,0.57,0.42));
  // Warm lamp pools and vehicle headlights are calculated in world space.
  let lamps = array<vec2f,12>(vec2f(-5,29),vec2f(5,4),vec2f(-5,-29),vec2f(-31,-5),vec2f(31,5),vec2f(-41,26),vec2f(41,-26),vec2f(29,41),vec2f(-28,-41),vec2f(-41,-28),vec2f(41,29),vec2f(26,-41));
  var warmth = 0.0;
  for(var i=0u;i<12u;i++) {
    let delta = input.world - vec3f(lamps[i].x+1.2,4.5,lamps[i].y);
    warmth += 3.0 / (1.0 + dot(delta,delta)) * max(normal.y,0.0);
  }
  let delta = input.world.xz - camera.car.xy;
  let heading = vec2f(-sin(camera.car.z),-cos(camera.car.z));
  let forward = dot(delta,heading);
  let sideways = abs(delta.x*heading.y-delta.y*heading.x);
  let cone = (1.0-smoothstep(forward*0.26+0.7,forward*0.5+1.0,sideways))*smoothstep(1.0,2.2,forward)*(1.0-smoothstep(9.0,22.0,forward));
  warmth += cone*0.55*max(normal.y,0.0)*(1.0-smoothstep(0.0,2.2,input.world.y));
  rgb += input.tint.rgb*vec3f(1.0,0.77,0.38)*warmth;
  rgb = mix(rgb,input.tint.rgb*1.25,clamp(input.tint.a,0.0,1.0));
  let fog = smoothstep(48.0,115.0,distance(input.world,camera.position))*0.65;
  rgb = mix(rgb,vec3f(0.21,0.31,0.33),fog);
  return vec4f(clamp(rgb,vec3f(0),vec3f(1)),1.0);
}
