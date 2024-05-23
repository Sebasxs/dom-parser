// @packages
import { chromium } from 'playwright';

// @types
import type { DOMData, InteractiveElement, MetaData, SimplifiedNode } from './types';

export async function extractDOMData(url: string): Promise<DOMData> {
   const browser = await chromium.launch({ headless: true });
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

   function isElementVisible(element: Element): boolean {
      const style = window.getComputedStyle(element);
      return style.display !== 'none' && style.visibility !== 'hidden';
   }

   function extractMetaData(): MetaData {
      const metaData: MetaData = {};
      const documentTitle = trimAndNormalize(document.title);
      if (documentTitle) metaData.title = documentTitle;

      const descriptionElm = document.querySelector('meta[name="description"]') as HTMLMetaElement;
      const description = trimAndNormalize(descriptionElm?.content || '');
      if (description) metaData.description = description;

      const authorElm = document.querySelector('meta[name="author"]') as HTMLMetaElement;
      const author = trimAndNormalize(authorElm?.content || '');
      if (author) metaData.author = author;

      // Extraer URL Canónica
      const canonicalElm = document.querySelector('link[rel="canonical"]') as HTMLLinkElement;
      const canonical = canonicalElm?.href || '';
      if (canonical) metaData.canonical = canonical;

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
      'TABLE',
   ]);

   const INTERACTIVE_TAGS = new Set(['BUTTON', 'INPUT', 'SELECT', 'TEXTAREA', 'A']);
   const interactiveElements: InteractiveElement[] = [];

   function traverseChildNodes(node: Node): SimplifiedNode[] {
      const children: SimplifiedNode[] = [];
      node.childNodes.forEach(childNode => {
         if (childNode.nodeType === Node.ELEMENT_NODE) {
            const element = childNode as Element;
            const tagName = element.tagName.toLowerCase();
            if (tagName === 'script' || tagName === 'style') return;
            if (!isElementVisible(element)) return;

            if (INTERACTIVE_TAGS.has(tagName.toUpperCase())) {
               const interactiveObject: InteractiveElement = { tag: tagName };
               const attributesToExtract = [
                  'id',
                  'name',
                  'class',
                  'aria-label',
                  'placeholder',
                  'value',
                  'type',
                  'role',
               ];
               attributesToExtract.forEach(attr => {
                  if (element.hasAttribute(attr)) {
                     interactiveObject[attr] = element.getAttribute(attr) || undefined;
                  }
               });
               const text = trimAndNormalize(element.textContent || '');
               if (text) interactiveObject.text = text;

               if (tagName === 'a') {
                  const href = element.getAttribute('href');
                  if (href) interactiveObject.href = href;
               }

               interactiveElements.push(interactiveObject);
               return;
            }

            if (!PRESERVED_TAGS.has(tagName.toUpperCase())) return;

            const child: SimplifiedNode = {
               tag: tagName,
               children: traverseChildNodes(element),
            };

            if (tagName === 'img') {
               const src = element.getAttribute('src');
               if (src) child.src = src;
               const alt = element.getAttribute('alt');
               if (alt) child.alt = alt;
            }

            if (tagName === 'a') {
               const href = element.getAttribute('href');
               if (href) child.href = href;
            }

            if (tagName === 'table') {
               return extractTableData(element);
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

   function extractTableData(tableElement: Element): SimplifiedNode {
      const tableData: SimplifiedNode = { tag: 'table', header: [], rows: [] };

      const headerCells = tableElement.querySelectorAll('th');
      if (headerCells.length > 0) {
         const headerRow: SimplifiedNode[] = [];
         headerCells.forEach(cell => {
            const processedCell = processDOMNode(cell);
            if (processedCell) headerRow.push(processedCell as SimplifiedNode);
         });
         tableData.header = headerRow;
      }

      const dataRows = tableElement.querySelectorAll('tr');
      if (dataRows.length > 0) {
         const tableRows: SimplifiedNode[][] = [];
         dataRows.forEach(row => {
            const cells = row.querySelectorAll('td');
            if (cells.length > 0) {
               const rowData: SimplifiedNode[] = [];
               cells.forEach(cell => {
                  const processedCell = processDOMNode(cell);
                  if (processedCell) rowData.push(processedCell as SimplifiedNode);
               });
               tableRows.push(rowData);
            }
         });
         tableData.rows = tableRows;
      }

      return tableData;
   }

   function processDOMNode(node: Node): SimplifiedNode | SimplifiedNode[] | null {
      if (node.nodeType === Node.TEXT_NODE) {
         const textContent = trimAndNormalize(node.textContent || '');
         if (!textContent) return null;
         return { tag: 'span', text: textContent };
      }

      if (node.nodeType !== Node.ELEMENT_NODE) return null;

      const element = node as Element;
      const tagName = element.tagName.toLowerCase();
      if (tagName === 'script' || tagName === 'style') return null;
      if (!isElementVisible(element)) return null;

      if (INTERACTIVE_TAGS.has(tagName.toUpperCase())) {
         return null;
      }

      if (!PRESERVED_TAGS.has(tagName.toUpperCase())) {
         const childNodes = traverseChildNodes(node);
         return childNodes.length ? childNodes : null;
      }

      const elementObject: SimplifiedNode = { tag: tagName };

      if (tagName === 'img') {
         const src = element.getAttribute('src');
         if (src) elementObject.src = src;
         const alt = element.getAttribute('alt');
         if (alt) elementObject.alt = alt;
      }

      if (tagName === 'a') {
         const href = element.getAttribute('href');
         if (href) elementObject.href = href;
      }

      if (tagName === 'table') {
         return extractTableData(element);
      }

      const children = traverseChildNodes(node);
      if (children.length) {
         elementObject.children = children;
      }
      return elementObject;
   }

   return {
      metadata: extractMetaData(),
      body: traverseChildNodes(document.body),
      interactive: interactiveElements,
   };
}
