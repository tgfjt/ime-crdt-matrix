import { appendFileSync, mkdirSync } from 'node:fs'

// ponytail: POST /record をそのまま results/*.jsonl に追記するだけ
export default {
  define: { __VERSIONS__: "{\"@codemirror/state\":\"6.7.2\",\"@codemirror/view\":\"6.43.10\",\"y-codemirror.next\":\"0.3.6\",\"yjs\":\"13.6.32\"}" },
  plugins: [{
    name: 'record',
    configureServer(server) {
      server.middlewares.use('/record', (req, res) => {
        let body = ''
        req.on('data', c => body += c)
        req.on('end', () => {
          mkdirSync('../../results', { recursive: true })
          appendFileSync('../../results/yjs-codemirror.jsonl', body + '\n')
          res.end('ok')
        })
      })
    },
  }],
}
