import assert from 'node:assert/strict';
const base = process.argv[2] || 'https://tinyagents.michael-325.workers.dev';
const expected = process.argv[3];
let lastError;
for (let attempt = 0; attempt < 8; attempt++) {
  try {
    const healthResponse = await fetch(base + '/api/health', { signal: AbortSignal.timeout(10000) });
    assert.equal(healthResponse.status, 200);
    const health = await healthResponse.json();
    assert.ok(health.publicSignup || health.providers?.github || health.providers?.gitlab); assert.equal(health.registration, true);
    const account = await fetch(base + '/api/account').then(r => r.json());
    assert.equal(account.user, null); assert.equal(account.officeId, null);
    if (expected) assert.equal(health.build, expected);
    for (const path of ['/', '/setup.html', '/privacy.html', '/plugins/codex.zip', '/plugins/claude.zip']) {
      const response = await fetch(base + path, { signal: AbortSignal.timeout(10000) }); assert.equal(response.status, 200, path);
      if (path.endsWith('.zip')) assert.equal(Buffer.from(await response.arrayBuffer()).subarray(0, 2).toString(), 'PK', path);
    }
    console.log('Live deployment verified: ' + base + ' · build ' + health.build);
    process.exit(0);
  } catch (error) { lastError = error; await new Promise(resolve => setTimeout(resolve, 4000)); }
}
throw lastError;
