"use client";

import { useState, useCallback, useRef } from "react";
import type React from "react";
import { Navbar } from "@/components/navbar";
import { 
  Upload, 
  FileText, 
  Users, 
  CheckCircle, 
  XCircle, 
  Clock, 
  Download, 
  AlertCircle, 
  Loader2,
  RotateCcw,
  Trash2,
  File,
  X
} from "lucide-react";
import { apiService, StudentEvaluation, EvaluationBatchResponse } from "@/services/api";

interface FileValidationResult {
  file: File;
  isValid: boolean;
  name?: string;
  regNo?: string;
  error?: string;
}

export default function EvaluationPage() {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [problemStatement, setProblemStatement] = useState<string>("");
  const [additionalContext, setAdditionalContext] = useState<string>("");
  const [isDragOver, setIsDragOver] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [evaluationBatch, setEvaluationBatch] = useState<EvaluationBatchResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [validationResults, setValidationResults] = useState<FileValidationResult[]>([]);
  const [isValidating, setIsValidating] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // File validation function
  const validateStudentFile = (file: File): Promise<FileValidationResult> => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const content = e.target?.result as string;
        const lines = content.split('\n');
        
        if (lines.length < 3) {
          resolve({
            file,
            isValid: false,
            error: "File must have at least 3 lines (Name, Reg No, and code)"
          });
          return;
        }

        const nameLine = lines[0].trim();
        const regNoLine = lines[1].trim();

        if (!nameLine.toLowerCase().startsWith('name:')) {
          resolve({
            file,
            isValid: false,
            error: "First line must start with 'Name:'"
          });
          return;
        }

        if (!regNoLine.toLowerCase().startsWith('reg no:')) {
          resolve({
            file,
            isValid: false,
            error: "Second line must start with 'Reg No:'"
          });
          return;
        }

        const name = nameLine.substring(5).trim();
        const regNo = regNoLine.substring(7).trim();

        if (!name) {
          resolve({
            file,
            isValid: false,
            error: "Student name is required"
          });
          return;
        }

        if (!regNo) {
          resolve({
            file,
            isValid: false,
            error: "Registration number is required"
          });
          return;
        }

        resolve({
          file,
          isValid: true,
          name,
          regNo
        });
      };

      reader.onerror = () => {
        resolve({
          file,
          isValid: false,
          error: "Failed to read file"
        });
      };

      reader.readAsText(file);
    });
  };

  // Validate all selected files
  const validateFiles = async (files: File[]) => {
    setIsValidating(true);
    try {
      const results = await Promise.all(files.map(validateStudentFile));
      setValidationResults(results);
      return results;
    } finally {
      setIsValidating(false);
    }
  };

  // Handle file selection with validation similar to upload page
  const handleFileSelect = useCallback(async (files: File[]) => {
    const validFiles: File[] = [];
    const errors: string[] = [];

    files.forEach(file => {
      // Check file size (5MB limit)
      if (file.size > 5 * 1024 * 1024) {
        errors.push(`${file.name}: File size must be less than 5MB`);
        return;
      }

      // Check file type (allow common code file extensions)
      const allowedExtensions = [
        '.js', '.jsx', '.ts', '.tsx', '.py', '.java', '.cpp', '.c', '.cs', 
        '.php', '.rb', '.go', '.rs', '.swift', '.kt', '.dart'
      ];
      
      const fileExtension = '.' + file.name.split('.').pop()?.toLowerCase();
      if (!allowedExtensions.includes(fileExtension)) {
        errors.push(`${file.name}: Invalid file type for student evaluation`);
        return;
      }

      validFiles.push(file);
    });

    if (errors.length > 0) {
      setError(`Some files were rejected:\n${errors.join('\n')}`);
    } else {
      setError(null);
    }

    if (validFiles.length > 0) {
      setSelectedFiles((prev: File[]) => [...prev, ...validFiles]);
      await validateFiles(validFiles);
    }
  }, []);

  // Handle drag and drop
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    
    const files = Array.from(e.dataTransfer.files);
    handleFileSelect(files);
  }, [handleFileSelect]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  // Handle file input change
  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      handleFileSelect(Array.from(e.target.files));
    }
  };

  // Remove file from selection
  const removeFile = (index: number) => {
    const newFiles = selectedFiles.filter((_: File, i: number) => i !== index);
    setSelectedFiles(newFiles);
    const newValidation = validationResults.filter((_: FileValidationResult, i: number) => i !== index);
    setValidationResults(newValidation);
  };

  // Clear all files
  const clearAllFiles = () => {
    setSelectedFiles([]);
    setValidationResults([]);
    setError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Format file size utility
  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // Start evaluation
  const startEvaluation = async () => {
    if (selectedFiles.length === 0) {
      setError("Please select at least one file");
      return;
    }

    if (!problemStatement.trim()) {
      setError("Please provide a problem statement");
      return;
    }

  const validFiles = validationResults.filter((r: FileValidationResult) => r.isValid);
    if (validFiles.length === 0) {
      setError("Please ensure all files have valid format");
      return;
    }

    setIsUploading(true);
    setError(null);

    try {
      const result = await apiService.evaluateStudentBatch(
  validFiles.map((r: FileValidationResult) => r.file),
        problemStatement,
        additionalContext || undefined
      );

      if (result.success) {
        setEvaluationBatch(result);
        // Start polling for status updates
        pollEvaluationStatus(result.batchId);
      } else {
        setError(result.message || "Failed to start evaluation");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start evaluation");
    } finally {
      setIsUploading(false);
    }
  };

  // Poll for evaluation status
  const pollEvaluationStatus = async (batchId: string) => {
    const poll = async () => {
      try {
        const status = await apiService.getEvaluationStatus(batchId);
        setEvaluationBatch(status);

        if (status.status === 'processing' && status.success) {
          setTimeout(poll, 2000); // Poll every 2 seconds
        }
      } catch (err) {
        console.error("Error polling status:", err);
        setError("Failed to get evaluation status");
      }
    };

    poll();
  };

  // Download CSV
  const downloadCSV = async () => {
    if (!evaluationBatch?.batchId) return;

    try {
      const blob = await apiService.downloadEvaluationCSV(evaluationBatch.batchId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `evaluation_results_${evaluationBatch.batchId}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      setError("Failed to download CSV");
    }
  };

  // Reset form
  const resetForm = () => {
    setSelectedFiles([]);
    setProblemStatement("");
    setAdditionalContext("");
    setEvaluationBatch(null);
    setError(null);
    setValidationResults([]);
  };

  const validFileCount = validationResults.filter((r: FileValidationResult) => r.isValid).length;
  const invalidFileCount = validationResults.filter((r: FileValidationResult) => !r.isValid).length;

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-4">
            Student Code Evaluation
          </h1>
          <p className="text-lg text-gray-600">
            Upload student code files and provide a problem statement to generate batch evaluations with AI-powered scores
          </p>
        </div>

        {!evaluationBatch ? (
          <>
            {/* File Upload Section */}
            <div className="bg-white rounded-lg shadow-lg p-8 mb-6">
              {selectedFiles.length === 0 ? (
                <>
                  <div
                    className={`border-2 border-dashed rounded-lg p-12 text-center transition-colors cursor-pointer ${
                      isDragOver 
                        ? "border-blue-500 bg-blue-50" 
                        : "border-gray-300 hover:border-gray-400"
                    }`}
                    onDrop={handleDrop}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Upload className="mx-auto h-12 w-12 text-gray-400 mb-4" />
                    <h3 className="text-lg font-medium text-gray-900 mb-2">
                      Drop student code files here
                    </h3>
                    <p className="text-gray-600 mb-4">
                      or click anywhere in this area to browse (each file must have Name: and Reg No: headers)
                    </p>
                    <div className="space-y-3">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          fileInputRef.current?.click();
                        }}
                        className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-3 rounded-lg font-medium transition-colors text-lg"
                      >
                        Choose Student Files
                      </button>
                      <p className="text-sm text-gray-500">
                        Click the button above or drag & drop files
                      </p>
                    </div>
                    <input
                      ref={fileInputRef}
                      type="file"
                      multiple
                      className="hidden"
                      onChange={handleFileInputChange}
                      accept=".js,.jsx,.ts,.tsx,.py,.java,.cpp,.c,.cs,.php,.rb,.go,.rs,.swift,.kt,.dart"
                    />
                    <p className="text-sm text-gray-500 mt-4">
                      Supported formats: JavaScript, TypeScript, Python, Java, C++, C#, PHP, Ruby, Go, Rust, Swift, Kotlin, Dart
                    </p>
                    <p className="text-sm text-gray-500">
                      Maximum file size: 5MB per file. Each file must start with "Name: " and "Reg No: " headers
                    </p>
                  </div>
                </>
              ) : (
                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-medium text-gray-900">
                      Selected Files ({selectedFiles.length})
                    </h3>
                    <button
                      onClick={clearAllFiles}
                      className="text-red-600 hover:text-red-700 text-sm font-medium flex items-center space-x-1"
                    >
                      <Trash2 className="h-4 w-4" />
                      <span>Clear All</span>
                    </button>
                  </div>

                  <div className="max-h-60 overflow-y-auto space-y-2">
                    {selectedFiles.map((file, index) => (
                      <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                        <div className="flex items-center space-x-3">
                          <File className="h-6 w-6 text-blue-600" />
                          <div>
                            <h4 className="font-medium text-gray-900">
                              {file.name}
                            </h4>
                            <p className="text-sm text-gray-600">
                              {formatFileSize(file.size)}
                            </p>
                          </div>
                        </div>
                        <button
                          onClick={() => removeFile(index)}
                          className="text-gray-400 hover:text-gray-600 transition-colors"
                        >
                          <X className="h-5 w-5" />
                        </button>
                      </div>
                    ))}
                  </div>

                  {/* Validation Results Display */}
                  {validationResults.length > 0 && (
                    <div className="p-4 bg-gray-50 rounded-lg">
                      <h4 className="font-medium text-gray-900 mb-3 flex items-center">
                        <FileText className="mr-2 h-5 w-5" />
                        File Validation Results
                        {isValidating && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
                      </h4>
                      <div className="space-y-2">
                        {validationResults.map((result, index) => (
                          <div key={index} className="flex items-center justify-between">
                            <div className="flex items-center space-x-2">
                              {result.isValid ? (
                                <CheckCircle className="h-4 w-4 text-green-600" />
                              ) : (
                                <AlertCircle className="h-4 w-4 text-red-600" />
                              )}
                              <span className="text-sm text-gray-900">{result.file.name}</span>
                              {result.isValid && (
                                <span className="text-sm text-gray-500">
                                  ({result.name} - {result.regNo})
                                </span>
                              )}
                            </div>
                            {result.error && (
                              <span className="text-sm text-red-600">{result.error}</span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Problem Statement Form */}
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Problem Statement *
                      </label>
                      <textarea
                        value={problemStatement}
                        onChange={(e) => setProblemStatement(e.target.value)}
                        placeholder="Describe the programming problem or assignment that students were asked to solve..."
                        className="w-full h-32 p-3 border border-gray-300 rounded-lg text-gray-900 placeholder-gray-500 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        required
                      />
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Additional Context (Optional)
                      </label>
                      <textarea
                        value={additionalContext}
                        onChange={(e) => setAdditionalContext(e.target.value)}
                        placeholder="Any additional context or specific evaluation criteria..."
                        className="w-full h-24 p-3 border border-gray-300 rounded-lg text-gray-900 placeholder-gray-500 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>
                  </div>

                  {/* Error Display */}
                  {error && (
                    <div className="flex items-center justify-center space-x-2 text-red-600">
                      <AlertCircle className="h-5 w-5" />
                      <span className="font-medium">{error}</span>
                    </div>
                  )}

                  {/* Start Evaluation Button */}
                  <div className="flex justify-center">
                    <button
                      onClick={startEvaluation}
                      disabled={isUploading || validFileCount === 0 || !problemStatement.trim()}
                      className={`px-8 py-3 rounded-lg font-medium transition-colors ${
                        isUploading || validFileCount === 0 || !problemStatement.trim()
                          ? "bg-gray-400 cursor-not-allowed text-white"
                          : "bg-blue-600 hover:bg-blue-700 text-white"
                      }`}
                    >
                      {isUploading ? "Starting Evaluation..." : `Start Evaluation (${validFileCount} valid files)`}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Information Panel */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
              <h3 className="font-medium text-gray-900 mb-2">
                How Student Evaluation Works
              </h3>
              <ul className="text-sm text-gray-600 space-y-1">
                <li>• Each file must start with "Name: " and "Reg No: " headers</li>
                <li>• Files are evaluated based on code quality, logic, correctness, and best practices</li>
                <li>• Scores are given out of 100 with letter grades (A+ to F)</li>
                <li>• Evaluation typically takes 1-2 minutes per student file</li>
                <li>• Results can be downloaded as CSV for easy grade book import</li>
                <li>• Progress is tracked in real-time during batch processing</li>
              </ul>
            </div>
          </>
        ) : (
          <>
            {/* Evaluation Results Section */}
            <div className="bg-white rounded-lg shadow-lg p-8">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-semibold text-gray-900 flex items-center">
                  <Users className="mr-2 h-5 w-5 text-blue-600" />
                  Evaluation Results
                </h2>
                <div className="flex space-x-2">
                  {evaluationBatch.status === 'completed' && (
                    <button
                      onClick={downloadCSV}
                      className="inline-flex items-center px-4 py-2 text-sm font-medium rounded-lg text-white bg-green-600 hover:bg-green-700 transition-colors"
                    >
                      <Download className="mr-2 h-4 w-4" />
                      Download CSV
                    </button>
                  )}
                  <button
                    onClick={resetForm}
                    className="inline-flex items-center px-4 py-2 text-sm font-medium rounded-lg text-gray-700 bg-gray-100 hover:bg-gray-200 transition-colors"
                  >
                    <RotateCcw className="mr-2 h-4 w-4" />
                    New Evaluation
                  </button>
                </div>
              </div>

            {/* Progress Bar */}
            <div className="mb-6">
                <div className="flex items-center justify-between mb-3">
                <div className="flex items-center space-x-3">
                    <span className="text-sm font-medium text-gray-700">
                    Processing: {evaluationBatch.progress.processedFiles} / {evaluationBatch.progress.totalFiles} files
                    </span>
                    {evaluationBatch.status === 'processing' && (
                    <div className="flex items-center space-x-2 text-blue-600">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span className="text-sm font-medium">
                        Evaluating<span className="animate-pulse">...</span>
                        </span>
                    </div>
                    )}
                </div>
                <div className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${
                    evaluationBatch.status === 'processing' 
                    ? 'bg-blue-100 text-blue-800'
                    : evaluationBatch.status === 'completed'
                    ? 'bg-green-100 text-green-800'
                    : evaluationBatch.status === 'failed'
                    ? 'bg-red-100 text-red-800'
                    : 'bg-gray-100 text-gray-800'
                }`}>
                    {evaluationBatch.status === 'processing' && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
                    {evaluationBatch.status === 'completed' && <CheckCircle className="mr-1 h-3 w-3" />}
                    {evaluationBatch.status === 'failed' && <XCircle className="mr-1 h-3 w-3" />}
                    <span className="capitalize">{evaluationBatch.status}</span>
                </div>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-3">
                <div
                    className={`h-3 rounded-full transition-all duration-500 ease-out ${
                    evaluationBatch.status === 'completed'
                        ? 'bg-green-500'
                        : evaluationBatch.status === 'failed'
                        ? 'bg-red-500'
                        : 'bg-blue-500'
                    }`}
                    style={{ 
                    width: evaluationBatch.status === 'completed' 
                        ? '100%' 
                        : `${Math.max(5, evaluationBatch.progress.percentage)}%`
                    }}
                />
                </div>
            </div>

            {/* Results Table */}
            {evaluationBatch.students.length > 0 && (
              <div className="p-4 bg-gray-50 rounded-lg">
                <h4 className="font-medium text-gray-900 mb-3">Student Evaluation Results</h4>
                <div className="space-y-2">
                  {evaluationBatch.students.map((student, index) => (
                    <div key={index} className="flex items-center justify-between p-3 bg-white rounded border">
                      <div className="flex items-center space-x-3">
                        {student.status === 'completed' ? (
                          <CheckCircle className="h-5 w-5 text-green-600" />
                        ) : student.status === 'failed' ? (
                          <XCircle className="h-5 w-5 text-red-600" />
                        ) : (
                          <Clock className="h-5 w-5 text-yellow-600" />
                        )}
                        <div>
                          <p className="font-medium text-gray-900">{student.name}</p>
                          <p className="text-sm text-gray-600">{student.regNo} • {student.filename}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        {student.status === 'completed' && student.score !== null ? (
                          <div>
                            <p className="font-medium text-gray-900">
                              {student.score}/{student.maxScore}
                            </p>
                            <div className="flex items-center space-x-2">
                              <span className="text-sm text-gray-600">{student.percentage}%</span>
                              {student.grade && (
                                <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded ${
                                  student.grade.startsWith('A') ? 'bg-green-100 text-green-800' :
                                  student.grade.startsWith('B') ? 'bg-blue-100 text-blue-800' :
                                  student.grade.startsWith('C') ? 'bg-yellow-100 text-yellow-800' :
                                  'bg-red-100 text-red-800'
                                }`}>
                                  {student.grade}
                                </span>
                              )}
                            </div>
                          </div>
                        ) : student.status === 'failed' ? (
                          <span className="text-sm text-red-600">Failed</span>
                        ) : (
                          <span className="text-sm text-yellow-600">Processing...</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Error Messages */}
            {evaluationBatch.errors.length > 0 && (
              <div className="mt-6 p-4 bg-red-50 rounded-lg">
                <h4 className="font-medium text-red-900 mb-3">Evaluation Errors</h4>
                <div className="space-y-2">
                  {evaluationBatch.errors.map((error, index) => (
                    <div key={index} className="text-sm">
                      <span className="font-medium text-red-800">{error.filename}:</span>
                      <span className="text-red-600 ml-1">{error.error}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex justify-center space-x-3 mt-6">
              <button
                onClick={resetForm}
                className="bg-gray-200 hover:bg-gray-300 text-gray-800 px-6 py-2 rounded-lg font-medium transition-colors"
              >
                New Evaluation
              </button>
              {evaluationBatch.status === 'completed' && (
                <button
                  onClick={downloadCSV}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg font-medium transition-colors"
                >
                  Download Results
                </button>
              )}
            </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}