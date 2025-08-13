import React, { useState, useCallback } from 'react';
import { ClipboardIcon } from './icons/ClipboardIcon.tsx';
import { CheckIcon } from './icons/CheckIcon.tsx';
import { LoadingSpinner } from './LoadingSpinner.tsx';
import { ExclamationTriangleIcon } from './icons/ExclamationTriangleIcon.tsx';
import { TrashIcon } from './icons/TrashIcon.tsx'; 
import { DownloadIcon } from './icons/DownloadIcon.tsx'; 
import { DocumentDuplicateIcon } from './icons/DocumentDuplicateIcon.tsx';

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

const cleanGameNameForDisplay = (name) => {
    if (!name) return 'N/A';
    const cleaned = name
        .trim()
        .replace(/\s*\(copy\)/i, '')
        .replace(/\s+(94%|v94)$/i, '')
        .replace(/™|®|©/g, '')
        .replace(/\s+/g, ' ')
        .trim();
    return cleaned || 'N/A';
};

const getDisplayHash = (file) => {
  if (file.md5) return file.md5;
  if (file.sha1) return file.sha1;
  return 'N/A';
};

export const ReportTable = ({ data, gameProviderMap, onClearAllData, onExportZip, isZipping, isBatchProcessing, canExport }) => {
  const [copied, setCopied] = useState(false);
  const [comCopied, setComCopied] = useState(false);

  const getGameProvider = (gameName) => {
    if (!gameName || gameName.trim() === '' || gameProviderMap.size === 0) return 'N/A';
    const providerInfo = gameProviderMap.get(normalizeGameName(gameName));
    return providerInfo?.provider || 'N/A';
  };

  const copyToClipboard = useCallback(() => {
    const headers = "GameName\tGameCodes\tProgressive\tCertificateRef\tDate\tSupplierRegistrationnumber\tDeactivated\tFileList\tHashList";
    
    const formatListForClipboard = (items) => {
      if (!items || items.length === 0) return 'N/A';
      const content = items.filter(Boolean).join(', ');
      if (!content) return 'N/A';
      const escapedContent = content.replace(/"/g, '""');
      return `"${escapedContent}"`;
    };

    const authoritativeImsCodeMap = new Map();
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

    const tableRows = [];
    data.forEach(fileEntry => {
      if (fileEntry.status !== 'completed') return;

      if (fileEntry.extractedInstances.length > 0) {
        fileEntry.extractedInstances.forEach(instance => {
          const cleanedGameName = cleanGameNameForDisplay(instance.gameName);
          const gameNameKey = normalizeGameName(instance.gameName);
          const gameCodes = authoritativeImsCodeMap.get(gameNameKey) || 'N/A';
          const providerInfo = gameProviderMap.get(gameNameKey);
          const portalDate = providerInfo?.portalLiveDate || fileEntry.certificationDate || 'N/A';

          const row = [
            cleanedGameName, gameCodes, "", fileEntry.reportNumber || 'N/A',
            portalDate, "", "",
            formatListForClipboard(instance.files.map(f => f.name)),
            formatListForClipboard(instance.files.map(f => getDisplayHash(f)))
          ].join('\t');
          tableRows.push(row);
        });
      } else {
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
    
    const authoritativeImsCodeMap = new Map();
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

    const comDataRows = [];
    data.forEach(fileEntry => {
        if (fileEntry.status !== 'completed') return;
        const instances = fileEntry.extractedInstances.length > 0 ? fileEntry.extractedInstances : [{ gameName: null, gameCode: null, files: [] }];
        instances.forEach(instance => {
            const gameNameKey = normalizeGameName(instance.gameName);
            const providerInfo = gameProviderMap.get(gameNameKey);

            comDataRows.push({
                gameName: cleanGameNameForDisplay(instance.gameName),
                gameCode: authoritativeImsCodeMap.get(gameNameKey) || 'N/A',
                certificateNumber: fileEntry.reportNumber || 'N/A',
                portalLiveDate: providerInfo?.portalLiveDate || fileEntry.certificationDate || 'N/A'
            });
        });
    });

    const uniqueComDataMap = new Map();
    comDataRows.forEach(row => {
        uniqueComDataMap.set(row.gameName, row);
    });

    const uniqueRows = Array.from(uniqueComDataMap.values());
    const rows = uniqueRows.map(row => [
        row.gameName, row.gameCode, row.certificateNumber, row.portalLiveDate
    ].join('\t')).join('\n');

    if (!rows.trim()) {
        alert("No completed data to copy for .COM process.");
        return;
    }

    const tsvData = `${headers}\n${rows}`;
    navigator.clipboard.writeText(tsvData).then(() => {
        setComCopied(true);
        setTimeout(() => setComCopied(false), 2000);
    }).catch(err => {
        console.error('Failed to copy .COM data:', err);
        alert('Failed to copy .COM data. See console for details.');
    });
  }, [data, gameProviderMap]);
  
  return (
    <div className="w-full bg-slate-800 border border-slate-700 rounded-xl shadow-lg p-4 sm:p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-xl font-semibold text-slate-100">Processing Results</h2>
            <div className="flex flex-wrap items-center gap-2">
                <button onClick={onClearAllData} disabled={isBatchProcessing || isZipping || data.length === 0} className="px-3 py-2 text-sm bg-red-800/80 hover:bg-red-700 text-white font-medium rounded-md flex items-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                    <TrashIcon className="w-4 h-4" /> Clear All
                </button>
                <button onClick={onExportZip} disabled={!canExport || isZipping} className="px-3 py-2 text-sm bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-md flex items-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                    <DownloadIcon className="w-4 h-4" /> {isZipping ? 'Zipping...' : 'Export ZIP'}
                </button>
                <button onClick={copyForComProcess} disabled={isBatchProcessing || isZipping || data.filter(d=>d.status === 'completed').length === 0} className="px-3 py-2 text-sm bg-sky-600 hover:bg-sky-700 text-white font-medium rounded-md flex items-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                    {comCopied ? <CheckIcon className="w-4 h-4 text-green-300"/> : <DocumentDuplicateIcon className="w-4 h-4" />}
                    {comCopied ? 'Copied!' : 'Copy for .COM'}
                </button>
                <button onClick={copyToClipboard} disabled={isBatchProcessing || isZipping || data.filter(d=>d.status === 'completed').length === 0} className="px-3 py-2 text-sm bg-sky-600 hover:bg-sky-700 text-white font-medium rounded-md flex items-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                    {copied ? <CheckIcon className="w-4 h-4 text-green-300"/> : <ClipboardIcon className="w-4 h-4" />}
                    {copied ? 'Copied!' : 'Copy for Sheet'}
                </button>
            </div>
        </div>

        <div className="overflow-x-auto rounded-lg border border-slate-700">
            <table className="min-w-full divide-y divide-slate-700">
                <thead className="bg-slate-900/50">
                    <tr>
                        <th scope="col" className="p-3 text-left text-xs font-medium text-slate-300 uppercase tracking-wider">File / Game Details</th>
                        <th scope="col" className="p-3 text-left text-xs font-medium text-slate-300 uppercase tracking-wider">Provider</th>
                        <th scope="col" className="p-3 text-left text-xs font-medium text-slate-300 uppercase tracking-wider">Status</th>
                    </tr>
                </thead>
                <tbody className="bg-slate-800 divide-y divide-slate-700">
                    {data.map((fileEntry) => (
                        <React.Fragment key={fileEntry.id}>
                            <tr className="bg-slate-800/50">
                                <td className="p-3 text-sm font-semibold text-sky-400" colSpan={3}>{fileEntry.pdfFileName}</td>
                            </tr>
                            {fileEntry.status === 'completed' && fileEntry.extractedInstances.length > 0 ? (
                                fileEntry.extractedInstances.map((instance, instIndex) => (
                                    <tr key={`${fileEntry.id}-${instIndex}`}>
                                        <td className="p-3 pl-8">
                                            <div className="text-sm font-medium text-slate-100">{cleanGameNameForDisplay(instance.gameName)}</div>
                                            <div className="text-xs text-slate-400">Report: {fileEntry.reportNumber || 'N/A'} | Date: {fileEntry.certificationDate || 'N/A'}</div>
                                            {instance.files && instance.files.length > 0 && (
                                              <details className="mt-2 text-xs">
                                                  <summary className="cursor-pointer text-slate-500 hover:text-slate-300">Show {instance.files.length} file(s)</summary>
                                                  <ul className="mt-1 pl-4 list-disc list-inside text-slate-400 max-h-32 overflow-y-auto">
                                                      {instance.files.map((f, fIndex) => (
                                                          <li key={fIndex} title={`Hash: ${getDisplayHash(f)}`}>{f.name}</li>
                                                      ))}
                                                  </ul>
                                              </details>
                                            )}
                                        </td>
                                        <td className="p-3 text-sm text-slate-300">{getGameProvider(instance.gameName)}</td>
                                        <td className="p-3">
                                             <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-900 text-green-300">Completed</span>
                                        </td>
                                    </tr>
                                ))
                            ) : (
                                 <tr>
                                    <td className="p-3 pl-8 text-sm text-slate-400 italic">
                                        {fileEntry.status === 'error' ? fileEntry.errorMessage : 
                                         fileEntry.status === 'completed' ? 'No game data extracted from file.' : 
                                         'Awaiting processing...'}
                                    </td>
                                    <td></td>
                                    <td className="p-3">
                                        {fileEntry.status === 'queued' && <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-yellow-900 text-yellow-300">Queued</span>}
                                        {fileEntry.status === 'processing' && <div className="flex items-center gap-2"><LoadingSpinner className="w-4 h-4" /> <span className="text-xs text-sky-300">Processing...</span></div>}
                                        {fileEntry.status === 'error' && <span title={fileEntry.errorMessage} className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-red-900 text-red-300 cursor-help">Error</span>}
                                    </td>
                                </tr>
                            )}
                        </React.Fragment>
                    ))}
                    {data.length === 0 && (
                      <tr>
                        <td colSpan={3} className="text-center p-8 text-slate-500">
                            Upload PDF or Image files to begin.
                        </td>
                      </tr>
                    )}
                </tbody>
            </table>
        </div>
    </div>
  );
};