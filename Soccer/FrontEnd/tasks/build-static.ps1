param([switch]$Debug = $false, [switch]$FullStack = $false, [switch]$Clean = $false)

if ($Clean) {
    if ($Debug) {
        Remove-Item -Path .\public\web\ -Recurse
    }
    if ($FullStack) {
        Remove-Item -Path ..\wwwroot\web\ -Recurse
    }
}

$targetDirRelative = if ($Debug) { "public" } elseif ($FullStack) { "..\\wwwroot" } else { "" }

Get-ChildItem -Path .\src\web\js\ -Recurse | ? {
    !$_.PSisContainer
} | % {
    $target = $_ | Resolve-Path -Relative | % { $_ -replace "src", $targetDirRelative -replace "\.ts", ".js" }
    if ($_.Name.EndsWith(".d.ts")) {
    } elseif ($_.Extension -eq ".js") {
        $td = Split-Path $target
        if (-not (Test-Path -Path $td)) {
            New-Item -Path $td -ItemType Directory > $null
        }
        Copy-Item -Path $_.FullName -Destination "$target"
    } else {
        &esbuild $_.FullName --format=esm --outfile="$target"
    }
}

Get-ChildItem -Path .\src\web\css\ -Recurse | % {
    $target = $_ | Resolve-Path -Relative | % { $_ -replace "src", $targetDirRelative }
    $targetDir = Split-Path $target
    if (-not (Test-Path -Path $targetDir)) {
        New-Item -Path "$targetDir" -ItemType Directory > $null
    }
    Copy-Item -Path $_.FullName -Destination "$target"
}

Get-ChildItem -Path .\src\web\ -Recurse -Filter *.html | % {
    $target = $_ | Resolve-Path -Relative | % { $_ -replace "src", $targetDirRelative }
    $targetDir = Split-Path $target
    if (-not (Test-Path -Path "$targetDir")) {
        New-Item -Path "$targetDir" -ItemType Directory > $null
    }
    Copy-Item -Path "$($_.FullName)" -Destination "$target"
}
