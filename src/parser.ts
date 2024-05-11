// @packages
import { chromium } from 'playwright';

export async function extractDOMData(url: string): Promise<string> {
   const browser = await chromium.launch();
   const page = await browser.newPage();
   await page.goto(url);
   const bodyText = await page.evaluate(() => document.body.textContent);
   await browser.close();
   return bodyText || '';
}
