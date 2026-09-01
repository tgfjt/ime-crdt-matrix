import { appendFileSync, mkdirSync } from 'node:fs'

// ponytail: POST /record をそのまま results/*.jsonl に追記するだけ
export default {
  define: { __VERSIONS__: "{\"@lexical/react\":\"0.49.0\",\"@lexical/yjs\":\"0.49.0\",\"lexical\":\"0.49.0\",\"react\":\"19.2.8\",\"react-dom\":\"19.2.8\",\"y-protocols\":\"1.0.7\",\"yjs\":\"13.6.32\"}" },
  plugins: [{
    name: 'record',
    configureServer(server) {
      server.middlewares.use('/record', (req, res) => {
        let body = ''
        req.on('data', c => body += c)
        req.on('end', () => {
          mkdirSync('../../results', { recursive: true })
          appendFileSync('../../results/yjs-lexical.jsonl', body + '\n')
          res.end('ok')
        })
      })
    },
  }],
}
