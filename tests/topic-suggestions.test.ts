import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { test } from 'node:test';

const require = createRequire(import.meta.url);

const calls: any[] = [];
let nextOutput = '';

// Replace the OpenAI client before the module under test loads it.
const clientPath = require.resolve('../server/ai/openai-client.js');
require.cache[clientPath] = {
  id: clientPath, filename: clientPath, loaded: true, exports: {
    getModel: () => 'test-model',
    getOpenAIClient: () => ({
      responses: { create: async (body: any) => { calls.push(body); return { output_text: nextOutput }; } },
    }),
  },
} as any;

const { suggestTopics } = require('../server/ai/topic-suggestions.js');

test('returns cleaned topic names without duplicates or topics the subject already has', async () => {
  calls.length = 0;
  nextOutput = JSON.stringify({ topics: ['Stroke', ' stroke ', 'Epilepsy', 'Cranial  nerves', '', 'x'.repeat(90)] });
  const result = await suggestTopics({ subjectName: 'Neurology', count: 8, existingTopics: ['epilepsy'] });
  assert.deepEqual(result.topics.slice(0, 2), ['Stroke', 'Cranial nerves']);
  assert.equal(result.topics[2].length, 60);
  assert.equal(result.topics.length, 3);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].store, false);
  const sent = JSON.parse(calls[0].input[1].content);
  assert.equal(sent.subjectName, 'Neurology');
  assert.deepEqual(sent.existingTopics, ['epilepsy']);
  assert.equal(sent.notes, null);
});

test('passes notes along and never returns more than asked for', async () => {
  nextOutput = JSON.stringify({ topics: ['A', 'B', 'C', 'D', 'E'] });
  const result = await suggestTopics({ subjectName: 'Anatomy', count: 3, sourceMaterial: 'Lecture notes' });
  assert.deepEqual(result.topics, ['A', 'B', 'C']);
  assert.equal(JSON.parse(calls[calls.length - 1].input[1].content).notes, 'Lecture notes');
});

test('rejects bad requests before calling the model', async () => {
  calls.length = 0;
  await assert.rejects(suggestTopics(null), /Invalid topic request/);
  await assert.rejects(suggestTopics({ subjectName: '', count: 5 }), /subject name/);
  await assert.rejects(suggestTopics({ subjectName: 'Anatomy', count: 40 }), /between 3 and 15/);
  await assert.rejects(suggestTopics({ subjectName: 'Anatomy', count: 5, sourceMaterial: 'a'.repeat(20_001) }), /20,000/);
  assert.equal(calls.length, 0);
});

test('fails clearly when the model returns nothing usable', async () => {
  nextOutput = 'not json';
  await assert.rejects(suggestTopics({ subjectName: 'Anatomy', count: 5 }), /could not be read/);
  nextOutput = JSON.stringify({ topics: ['Heart'] });
  await assert.rejects(suggestTopics({ subjectName: 'Anatomy', count: 5, existingTopics: ['heart'] }), /no new topics/);
});
