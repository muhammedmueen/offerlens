
const fs = require('fs');

async function testPdfParse() {
    try {
        console.log('Importing pdf-parse...');
        const pdfModule = await import('pdf-parse');
        console.log('pdfModule keys:', Object.keys(pdfModule));
        console.log('pdfModule.default:', typeof pdfModule.default);
        console.log('pdfModule.PDFParse:', typeof pdfModule.PDFParse);

        if (pdfModule.PDFParse) {
            console.log('Attempting new PDFParse...');
            try {
                const parser = new pdfModule.PDFParse({ data: Buffer.from('test') });
                console.log('parser created');
            } catch (e) {
                console.log('new PDFParse failed:', e.message);
            }
        }

        if (pdfModule.default) {
            console.log('Attempting pdfModule.default()...');
        }

    } catch (e) {
        console.error('Error:', e);
    }
}

testPdfParse();
