# Simple local preview server for testing the site before it's live.
#
# Why you need this: opening index.html by double-clicking it loads it as
# a "file://" page, which sends no referrer to any request it makes. The
# Google Books API key is restricted to only accept requests from specific
# websites (kitabguru.com, localhost, etc.) for security -- a file:// page
# matches none of those, so every request gets blocked with 403 Forbidden.
# Running this script gives the page a real "http://localhost:8791/"
# address instead, which IS on the allowed list, so it works exactly like
# it will on the live site.
#
# HOW TO RUN:
#   1. Right-click this file and choose "Run with PowerShell"
#      (or open PowerShell, cd into this folder, and run:
#       powershell -ExecutionPolicy Bypass -File serve.ps1)
#   2. Leave the black PowerShell window open (it's the server running)
#   3. Open http://localhost:8791/ in Edge or Chrome -- NOT the file path
#   4. To stop the server, close the PowerShell window or press Ctrl+C

param(
  [int]$Port = 8791,
  [string]$Root = (Split-Path -Parent $PSScriptRoot)
)

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")
$listener.Start()
Write-Host "Serving $Root"
Write-Host "Open this in your browser: http://localhost:$Port/"
Write-Host "(Press Ctrl+C to stop)"

$mime = @{
  ".html" = "text/html"; ".htm" = "text/html"; ".css" = "text/css"; ".js" = "application/javascript";
  ".json" = "application/json"; ".png" = "image/png"; ".jpg" = "image/jpeg"; ".jpeg" = "image/jpeg";
  ".svg" = "image/svg+xml"; ".ico" = "image/x-icon"; ".txt" = "text/plain"
}

while ($listener.IsListening) {
  $context = $listener.GetContext()
  $req = $context.Request
  $res = $context.Response
  try {
    $path = $req.Url.AbsolutePath
    if ($path -eq "/") { $path = "/index.html" }
    $filePath = Join-Path $Root ($path.TrimStart("/"))
    if (Test-Path $filePath -PathType Leaf) {
      $ext = [System.IO.Path]::GetExtension($filePath)
      $contentType = $mime[$ext]
      if (-not $contentType) { $contentType = "application/octet-stream" }
      $bytes = [System.IO.File]::ReadAllBytes($filePath)
      $res.ContentType = $contentType
      $res.ContentLength64 = $bytes.Length
      $res.OutputStream.Write($bytes, 0, $bytes.Length)
    } else {
      $res.StatusCode = 404
      $msg = [System.Text.Encoding]::UTF8.GetBytes("Not found: $path")
      $res.OutputStream.Write($msg, 0, $msg.Length)
    }
  } catch {
    $res.StatusCode = 500
  } finally {
    $res.OutputStream.Close()
  }
}
