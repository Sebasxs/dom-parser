export interface SimplifiedNode {
   tag: string;
   text?: string;
   children?: SimplifiedNode[];
   src?: string;
}

export interface MetaData {
   title?: string;
}

export interface DOMData {
   metadata: MetaData;
   body: SimplifiedNode[];
   interactive: [];
}
