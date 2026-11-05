import { connect, createServer } from 'node:net'

const TOKEN = 'workloom-case-ok'

const server = createServer((socket) => {
  socket.once('data', () => socket.end(TOKEN))
})

server.on('error', (error) => {
  console.error(`SOCKET_CHECK=blocked reason=${error.message}`)
  process.exit(2)
})

server.listen(0, '127.0.0.1', () => {
  const { port } = server.address()
  const client = connect(port, '127.0.0.1', () => client.write('ping'))
  const chunks = []
  client.on('data', (chunk) => chunks.push(chunk))
  client.on('error', (error) => {
    server.close()
    console.error(`SOCKET_CHECK=blocked reason=${error.message}`)
    process.exit(2)
  })
  client.on('end', () => {
    const received = Buffer.concat(chunks).toString('utf8')
    server.close()
    if (received === TOKEN) {
      console.log(`SOCKET_CHECK=ok port=${port} token=${received}`)
      process.exit(0)
    }
    console.error(`SOCKET_CHECK=failed expected=${TOKEN} received=${received}`)
    process.exit(1)
  })
})
