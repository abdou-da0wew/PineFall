import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { projectRoot } from './test-support.mjs';
const suites={
 cpu:['test-compatibility.mjs','test-errors.mjs','test-vgpu-fallback.mjs'],
 webgl:['check.mjs','test-renderers.mjs'],
 webgpu:['test-vgpu-browser.mjs','test-vgpu-loss.mjs'],
};
const suite=process.argv[2]||'cpu';
if(!suites[suite])throw new Error(`Unknown suite: ${suite}. Choose cpu, webgl, or webgpu.`);
let server,current;
const port=process.env.TEST_PORT||'4173';
const base=process.env.TEST_BASE_URL||`http://127.0.0.1:${port}`;
function stop(){current?.kill('SIGTERM');server?.kill('SIGTERM');}
process.once('SIGINT',()=>{stop();process.exit(130)});
process.once('SIGTERM',()=>{stop();process.exit(143)});
try{
 if(!process.env.TEST_BASE_URL){
  server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',port,'--strictPort'],{cwd:projectRoot,stdio:['ignore','pipe','pipe']});
  await new Promise((resolve,reject)=>{
   const timeout=setTimeout(()=>reject(new Error('Test server startup timed out')),15000);
   const finish=(error)=>{clearTimeout(timeout);error?reject(error):resolve()};
   server.once('error',finish);server.once('exit',code=>finish(new Error(`Test server exited: ${code}`)));
   server.stdout.on('data',data=>{if(data.toString().includes('Local:'))finish()});
   server.stderr.on('data',data=>process.stderr.write(data));
  });
 }
 for(const script of suites[suite]){
  console.log(`\n→ ${script}`);
  current=spawn(process.execPath,[script],{cwd:projectRoot,env:{...process.env,TEST_BASE_URL:base},stdio:'inherit'});
  const timeout=setTimeout(()=>current?.kill('SIGTERM'),120000);
  const [code,signal]=await once(current,'exit');clearTimeout(timeout);current=null;
  if(code!==0)throw new Error(`${script} failed (${signal||code})`);
 }
 console.log(`\n✓ ${suite} suite passed`);
}catch(error){console.error(error.message);process.exitCode=1;}finally{stop();}
