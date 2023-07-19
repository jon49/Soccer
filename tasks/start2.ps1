# param([switch]$Debug = $false, [switch]$FullStack = $false)

# watch -> https://github.com/jfromaniello/pswatch via https://4sysops.com/archives/monitor-file-changes-in-windows-with-powershell-and-pswatch/

# $paths = Get-ChildItem -Path .\src\ -Recurse -Include *.js,*.ts | Resolve-Path -Relative | % { $_.Substring(2) }
# >> $cleanPaths = $paths -join " " -replace "\\", "/"
# >> esbuild.cmd $cleanPaths --bundle --outdir=temp --outbase=src

Write-Host $PATH

# if ($Debug) {
#     Get-FileHash -Path ..\temp\temp.js -Algorithm MD5 | % { $_.Hash }
# }
