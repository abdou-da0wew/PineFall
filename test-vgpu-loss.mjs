import { chromium, expect } from '@playwright/test';
const browser=await chromium.launch({headless:true,args:['--no-sandbox','--enable-unsafe-webgpu','--enable-features=Vulkan','--use-angle=vulkan','--use-vulkan=swiftshader','--use-webgpu-adapter=swiftshader','--disable-vulkan-surface']});
const page=await browser.newPage({viewport:{width:1000,height:700}});
await page.addInitScript(()=>{
 const original=GPUAdapter.prototype.requestDevice;
 GPUAdapter.prototype.requestDevice=async function(...args){const device=await original.apply(this,args);window.testDevice=device;return device;};
});
await page.goto('http://localhost:5173/?renderer=vgpu');await page.locator('button[title="Renderer settings"]').click();
await expect(page.locator('.renderer-status')).toContainText('vgpu 0.6.0',{timeout:25000});
await page.getByRole('button',{name:'BACK TO THE ROAD'}).click();await page.getByRole('button',{name:'START YOUR SHIFT'}).click();await page.keyboard.press('e');await expect(page.getByText('▣ Telescope lens')).toBeVisible();
await page.evaluate(()=>window.testDevice.destroy());
await expect(page.locator('.compatibility-badge')).toContainText('CPU');await expect(page.getByText('▣ Telescope lens')).toBeVisible();
console.log('WebGPU device loss → CPU Canvas, cargo retained: PASS');
await browser.close();
