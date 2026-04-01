import { register } from 'node:module';
import { pathToFileURL } from 'node:url';

register('./tests/js-extension-loader.mjs', pathToFileURL('./'));
