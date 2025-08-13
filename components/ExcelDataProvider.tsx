
import React, { useState, useCallback } from 'react';
import { GameProviderMap, ProviderInfo } from '../types.ts';
import { DatabaseIcon } from './icons/DatabaseIcon.tsx'; // Assuming a new icon or reuse existing

interface ExcelDataProviderProps {
  onDataParsed: (map: GameProviderMap, count: number) => void;
  currentStatus: string;
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

export const ExcelDataProvider: React.FC<ExcelDataProviderProps> = ({ onDataParsed, currentStatus }) => {
  const [excelData, setExcelData] = useState('');

  const handleParseData = useCallback(() => {
    const lines = excelData.split('\n');
    const newProviderMap: GameProviderMap = new Map();
    let validEntries = 0;

    // Skip header row if present
    const dataLines = lines[0] && lines[0].toLowerCase().includes('game provider') ? lines.slice(1) : lines;

    dataLines.forEach(line => {
      const parts = line.split('\t'); // Tab-separated
      // Expecting Name, Game Provider, _, Portal Live Date, _, IMS Game Code
      if (parts.length >= 6) {
        const gameName = parts[0]?.trim();
        const providerName = parts[1]?.trim();
        const portalLiveDate = parts[3]?.trim() || null;
        const imsGameCode = parts[5]?.trim() || null;
        
        if (gameName && providerName) {
          const normalizedKey = normalizeGameName(gameName);
          if (normalizedKey) {
            const info: ProviderInfo = {
                provider: providerName,
                portalLiveDate: portalLiveDate,
                imsGameCode: imsGameCode,
            };
            newProviderMap.set(normalizedKey, info);
            validEntries++;
          }
        }
      }
    });
    onDataParsed(newProviderMap, validEntries);
  }, [excelData, onDataParsed]);

  return (
    <div className="w-full p-6 bg-slate-800 border border-slate-700 rounded-xl shadow-lg space-y-4">
      <div className="flex items-center gap-3">
        <DatabaseIcon className="w-8 h-8 text-sky-400 flex-shrink-0" />
        <div>
            <h2 className="text-xl font-semibold text-slate-100">Game Provider Data</h2>
            <p className="text-sm text-slate-400">Paste data from Monday.com export. Expects tab-separated columns including: Name, Game Provider, Portal Live Date, IMS Game Code.</p>
        </div>
      </div>
      
      <textarea
        value={excelData}
        onChange={(e) => setExcelData(e.target.value)}
        placeholder="Paste your full table export from Monday.com here..."
        rows={6}
        className="w-full p-3 bg-slate-700 border border-slate-600 rounded-md text-slate-200 placeholder-slate-500 focus:ring-2 focus:ring-sky-500 focus:border-sky-500 transition-colors"
        aria-label="Paste monday.com data for game providers"
      />
      <div className="flex flex-col sm:flex-row justify-between items-center gap-3">
        <button
          onClick={handleParseData}
          className="px-4 py-2 w-full sm:w-auto bg-sky-600 hover:bg-sky-700 text-white font-medium rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-opacity-75"
        >
          Load Provider Data
        </button>
        {currentStatus && (
            <p className="text-sm text-slate-400 text-right flex-grow mt-2 sm:mt-0" role="status">
                {currentStatus}
            </p>
        )}
      </div>
    </div>
  );
};