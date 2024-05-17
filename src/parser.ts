// @packages
import { chromium } from 'playwright';

// @types
import type { DOMData, MetaData, SimplifiedNode } from './types';

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

   const PRESERVED_TAGS = new Set([
      'H1',
      'H2',
      'H3',
      'H4',
      'H5',
      'H6',
      'P',
      'A',
      'UL',
      'OL',
      'LI',
      'IMG',
   ]);

   function traverseChildNodes(node: Node): SimplifiedNode[] {
      const children: SimplifiedNode[] = [];
      node.childNodes.forEach(childNode => {
         if (childNode.nodeType === Node.ELEMENT_NODE) {
            const element = childNode as Element;
            const tagName = element.tagName.toLowerCase();
            if (tagName === 'script' || tagName === 'style') return;
            if (!PRESERVED_TAGS.has(tagName.toUpperCase())) return;

            const child: SimplifiedNode = {
               tag: tagName,
               children: traverseChildNodes(element),
            };

            if (tagName === 'img') {
               const src = element.getAttribute('src');
               if (src) child.src = src;
            }

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
      body: traverseChildNodes(document.body),
      interactive: [],
   };
}
