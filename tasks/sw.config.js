import * as esbuild from 'esbuild'

// prod, dev, or server
let env = process.argv[2] || 'dev'
let targetDir = process.argv[3] || 'public'

const plugins = [{
  name: 'afters',
  setup(build) {
    build.onStart(result => console.log('start', result))
    build.onEnd(result => {
        console.log('outputFiles', result)
    });
  },
}]

let config = {
    entryPoints: ['./src/web/sw.js'],
    bundle: true,
    // outfile: './public/web/sw.js',
    outbase: './src/',
    format: 'iife',
    entryNames: '[dir]/[name].[hash]',
    logLevel: 'info',
    plugins
}

if (env === 'prod') {
    config.minify = true
    config.outfile = './public/web/_sw.js'
} else if (env === 'dev') {
    config.sourcemap = true
    config.outdir = targetDir
    // config.servedir = targetDir
} else /* server */ {
    config.sourcemap = true
    config.outfile = './public/web/_sw.js'
}

async function watch() {
    let ctx = await esbuild.context(config)
    if (env !== 'prod') {
        await ctx.watch()
        if (env === 'dev') {
            await ctx.serve()
        }
        console.log('Watching...')
    } else {
        await ctx.rebuild()
        await ctx.dispose()
    }
}

watch()

