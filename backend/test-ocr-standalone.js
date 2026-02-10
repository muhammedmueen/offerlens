const fs = require('fs');
const path = require('path');

console.log('Testing pdf-parse...');

const validPdf = Buffer.from(
    `%PDF-1.4
1 0 obj
<<
/Type /Catalog
/Pages 2 0 R
>>
endobj
2 0 obj
<<
/Type /Pages
/Kids [3 0 R]
/Count 1
>>
endobj
3 0 obj
<<
/Type /Page
/Parent 2 0 R
/Resources <<
/Font <<
/F1 4 0 R
>>
>>
/MediaBox [0 0 612 792]
/Contents 5 0 R
>>
endobj
4 0 obj
<<
/Type /Font
/Subtype /Type1
/BaseFont /Helvetica
>>
endobj
5 0 obj
<<
/Length 44
>>
stream
BT
/F1 24 Tf
100 100 Td
(Hello World) Tj
ET
endstream
endobj
xref
0 6
0000000000 65535 f
0000000010 00000 n
0000000060 00000 n
0000000117 00000 n
0000000224 00000 n
0000000301 00000 n
trailer
<<
/Size 6
/Root 1 0 R
>>
startxref
396
%%EOF`
);

try {
    const pdf = require('pdf-parse');
    console.log('pdf-parse required successfully');
    console.log('Type of export:', typeof pdf);

    if (typeof pdf !== 'function') {
        console.error('Export is not a function. Keys:', Object.keys(pdf));
    } else {
        console.log('Export is a function, attempting parse...');
        pdf(validPdf).then(data => {
            console.log('Parse SUCCESS!');
            console.log('Text content:', data.text);
            console.log('Info:', data.info);
        }).catch(e => {
            console.error('Parse FAILED:', e);
        });
    }

} catch (e) {
    console.error('Require FAILED:', e);
}
