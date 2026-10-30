import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
export const projectRoot=fileURLToPath(new URL('../',import.meta.url));
const outputDir=process.env.TEST_ARTIFACT_DIR||join(projectRoot,'artifacts','tests');
export function artifact(name){mkdirSync(outputDir,{recursive:true});return join(outputDir,name);}
export function testUrl(search=''){const base=process.env.TEST_BASE_URL||'http://localhost:5173';return new URL(search,base.endsWith('/')?base:base+'/').href;}
