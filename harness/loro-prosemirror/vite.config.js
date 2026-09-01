import { appendFileSync, mkdirSync } from 'node:fs'

// ponytail: POST /record をそのまま results/*.jsonl に追記するだけ
export default {
  optimizeDeps: { exclude: ['loro-crdt'] }, // loro-crdt の WASM は Vite の事前バンドルを通すと壊れる
  define: { __VERSIONS__: "{\"loro-crdt\":\"1.15.1\",\"loro-prosemirror\":\"0.4.4\",\"prosemirror-commands\":\"1.7.2\",\"prosemirror-keymap\":\"1.2.3\",\"prosemirror-model\":\"1.25.11\",\"prosemirror-schema-basic\":\"1.2.4\",\"prosemirror-state\":\"1.4.4\",\"prosemirror-view\":\"1.42.3\"}" },
  plugins: [{
    name: 'record',
    configureServer(server) {
      server.middlewares.use('/record', (req, res) => {
        let body = ''
        req.on('data', c => body += c)
        req.on('end', () => {
          mkdirSync('../../results', { recursive: true })
          appendFileSync('../../results/loro-prosemirror.jsonl', body + '\n')
          res.end('ok')
        })
      })
    },
  }],
}
