#!/usr/bin/env node
import { startREPL } from '../src/index.js';
startREPL().catch(e => { console.error(e); process.exit(1); });
