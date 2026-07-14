# Setup the excel-assist finetuned model for Ollama
# This model is trained specifically for structured spreadsheet JSON output.
# Requires: Ollama installed and running

Write-Host "Creating smartsht-assist model in Ollama..."
Write-Host "(This uses the finetuned Qwen2.5-1.5B excel-assist model)"
Write-Host ""

$modelfileDir = Split-Path -Parent $PSScriptRoot
$modelfilePath = Join-Path $modelfileDir "server\Modelfile.excel-assist"

if (-Not (Test-Path $modelfilePath)) {
    Write-Error "Modelfile not found at: $modelfilePath"
    exit 1
}

$modelsDir = Join-Path $modelfileDir "models"
$ggufPath = Join-Path $modelsDir "excel-assist-q8.gguf"

if (-Not (Test-Path $ggufPath)) {
    Write-Error "Model GGUF not found at: $ggufPath"
    Write-Host "Expected: models/excel-assist-q8.gguf"
    exit 1
}

# Create the model in Ollama
Push-Location $modelfileDir
ollama create smartsht-assist -f "server/Modelfile.excel-assist"
Pop-Location

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "Done! smartsht-assist model is now available."
    Write-Host "The server will automatically prefer it when Ollama is the active provider."
    Write-Host ""
    Write-Host "Verify: ollama list | Select-String smartsht"
} else {
    Write-Error "Failed to create model. Is Ollama running?"
}
