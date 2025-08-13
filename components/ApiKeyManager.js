import React, { useState, useEffect } from 'react';
import { KeyIcon } from './icons/KeyIcon.js';
import { CheckIcon } from './icons/CheckIcon.js';

export const ApiKeyManager = ({ onKeySaved, isProcessing }) => {
  const [apiKey, setApiKey] = useState('');
  const [isSaved, setIsSaved] = useState(false);

  useEffect(() => {
    const storedKey = sessionStorage.getItem('gemini-api-key');
    if (storedKey) {
      setApiKey(storedKey);
      setIsSaved(true);
      onKeySaved(storedKey);
    }
  }, [onKeySaved]);

  const handleSaveKey = () => {
    if (!apiKey.trim()) {
      alert('Please enter a valid API key.');
      return;
    }
    sessionStorage.setItem('gemini-api-key', apiKey);
    setIsSaved(true);
    onKeySaved(apiKey);
  };
  
  const handleClearKey = () => {
    setApiKey('');
    setIsSaved(false);
    sessionStorage.removeItem('gemini-api-key');
    onKeySaved(''); // Notify parent that key is removed
  };

  if (isSaved) {
     return (
        <div className="w-full p-4 bg-slate-800 border border-slate-700 rounded-xl shadow-lg flex items-center justify-between">
            <div className="flex items-center gap-3">
                <CheckIcon className="w-6 h-6 text-green-400" />
                <p className="text-slate-300">API Key is saved for this session.</p>
            </div>
            <button
                onClick={handleClearKey}
                disabled={isProcessing}
                className="px-4 py-2 bg-slate-600 hover:bg-slate-500 text-white font-medium rounded-md text-sm transition-colors disabled:opacity-50"
            >
                Change Key
            </button>
        </div>
     );
  }

  return (
    <div className="w-full p-6 bg-slate-800 border-2 border-dashed border-sky-700 rounded-xl shadow-lg space-y-4">
      <div className="flex items-center gap-3">
        <KeyIcon className="w-8 h-8 text-sky-400 flex-shrink-0" />
        <div>
          <h2 className="text-xl font-semibold text-slate-100">Enter Your Gemini API Key</h2>
          <p className="text-sm text-slate-400">
            Your API key is required to process files. It's stored only in your browser for this session and never saved on any server.
          </p>
        </div>
      </div>
      <div className="flex flex-col sm:flex-row gap-2">
        <input
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder="Paste your Gemini API key here"
          className="flex-grow p-3 bg-slate-700 border border-slate-600 rounded-md text-slate-200 placeholder-slate-500 focus:ring-2 focus:ring-sky-500 focus:border-sky-500 transition-colors"
          aria-label="Gemini API Key Input"
        />
        <button
          onClick={handleSaveKey}
          className="px-6 py-3 sm:w-auto bg-sky-600 hover:bg-sky-700 text-white font-semibold rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-opacity-75"
        >
          Save Key
        </button>
      </div>
    </div>
  );
};
