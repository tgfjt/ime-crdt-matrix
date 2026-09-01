import { appendFileSync, mkdirSync } from 'node:fs'

// ponytail: POST /record をそのまま results/*.jsonl に追記するだけ
export default {
  define: { __VERSIONS__: JSON.stringify({"prosemirror-commands":"1.7.2","prosemirror-keymap":"1.2.3","prosemirror-model":"1.25.11","prosemirror-schema-basic":"1.2.4","prosemirror-state":"1.4.4","prosemirror-view":"1.42.3","y-prosemirror":"1.3.7","yjs":"13.6.32"}) },
  plugins: [{
    name: 'record',
    configureServer(server) {
      server.middlewares.use('/record', (req, res) => {
        let body = ''
        req.on('data', c => body += c)
        req.on('end', () => {
          mkdirSync('../../results', { recursive: true })
          appendFileSync('../../results/yjs-prosemirror.jsonl', body + '\n')
          res.end('ok')
        })
      })
    },
  }],
}
