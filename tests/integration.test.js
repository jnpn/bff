import { test, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { spawn } from 'child_process';
import axios from 'axios';
import util from 'util';
import { exec as execCallback } from 'child_process';

const exec = util.promisify(execCallback);

const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Helper to run shell commands (silenced for cleaner test output)
const runShellCommand = async (command) => {
  try {
    await exec(command);
  } catch (error) {
    // console.warn(`Error executing shell command "${command}": ${error.message}`);
  }
};

// Helper to wait for a service to be reachable at a given port and path
const waitForService = (port, path, messageMatch = null, timeout = 20000) => {
    return new Promise((resolve, reject) => {
        const startTime = Date.now();
        const check = async () => {
            if (Date.now() - startTime > timeout) {
                return reject(new Error(`Service on port ${port} at ${path} did not become available within ${timeout}ms`));
            }
            try {
                const response = await axios.get(`http://localhost:${port}${path}`, { timeout: 1000 });
                if (messageMatch) {
                    // If a messageMatch is provided, check if the response data contains it
                    if (JSON.stringify(response.data).includes(messageMatch)) {
                        resolve();
                    } else {
                        await wait(500);
                        check();
                    }
                } else {
                    // If no messageMatch, just successful response is enough
                    resolve();
                }
            } catch (e) {
                await wait(500);
                check();
            }
        };
        check();
    });
};

let proxyProcess;
let backendProcess;
let proxyPort;

beforeAll(async () => {
    console.log('Performing pre-test cleanup: killing existing Node.js processes...');
    // Kill any existing node processes that might be running our backend
    await runShellCommand('pkill -f "node tests/mock-backend.cjs" || true');
    // No need to kill proxy explicitly as it will use a dynamic port
    await wait(3000); // Give processes ample time to terminate and ports to be released

    console.log('Starting mock backend...');
    backendProcess = spawn('node', ['tests/mock-backend.cjs'], {
        stdio: 'pipe',
    });
    let backendReady = false;
    backendProcess.stdout.on('data', (data) => {
        const output = data.toString();
        if (output.includes('Mock backend listening on port 4000')) {
            backendReady = true;
        }
    });
    backendProcess.stderr.on('data', (data) => {
        console.error(`Mock Backend STDERR: ${data}`);
    });
    backendProcess.on('error', (err) => console.error('Backend process error:', err));
    backendProcess.on('exit', (code) => console.log(`Backend process exited with code ${code}`));

    console.log('Starting proxy...');
    proxyProcess = spawn('node', ['src/proxy.cjs'], {
        env: { ...process.env, BACKEND: 'http://localhost:4000' },
        stdio: 'pipe',
    });
    let proxyStarted = false;
    proxyProcess.stdout.on('data', (data) => {
        const output = data.toString();
        // Capture the dynamically assigned port
        const portMatch = output.match(/Proxy running on http:\/\/localhost:(\d+)/);
        if (portMatch && portMatch[1]) {
            proxyPort = parseInt(portMatch[1], 10);
            proxyStarted = true;
            console.log(`Proxy assigned port: ${proxyPort}`);
        }
    });
    proxyProcess.stderr.on('data', (data) => {
        console.error(`Proxy STDERR: ${data}`);
    });
    proxyProcess.on('error', (err) => console.error('Proxy process error:', err));
    proxyProcess.on('exit', (code) => console.log(`Proxy process exited with code ${code}`));

    // Wait for internal signals that processes have started and port is assigned
    const maxStartupWait = 25000; // 25 seconds for internal logs
    const startupStartTime = Date.now();
    while (Date.now() - startupStartTime < maxStartupWait) {
        if (backendReady && proxyStarted && proxyPort) break;
        await wait(500);
    }

    if (!backendReady) throw new Error('Mock Backend failed to emit startup message within timeout');
    if (!proxyStarted || !proxyPort) throw new Error('Proxy failed to emit startup message and/or assign port within timeout');
    console.log('Backend and Proxy startup messages received and port assigned.');

    // Additionally, wait for services to be reachable via HTTP
    await Promise.all([
        waitForService(4000, '/api/hello', 'hello from backend').catch(e => { throw new Error(`Backend service not reachable: ${e.message}`); }),
        waitForService(proxyPort, '/__scenarios').catch(e => { throw new Error(`Proxy service not reachable: ${e.message}`); })
    ]);
    console.log('Backend and Proxy services are reachable.');

}, 40000); // Increased total timeout for beforeAll

afterAll(() => {
    console.log('Stopping proxy and backend processes...');
    // Attempt graceful shutdown first
    proxyProcess?.kill('SIGINT');
    backendProcess?.kill('SIGINT');

    // Give them a moment, then forcefully kill if still running
    wait(3000).then(() => {
        if (proxyProcess && !proxyProcess.killed) {
            console.log('Proxy process did not exit gracefully, sending SIGKILL.');
            proxyProcess.kill('SIGKILL');
        }
        if (backendProcess && !backendProcess.killed) {
            console.log('Backend process did not exit gracefully, sending SIGKILL.');
            backendProcess.kill('SIGKILL');
        }
    });
});

// Helper to clear interceptors
const clearInterceptors = async () => {
    try {
        await axios.delete(`http://localhost:${proxyPort}/__interceptors`);
        await wait(100); // Give it a moment to clear
    } catch (error) {
        // Ignore errors if proxy isn't running or port is busy, etc.
    }
};

beforeEach(async () => {
    await clearInterceptors();
});

test('Proxy forwards request to backend', async () => {
    const res = await axios.get(`http://localhost:${proxyPort}/api/hello`, {
        headers: { 'Origin': `http://localhost:${proxyPort}` }
    });
    expect(res.status).toBe(200);
    expect(res.data).toEqual({ message: 'hello from backend' });
    expect(res.headers['access-control-allow-origin']).toBe(`http://localhost:${proxyPort}`);
});

test('Proxy intercepts request', async () => {
    await axios.post(`http://localhost:${proxyPort}/__interceptors`, {
        path: '/api/hello',
        method: 'GET',
        response: {
            status: 200,
            body: { message: 'intercepted!' }
        }
    });
    await wait(100);

    const res = await axios.get(`http://localhost:${proxyPort}/api/hello`);
    expect(res.status).toBe(200);
    expect(res.data).toEqual({ message: 'intercepted!' });
});

test('CORS preflight works', async () => {
    const res = await axios.options(`http://localhost:${proxyPort}/api/hello`, {
        headers: {
            'Origin': 'http://example.com',
            'Access-Control-Request-Method': 'GET'
        }
    });
    expect(res.status).toBe(204);
    expect(res.headers['access-control-allow-origin']).toBe('http://example.com');
    expect(res.headers['access-control-allow-methods']).toContain('GET');
    expect(res.headers['access-control-allow-credentials']).toBe('true');
});
