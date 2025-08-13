
import React, { useState, useCallback, useEffect } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import JSZip from 'jszip';
import saveAs from 'file-saver';

import { FileUploader } from './components/FileUploader.tsx';
import { ReportTable } from './components/ReportTable.tsx';
import { ExcelDataProvider } from './components/ExcelDataProvider.tsx';
import { ApiKeyManager } from './components/ApiKeyManager.tsx';
import { extractInfoFromText, extractInfoFromImage } from './services/geminiService.ts';
import { MAX_FILE_SIZE_BYTES, MAX_FILE_SIZE_MB } from './constants.ts';
import { PlayIcon } from './components/icons/PlayIcon.tsx';

// Set up pdf.js worker
const PDF_WORKER_SRC = `https://cdn.jsdelivr.net/npm/pdfjs-dist@4.5.136/build/pdf.worker.min.js`;

if (typeof Worker !== 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc = PDF_WORKER_SRC;
}

const triggerDownload = (blob, fileName) => {
  saveAs(blob, fileName);
};

const convertFileToBase64AndGetMime = (file): Promise<{ base64: string; mimeType: string; }> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== 'string') {
        reject(new Error("File could not be read as a data URL."));
        return;
      }
      const parts = result.split(';');
      if (parts.length < 2 || !parts[0].startsWith('data:')) {
        reject(new Error("Invalid Data URL format"));
        return;
      }
      const mimeType = parts[0].substring(5);
      const base64Data = parts[1].substring("base64,".length);
      resolve({ base64: base64Data, mimeType });
    };
    reader.onerror = (error) => reject(error);
    reader.readAsDataURL(file);
  });
};

const normalizeGameName = (name) => {
  if (!name) return '';
  return name
    .trim()
    .replace(/\s*\(copy\)/i, '') // Remove " (copy)" case-insensitively
    .replace(/\s+(94%|v94)$/i, '') // Remove specific versioning suffixes like " 94%" or " V94"
    .toLowerCase()
    .replace(/™|®|©/g, '') // Remove common symbols
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim();
};

const App = () => {
  const [apiKey, setApiKey] = useState('');
  const [processedFiles, setProcessedFiles] = useState([]);
  const [originalFilesMap, setOriginalFilesMap] = useState(new Map());
  const [isBatchProcessing, setIsBatchProcessing] = useState(false);
  const [isZipping, setIsZipping] = useState(false);
  const [gameProviderMap, setGameProviderMap] = useState(new Map());
  const [providerDataStatus, setProviderDataStatus] = useState('');

  const extractTextFromPdf = async (file) => {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let fullText = '';
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      fullText += textContent.items.map(item => ('str' in item ? item.str : '')).join(' ') + '\n';
    }
    return fullText;
  };

  const handleFilesSelected = useCallback(async (files) => {
    const newInitialFilesData = [];
    const newOriginalFilesMap = new Map(originalFilesMap);

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const fileId = `${file.name}-${Date.now()}`;
      
      newOriginalFilesMap.set(fileId, file); 

      if (file.size > MAX_FILE_SIZE_BYTES) {
        newInitialFilesData.push({
          id: fileId,
          pdfFileName: file.name,
          reportNumber: null,
          certificationDate: null,
          supplierRegistrationNumber: null,
          extractedInstances: [],
          status: 'error',
          errorMessage: `File exceeds ${MAX_FILE_SIZE_MB}MB limit.`,
        });
        continue;
      }
      
      const isPdf = file.type === 'application/pdf';
      const isImage = file.type.startsWith('image/png') || file.type.startsWith('image/jpeg');

      if (!isPdf && !isImage) {
         newInitialFilesData.push({
          id: fileId,
          pdfFileName: file.name,
          reportNumber: null,
          certificationDate: null,
          supplierRegistrationNumber: null,
          extractedInstances: [],
          status: 'error',
          errorMessage: `Invalid file type: ${file.type}. Please upload PDF (.pdf), PNG (.png), or JPEG (.jpg) files.`,
        });
        continue;
      }

      newInitialFilesData.push({
        id: fileId,
        pdfFileName: file.name,
        reportNumber: null,
        certificationDate: null,
        supplierRegistrationNumber: null,
        extractedInstances: [],
        status: 'queued', 
      });
    }
    setOriginalFilesMap(newOriginalFilesMap);
    setProcessedFiles(prev => [...prev, ...newInitialFilesData]);
  }, [originalFilesMap]);

  const handleStartProcessing = useCallback(async () => {
    if (isBatchProcessing || isZipping) return;

    if (!apiKey) {
        alert("Error: The Gemini API Key is not set. Please set it before processing files.");
        setProcessedFiles(prev => prev.map(f => f.status === 'queued' ? { ...f, status: 'error', errorMessage: 'API Key not set.' } : f));
        return;
    }

    const filesToProcess = processedFiles.filter(f => f.status === 'queued');
    if (filesToProcess.length === 0) {
      alert("No files in the queue to process.");
      return;
    }

    setIsBatchProcessing(true);

    for (const currentFileToProcess of filesToProcess) {
        setProcessedFiles(prev => prev.map(f => f.id === currentFileToProcess.id ? { ...f, status: 'processing' } : f));
        
        try {
            const file = originalFilesMap.get(currentFileToProcess.id);
            if (!file) throw new Error("Original file not found for processing.");

            let extractedData;
            const isPdf = file.type === 'application/pdf';
            const isImage = file.type.startsWith('image/png') || file.type.startsWith('image/jpeg');

            if (isPdf) {
                const textContent = await extractTextFromPdf(file);
                if (!textContent.trim()) {
                    throw new Error("No text content could be extracted from the PDF.");
                }
                extractedData = await extractInfoFromText(textContent, apiKey);
            } else if (isImage) {
                const { base64, mimeType } = await convertFileToBase64AndGetMime(file);
                if (!base64) {
                    throw new Error("Could not convert image to base64.");
                }
                extractedData = await extractInfoFromImage(base64, mimeType, apiKey);
            } else {
                throw new Error(`Unsupported file type for processing: ${file.type}`);
            }
            
            setProcessedFiles(prev => prev.map(f => f.id === currentFileToProcess.id ? {
              ...f,
              reportNumber: extractedData.reportNumber,
              certificationDate: extractedData.certificationDate,
              supplierRegistrationNumber: extractedData.supplierRegistrationNumber,
              extractedInstances: extractedData.gameInstances,
              status: 'completed',
            } : f));
        } catch (error) {
            console.error(`Error processing file ${currentFileToProcess.pdfFileName}:`, error);
            setProcessedFiles(prev => prev.map(f => f.id === currentFileToProcess.id ? {
              ...f,
              status: 'error',
              errorMessage: error.message || 'Failed to process file or extract data.',
            } : f));
        }
    }
    setIsBatchProcessing(false);
  }, [processedFiles, originalFilesMap, isBatchProcessing, isZipping, apiKey]);


  const handleClearAllData = useCallback(() => {
    if (isBatchProcessing || isZipping) {
        alert("Cannot clear data while processing or zipping is in progress.");
        return;
    }
    setProcessedFiles([]);
    setOriginalFilesMap(new Map());
  }, [isBatchProcessing, isZipping]);

  const handleProviderDataParsed = useCallback((map, count) => {
    setGameProviderMap(map);
    if (count > 0) {
      setProviderDataStatus(`Loaded ${count} game provider mapping${count === 1 ? '' : 's'}.`);
    } else {
      setProviderDataStatus('No valid provider data found or data was empty.');
    }
  }, []);

  const handleExportZip = useCallback(async () => {
    if (isZipping || isBatchProcessing || processedFiles.filter(f => f.status === 'completed').length === 0 || gameProviderMap.size === 0) {
      alert("No completed PDF/Image files to export, provider data not loaded, or processing is in progress.");
      return;
    }
    setIsZipping(true);
    setProviderDataStatus('Generating ZIP file, please wait...');

    const zip = new JSZip();
    const filesToZip = processedFiles.filter(pf => pf.status === 'completed');
    let filesAddedToZip = 0;

    for (const processedFile of filesToZip) {
        const originalFile = originalFilesMap.get(processedFile.id);
        if (!originalFile) continue;

        const processedFolders = new Set();

        if (processedFile.extractedInstances && processedFile.extractedInstances.length > 0) {
            for (const instance of processedFile.extractedInstances) {
                const gameNameKey = normalizeGameName(instance.gameName);
                const providerInfo = gameProviderMap.get(gameNameKey);
                let providerName = providerInfo?.provider;

                // Fallback logic for categorization
                if (!providerName) {
                    const gameCode = instance.gameCode;
                    if (gameCode) {
                        if (gameCode.endsWith('_mcg')) providerName = 'Games Global';
                        else if (gameCode.endsWith('_prg')) providerName = 'Pragmatic';
                    }
                }
                
                const folderName = providerName?.trim() || 'Uncategorized';
                
                // Add file to folder only once per folder
                if (!processedFolders.has(folderName)) {
                    const folder = zip.folder(folderName);
                    if (folder) {
                        folder.file(originalFile.name, originalFile, { binary: true });
                        processedFolders.add(folderName);
                    }
                }
            }
        }
        
        // If after all instances, it's still uncategorized, add it to uncategorized folder.
        // This handles cases where instances have no name or code, or file has no instances.
        if (processedFolders.size === 0) {
             const uncategorizedFolder = zip.folder("Uncategorized");
             if (uncategorizedFolder) { 
                uncategorizedFolder.file(originalFile.name, originalFile, { binary: true });
                processedFolders.add('Uncategorized');
             }
        }
      
        if(processedFolders.size > 0) {
            filesAddedToZip++;
        }
    }
    
    if (filesAddedToZip === 0) {
        setProviderDataStatus('No files could be mapped to providers or added to Uncategorized.');
        setIsZipping(false);
        return;
    }

    try {
      const zipBlob = await zip.generateAsync({ type: "blob" });
      triggerDownload(zipBlob, "GameCertificatesByProvider.zip");
      setProviderDataStatus(`Successfully exported ${filesAddedToZip} file(s) in ZIP.`);
    } catch (error) {
      console.error("Error generating ZIP:", error);
      setProviderDataStatus('Error generating ZIP file. See console for details.');
    } finally {
      setIsZipping(false);
    }
  }, [processedFiles, originalFilesMap, gameProviderMap, isZipping, isBatchProcessing]);

  const hasQueuedFiles = processedFiles.some(f => f.status === 'queued');

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 p-4 sm:p-6 lg:p-8 flex flex-col items-center">
      <header className="w-full max-w-5xl mb-8 text-center flex flex-col items-center">
        <img src="https://digibeat.com/wp-content/uploads/2022/06/logo-white-300x80.png" alt="Digital Beat Logo" className="h-12 mb-4" />
        <h1 className="text-4xl font-bold text-sky-400">Certificate Tool</h1>
        <p className="mt-2 text-slate-400">Upload PDFs or Images, map games to providers, and export organized certificates.</p>
      </header>

      <main className="w-full max-w-5xl space-y-8">
        {!apiKey ? (
          <ApiKeyManager onKeySaved={setApiKey} isProcessing={isBatchProcessing || isZipping} />
        ) : (
          <>
            <ExcelDataProvider onDataParsed={handleProviderDataParsed} currentStatus={providerDataStatus} />
            <FileUploader onFilesSelected={handleFilesSelected} isProcessing={isBatchProcessing || isZipping} />
            {processedFiles.length > 0 && (
                 <div className="flex justify-center mt-4">
                    <button
                        onClick={handleStartProcessing}
                        disabled={!hasQueuedFiles || isBatchProcessing || isZipping}
                        className="px-6 py-3 bg-teal-600 hover:bg-teal-700 text-white font-semibold rounded-lg shadow-md
                                   flex items-center justify-center transition-all duration-150 ease-in-out
                                   focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-opacity-75
                                   disabled:opacity-50 disabled:cursor-not-allowed"
                        aria-label="Start processing queued files"
                    >
                        <PlayIcon className="w-5 h-5 mr-2" /> 
                        {isBatchProcessing ? 'Processing...' : `Start Processing Queued Files (${processedFiles.filter(f => f.status === 'queued').length})`}
                    </button>
                 </div>
            )}
          </>
        )}
        
        {apiKey && processedFiles.length > 0 && (
          <ReportTable 
            data={processedFiles} 
            gameProviderMap={gameProviderMap}
            onClearAllData={handleClearAllData} 
            onExportZip={handleExportZip}
            isZipping={isZipping}
            isBatchProcessing={isBatchProcessing}
            canExport={processedFiles.some(f => f.status === 'completed') && gameProviderMap.size > 0 && !isBatchProcessing}
          />
        )}
      </main>

      <footer className="w-full max-w-5xl mt-12 pt-6 border-t border-slate-700 text-center text-slate-500 text-sm">
        <p>&copy; {new Date().getFullYear()} Digital Beat certificate tool. Created by Bob Fox. Powered by Gemini.</p>
      </footer>
    </div>
  );
};

export default App;
