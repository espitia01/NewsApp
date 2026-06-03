'use strict';

const fs = require('fs');
const path = require('path');

const root = __dirname;
const out = path.join(root, 'public');

const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');
const js = fs.readFileSync(path.join(root, 'app.js'), 'utf8');

let bundled = html
  .replace('<link rel="stylesheet" href="styles.css">', '<style>\n' + css + '\n</style>')
  .replace('<link rel="icon" href="icon-96.png" sizes="96x96">', '')
  .replace('<script src="app.js"></script>', '<script>\n' + js + '\n</script>');

fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, 'index.html'), bundled);
fs.copyFileSync(path.join(root, 'ping.html'), path.join(out, 'ping.html'));
fs.copyFileSync(path.join(root, 'icon-96.png'), path.join(out, 'icon-96.png'));
fs.writeFileSync(path.join(out, '.nojekyll'), '');

console.log('Built public/index.html');
