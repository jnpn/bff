// proxy.js
const fastify = require('fastify')({ logger: true })
const httpProxy = require('@fastify/http-proxy')
const { randomUUID } = require('crypto')

const BACKEND = process.env.BACKEND
if (!BACKEND) {
  console.error('BACKEND env variable required')
  process.exit(1)
}

// Enable CORS for dev
fastify.register(require('@fastify/cors'), {
  origin: true
})

let interceptors = []
let requestHistory = []
const MAX_HISTORY = 50

// -------------------------
// Scenarios
// -------------------------
const scenarios = {
  'happy-path': [],
  'server-down': [
    {
      path: '^/api/.*',
      isRegex: true,
      response: { status: 503, body: { error: 'Service unavailable' } }
    }
  ],
  'auth-expired': [
    {
      path: '^/api/.*',
      isRegex: true,
      method: 'GET',
      response: { status: 401, body: { error: 'Unauthorized' } }
    }
  ]
}

// -------------------------
// Create interceptor
// -------------------------
fastify.post('/__interceptors', async (request) => {
  const interceptor = {
    id: randomUUID(),
    enabled: true,
    createdAt: new Date().toISOString(),
    ...request.body
  }
  interceptors.push(interceptor)
  return interceptor
})

// -------------------------
// List all
// -------------------------
fastify.get('/__interceptors', async () => {
  return interceptors
})

// -------------------------
// Update (enable/disable or edit)
// -------------------------
fastify.patch('/__interceptors/:id', async (request, reply) => {
  const interceptor = interceptors.find(i => i.id === request.params.id)
  if (!interceptor) {
    return reply.code(404).send({ error: 'Not found' })
  }
  Object.assign(interceptor, request.body)
  return interceptor
})

// -------------------------
// Delete one
// -------------------------
fastify.delete('/__interceptors/:id', async (request, reply) => {
  const index = interceptors.findIndex(i => i.id === request.params.id)
  if (index === -1) {
    return reply.code(404).send({ error: 'Not found' })
  }
  const removed = interceptors.splice(index, 1)[0]
  return removed
})

// -------------------------
// Clear all
// -------------------------
fastify.delete('/__interceptors', async () => {
  interceptors = []
  return { success: true }
})

// -------------------------
// Request history
// -------------------------
fastify.get('/__requests', async () => {
  return requestHistory.slice(-MAX_HISTORY)
})

fastify.delete('/__requests', async () => {
  requestHistory = []
  return { success: true }
})

// -------------------------
// Scenarios
// -------------------------
fastify.get('/__scenarios', async () => {
  return Object.keys(scenarios)
})

fastify.post('/__scenarios/:name/apply', async (request, reply) => {
  const scenario = scenarios[request.params.name]
  if (!scenario) {
    return reply.code(404).send({ error: 'Scenario not found' })
  }
  
  interceptors = scenario.map(s => ({
    id: randomUUID(),
    enabled: true,
    createdAt: new Date().toISOString(),
    ...s
  }))
  
  return { success: true, interceptors }
})

// -------------------------
// Matching logic
// -------------------------
function matchInterceptor(req) {
  return interceptors.find(i => {
    if (!i.enabled) return false
    const methodMatch = !i.method || i.method === req.method
    if (!methodMatch) return false
    if (i.isRegex) {
      return new RegExp(i.path).test(req.url)
    }
    return req.url === i.path
  })
}

// -------------------------
// Interception hook
// -------------------------
fastify.addHook('onRequest', async (request, reply) => {
  // Skip meta routes
  if (request.url.startsWith('/__')) return

  const startTime = Date.now()
  const interceptor = matchInterceptor(request)

  // Log request
  const logEntry = {
    id: randomUUID(),
    timestamp: new Date().toISOString(),
    method: request.method,
    url: request.url,
    intercepted: !!interceptor,
    interceptorId: interceptor?.id,
    duration: 0
  }

  if (!interceptor) {
    requestHistory.push(logEntry)
    return
  }

  const { status, headers, body, delayMs } = interceptor.response

  if (delayMs) {
    await new Promise(r => setTimeout(r, delayMs))
  }

  if (headers) {
    Object.entries(headers).forEach(([k, v]) => reply.header(k, v))
  }

  logEntry.duration = Date.now() - startTime
  logEntry.status = status
  requestHistory.push(logEntry)

  reply.code(status || 200)
  reply.send(body)

  return reply
})

// -------------------------
// Proxy fallback
// -------------------------
fastify.register(httpProxy, {
  upstream: BACKEND,
  prefix: '/',
  http2: false
})

fastify.listen({ port: 3000, host: '0.0.0.0' }, (err) => {
  if (err) throw err
  console.log(`Proxy running on http://localhost:3000`)
  console.log(`Forwarding to ${BACKEND}`)
})
