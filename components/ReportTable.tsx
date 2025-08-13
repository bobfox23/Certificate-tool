import React, { useState, useCallback } from 'react';
import { ProcessedFileData, GameInstanceData, FileDetail, GameProviderMap } from '../types';
import { ClipboardIcon } from './icons/ClipboardIcon';
import { CheckIcon } from './icons/CheckIcon';
import { LoadingSpinner } from './LoadingSpinner';
import { ExclamationTriangleIcon } from './icons/ExclamationTriangleIcon';
import { TrashIcon } from './icons/TrashIcon'; 
import { DownloadIcon } from './icons/DownloadIcon'; 
import { DocumentDuplicateIcon } from './icons/DocumentDuplicateIcon'; // For .COM process button

interface ReportTableProps {
  data: ProcessedFileData[];
  gameProviderMap: GameProviderMap;
  onClearAllData: () => void;
  onExportZip: () => void;
  isZipping: boolean;
  isBatchProcessing: boolean; // Added to disable controls during batch processing
  canExport: boolean;
}

const normalizeGameName = (name: string | null): string => {
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

const cleanGameNameForDisplay = (name: string | null): string => {
    if (!name) return 'N/A';
    const cleaned = name
        .trim()
        .replace(/\s*\(copy\)/i, '') // Remove " (copy)" case-insensitively
        .replace(/\s+(94%|v94)$/i, '')
        .replace(/™|®|©/g, '')
        .replace(/\s+/g, ' ')
        .trim();
    return cleaned || 'N/A';
};

// A pure helper function, can be defined outside the component.
const getDisplayHash = (file: FileDetail): string => {
  if (file.md5) return file.md5;
  if (file.sha1) return file.sha1;
  return 'N/A';
};

export const ReportTable: React.FC<ReportTableProps> = ({ data, gameProviderMap, onClearAllData, onExportZip, isZipping, isBatchProcessing, canExport }) => {
  const [copied, setCopied] = useState(false);
  const [comCopied, setComCopied] = useState(false);

  // This helper depends on props (gameProviderMap), so it's defined inside the component.
  const getGameProvider = (gameName: string | null): string => {
    if (!gameName || gameName.trim() === '' || gameProviderMap.size === 0) return 'N/A';
    const providerInfo = gameProviderMap.get(normalizeGameName(gameName));
    return providerInfo?.provider || 'N/A';
  };

  const copyToClipboard = useCallback(() => {
    const headers = "GameName\tGameCodes\tProgressive\tCertificateRef\tDate\tSupplierRegistrationnumber\tDeactivated\tFileList\tHashList";
    
    const formatListForClipboard = (items: (string | null)[]) => {
      if (!items || items.length === 0) return 'N/A';
      const content = items.filter(Boolean).join(', ');
      if (!content) return 'N/A';
      const escapedContent = content.replace(/"/g, '""');
      return `"${escapedContent}"`;
    };

    // Build a map to store one authoritative IMS code for each game.
    // This ensures consistency when a game appears in multiple certificates.
    const authoritativeImsCodeMap = new Map<string, string>();

    // 1. First pass: Prioritize Monday.com data for the authoritative code.
    for (const [gameNameKey, providerInfo] of gameProviderMap.entries()) {
        if (providerInfo.imsGameCode) {
            authoritativeImsCodeMap.set(gameNameKey, providerInfo.imsGameCode);
        }
    }

    // 2. Second pass: Fill any gaps using the first available code extracted by Gemini.
    data.forEach(fileEntry => {
        if (fileEntry.status !== 'completed') return;
        fileEntry.extractedInstances.forEach(instance => {
            const gameNameKey = normalizeGameName(instance.gameName);
            // If we don't have a code for this game yet, and Gemini found one, use it.
            if (gameNameKey && !authoritativeImsCodeMap.has(gameNameKey) && instance.gameCode) {
                authoritativeImsCodeMap.set(gameNameKey, instance.gameCode);
            }
        });
    });

    const tableRows: string[] = [];
    data.forEach(fileEntry => {
      if (fileEntry.status !== 'completed') return;

      if (fileEntry.extractedInstances.length > 0) {
        fileEntry.extractedInstances.forEach(instance => {
          const cleanedGameName = cleanGameNameForDisplay(instance.gameName);
          const gameNameKey = normalizeGameName(instance.gameName);
          
          // Use the authoritative map to get a consistent game code.
          const gameCodes = authoritativeImsCodeMap.get(gameNameKey) || 'N/A';
          
          const providerInfo = gameProviderMap.get(gameNameKey);
          const portalDate = providerInfo?.portalLiveDate || fileEntry.certificationDate || 'N/A';

          const row = [
            cleanedGameName,
            gameCodes,
            "", // Progressive
            fileEntry.reportNumber || 'N/A',
            portalDate,
            "", // SupplierRegistrationnumber
            "", // Deactivated
            formatListForClipboard(instance.files.map(f => f.name)),
            formatListForClipboard(instance.files.map(f => getDisplayHash(f)))
          ].join('\t');
          tableRows.push(row);
        });
      } else {
        // Fallback for files where no game instances were extracted
        const row = [
          'N/A', 'N/A', "", fileEntry.reportNumber || 'N/A',
          fileEntry.certificationDate || 'N/A', "", "", 'N/A', 'N/A'
        ].join('\t');
        tableRows.push(row);
      }
    });
    
    const rows = tableRows.join('\n');
    if (!rows.trim()) {
        alert("No completed data available to copy.");
        return;
    }
    const tsvData = `${headers}\n${rows}`;
    navigator.clipboard.writeText(tsvData).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(err => {
      console.error('Failed to copy table data:', err);
      alert('Failed to copy table data. See console for details.');
    });
  }, [data, gameProviderMap]);

  const copyForComProcess = useCallback(() => {
    const headers = "Game Name\tIMS Game Code\tCertificate Number\tPortal Live Date";
    
    // Build authoritative IMS code map (same logic as other copy function)
    const authoritativeImsCodeMap = new Map<string, string>();
    for (const [gameNameKey, providerInfo] of gameProviderMap.entries()) {
        if (providerInfo.imsGameCode) {
            authoritativeImsCodeMap.set(gameNameKey, providerInfo.imsGameCode);
        }
    }
    data.forEach(fileEntry => {
        if (fileEntry.status !== 'completed') return;
        fileEntry.extractedInstances.forEach(instance => {
            const gameNameKey = normalizeGameName(instance.gameName);
            if (gameNameKey && !authoritativeImsCodeMap.has(gameNameKey) && instance.gameCode) {
                authoritativeImsCodeMap.set(gameNameKey, instance.gameCode);
            }
        });
    });

    // Create intermediate structure for sorting
    interface ComDataRow {
        gameName: string;
        gameCode: string;
        certificateRef: string;
        date: string;
        provider: string; // For sorting
    }
    const comDataRows: ComDataRow[] = [];

    data.forEach(fileEntry => {
        if (fileEntry.status !== 'completed') return;

        const instances = fileEntry.extractedInstances.length > 0 ? fileEntry.extractedInstances : [{ gameName: null, gameCode: null, files: [] }];

        instances.forEach(instance => {
            const gameNameKey = normalizeGameName(instance.gameName);
            const providerInfo = gameProviderMap.get(gameNameKey);

            comDataRows.push({
                gameName: cleanGameNameForDisplay(instance.gameName),
                gameCode: authoritativeImsCodeMap.get(gameNameKey) || 'N/A',
                certificateRef: fileEntry.reportNumber || 'N/A',
                date: providerInfo?.portalLiveDate || 'N/A', // ONLY use portal live date
                provider: providerInfo?.provider || 'ZZZ_Uncategorized', // For sorting, put uncategorized last
            });
        });
    });

    if (comDataRows.length === 0) {
        alert("No completed data available for .COM process export.");
        return;
    }

    // Sort by provider, then by game name
    comDataRows.sort((a, b) => {
        if (a.provider < b.provider) return -1;
        if (a.provider > b.provider) return 1;
        if (a.gameName < b.gameName) return -1;
        if (a.gameName > b.gameName) return 1;
        return 0;
    });

    const tableRows = comDataRows.map(row => 
        [
            row.gameName,
            row.gameCode,
            row.certificateRef,
            row.date
        ].join('\t')
    );
    
    const tsvData = `${headers}\n${tableRows.join('\n')}`;
    navigator.clipboard.writeText(tsvData).then(() => {
      setComCopied(true);
      setTimeout(() => setComCopied(false), 2000);
    }).catch(err => {
      console.error('Failed to copy .COM process data:', err);
      alert('Failed to copy .COM process data. See console for details.');
    });
  }, [data, gameProviderMap]);


  if (data.length === 0) {
    return null; 
  }
  
  const hasCompletedData = data.some(f => f.status === 'completed');

  return (
    <div className="w-full bg-slate-800 shadow-xl rounded-lg overflow-hidden">
      <div className="p-4 sm:p-6 flex flex-wrap justify-between items-center border-b border-slate-700 gap-2">
        <h2 className="text-xl font-semibold text-slate-100">Extracted Report Data</h2>
        <div className="flex flex-wrap gap-2">
           <button
            onClick={copyForComProcess}
            disabled={!hasCompletedData || isZipping || isBatchProcessing}
            className={`px-4 py-2 rounded-md text-sm font-medium flex items-center transition-all duration-150 ease-in-out
                        ${comCopied ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-amber-600 hover:bg-amber-700'}
                        text-white focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-opacity-50
                        disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            {comCopied ? (
              <CheckIcon className="w-5 h-5 mr-2" />
            ) : (
              <DocumentDuplicateIcon className="w-5 h-5 mr-2" />
            )}
            {comCopied ? 'Copied .COM!' : 'Copy .COM Data (TSV)'}
          </button>
          <button
            onClick={copyToClipboard}
            disabled={!hasCompletedData || isZipping || isBatchProcessing}
            className={`px-4 py-2 rounded-md text-sm font-medium flex items-center transition-all duration-150 ease-in-out
                        ${copied ? 'bg-green-600 hover:bg-green-700' : 'bg-sky-600 hover:bg-sky-700'}
                        text-white focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-opacity-50
                        disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            {copied ? (
              <CheckIcon className="w-5 h-5 mr-2" />
            ) : (
              <ClipboardIcon className="w-5 h-5 mr-2" />
            )}
            {copied ? 'Copied Full!' : 'Copy Full Table (TSV)'}
          </button>
          <button
            onClick={onExportZip}
            disabled={!canExport || isZipping || isBatchProcessing} 
            className={`px-4 py-2 rounded-md text-sm font-medium flex items-center transition-all duration-150 ease-in-out
                        bg-purple-600 hover:bg-purple-700 text-white
                        focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-opacity-50
                        disabled:opacity-50 disabled:cursor-not-allowed`}
            aria-label="Export PDFs by Provider as ZIP"
          >
            {isZipping ? <LoadingSpinner className="w-5 h-5 mr-2"/> : <DownloadIcon className="w-5 h-5 mr-2" />}
            {isZipping ? 'Zipping...' : 'Export ZIP'}
          </button>
          <button
            onClick={onClearAllData}
            disabled={data.length === 0 || isZipping || isBatchProcessing}
            className={`px-4 py-2 rounded-md text-sm font-medium flex items-center transition-all duration-150 ease-in-out
                        bg-red-600 hover:bg-red-700 text-white 
                        focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-opacity-50
                        disabled:opacity-50 disabled:cursor-not-allowed`}
            aria-label="Clear all data"
          >
            <TrashIcon className="w-5 h-5 mr-2" /> 
            Clear Data
          </button>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-700">
          <thead className="bg-slate-700/50">
            <tr>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-300 uppercase tracking-wider">File Name (PDF/Img)</th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-300 uppercase tracking-wider">Status</th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-300 uppercase tracking-wider">Game Name</th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-300 uppercase tracking-wider">Game Provider</th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-300 uppercase tracking-wider">Report Number</th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-300 uppercase tracking-wider">File/Directory Names</th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-300 uppercase tracking-wider">Hash</th>
            </tr>
          </thead>
          <tbody className="bg-slate-800 divide-y divide-slate-700">
            {data.map((fileEntry) => (
              fileEntry.extractedInstances.length > 0 && (fileEntry.status === 'completed' || fileEntry.status === 'processing' || fileEntry.status === 'queued' || fileEntry.status === 'error') ? ( 
                fileEntry.extractedInstances.map((instance, instanceIndex) => (
                  <tr key={`${fileEntry.id}-${instanceIndex}`} className="hover:bg-slate-700/30 transition-colors duration-150">
                    {instanceIndex === 0 && ( 
                      <>
                        <td rowSpan={fileEntry.extractedInstances.length} className="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-200 align-top">{fileEntry.pdfFileName}</td>
                        <td rowSpan={fileEntry.extractedInstances.length} className="px-6 py-4 whitespace-nowrap text-sm align-top">
                          {fileEntry.status === 'queued' && <span className="text-yellow-400">Queued</span>}
                          {fileEntry.status === 'pending' && <span className="text-slate-400">Pending...</span>}
                          {fileEntry.status === 'processing' && <div className="flex items-center text-sky-400"><LoadingSpinner className="w-4 h-4 mr-2"/> Processing...</div>}
                          {fileEntry.status === 'completed' && <span className="text-green-400">Completed</span>}
                          {fileEntry.status === 'error' && (
                            <div className="flex items-center text-red-400" title={fileEntry.errorMessage}>
                              <ExclamationTriangleIcon className="w-4 h-4 mr-2"/> Error
                            </div>
                          )}
                        </td>
                      </>
                    )}
                    <td className="px-6 py-4 whitespace-normal text-sm text-slate-300 break-words max-w-xs">{cleanGameNameForDisplay(instance.gameName)}</td>
                    <td className="px-6 py-4 whitespace-normal text-sm text-slate-300 break-words max-w-xs">{getGameProvider(instance.gameName)}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-300">{fileEntry.reportNumber || 'N/A'}</td>
                    <td className="px-6 py-4 whitespace-normal text-sm text-slate-300 break-words max-w-xs">
                      {instance.files.length > 0 ? instance.files.map(f => f.name).join(', ') : 'N/A'}
                    </td>
                    <td className="px-6 py-4 whitespace-normal text-sm text-slate-300 break-words max-w-xs">
                      {instance.files.length > 0 ? instance.files.map(f => getDisplayHash(f)).join(', ') : 'N/A'}
                    </td>
                  </tr>
                ))
              ) : ( 
                <tr key={fileEntry.id} className="hover:bg-slate-700/30 transition-colors duration-150">
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-200">{fileEntry.pdfFileName}</td>
                   <td className="px-6 py-4 whitespace-nowrap text-sm">
                      {fileEntry.status === 'queued' && <span className="text-yellow-400">Queued</span>}
                      {fileEntry.status === 'pending' && <span className="text-slate-400">Pending...</span>}
                      {fileEntry.status === 'processing' && <div className="flex items-center text-sky-400"><LoadingSpinner className="w-4 h-4 mr-2"/> Processing...</div>}
                      {fileEntry.status === 'completed' && <span className="text-gray-400 italic">No game data found</span>}
                      {fileEntry.status === 'error' && (
                        <div className="flex items-center text-red-400" title={fileEntry.errorMessage}>
                          <ExclamationTriangleIcon className="w-4 h-4 mr-2"/> Error
                        </div>
                      )}
                    </td>
                  <td className="px-6 py-4 whitespace-normal text-sm text-slate-300 break-words max-w-xs">N/A</td>
                  <td className="px-6 py-4 whitespace-normal text-sm text-slate-300 break-words max-w-xs">N/A</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-300">{fileEntry.reportNumber || 'N/A'}</td>
                  <td className="px-6 py-4 whitespace-normal text-sm text-slate-300 break-words max-w-xs">N/A</td>
                  <td className="px-6 py-4 whitespace-normal text-sm text-slate-300 break-words max-w-xs">N/A</td>
                </tr>
              )
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};