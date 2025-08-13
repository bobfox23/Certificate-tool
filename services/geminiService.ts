import { GoogleGenAI } from "@google/genai";
import { GEMINI_MODEL_NAME, GENAI_SYSTEM_INSTRUCTION, IMAGE_EXTRACTION_SYSTEM_INSTRUCTION, IMAGE_EXTRACTION_PROMPT_FOR_CONTENTS } from '../constants.ts';

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

function validateAndStructureData(parsedData, rawResponseText) {
    // This validation logic is copied from the original api/extract.ts
    if (typeof parsedData.reportNumber === 'undefined' ||
        typeof parsedData.certificationDate === 'undefined' ||
        typeof parsedData.supplierRegistrationNumber === 'undefined' ||
        !Array.isArray(parsedData.gameInstances)) {
        console.error("Parsed JSON structure error: missing key fields or gameInstances array. Raw:", rawResponseText.substring(0,500));
        throw new Error('Parsed JSON does not match expected structure (missing reportNumber, certificationDate, supplierRegistrationNumber, or gameInstances array).');
    }
    
    if (parsedData.gameInstances) {
      for (const instance of parsedData.gameInstances) {
        if (typeof instance.gameName === 'undefined' ||
            typeof instance.gameCode === 'undefined' ||
            !Array.isArray(instance.files)) {
          console.error("Parsed JSON game instance error: missing gameName, gameCode, or files array. Instance:", instance, "Raw:", rawResponseText.substring(0,500));
          throw new Error('Parsed JSON for a game instance is invalid (missing gameName, gameCode, or files array).');
        }
        if (instance.files) {
          for (const file of instance.files) {
            if (typeof file.name !== 'string' ) {
               console.error("Parsed JSON file entry error: missing name. File:", file, "Raw:", rawResponseText.substring(0,500));
               throw new Error('Parsed JSON for a file entry is invalid (missing name).');
            }
          }
        }
      }
    }

    const validatedData = {
      reportNumber: parsedData.reportNumber ?? null,
      certificationDate: parsedData.certificationDate ?? null,
      supplierRegistrationNumber: parsedData.supplierRegistrationNumber ?? null,
      gameInstances: (parsedData.gameInstances || []).map((instance) => ({
          gameName: instance.gameName ?? null,
          gameCode: instance.gameCode ?? null,
          files: (instance.files || []).map((f) => ({
              name: f.name,
              md5: f.md5 === undefined ? null : f.md5, 
              sha1: f.sha1 === undefined ? null : f.sha1 
          }))
      }))
    };
    return validatedData;
}


export async function extractInfoFromText(ocrText, apiKey) {
  if (!apiKey) throw new Error("API Key is not provided.");
  const ai = new GoogleGenAI({ apiKey });
  let lastError = null;
  
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await ai.models.generateContent({
        model: GEMINI_MODEL_NAME,
        contents: ocrText,
        config: {
          systemInstruction: GENAI_SYSTEM_INSTRUCTION,
          responseMimeType: "application/json",
          thinkingConfig: { thinkingBudget: 0 } 
        },
      });

      let jsonStr = response.text.trim();
      const fenceRegex = /^```(\w*)?\s*\n?(.*?)\n?\s*```$/s;
      const match = jsonStr.match(fenceRegex);
      if (match && match[2]) {
        jsonStr = match[2].trim();
      }

      try {
        const parsedData = JSON.parse(jsonStr);
        return validateAndStructureData(parsedData, response.text);
      } catch (e) {
        throw new Error(`Failed to parse/validate JSON from AI (text). Raw: ${response.text.substring(0,1000)}. Err: ${e.message}`);
      }

    } catch (error) {
      lastError = error;
      const errorMessage = String(error.message || '');
      if (errorMessage.includes("API key not valid")) {
          throw new Error("The provided API Key is invalid or has been rejected by Google.");
      }
      if (errorMessage.includes("500") && attempt < MAX_RETRIES) { // More generic retry for server errors
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS * attempt));
        continue; 
      }
      // Don't rethrow on final attempt, it will be thrown after loop
    }
  }
  throw lastError || new Error(`Failed to extract info from text after ${MAX_RETRIES} attempts.`);
}

export async function extractInfoFromImage(imageBase64, mimeType, apiKey) {
  if (!apiKey) throw new Error("API Key is not provided.");
  const ai = new GoogleGenAI({ apiKey });
  let lastError = null;
  
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const imagePart = { inlineData: { mimeType, data: imageBase64 } };
      const textPart = { text: IMAGE_EXTRACTION_PROMPT_FOR_CONTENTS };

      const response = await ai.models.generateContent({
        model: GEMINI_MODEL_NAME,
        contents: { parts: [imagePart, textPart] },
        config: {
          systemInstruction: IMAGE_EXTRACTION_SYSTEM_INSTRUCTION,
          responseMimeType: "application/json",
          thinkingConfig: { thinkingBudget: 0 }
        },
      });

      let jsonStr = response.text.trim();
      const fenceRegex = /^```(\w*)?\s*\n?(.*?)\n?\s*```$/s;
      const match = jsonStr.match(fenceRegex);
      if (match && match[2]) {
        jsonStr = match[2].trim();
      }
      
      try {
        const parsedData = JSON.parse(jsonStr);
        return validateAndStructureData(parsedData, response.text);
      } catch (e) {
        throw new Error(`Failed to parse/validate JSON from AI (image). Raw: ${response.text.substring(0,1000)}. Err: ${e.message}`);
      }

    } catch (error) {
      lastError = error;
      const errorMessage = String(error.message || '');
       if (errorMessage.includes("API key not valid")) {
          throw new Error("The provided API Key is invalid or has been rejected by Google.");
      }
      if (errorMessage.includes("500") && attempt < MAX_RETRIES) {
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS * attempt));
        continue;
      }
    }
  }
  throw lastError || new Error(`Failed to extract info from image after ${MAX_RETRIES} attempts.`);
}