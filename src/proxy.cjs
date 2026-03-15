// proxy.js
const fastify = require('fastify')({ logger: true })
const httpProxy = require('@fastify/http-proxy')
const { randomUUID } = require('crypto')
const { parseArgs } = require('node:util')

const options = {
  port: {
    type: 'string',
    short: 'p',
    default: '3000'
  }
}

const { values } = parseArgs({ options, strict: false })
const PORT = parseInt(values.port, 10)

const BACKEND = process.env.BACKEND
if (!BACKEND) {
  console.error('BACKEND env variable required')
  process.exit(1)
}

// Enable CORS
fastify.register(require('@fastify/cors'), {
  origin: true,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']
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
       console.debug("debug:matchInterceptor:re", req.url, i.path, req.url === i.path, RegExp(i.path).test(req.url) ? "MATCH_RE" : "NO-MATCH_RE")
      return new RegExp(i.path).test(req.url)
    }
    console.debug("debug:matchInterceptor", req.url, i.path, req.url === i.path, req.url === i.path ? "MATCH" : "NO-MATCH")
    return req.url === i.path
  })
}

// -------------------------
// Interception hook
// -------------------------
fastify.addHook('onRequest', async (request, reply) => {
  if (reply.sent) return; // CORS preflight handled

  if (request.url.startsWith('/__')) return; // Skip meta routes

  const startTime = Date.now();
  const interceptor = matchInterceptor(request);

  const logEntry = {
    id: randomUUID(),
    timestamp: new Date().toISOString(),
    method: request.method,
    url: request.url,
    intercepted: !!interceptor,
    interceptorId: interceptor?.id,
    duration: 0, // Will be updated later
    status: undefined // Will be updated later
  };

  if (interceptor) {
    console.debug("debug:interceptor-found", interceptor);
    // Interceptor found: handle it and send response
    const { status, headers, body, delayMs } = interceptor.response;

    if (delayMs) {
      await new Promise(r => setTimeout(r, delayMs));
    }

    if (headers) {
      Object.entries(headers).forEach(([k, v]) => reply.header(k, v));
    }

    logEntry.duration = Date.now() - startTime;
    logEntry.status = status;
    requestHistory.push(logEntry);

    reply.code(status || 200);
    reply.send(body);
    // No explicit return needed after reply.send() if it's the end of the hook's responsibility for this request.
  } else {
    // No interceptor found: log and let it fall through to httpProxy
    logEntry.duration = Date.now() - startTime; // Log duration even for non-intercepted
    requestHistory.push(logEntry);
    // No response sent here, Fastify router will find httpProxy.
  }
});

// -------------------------
// Proxy fallback
// -------------------------
fastify.register(httpProxy, {
  upstream: BACKEND,
  prefix: '/',
  httpMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD'], // Exclude OPTIONS
  http2: false,
  replyOptions: {
    rewriteResponseHeaders: (headers) => {
      const corsHeaders = [
        'access-control-allow-origin',
        'access-control-allow-credentials',
        'access-control-allow-methods',
        'access-control-allow-headers',
        'access-control-expose-headers'
      ]
      const newHeaders = { ...headers }
      corsHeaders.forEach(h => {
        delete newHeaders[h]
      })
      return newHeaders
    }
  }
})
console.log(fastify.printRoutes())

fastify.listen({ port: PORT, host: '0.0.0.0' }, (err, address) => {
  if (err) throw err
  console.log(`Proxy running on ${address}`)
  console.log(`Forwarding to ${BACKEND}`)
})
