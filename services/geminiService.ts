import { ExtractedGeminiInfo } from '../types';

async function handleApiResponse(response: Response): Promise<any> {
  if (!response.ok) {
    let errorMsg = `HTTP error! status: ${response.status}`;
    try {
      const errorBody = await response.json();
      // Use the server's error message if available
      errorMsg = errorBody.error || errorMsg;
    } catch (e) {
      // The response body was not JSON or was empty
      errorMsg = `${errorMsg} - Could not parse error response.`;
    }
    throw new Error(errorMsg);
  }
  return response.json();
}

export async function extractInfoFromText(ocrText: string): Promise<ExtractedGeminiInfo> {
  const response = await fetch('/api/extract', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      type: 'text',
      data: ocrText,
    }),
  });
  return handleApiResponse(response);
}

export async function extractInfoFromImage(imageBase64: string, mimeType: string): Promise<ExtractedGeminiInfo> {
  const response = await fetch('/api/extract', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      type: 'image',
      data: imageBase64,
      mimeType: mimeType,
    }),
  });
  return handleApiResponse(response);
}
