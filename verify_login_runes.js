const fs = require('fs');

const fileContent = fs.readFileSync('src/routes/(auth)/login/+page.svelte', 'utf-8');

const hasRunes = fileContent.includes('$state') && fileContent.includes('let');
const hasSubmit = fileContent.includes('onsubmit={handleSubmit}');

if (hasRunes && hasSubmit) {
    console.log('Verification Passed: Runes and submit handler detected.');
} else {
    console.error('Verification Failed: Missing runes or submit handler.');
    process.exit(1);
}
