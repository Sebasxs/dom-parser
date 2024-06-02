// @packages
import { chromium } from 'playwright';

// @types
import type { DOMData, InteractiveElement, MetaData, SimplifiedNode } from './types';

const TIMEOUT = 600_000;

export async function extractDOMData(url: string): Promise<DOMData> {
   const browser = await chromium.launch({ headless: true, channel: 'chrome' });
   const page = await browser.newPage();
   await page.goto(url, { waitUntil: 'networkidle', timeout: TIMEOUT });
   const domResult = await page.evaluate(extractPageData);
   await browser.close();
   return domResult;
}

function extractPageData(): DOMData {
   function trimAndNormalize(text: string): string {
      return text.replace(/\s+/g, ' ').trim();
   }

   function isElementVisible(element: Element): boolean {
      const style = window.getComputedStyle(element);
      return style.display !== 'none' && style.visibility !== 'hidden';
   }

   function mergeAdjacentSpans(nodes: SimplifiedNode[], forceMerging?: boolean): SimplifiedNode[] {
      if (!Array.isArray(nodes)) return nodes;

      const mergedNodes: SimplifiedNode[] = [];
      let buffer: SimplifiedNode | null = null;

      function shouldPrependSpace(existingText: string, newText: string): boolean {
         const endsWithNoSpace = !/([«{(\[]|\n|\r\n?)$/.test(existingText);
         const startsWithNoSpace = !/^([^\w«[({]|\n|\r\n?)/.test(newText);
         return endsWithNoSpace && startsWithNoSpace;
      }

      function pushBuffer(): void {
         if (!buffer) return;
         buffer.text = buffer.text?.replace(/\n+$/, '');
         mergedNodes.push(buffer);
         buffer = null;
      }

      nodes.forEach(node => {
         if (!node.text || node.tag === 'li' || node.tag.startsWith('h')) {
            pushBuffer();
            mergedNodes.push(node);
            return;
         }

         if (!buffer) {
            buffer = { ...node };
         } else {
            const prependSpace = shouldPrependSpace(buffer.text!, node.text);
            buffer.text += prependSpace ? ' ' : '';
            buffer.text += node.text;
         }

         const isShort = buffer?.text && buffer.text.length < 2000;
         const isEndOfSentence = /[.?!]$/.test(node.text);

         if (!isEndOfSentence && !forceMerging) return;
         if (isEndOfSentence && isShort) {
            buffer.text += '\n\n';
            return;
         }

         pushBuffer();
      });

      if (buffer !== null) pushBuffer();
      return mergedNodes;
   }

   function flattenSingleChildNodes(data: any, key: string): any {
      const children = data[key];
      if (!Array.isArray(children) || children.length === 0) {
         return data;
      }

      const child = children[0];

      Object.keys(child).forEach(childKey => {
         if (childKey === 'tag') return;
         data[childKey] = child[childKey];
      });

      if (!child.hasOwnProperty(key)) {
         delete data[key];
      }

      const { tag, text, href, src } = data;
      if (tag.startsWith('h')) return data;

      if (href && src && href === src) {
         data.tag = 'img';
         delete data.href;
      }

      if (!data.text) return data;

      if (tag === 'li') {
         data.text = data.text.replace(/\n+/g, ' ').trim();
         return data;
      }

      if (href) {
         data.text = `[${text}](${href})`;
         delete data.href;
      } else if (tag === 'code') {
         data.text = `\`${text}\``;
      } else if (tag === 'pre') {
         data.text = `\n\`\`\`\n${text}\n\`\`\`\n`;
      }

      return data;
   }

   function flattenNodes(data: any): any {
      if (data === null || typeof data !== 'object') return data;

      if (Array.isArray(data)) {
         const flattenedArray = data.map(flattenNodes).filter(Boolean);
         return mergeAdjacentSpans(flattenedArray);
      }

      if (Object.keys(data).length === 1 && data.hasOwnProperty('tag')) return null;

      for (const key in data) {
         if (key === 'header' || key === 'rows') continue;
         data[key] = flattenNodes(data[key]);
      }

      if (data.tag === 'li' && data.children) {
         data.children = mergeAdjacentSpans(data.children, true);
      }

      const keys = Object.keys(data);
      for (const key of keys) {
         if (key === 'header' || key === 'rows') continue;

         const value = data[key];
         if (!Array.isArray(value) || value.length > 1) continue;

         if (!value.length) {
            delete data[key];
            continue;
         }

         data = flattenSingleChildNodes(data, key);
      }

      return data;
   }

   function flattenTable(cellsArray: Element[]): SimplifiedNode[] {
      return cellsArray
         .map(cell => {
            const processedNode = processDOMNode(cell) as SimplifiedNode;
            if (Array.isArray(processedNode)) return flattenNodes(processedNode);
            return processedNode;
         })
         .flat()
         .filter(Boolean);
   }

   const INTERACTIVE_TAGS = new Set(['BUTTON', 'INPUT', 'SELECT', 'TEXTAREA']);
   const PRESERVED_TAGS = new Set([
      'H1',
      'H2',
      'H3',
      'H4',
      'H5',
      'H6',
      'UL',
      'OL',
      'LI',
      'P',
      'A',
      'TABLE',
      'IMG',
      'VIDEO',
      'IFRAME',
      'CODE',
      'PRE',
      'ARTICLE',
      'SECTION',
   ]);

   const interactiveElements: InteractiveElement[] = [];

   function traverseChildNodes(node: Node): SimplifiedNode[] {
      const children: SimplifiedNode[] = [];
      node.childNodes.forEach(child => {
         const processedChild = processDOMNode(child);
         if (processedChild === null) return;
         if (Array.isArray(processedChild)) {
            children.push(...processedChild);
         } else {
            children.push(processedChild);
         }
      });

      return children;
   }

   function processDOMNode(node: Node): SimplifiedNode | SimplifiedNode[] | null {
      const element = node as Element;
      const tagName = element.tagName?.toUpperCase() || 'span';
      if (node.nodeType === Node.TEXT_NODE) {
         const textContent = trimAndNormalize(node.textContent || '');
         if (!textContent) return null;
         return { tag: tagName, text: textContent };
      }

      if (node.nodeType !== Node.ELEMENT_NODE) return null;
      if (tagName === 'SCRIPT' || tagName === 'STYLE') return null;
      if (!isElementVisible(element)) return null;

      const hasRoleAttr = element.hasAttribute('role');
      const hasButtonRole = hasRoleAttr && element.getAttribute('role')?.toLowerCase() === 'button';
      const isInteractive = INTERACTIVE_TAGS.has(tagName) || hasButtonRole;

      if (isInteractive) {
         const interactiveObject: InteractiveElement = { tag: tagName.toLowerCase() };
         const attributesToExtract = [
            'id',
            'name',
            'data-testid',
            'class',
            'title',
            'aria-label',
            'data-network',
            'tabindex',
            'placeholder',
            'value',
         ];

         attributesToExtract.forEach(attr => {
            if (!element.hasAttribute(attr)) return;
            interactiveObject[attr] = element.getAttribute(attr) || undefined;
         });

         const text = trimAndNormalize(element.textContent || '');
         if (text) interactiveObject.text = text;

         const href = element.getAttribute('href');
         if (tagName === 'A' && href) {
            interactiveObject.href = new URL(href, document.baseURI).href;
         }

         interactiveElements.push(interactiveObject);
      }

      if (!PRESERVED_TAGS.has(tagName)) {
         const childNodes = traverseChildNodes(node);
         return childNodes.length ? childNodes : null;
      }

      const elementObject: SimplifiedNode = { tag: tagName.toLowerCase() };

      if (tagName === 'TABLE') return extractTableData(element);

      const href = element.getAttribute('href');
      if (tagName === 'A' && href) {
         elementObject.href = new URL(href, document.baseURI).href;
      }

      const src = element.getAttribute('src');
      if (src) {
         elementObject.src = new URL(src, document.baseURI).href;
      }

      if (tagName === 'IMG') {
         const altText = element.getAttribute('alt');
         if (altText) elementObject.alt = trimAndNormalize(altText);
         return elementObject;
      }

      const poster = element.getAttribute('poster');
      if (tagName === 'VIDEO' && poster) {
         elementObject.poster = new URL(poster, document.baseURI).href;
      }

      const children = traverseChildNodes(node);
      if (children.length) {
         elementObject.children = children;
      }
      return elementObject;
   }

   function extractTableData(tableElement: Element): SimplifiedNode {
      const tableData: SimplifiedNode = { tag: 'table', header: [], rows: [] };

      const thead = tableElement.querySelector(':scope > thead');
      if (thead) {
         const headerRows = Array.from(thead.querySelectorAll(':scope > tr'));
         if (headerRows.length > 0) {
            const headerCellsArray = Array.from(
               headerRows[0].querySelectorAll(':scope > th, :scope > td'),
            );
            tableData.header = flattenTable(headerCellsArray);
         }
      } else {
         let firstRow: Element | null = null;
         const tbody = tableElement.querySelector(':scope > tbody');
         if (tbody) {
            const rows = Array.from(tbody.querySelectorAll(':scope > tr'));
            if (rows.length > 0) {
               firstRow = rows[0];
            }
         } else {
            const rows = Array.from(tableElement.children).filter(
               child => child.tagName.toUpperCase() === 'TR',
            );
            if (rows.length > 0) {
               firstRow = rows[0];
            }
         }

         if (firstRow) {
            const headerCellsArray = Array.from(firstRow.querySelectorAll(':scope > th')).filter(
               th => th.closest('table') === tableElement,
            );
            if (headerCellsArray.length > 0) {
               tableData.header = flattenTable(headerCellsArray);
            }
         }
      }

      let rows: Element[] = [];
      const tbody = tableElement.querySelector('tbody');
      if (tbody) {
         rows = Array.from(tbody.querySelectorAll(':scope > tr'));
      } else {
         rows = Array.from(tableElement.children).filter(
            child => child.tagName.toUpperCase() === 'TR',
         );
      }

      if (tableData.header?.length && rows.length) {
         const firstRow = rows[0];
         if (firstRow.querySelector(':scope > th')) {
            rows = rows.slice(1);
         }
      }

      tableData.rows = rows
         .map(tr => {
            const cells = Array.from(tr.querySelectorAll(':scope > td, :scope > th'));
            return flattenTable(cells);
         })
         .filter(row => row.length > 0);

      return tableData;
   }

   function extractMetaData(): MetaData {
      const metaData: MetaData = {};

      const ogTitleElm = document.querySelector('meta[property="og:title"]') as HTMLMetaElement;
      const ogTitle = trimAndNormalize(ogTitleElm?.content || '');
      const documentTitle = trimAndNormalize(document.title);
      if (ogTitle || documentTitle) metaData.title = ogTitle || documentTitle;

      const ogDescriptionElm = document.querySelector('meta[property="og:description"]') as any;
      const ogDescription = trimAndNormalize(ogDescriptionElm?.content || '');
      const descriptionElm = document.querySelector('meta[name="description"]') as HTMLMetaElement;
      const description = trimAndNormalize(descriptionElm?.content || '');
      if (ogDescription || description) metaData.description = ogDescription || description;

      const authorElm = document.querySelector('meta[name="author"]') as HTMLMetaElement | null;
      const author = trimAndNormalize(authorElm?.content || '');
      if (author) metaData.author = author;

      const canonicalElm = document.querySelector('link[rel="canonical"]') as HTMLLinkElement;
      const canonical = canonicalElm?.href.trim() || '';
      if (canonical) metaData.canonical = canonical;

      const ogImageElm = document.querySelector('meta[property="og:image"]') as HTMLMetaElement;
      const ogImage = trimAndNormalize(ogImageElm?.content || '');
      if (ogImage) metaData.ogImage = ogImage;

      return metaData;
   }

   return flattenNodes({
      meta: extractMetaData(),
      body: traverseChildNodes(document.body),
      interactive: interactiveElements,
   });
}
