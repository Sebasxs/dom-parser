export interface InteractiveElement {
   tag: string;
   id?: string;
   name?: string;
   'data-testid'?: string;
   class?: string;
   title?: string;
   'aria-label'?: string;
   'data-network'?: string;
   tabindex?: string;
   placeholder?: string;
   value?: string;
   text?: string;
   href?: string;
   [key: string]: string | undefined;
}

export interface SimplifiedNode {
   tag: string;
   text?: string;
   children?: SimplifiedNode[];
   href?: string;
   src?: string;
   alt?: string;
   poster?: string;
   header?: SimplifiedNode[];
   rows?: SimplifiedNode[];
}

export interface MetaData {
   title?: string;
   description?: string;
   author?: string;
   canonical?: string;
   ogImage?: string;
}

export interface DOMData {
   metadata: MetaData;
   body: SimplifiedNode[];
   interactive: InteractiveElement[];
}
