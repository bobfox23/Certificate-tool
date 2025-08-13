// This file is a server-side API route.
// This should be deployed as a serverless function on a platform like Vercel or Netlify.

import { GoogleGenAI, GenerateContentResponse } from "@google/genai";
import { ExtractedGeminiInfo, GameInstanceData, FileDetail } from '../types';
import { GEMINI_MODEL_NAME, GENAI_SYSTEM_INSTRUCTION, IMAGE_EXTRACTION_SYSTEM_INSTRUCTION, IMAGE_EXTRACTION_PROMPT_FOR_CONTENTS } from '../constants';

// NOTE: This function expects to be run in a server environment where `process.env.API_KEY` is securely set.

// --- Serverless Function Handler ---
// This is the entry point for the API route, compatible with Vercel's Node.js runtime.
export default async (req: any, res: any) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  try {
    if (!process.env.API_KEY) {
      console.error("FATAL: API_KEY environment variable is not set on the server.");
      return res.status(500).json({ error: "Server configuration error: API Key is missing." });
    }

    // On platforms like Vercel, the body is automatically parsed for Node.js runtimes
    const { type, data, mimeType } = req.body;
    let result: ExtractedGeminiInfo;

    if (type === 'text') {
      if (!data) return res.status(400).json({ error: "Missing 'data' for text extraction." });
      result = await extractInfoFromText(data);
    } else if (type === 'image') {
      if (!data || !mimeType) return res.status(400).json({ error: "Missing 'data' or 'mimeType' for image extraction." });
      result = await extractInfoFromImage(data, mimeType);
    } else {
      return res.status(400).json({ error: "Invalid 'type' specified in request body." });
    }
    
    return res.status(200).json(result);

  } catch (error: any) {
    console.error("Error in /api/extract handler:", error);
    const clientMessage = error.message.includes("API key not valid") 
        ? "The API Key configured on the server is invalid."
        : "An error occurred while processing your request.";
    return res.status(500).json({ error: clientMessage });
  }
};


// --- Internal Gemini Service Logic (Moved from services/geminiService.ts) ---

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY! });

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

function validateAndStructureData(parsedData: any, rawResponseText: string): ExtractedGeminiInfo {
    if (typeof parsedData.reportNumber === 'undefined' ||
        typeof parsedData.certificationDate === 'undefined' ||
        typeof parsedData.supplierRegistrationNumber === 'undefined' ||
        !Array.isArray(parsedData.gameInstances)) {
        console.error("Parsed JSON structure error: missing key fields or gameInstances array. Raw:", rawResponseText.substring(0,500));
        throw new Error('Parsed JSON does not match expected structure (missing reportNumber, certificationDate, supplierRegistrationNumber, or gameInstances array).');
    }
    
    if (parsedData.gameInstances) {
      for (const instance of parsedData.gameInstances as Array<Partial<GameInstanceData>>) {
        if (typeof instance.gameName === 'undefined' ||
            typeof instance.gameCode === 'undefined' ||
            !Array.isArray(instance.files)) {
          console.error("Parsed JSON game instance error: missing gameName, gameCode, or files array. Instance:", instance, "Raw:", rawResponseText.substring(0,500));
          throw new Error('Parsed JSON for a game instance is invalid (missing gameName, gameCode, or files array).');
        }
        if (instance.files) {
          for (const file of instance.files as Array<Partial<FileDetail>>) {
            if (typeof file.name !== 'string' ) {
               console.error("Parsed JSON file entry error: missing name. File:", file, "Raw:", rawResponseText.substring(0,500));
               throw new Error('Parsed JSON for a file entry is invalid (missing name).');
            }
          }
        }
      }
    }

    const validatedData: ExtractedGeminiInfo = {
      reportNumber: parsedData.reportNumber ?? null,
      certificationDate: parsedData.certificationDate ?? null,
      supplierRegistrationNumber: parsedData.supplierRegistrationNumber ?? null,
      gameInstances: (parsedData.gameInstances || []).map((instance: Partial<GameInstanceData>) => ({
          gameName: instance.gameName ?? null,
          gameCode: instance.gameCode ?? null,
          files: (instance.files || []).map((f: Partial<FileDetail>) => ({
              name: f.name!,
              md5: f.md5 === undefined ? null : f.md5, 
              sha1: f.sha1 === undefined ? null : f.sha1 
          }))
      }))
    };
    return validatedData;
}


async function extractInfoFromText(ocrText: string): Promise<ExtractedGeminiInfo> {
  let lastError: any = null;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response: GenerateContentResponse = await ai.models.generateContent({
        model: GEMINI_MODEL_NAME,
        contents: [{ role: "user", parts: [{text: ocrText}] }],
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
      } catch (e: any) {
        throw new Error(`Failed to parse/validate JSON from AI (text). Raw: ${response.text.substring(0,1000)}. Err: ${e.message}`);
      }

    } catch (error: any) {
      lastError = error;
      const errorMessage = String(error.message || '');
      if (errorMessage.includes("status: 500 UNKNOWN") && attempt < MAX_RETRIES) {
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
        continue; 
      }
      if (errorMessage.includes("API key not valid")) {
          throw new Error("Invalid Gemini API Key. Please check your configuration.");
      }
      throw new Error(`Failed to get data from AI (text) after ${attempt} attempt(s): ${errorMessage}`);
    }
  }
  throw lastError || new Error(`Failed to extract info from text after ${MAX_RETRIES} attempts.`);
}

async function extractInfoFromImage(imageBase64: string, mimeType: string): Promise<ExtractedGeminiInfo> {
  let lastError: any = null;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const imagePart = { inlineData: { mimeType, data: imageBase64 } };
      const textPart = { text: IMAGE_EXTRACTION_PROMPT_FOR_CONTENTS };

      const response: GenerateContentResponse = await ai.models.generateContent({
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
      } catch (e: any) {
        throw new Error(`Failed to parse/validate JSON from AI (image). Raw: ${response.text.substring(0,1000)}. Err: ${e.message}`);
      }

    } catch (error: any)
      {
      lastError = error;
      const errorMessage = String(error.message || '');
      if (errorMessage.includes("status: 500 UNKNOWN") && attempt < MAX_RETRIES) {
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
        continue;
      }
      if (errorMessage.includes("API key not valid")) {
        throw new Error("Invalid Gemini API Key. Please check your configuration.");
      }
      throw new Error(`Failed to get data from AI (image) after ${attempt} attempt(s): ${errorMessage}`);
    }
  }
  throw lastError || new Error(`Failed to extract info from image after ${MAX_RETRIES} attempts.`);
}