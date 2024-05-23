export interface InteractiveElement {
   tag: string;
   id?: string;
   name?: string;
   class?: string;
   'aria-label'?: string;
   placeholder?: string;
   value?: string;
   type?: string;
   role?: string;
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
   header?: SimplifiedNode[];
   rows?: SimplifiedNode[][];
}

export interface MetaData {
   title?: string;
   description?: string;
   author?: string;
   canonical?: string;
}

export interface DOMData {
   metadata: MetaData;
   body: SimplifiedNode[];
   interactive: InteractiveElement[];
}
