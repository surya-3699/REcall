const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
// Load the actual TS implementation using the project's pinned compiler.
require.extensions['.ts'] = (mod, filename) => mod._compile(ts.transpileModule(
  fs.readFileSync(filename, 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true, resolveJsonModule: true } },
).outputText, filename);
const { generateValidatedComparison, ComparisonOutputError } = require('../lib/recall/generation.ts');
const context = {
  products: ['Lenovo ThinkPad E14 Gen 6', 'Dell Latitude 3450'],
  sources: [{ id: 'S1', title: 'Fixture source', url: 'https://example.com/specs' }],
  memories: [],
};
const valid = () => ({
  products: context.products.map(name => ({ name, claims: [{ label: 'Price and seller', value: 'Not verified', sourceIds: [] }], reviewSummary: 'Not verified', reviewSourceIds: [], uncertainties: [] })),
  recommendation: { choice: 'Insufficient evidence', reason: 'Price not established.', sourceIds: [], memoryIds: [] },
  memoryImpact: 'No relevant memory was available.',
});
test('accepts a valid comparison without a second model request', async () => {
  let calls = 0;
  const result = await generateValidatedComparison(async feedback => {
    calls++; assert.equal(feedback, ''); return JSON.stringify(valid());
  }, context, () => assert.fail('unexpected rejection'));
  assert.equal(calls, 1);
  assert.deepEqual(result, valid());
});
for (const [name, change, reason] of [
  ['unsupported citation', v => { v.products[0].claims[0].sourceIds = ['S999']; }, 'Unsupported source or memory citation.'],
  ['uncited claim', v => { v.products[0].claims[0].value = 'Costs 50000 INR'; }, 'A product fact is missing a source.'],
  ['uncited review', v => { v.products[0].reviewSummary = 'Not verified for this variant'; }, 'Review summary is missing a source.'],
  ['wrong product', v => { v.products[0].name = 'Different laptop'; }, 'Product names do not match the request.'],
  ['fabricated memory', v => { v.recommendation.memoryIds = ['invented']; }, 'Unsupported source or memory citation.'],
]) {
  test(`regenerates ${name} and validates again`, async () => {
    const bad = valid(); change(bad);
    const logs = []; let calls = 0;
    const result = await generateValidatedComparison(async feedback => {
      calls++;
      if (calls === 1) return JSON.stringify(bad);
      assert.ok(feedback.includes(reason));
      return JSON.stringify(valid());
    }, context, (...args) => logs.push(args));
    assert.equal(calls, 2); assert.deepEqual(result, valid());
    assert.deepEqual(logs, [[reason, 1]]);
  });
}
test('rejects repeated invalid output after exactly two attempts', async () => {
  let calls = 0;
  await assert.rejects(generateValidatedComparison(async () => {
    calls++; const v = valid(); v.products[0].claims[0].sourceIds = ['S999']; return JSON.stringify(v);
  }, context, () => {}), ComparisonOutputError);
  assert.equal(calls, 2);
});
test('malformed JSON diagnostics do not leak model content', async () => {
  const logs = []; let calls = 0;
  await generateValidatedComparison(async feedback => {
    calls++;
    if (calls === 1) return 'PRIVATE_MODEL_OUTPUT';
    assert.ok(!feedback.includes('PRIVATE_MODEL_OUTPUT')); return JSON.stringify(valid());
  }, context, (...args) => logs.push(args));
  assert.deepEqual(logs, [['The response was not valid JSON.', 1]]);
});
test('provider failures are propagated without validation retry', async () => {
  let calls = 0; const failure = new Error('Provider timed out');
  await assert.rejects(generateValidatedComparison(async () => { calls++; throw failure; }, context, () => assert.fail()), error => error === failure);
  assert.equal(calls, 1);
});
