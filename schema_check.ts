import { readFile } from 'fs/promises';
import { resolve } from 'path';

async function checkSchema() {
  try {
    const schemaPath = resolve('/home/ubuntu/Atrevidos/database/schema.sql');
    const content = await readFile(schemaPath, 'utf8');
    
    // Check for some critical tables
    const tables = ['profiles', 'posts', 'matches', 'conversations', 'messages'];
    for (const table of tables) {
      if (!content.includes(`CREATE TABLE ${table}`)) {
        console.error(`Missing table: ${table}`);
        process.exit(1);
      }
    }
    
    console.log('All critical tables found in schema.sql');
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

checkSchema();
