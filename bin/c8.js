#!/usr/bin/env node

const argv = require('yargs').parse()
const CRI = require('chrome-remote-interface')
const getPort = require('get-port');
const foreground = require('foreground-child')
const waitTillPortOpen = require('wait-till-port-open')

getPort().then(async port => {
  foreground(
    ['node', `--inspect-brk=${port}`].concat(process.argv.slice(2)),
    (done) => {
      console.info('actually got here')
    }
  )
  try {
    await waitTillPortOpen(port)
    const client = await CRI({port: port})

    const {Debugger, Runtime, Profiler} = client
    await Runtime.runIfWaitingForDebugger()
    await Runtime.enable()
    await Profiler.enable()
    await Profiler.startPreciseCoverage({callCount: true, detailed: true})
    await Debugger.enable()
    await Debugger.paused()
    await Debugger.resume()

    client.on('event', async (message) => {
      // console.info(message)
      if (message.method === 'Runtime.executionContextDestroyed') {
        await outputCoverage(Profiler)
        client.close()
      }
    })

  } catch (err) {
    console.error(err)
    process.exit(1)
  }
})

async function outputCoverage (Profiler) {
  const IGNORED_PATHS = [
    /\/bin\/wrap.js/,
    /\/node_modules\//,
    /node-spawn-wrap/
  ]
  let {result} = await Profiler.takePreciseCoverage()
  result = result.filter(coverage => {
    for (var ignored, i = 0; (ignored = IGNORED_PATHS[i]) !== undefined; i++) {
      if (ignored.test(coverage.url)) return false
    }
    if (!/^\//.test(coverage.url)) return false
    else return true
  })
  console.log(JSON.stringify(result, null, 2))
}
