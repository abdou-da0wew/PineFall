import { artifact, testUrl, projectRoot } from './scripts/test-support.mjs';
import { chromium, expect } from '@playwright/test';
const browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-webgl']});
const page=await browser.newPage();await page.addInitScript(()=>Object.defineProperty(navigator,'gpu',{get:()=>undefined}));
await page.goto(testUrl('/?renderer=cpu'));await page.getByRole('button',{name:'START YOUR SHIFT'}).click();await page.keyboard.press('e');await expect(page.getByText('▣ Telescope lens')).toBeVisible();
await page.locator('button[title="Renderer settings"]').click();await page.getByRole('button',{name:'vgpu · WebGPU',exact:false}).click();
await expect(page.locator('.renderer-note')).toContainText('WebGPU is unavailable');await expect(page.locator('.renderer-status')).toContainText('CPU-compatible');
await expect(page.getByText('▣ Telescope lens')).toBeVisible();console.log('Missing WebGPU → CPU fallback, cargo retained: PASS');
await browser.close();
