// @packages
import { chromium } from 'playwright';

// @types
import type { DOMData, InteractiveElement, MetaData, SimplifiedNode } from './types';

export async function extractDOMData(url: string): Promise<DOMData> {
   const browser = await chromium.launch({ headless: true, channel: 'chrome' });
   const page = await browser.newPage();
   await page.goto(url, { waitUntil: 'networkidle', timeout: 600_000 });
   const domResult = await page.evaluate(extractPageData);
   await browser.close();
   return flattenNodes(domResult);
}

function extractPageData(): DOMData {
   function trimAndNormalize(text: string): string {
      return text.replace(/\s+/g, ' ').trim();
   }

   function isElementVisible(element: Element): boolean {
      const style = window.getComputedStyle(element);
      return style.display !== 'none' && style.visibility !== 'hidden';
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
      if (node.nodeType === Node.TEXT_NODE) {
         const textContent = trimAndNormalize(node.textContent || '');
         if (!textContent) return null;
         return { tag: 'span', text: textContent };
      }

      if (node.nodeType !== Node.ELEMENT_NODE) return null;

      const element = node as Element;
      const tagName = element.tagName.toUpperCase();
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

      const thead = tableElement.querySelector('thead');
      const headerRow = thead?.querySelector('tr');
      const firstRow = tableElement.querySelector('tr');
      const headerCells = firstRow?.querySelectorAll('th');

      if (headerRow) {
         const _headerRow = Array.from(headerRow.querySelectorAll('th'));
         tableData.header = _headerRow.map(th => processDOMNode(th) as SimplifiedNode);
      } else if (headerCells?.length) {
         const _headerRow = Array.from(headerCells);
         tableData.header = _headerRow.map(cell => processDOMNode(cell) as SimplifiedNode);
      }

      const tbody = tableElement.querySelector('tbody') || tableElement;
      const rows = Array.from(tbody.querySelectorAll('tr'));
      const dataRows = tableData.header && rows.length > 1 ? rows.slice(1) : rows;
      tableData.rows = dataRows.map(tr => {
         const rows = Array.from(tr.querySelectorAll('td, th'));
         return rows.map(cell => processDOMNode(cell) as SimplifiedNode);
      })[0];

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

   return {
      metadata: extractMetaData(),
      body: traverseChildNodes(document.body),
      interactive: interactiveElements,
   };
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

   nodes.forEach(node => {
      if (node.tag !== 'span') {
         if (buffer) {
            mergedNodes.push(buffer);
            buffer = null;
         }
         mergedNodes.push(node);
         return;
      }

      if (!node.text) return;

      if (!buffer) {
         buffer = { ...node };
      } else {
         const prependSpace = shouldPrependSpace(buffer.text!, node.text);
         buffer.text += prependSpace ? ' ' + node.text : node.text;
      }

      if (!/([.?!\n]|\s)$/.test(node.text) || forceMerging) return;

      mergedNodes.push(buffer);
      buffer = null;
   });

   if (buffer !== null) mergedNodes.push(buffer);
   return mergedNodes;
}

function flattenSingleChildNodes(data: any, key: string): any {
   const child = data[key][0];
   for (const childKey in child) {
      if (childKey === 'tag') continue;
      data[childKey] = child[childKey];
   }

   if (!child.hasOwnProperty(key)) delete data[key];

   const { tag, text, href } = data;
   if (!text || tag.startsWith('h') || tag === 'li') return data;

   data.tag = 'span';

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
