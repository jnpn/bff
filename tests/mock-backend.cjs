// tests/mock-backend.cjs
const fastify = require('fastify')({ logger: false })

fastify.register(require('@fastify/cors'), {
  origin: true,
  credentials: true
})

fastify.get('/api/hello', async () => {
  return { message: 'hello from backend' }
})

fastify.get('/api/data', async () => {
  return { data: [1, 2, 3] }
})

const start = async () => {
  try {
    await fastify.listen({ port: 4000, host: '0.0.0.0' })
    console.log('Mock backend listening on port 4000')
  } catch (err) {
    console.error(err)
    process.exit(1)
  }
}

start()
