import fs from 'fs';
const content = fs.readFileSync('src/routes/(auth)/login/+page.svelte', 'utf8');
console.log('File exists and has ' + content.length + ' chars');
