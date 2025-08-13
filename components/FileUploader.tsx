import React, { useState, useCallback } from 'react';
import { UploadIcon } from './icons/UploadIcon.jsx';
import { MAX_FILE_SIZE_MB } from '../constants.js';


const FileUploader = ({ onFilesSelected, isProcessing }) => {
  const [isDragging, setIsDragging] = useState(false);

  const handleDragEnter = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      onFilesSelected(e.dataTransfer.files);
      e.dataTransfer.clearData();
    }
  }, [onFilesSelected]);

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      onFilesSelected(e.target.files);
       // Reset file input to allow uploading the same file again
      e.target.value = '';
    }
  };

  return (
    <div className="w-full p-6 bg-slate-800 border-2 border-dashed border-slate-600 rounded-xl shadow-lg hover:border-sky-500 transition-colors duration-200">
      <div
        className={`flex flex-col items-center justify-center p-8 border-2 border-dashed rounded-lg transition-all duration-300
                    ${isDragging ? 'border-sky-400 bg-slate-700' : 'border-slate-500 hover:border-sky-600'}
                    ${isProcessing ? 'cursor-not-allowed opacity-70' : 'cursor-pointer'}`}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onClick={() => !isProcessing && document.getElementById('fileInputPdfAndImage')?.click()}
        role="button"
        tabIndex={0}
        aria-label="File upload area for PDFs and Images"
      >
        <input
          type="file"
          id="fileInputPdfAndImage"
          multiple
          accept="application/pdf,image/png,image/jpeg"
          className="hidden"
          onChange={handleFileChange}
          disabled={isProcessing}
        />
        <UploadIcon className="w-16 h-16 text-slate-400 mb-4 group-hover:text-sky-400 transition-colors" />
        <p className="text-lg font-semibold text-slate-300">
          {isDragging ? "Drop files here" : "Drag & drop PDF or Image files here, or click to select"}
        </p>
        <p className="text-sm text-slate-500 mt-1">
          (Max file size: ${MAX_FILE_SIZE_MB}MB per file, .pdf, .png, .jpg formats only)
        </p>
        {isProcessing && <p className="mt-2 text-sky-400">Processing files...</p>}
      </div>
    </div>
  );
};

export { FileUploader };