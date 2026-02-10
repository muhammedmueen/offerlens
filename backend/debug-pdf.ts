
import fs from 'fs';
import path from 'path';

async function debug() {
    console.log('--- Debugging pdf-parse ---');
    try {
        const pdfModule = await import('pdf-parse');
        console.log('Imported keys:', Object.keys(pdfModule));
        console.log('Type of module:', typeof pdfModule);
        console.log('Type of default:', typeof pdfModule.default);

        // minimal PDF buffer
        const pdfBuffer = Buffer.from(`%PDF-1.0
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj 3 0 obj<</Type/Page/MediaBox[0 0 3 3]/Parent 2 0 R/Resources<<>>/Contents 4 0 R>>endobj 4 0 obj<</Length 21>>stream
BT/F1 1 Tf(Hello)Tj ET
endstream
endobj
xref
0 5
0000000000 65535 f
0000000010 00000 n
0000000060 00000 n
0000000157 00000 n
0000000271 00000 n
trailer<</Size 5/Root 1 0 R>>
startxref
343
%%EOF`);

        const parseFunc = pdfModule.default || pdfModule;
        if (typeof parseFunc === 'function') {
            console.log('Attempting parse...');
            const data = await parseFunc(pdfBuffer);
            console.log('Success!');
            console.log('Text:', data.text);
        } else {
            console.error('pdf-parse is not a function');
        }

    } catch (err: any) {
        console.error('Error:', err);
        if (err.code === 'ERR_MODULE_NOT_FOUND') {
            console.log('Module not found. Checking node_modules...');
            const nodeModules = path.join(process.cwd(), 'node_modules');
            if (fs.existsSync(nodeModules)) {
                console.log('node_modules exists');
                const pdfParsePath = path.join(nodeModules, 'pdf-parse');
                console.log('pdf-parse path exists:', fs.existsSync(pdfParsePath));
            }
        }
    }
}

debug();
