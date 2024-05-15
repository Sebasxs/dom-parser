// @packages
import { chromium } from 'playwright';

// @types
import type { DOMData, MetaData, SimplifiedNode } from './types.d';

export async function extractDOMData(url: string): Promise<DOMData> {
   const browser = await chromium.launch();
   const page = await browser.newPage();
   await page.goto(url);
   const domResult = await page.evaluate(extractPageData);
   await browser.close();
   return domResult;
}

function extractPageData(): DOMData {
   function trimAndNormalize(text: string): string {
      return text.replace(/\s+/g, ' ').trim();
   }

   function extractMetaData(): MetaData {
      const metaData: MetaData = {};
      const documentTitle = trimAndNormalize(document.title);
      if (documentTitle) metaData.title = documentTitle;
      return metaData;
   }

   function traverseBody(body: HTMLElement): SimplifiedNode[] {
      const children: SimplifiedNode[] = [];
      body.childNodes.forEach(childNode => {
         if (childNode.nodeType === Node.ELEMENT_NODE) {
            const element = childNode as HTMLElement;
            const tagName = element.tagName.toLowerCase();
            if (tagName === 'script' || tagName === 'style') return;
            const textContent = trimAndNormalize(element.textContent || '');
            const child: SimplifiedNode = {
               tag: tagName,
               text: textContent || undefined,
            };
            children.push(child);
         } else if (childNode.nodeType === Node.TEXT_NODE) {
            const textContent = trimAndNormalize(childNode.textContent || '');
            if (textContent) {
               children.push({ tag: 'span', text: textContent });
            }
         }
      });
      return children;
   }

   return {
      metadata: extractMetaData(),
      body: traverseBody(document.body),
      interactive: [],
   };
}
