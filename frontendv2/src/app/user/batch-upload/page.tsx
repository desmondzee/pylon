'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ChevronRight, Upload, File, CheckCircle2, AlertCircle, Download, X } from 'lucide-react'

export default function BatchUploadPage() {
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadResults, setUploadResults] = useState<any>(null)

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0])
      setUploadResults(null)
    }
  }

  const handleUpload = async () => {
    if (!file) return

    setUploading(true)
    // Simulate upload
    await new Promise(resolve => setTimeout(resolve, 2000))

    // Mock results
    setUploadResults({
      total: 15,
      successful: 13,
      failed: 2,
      errors: [
        { row: 7, error: 'Invalid carbon_cap_gco2 value' },
        { row: 12, error: 'Missing required field: workload_name' },
      ]
    })
    setUploading(false)
  }

  const downloadTemplate = () => {
    // In a real app, this would download a CSV template
    const csvContent = `workload_name,workload_type,urgency,required_cpu_cores,required_memory_gb,required_gpu_mins,estimated_energy_kwh,carbon_cap_gco2,max_price_gbp,deferral_window_mins,deadline
ML Training - Model A,TRAINING_RUN,HIGH,16,64,480,12.5,450,25.50,120,2024-01-25T18:00:00Z
Data Processing - ETL,DATA_PROCESSING,MEDIUM,8,32,0,4.2,200,8.00,240,2024-01-26T12:00:00Z
Inference Batch,INFERENCE_BATCH,LOW,4,16,120,2.8,150,5.00,360,2024-01-27T09:00:00Z`

    const blob = new Blob([csvContent], { type: 'text/csv' })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'workload_template.csv'
    a.click()
    window.URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Page header */}
      <div>
        <div className="flex items-center gap-2 text-sm text-pylon-dark/60 mb-2">
          <Link href="/user" className="hover:text-pylon-dark">Dashboard</Link>
          <ChevronRight className="w-4 h-4" />
          <span className="text-pylon-dark">Batch Upload</span>
        </div>
        <h1 className="text-2xl font-semibold text-pylon-dark">Batch Upload Workloads</h1>
        <p className="text-sm text-pylon-dark/60 mt-1">Upload multiple compute jobs from a CSV file</p>
      </div>

      {/* Instructions */}
      <div className="bg-white rounded-lg border border-pylon-dark/5 p-6">
        <h2 className="text-lg font-semibold text-pylon-dark mb-4">How It Works</h2>
        <div className="space-y-3 text-sm text-pylon-dark/70">
          <div className="flex items-start gap-3">
            <div className="w-6 h-6 rounded-full bg-pylon-accent/10 flex items-center justify-center flex-shrink-0 mt-0.5">
              <span className="text-xs font-medium text-pylon-accent">1</span>
            </div>
            <p>Download the CSV template below or prepare your own file with the required format</p>
          </div>
          <div className="flex items-start gap-3">
            <div className="w-6 h-6 rounded-full bg-pylon-accent/10 flex items-center justify-center flex-shrink-0 mt-0.5">
              <span className="text-xs font-medium text-pylon-accent">2</span>
            </div>
            <p>Fill in your workload details, one row per workload</p>
          </div>
          <div className="flex items-start gap-3">
            <div className="w-6 h-6 rounded-full bg-pylon-accent/10 flex items-center justify-center flex-shrink-0 mt-0.5">
              <span className="text-xs font-medium text-pylon-accent">3</span>
            </div>
            <p>Upload the file and review the results</p>
          </div>
        </div>

        <button
          onClick={downloadTemplate}
          className="flex items-center gap-2 mt-6 px-4 py-2 text-sm font-medium text-pylon-dark bg-pylon-light border border-pylon-dark/10 rounded hover:bg-pylon-dark/5 transition-colors"
        >
          <Download className="w-4 h-4" />
          Download CSV Template
        </button>
      </div>

      {/* Upload area */}
      <div className="bg-white rounded-lg border border-pylon-dark/5 p-6">
        <h2 className="text-lg font-semibold text-pylon-dark mb-4">Upload File</h2>

        {!file ? (
          <label className="block">
            <div className="border-2 border-dashed border-pylon-dark/20 rounded-lg p-12 text-center hover:border-pylon-accent/50 hover:bg-pylon-accent/5 transition-colors cursor-pointer">
              <Upload className="w-12 h-12 text-pylon-dark/40 mx-auto mb-4" />
              <p className="text-sm font-medium text-pylon-dark mb-1">
                Click to upload or drag and drop
              </p>
              <p className="text-xs text-pylon-dark/60">
                CSV files only, up to 10MB
              </p>
            </div>
            <input
              type="file"
              accept=".csv"
              onChange={handleFileChange}
              className="hidden"
            />
          </label>
        ) : (
          <div className="space-y-4">
            {/* File preview */}
            <div className="flex items-center gap-4 p-4 bg-pylon-light rounded-lg">
              <File className="w-8 h-8 text-pylon-accent" />
              <div className="flex-1">
                <p className="text-sm font-medium text-pylon-dark">{file.name}</p>
                <p className="text-xs text-pylon-dark/60">
                  {(file.size / 1024).toFixed(2)} KB
                </p>
              </div>
              {!uploading && !uploadResults && (
                <button
                  onClick={() => setFile(null)}
                  className="p-2 text-pylon-dark/60 hover:text-pylon-dark hover:bg-white rounded transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Upload button */}
            {!uploadResults && (
              <button
                onClick={handleUpload}
                disabled={uploading}
                className="w-full px-6 py-3 text-sm font-medium text-white bg-pylon-dark rounded hover:bg-pylon-dark/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {uploading ? 'Uploading...' : 'Upload and Process'}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Results */}
      {uploadResults && (
        <div className="bg-white rounded-lg border border-pylon-dark/5 p-6">
          <h2 className="text-lg font-semibold text-pylon-dark mb-4">Upload Results</h2>

          <div className="grid md:grid-cols-3 gap-4 mb-6">
            <div className="p-4 bg-pylon-light rounded-lg">
              <p className="text-sm text-pylon-dark/60 mb-1">Total Workloads</p>
              <p className="text-2xl font-semibold text-pylon-dark">{uploadResults.total}</p>
            </div>
            <div className="p-4 bg-pylon-accent/10 rounded-lg">
              <div className="flex items-center gap-2 mb-1">
                <CheckCircle2 className="w-4 h-4 text-pylon-accent" />
                <p className="text-sm text-pylon-accent font-medium">Successful</p>
              </div>
              <p className="text-2xl font-semibold text-pylon-accent">{uploadResults.successful}</p>
            </div>
            <div className="p-4 bg-red-50 rounded-lg">
              <div className="flex items-center gap-2 mb-1">
                <AlertCircle className="w-4 h-4 text-red-600" />
                <p className="text-sm text-red-600 font-medium">Failed</p>
              </div>
              <p className="text-2xl font-semibold text-red-600">{uploadResults.failed}</p>
            </div>
          </div>

          {uploadResults.errors.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-pylon-dark mb-3">Errors</h3>
              <div className="space-y-2">
                {uploadResults.errors.map((err: any, idx: number) => (
                  <div key={idx} className="flex items-start gap-3 p-3 bg-red-50 border border-red-200 rounded-lg">
                    <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-pylon-dark">Row {err.row}</p>
                      <p className="text-xs text-pylon-dark/70">{err.error}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex items-center gap-4 mt-6">
            <Link
              href="/user/workloads"
              className="px-6 py-2 text-sm font-medium text-white bg-pylon-dark rounded hover:bg-pylon-dark/90 transition-colors"
            >
              View All Workloads
            </Link>
            <button
              onClick={() => {
                setFile(null)
                setUploadResults(null)
              }}
              className="px-6 py-2 text-sm font-medium text-pylon-dark bg-white border border-pylon-dark/10 rounded hover:bg-pylon-light transition-colors"
            >
              Upload Another File
            </button>
          </div>
        </div>
      )}

      {/* Required fields */}
      <div className="bg-white rounded-lg border border-pylon-dark/5 p-6">
        <h2 className="text-lg font-semibold text-pylon-dark mb-4">Required CSV Fields</h2>
        <div className="grid md:grid-cols-2 gap-x-8 gap-y-3 text-sm">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-pylon-accent" />
            <code className="text-xs bg-pylon-light px-2 py-1 rounded">workload_name</code>
          </div>
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-pylon-accent" />
            <code className="text-xs bg-pylon-light px-2 py-1 rounded">workload_type</code>
          </div>
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-pylon-accent" />
            <code className="text-xs bg-pylon-light px-2 py-1 rounded">required_cpu_cores</code>
          </div>
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-pylon-accent" />
            <code className="text-xs bg-pylon-light px-2 py-1 rounded">required_memory_gb</code>
          </div>
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-pylon-accent" />
            <code className="text-xs bg-pylon-light px-2 py-1 rounded">estimated_energy_kwh</code>
          </div>
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-pylon-accent" />
            <code className="text-xs bg-pylon-light px-2 py-1 rounded">carbon_cap_gco2</code>
          </div>
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-pylon-accent" />
            <code className="text-xs bg-pylon-light px-2 py-1 rounded">max_price_gbp</code>
          </div>
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-pylon-accent" />
            <code className="text-xs bg-pylon-light px-2 py-1 rounded">deadline</code>
          </div>
        </div>
        <p className="text-xs text-pylon-dark/60 mt-4">
          See template for valid values for workload_type (TRAINING_RUN, INFERENCE_BATCH, etc.) and urgency (LOW, MEDIUM, HIGH, CRITICAL)
        </p>
      </div>
    </div>
  )
}
