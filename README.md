# 📦 Dev Proxy - Programmable HTTP Proxy for Frontend Testing

A lightweight, programmable HTTP proxy designed for frontend developers. Intercept API calls, mock responses, simulate errors, and test edge cases without touching your backend.

## ✨ Features

- 🎯 **Programmable Interceptors** - Mock any endpoint with custom responses
- 🔄 **Hot Reload** - Enable/disable interceptors without restarting
- 📊 **Request History** - See what's being called and what's being mocked
- 🎨 **React Dev Widget** - Control everything from your UI (Vite/React integration)
- 🚀 **High Performance** - Built on Fastify
- 🎭 **Scenario Switching** - One-click state changes (happy path, errors, auth failures)
- 🔍 **Regex Matching** - Match paths with patterns
- ⏱️ **Delay Simulation** - Test slow networks
- 🐳 **Docker Ready** - Deploy anywhere

## 🚀 Quick Start

### Option 1: Run Locally

```bash
# Install dependencies
npm install

# Start proxy (forwards to your backend)
BACKEND=http://localhost:9000 node proxy.js

# Proxy runs on http://localhost:3000
```

### Option 2: Docker

```bash
# Pull image
docker pull your-org/dev-proxy:latest

# Run
docker run -p 3000:3000 \
  -e BACKEND=http://host.docker.internal:9000 \
  your-org/dev-proxy:latest
```

### Option 3: Docker Compose

```yaml
version: '3.8'
services:
  proxy:
    image: your-org/dev-proxy:latest
    ports:
      - "3000:3000"
    environment:
      - BACKEND=http://backend:8080
```

## 📖 Usage

### Add an Interceptor

```bash
curl -X POST http://localhost:3000/__interceptors \
  -H "Content-Type: application/json" \
  -d '{
    "path": "/api/user",
    "method": "GET",
    "response": {
      "status": 200,
      "body": {
        "id": 123,
        "name": "John Doe"
      }
    }
  }'
```

### List All Interceptors

```bash
curl http://localhost:3000/__interceptors
```

### Enable/Disable Interceptor

```bash
curl -X PATCH http://localhost:3000/__interceptors/<ID> \
  -H "Content-Type: application/json" \
  -d '{"enabled": false}'
```

### Delete Interceptor

```bash
curl -X DELETE http://localhost:3000/__interceptors/<ID>
```

### View Request History

```bash
curl http://localhost:3000/__requests
```

### Apply Scenario

```bash
# Switch to "server down" scenario
curl -X POST http://localhost:3000/__scenarios/server-down/apply
```

## 🎨 React Widget Integration

For Vite + React projects, integrate the dev widget directly into your app:

### 1. Install Widget

```bash
# Copy DevProxyWidget.tsx and DevProxyWidget.css to your project
# (Available in /widget directory)
```

### 2. Add to Your App

```tsx
// src/App.tsx
import { DevProxyWidget } from './components/DevProxyWidget'

function App() {
  return (
    <>
      <DevProxyWidget />
      {/* your app */}
    </>
  )
}
```

### 3. Configure Proxy URL

```env
# .env
VITE_PROXY_URL=http://localhost:3000
```

### 4. Start Everything

```bash
# Terminal 1: Your backend
npm run backend

# Terminal 2: Dev proxy
BACKEND=http://localhost:9000 node proxy.js

# Terminal 3: Your frontend
npm run dev
```

Now you'll see a floating "DEV PROXY" button in the bottom-right corner of your app!

## 🔧 Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `BACKEND` | URL of your backend API | **Required** |
| `PORT` | Proxy port | `3000` |
| `LOG_LEVEL` | Logging level (`debug`, `info`, `warn`, `error`) | `info` |

## 🎭 Interceptor Schema

```typescript
{
  "path": string,           // Exact path or regex pattern
  "method": string,         // GET, POST, PUT, DELETE, etc. (optional)
  "isRegex": boolean,       // Use regex matching (optional)
  "response": {
    "status": number,       // HTTP status code
    "headers": object,      // Custom headers (optional)
    "body": any,           // Response body
    "delayMs": number      // Delay in milliseconds (optional)
  }
}
```

## 📋 Examples

### Mock User Profile

```bash
curl -X POST http://localhost:3000/__interceptors \
  -H "Content-Type: application/json" \
  -d '{
    "path": "/api/user/profile",
    "method": "GET",
    "response": {
      "status": 200,
      "body": {
        "id": 1,
        "username": "testuser",
        "email": "test@example.com",
        "verified": true
      }
    }
  }'
```

### Simulate Auth Failure

```bash
curl -X POST http://localhost:3000/__interceptors \
  -H "Content-Type: application/json" \
  -d '{
    "path": "^/api/.*",
    "isRegex": true,
    "response": {
      "status": 401,
      "body": {
        "error": "Unauthorized",
        "message": "Token expired"
      }
    }
  }'
```

### Simulate Server Error

```bash
curl -X POST http://localhost:3000/__interceptors \
  -H "Content-Type: application/json" \
  -d '{
    "path": "/api/checkout",
    "method": "POST",
    "response": {
      "status": 500,
      "body": {
        "error": "Internal Server Error"
      }
    }
  }'
```

### Simulate Slow Network

```bash
curl -X POST http://localhost:3000/__interceptors \
  -H "Content-Type: application/json" \
  -d '{
    "path": "/api/data",
    "response": {
      "status": 200,
      "delayMs": 3000,
      "body": {
        "message": "Delayed response"
      }
    }
  }'
```

### Match Multiple Endpoints

```bash
curl -X POST http://localhost:3000/__interceptors \
  -H "Content-Type: application/json" \
  -d '{
    "path": "^/api/products/.*",
    "isRegex": true,
    "method": "GET",
    "response": {
      "status": 200,
      "body": {
        "products": []
      }
    }
  }'
```

## 🎬 Built-in Scenarios

The proxy comes with pre-configured scenarios:

- **`happy-path`** - Clear all interceptors, proxy everything
- **`server-down`** - All API calls return 503
- **`auth-expired`** - All GET requests return 401

Apply a scenario:

```bash
curl -X POST http://localhost:3000/__scenarios/server-down/apply
```

## 🏗️ Architecture

```
┌─────────────────────────────────────────┐
│  Your React App                          │
│  ┌───────────────────────────────────┐  │
│  │  <DevProxyWidget />               │  │
│  │  - Toggle interceptors            │  │
│  │  - View request history           │  │
│  │  - Switch scenarios               │  │
│  └───────────────────────────────────┘  │
│            ↕ REST API                   │
│  ┌───────────────────────────────────┐  │
│  │  Dev Proxy (Fastify)              │  │
│  │  - Intercept matching requests    │  │
│  │  - Track request history          │  │
│  │  - Manage interceptors            │  │
│  └───────────────────────────────────┘  │
│            ↕ HTTP Proxy                 │
│  ┌───────────────────────────────────┐  │
│  │  Your Backend API                 │  │
│  └───────────────────────────────────┘  │
└─────────────────────────────────────────┘
```

## 🛠️ API Reference

### Interceptors

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/__interceptors` | GET | List all interceptors |
| `/__interceptors` | POST | Create interceptor |
| `/__interceptors/:id` | PATCH | Update interceptor |
| `/__interceptors/:id` | DELETE | Delete interceptor |
| `/__interceptors` | DELETE | Clear all interceptors |

### Requests

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/__requests` | GET | Get request history |
| `/__requests` | DELETE | Clear request history |

### Scenarios

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/__scenarios` | GET | List available scenarios |
| `/__scenarios/:name/apply` | POST | Apply scenario |

## 🐳 Docker

### Build

```bash
docker build -t dev-proxy .
```

### Run

```bash
BACKEND=http://your-backend:8080 npm run run
```

### Configuration

You can specify the listening port using the `--port` or `-p` argument:

```bash
BACKEND=http://your-backend:8080 npm run run -- --port 4000
```

### Docker Compose Example

```yaml
version: '3.8'

services:
  backend:
    image: your-backend:latest
    ports:
      - "9000:9000"

  proxy:
    image: dev-proxy:latest
    ports:
      - "3000:3000"
    environment:
      - BACKEND=http://backend:9000
    depends_on:
      - backend

  frontend:
    image: your-frontend:latest
    ports:
      - "5173:5173"
    environment:
      - VITE_PROXY_URL=http://proxy:3000
    depends_on:
      - proxy
```

## 🚀 Production Considerations

⚠️ **This is a development tool**. For production:

- Use environment-based feature flags
- Remove the widget from production builds
- Don't expose interceptor endpoints publicly
- Consider authentication if deploying remotely

## 🤝 Contributing

Contributions welcome! Please:

1. Fork the repo
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a PR

## 📄 License

MIT

## 🙏 Acknowledgments

Built with:
- [Fastify](https://www.fastify.io/) - Fast web framework
- [@fastify/http-proxy](https://github.com/fastify/fastify-http-proxy) - HTTP proxy plugin
- [@fastify/cors](https://github.com/fastify/fastify-cors) - CORS support

---

## 📞 Support

- 🐛 [Report a bug](https://github.com/jnpn/bff/issues)
- 💡 [Request a feature](https://github.com/jnpn/bff/issues)
- 📖 [Documentation](https://github.com/jnpn/bff/wiki)

---

**Clauded with ❤️ for frontend developers**
