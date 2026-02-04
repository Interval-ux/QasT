#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import url from 'url';
import { lex } from '../lib/lexer.js';
import { parse } from '../lib/parser.js';
import { createRuntime, evalProgram } from '../lib/runtime.js';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));

function printUsage() {
  console.log('Usage: qast [options] <file.qast>');
  console.log('');
  console.log('Options:');
  console.log('  --repl          Start interactive REPL (not yet implemented)');
  console.log('  --check         Parse and statically check only');
  console.log('  --trace         Trace executed statements');
}

async function main() {
  const argv = process.argv.slice(2);
  if (argv.length === 0) {
    printUsage();
    process.exit(1);
  }

  const flags = new Set();
  const files = [];
  for (const arg of argv) {
    if (arg.startsWith('--')) {
      flags.add(arg);
    } else {
      files.push(arg);
    }
  }

  if (flags.has('--repl')) {
    console.error('REPL not implemented yet.');
    process.exit(1);
  }

  if (files.length === 0) {
    console.error('Error: no input file.');
    printUsage();
    process.exit(1);
  }

  const filePath = path.resolve(process.cwd(), files[0]);
  const source = fs.readFileSync(filePath, 'utf8');

  try {
    const tokens = lex(source, filePath);
    const ast = parse(tokens, filePath);

    if (flags.has('--check')) {
      console.log(`OK: ${filePath}`);
      process.exit(0);
    }

    const runtime = createRuntime({ trace: flags.has('--trace') });
    await evalProgram(ast, runtime);
  } catch (err) {
    if (err && err.isQastError) {
      console.error(`Error: ${err.message} at ${err.file || filePath}:${err.line}:${err.column}`);
      if (err.hint) console.error(`Hint: ${err.hint}`);
      process.exit(1);
    } else {
      console.error(err);
      process.exit(1);
    }
  }
}

main();

