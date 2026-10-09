import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { test } from 'node:test';

const require = createRequire(import.meta.url);

type Call = { body: any; options: any };
const calls: Call[] = [];
let nextOutput = '';

// Replace the OpenAI client before the module under test loads it.
const clientPath = require.resolve('../server/ai/openai-client.js');
require.cache[clientPath] = {
  id: clientPath, filename: clientPath, loaded: true, exports: {
    getModel: () => 'test-model',
    getOpenAIClient: () => ({
      responses: {
        create: async (body: any, options: any) => {
          calls.push({ body, options });
          return { output_text: nextOutput };
        },
      },
    }),
  },
} as any;

const { extractNotesFromPdf } = require('../server/ai/notes-from-pdf.js');

const pdf = (text = '%PDF-1.7 lecture') => Buffer.from(text).toString('base64');

test('sends the PDF to the model and returns its notes', async () => {
  calls.length = 0;
  nextOutput = 'Heart failure\n- Reduced ejection fraction is below 40 %.\n- Loop diuretics relieve congestion.';
  const result = await extractNotesFromPdf({ fileName: 'cardio.pdf', dataBase64: pdf() });

  assert.equal(result.notes, nextOutput);
  assert.equal(result.truncated, false);
  assert.equal(calls.length, 1);
  const file = calls[0].body.input[1].content[0];
  assert.equal(file.type, 'input_file');
  assert.equal(file.filename, 'cardio.pdf');
  assert.ok(file.file_data.startsWith('data:application/pdf;base64,'));
  assert.equal(calls[0].body.store, false);
});

test('cuts notes that are longer than the notes field allows', async () => {
  nextOutput = 'a'.repeat(25_000);
  const result = await extractNotesFromPdf({ fileName: 'long.pdf', dataBase64: pdf() });
  assert.equal(result.notes.length, 20_000);
  assert.equal(result.truncated, true);
});

test('rejects files that are not PDFs before calling the model', async () => {
  calls.length = 0;
  await assert.rejects(extractNotesFromPdf({ fileName: 'x.pdf', dataBase64: pdf('just text') }), /^Error: The PDF could not be read/);
  await assert.rejects(extractNotesFromPdf({ fileName: 'x.pdf', dataBase64: 'not base64!' }), /^Error: The PDF could not be read/);
  await assert.rejects(extractNotesFromPdf({}), /^Error: The PDF could not be read/);
  await assert.rejects(extractNotesFromPdf(null), /^Error: The PDF could not be read/);
  assert.equal(calls.length, 0);
});

test('rejects PDFs over 10 MB before calling the model', async () => {
  calls.length = 0;
  const large = Buffer.concat([Buffer.from('%PDF-1.7'), Buffer.alloc(10 * 1024 * 1024)]).toString('base64');
  await assert.rejects(extractNotesFromPdf({ fileName: 'big.pdf', dataBase64: large }), /^Error: The PDF is over 10 MB/);
  assert.equal(calls.length, 0);
});

test('reports a PDF without study content', async () => {
  nextOutput = 'NO_STUDY_CONTENT';
  await assert.rejects(extractNotesFromPdf({ fileName: 'scan.pdf', dataBase64: pdf() }), /^Error: The PDF has no readable study content/);
});

test('removes path characters from the file name', async () => {
  calls.length = 0;
  nextOutput = 'Renal physiology\n- Glomerular filtration rate is about 125 mL/min.';
  await extractNotesFromPdf({ fileName: '../../etc/passwd\n.pdf', dataBase64: pdf() });
  assert.doesNotMatch(calls[0].body.input[1].content[0].filename, /[\\/\n]/);
});
