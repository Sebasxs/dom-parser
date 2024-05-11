import { join } from 'node:path';
import { writeFileSync } from 'node:fs';
import { extractDOMData } from './parser.ts';
import { randomBytes } from 'node:crypto';

const URL = 'https://es.wikipedia.org/wiki/Rosemary%27s_Baby_(pel%C3%ADcula)';

extractDOMData(URL)
   .then(result => {
      const jsonData = JSON.stringify(result, null, 2);
      const hash = randomBytes(4).toString('hex');
      writeFileSync(join('output', `simplified-${hash}.json`), jsonData, 'utf-8');
      console.log(`Data successfully written to simplified-${hash}.json`);
   })
   .catch(error => {
      console.error('An error occurred:', error);
   });
