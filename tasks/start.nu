#!/usr/bin/env nu

# prod, dev, or server
def main [build: string = "dev"] {

    let targetDir = (
        if $build == "server" {
            "../soccer-server/public"
        } else {
            "public"
        })

    rm -r -f $targetDir

    let insertHash = { |x|
        let splitFilename = ($x.name | split column '.' | transpose | get column1) 
        let flength = ($splitFilename | length)
        let filename = ($splitFilename | insert ($flength - 1) $x.hash | str join '.')
        $filename | str replace '^src/' $"($targetDir)/"
    }

    # webpack uses sha256 with 8 characters so I guess I will too!
    let addHash = { |x|
        $x
        | insert hash { |x| open $x.name | hash sha256 | str substring 56..64 }
        | insert hashed $insertHash
        | insert pathname { |x| $x.hashed | str substring ($x.hashed | str index-of '/web')..999 }
        | insert target-dir { |x| $x.hashed | path dirname }
        | insert url { |x| $x.name | str substring ($x.name | str index-of '/web')..999 }
        | select name hashed url pathname target-dir
    }

    # copy static npm files
    ls node_modules/mpa-enhancer/src/*.min.js
    | each $addHash
    | each { |x|
        let target = $"($targetDir)/web/js/lib"
        mkdir $target
        let hashName = $"($target)/($x.hashed | path basename)"
        cp (if $build == "prod" {
                "node_modules/mpa-enhancer/src/*.min.js"
            } else { "node_modules/mpa-enhancer/src/mpa.js" }) $hashName
    }

    # elastic-textarea
    ls node_modules/@cloudfour/elastic-textarea/*.min.js
    | each $addHash
    | each { |x|
        let target = $"($targetDir)/web/js/lib"
        mkdir $target
        let hashName = $"($target)/($x.hashed | path basename)"
        cp (if $build == "prod" {
                "node_modules/@cloudfour/elastic-textarea/index.min.js"
            } else {
                "node_modules/@cloudfour/elastic-textarea/index.js"
            }
        ) $hashName
    }

    # copy css files
    ls src/**/css/**/*.css
    | each $addHash
    | each { |x|
        mkdir $x.target-dir
        cp $x.name $x.hashed
    }

    let js = (
        ls **/src/**/js/**/*
        | where type == "file" and name !~ '\.bundle\.'
        | $in.name
    )

    let e = ($js | append [
        $"--outdir=($targetDir)",
        '--outbase=src',
        '--format=esm',
        '--tree-shaking=false',
        '--entry-names=[dir]/[name].[hash]',
    ]
    | append (
        if $build == "prod" {
            [ '--minify' ]
        } else { [] }
    ))

    ^npx esbuild $e

    # let bundles = (
    #     ls **/src/**/js/**/*.bundle.ts
    #     | where type == "file"
    #     | $in.name
    # )

    # let eBundle = ($bundles | append [
    #     $"--outdir=($targetDir)",
    #     '--outbase=src',
    #     '--format=iife',
    #     '--bundle',
    #     '--tree-shaking=true'
    # ]
    # | append (
    #     if $build {
    #         [ '--minify' ]
    #     } else {
    #         [ '--entry-names=[dir]/[name].[hash]' ] }
    # ))

    # ^npx esbuild $eBundle

    # write static files to entry-points file
    let files = (
        ls $"($targetDir)/**/*"
        | where { |x| $x.name =~ '\.(css|js)$' }
        | insert file { |x| $x.name | str substring ($x.name | str index-of '/web')..999 }
        | insert url { |x|
            let s = $x.file
            let length = ($s | str length)
            let extension = ($s | str substring ($s | str index-of -e '.')..)
            let extensionLength = ($extension | str length)
            let first = ($s | str substring ..($length - $extensionLength - 9))
            $first + $extension
        }
        | select url file
        | to json
    )
    $"export default ($files)" | save -f src/web/entry-points.ts

    # copy html files
    let appCss = (ls $"($targetDir)/**/app.*.css" | get name | first | str replace $targetDir "")
    let indexCss = (ls $"($targetDir)/**/index.*.css" | get name | first | str replace $targetDir "")
    let apploaderjs = (ls $"($targetDir)/**/app-loader*.js" | get name | first | str replace $targetDir "")
    ls src/**/*.html
    | each { |x|
        mkdir ($x.name | path dirname | str replace '^src/' $"($targetDir)/")
        open $x.name
        | str replace '{{indexCss}}' $indexCss
        | str replace '{{apploaderjs}}' $apploaderjs
        | str replace '{{appCss}}' $appCss
        | save -f ($x.name | str replace '^src/' $"($targetDir)/")
    }

    # Service worker
    let sw = ([
        '--bundle',
        $"--outdir=($targetDir)",
        '--outbase=src',
        '--format=iife',
        'src/web/sw.ts',
    ]
    | append (
        if $build == "prod" {
            ['--minify']
        } else if $build == "dev" { [
            $"--servedir=($targetDir)",
            '--watch'
        ] }
        else { [ '--watch' ] }
    ))

    ^npx esbuild $sw

}

