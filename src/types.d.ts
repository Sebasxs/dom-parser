export interface SimplifiedNode {
   tag: string;
   text?: string;
   children?: SimplifiedNode[];
   href?: string;
   src?: string;
   alt?: string;
}

export interface MetaData {
   title?: string;
   description?: string;
   author?: string;
}

export interface DOMData {
   metadata: MetaData;
   body: SimplifiedNode[];
   interactive: [];
}
