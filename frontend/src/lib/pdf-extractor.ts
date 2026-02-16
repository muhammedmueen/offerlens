import * as pdfjsLib from 'pdfjs-dist';

// Set worker source using jsdelivr CDN (more reliable)
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

const MIN_TEXT_LENGTH = 100; // Minimum characters to consider extraction successful

export interface ExtractionResult {
  text: string;
  success: boolean;
  needsOCR: boolean;
  error?: string;
}

export async function extractTextFromPDF(file: File): Promise<ExtractionResult> {
  console.log('[PDF Extractor] Starting PDF text extraction', {
    fileName: file.name,
    fileSize: file.size,
    fileType: file.type
  });

  try {
    const arrayBuffer = await file.arrayBuffer();
    console.log('[PDF Extractor] File loaded into memory', { bufferSize: arrayBuffer.byteLength });
    
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    console.log('[PDF Extractor] PDF document loaded', { numPages: pdf.numPages });
    
    let fullText = '';
    
    // Extract text from each page
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items
        .map((item: any) => item.str)
        .join(' ');
      fullText += pageText + '\n\n';
      console.log(`[PDF Extractor] Page ${i}/${pdf.numPages} extracted`, { 
        pageTextLength: pageText.length,
        totalTextLength: fullText.length 
      });
    }
    
    const extractedText = fullText.trim();
    
    // Check if we got meaningful text
    if (extractedText.length < MIN_TEXT_LENGTH) {
      console.warn('[PDF Extractor] Insufficient text extracted - likely scanned PDF', {
        extractedLength: extractedText.length,
        minRequired: MIN_TEXT_LENGTH
      });
      return {
        text: '',
        success: false,
        needsOCR: true,
        error: 'Scanned PDF detected - needs OCR processing'
      };
    }
    
    console.log('[PDF Extractor] ✅ Text extraction successful', {
      textLength: extractedText.length,
      preview: extractedText.substring(0, 100) + '...'
    });
    
    return {
      text: extractedText,
      success: true,
      needsOCR: false
    };
  } catch (error) {
    console.error('[PDF Extractor] ❌ PDF extraction failed', error);
    return {
      text: '',
      success: false,
      needsOCR: true,
      error: 'Failed to extract text from PDF - may be scanned'
    };
  }
}

export async function extractTextFromImage(file: File): Promise<ExtractionResult> {
  console.log('[PDF Extractor] Image file detected - requires OCR', {
    fileName: file.name,
    fileType: file.type
  });
  
  // Images always need OCR
  return {
    text: '',
    success: false,
    needsOCR: true,
    error: 'Image files require OCR processing'
  };
}

export async function extractTextFromFile(file: File): Promise<ExtractionResult> {
  console.log('[PDF Extractor] Starting file extraction', {
    fileName: file.name,
    fileType: file.type,
    fileSize: file.size
  });

  const fileType = file.type;
  
  if (fileType === 'application/pdf') {
    return extractTextFromPDF(file);
  } else if (fileType.startsWith('image/')) {
    return extractTextFromImage(file);
  } else if (fileType === 'text/plain') {
    const text = await file.text();
    console.log('[PDF Extractor] ✅ Plain text file loaded', { textLength: text.length });
    return {
      text,
      success: true,
      needsOCR: false
    };
  } else {
    console.error('[PDF Extractor] ❌ Unsupported file type', { fileType });
    return {
      text: '',
      success: false,
      needsOCR: false,
      error: 'Unsupported file type'
    };
  }
}
