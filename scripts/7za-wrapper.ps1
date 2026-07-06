param(
    [Parameter(ValueFromRemainingArguments=$true)]
    [string[]]$Arguments
)
$original7za = "D:\onecode\node_modules\7zip-bin\win\x64\7za_original.exe"
$filteredArgs = $Arguments | Where-Object { $_ -ne "-snld" }
Write-Host "7za-wrapper: calling with filtered args"
Start-Process -FilePath $original7za -ArgumentList $filteredArgs -NoNewWindow -Wait
