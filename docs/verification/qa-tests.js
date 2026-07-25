const http = require('http');

async function testGuestAuth() {
  console.log("--- TEST: LLM-001 Reasoning Endpoint Auth Bypass ---");
  // Simulating an unauthenticated request to a deterministic provider
  const payload = JSON.stringify({
    provider: 'deterministic',
    packet: { type: 'test' }
  });

  const req = http.request({
    hostname: 'localhost',
    port: 8000,
    path: '/api/reasoning',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payload)
    }
  }, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
      console.log(`Status: ${res.statusCode}`);
      console.log(`Response: ${data}`);
      if (res.statusCode === 200) {
        console.log("FAIL: Unauthenticated request to deterministic provider was allowed.");
      } else if (res.statusCode === 401) {
        console.log("PASS: Unauthenticated request rejected.");
      } else {
        console.log("UNKNOWN: Unexpected status code.");
      }
    });
  });

  req.on('error', (e) => {
    console.log(`Error: ${e.message}. Ensure backend is running.`);
  });

  req.write(payload);
  req.end();
}

async function runTests() {
  console.log("Starting QA Network Verification...");
  await testGuestAuth();
}

runTests();
