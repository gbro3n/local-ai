/**
 * Agent harness — single-file Node.js agent loop for Ollama.
 *
 * Usage:
 *   node src/index.js
 *
 * Terminal commands:
 *   /reset  — clear conversation history
 *   /exit   — quit
 *
 * Environment variables (optional):
 *   OLLAMA_URL    — Ollama base URL  (default: http://localhost:11434)
 *   OLLAMA_MODEL  — Model name       (default: gemma3:4b)
 */

import readline from 'readline';
import fs from 'fs';
import path from 'path';

// Ollama server listen host / port

const OLLAMA_URL = process.env.OLLAMA_URL ?? 'http://localhost:11434';

// Model is Google Gemma 3 4B

const MODEL = process.env.OLLAMA_MODEL ?? 'gemma3:4b';

// Tool use file read limit to prevent overflowing context

const READ_LINE_LIMIT = 200;

// System prompt 

const BASE_SYSTEM_PROMPT =
    'You are an expert software engineering assistant. ' +
    'You write clean, idiomatic code, explain your reasoning concisely, ' +
    'and prefer simple solutions over complex ones. ' +
    'When asked to write code, provide the full implementation unless told otherwise.';

const FILE_PROTOCOL = `
IMPORTANT: You have access to the user's filesystem via a command protocol described below.
You MUST use this protocol to read and write files. Do NOT use regular fenced code blocks
(e.g. \`\`\`js or \`\`\`json) to display or suggest file content — always use the write: command
form instead. The harness detects and executes these commands automatically.

Available commands:

Read first ${READ_LINE_LIMIT} lines of a file:
\`\`\`read:relative/path
\`\`\`

Read a specific line range (1-based, inclusive):
\`\`\`read:relative/path:START:END
\`\`\`

Write (create or overwrite) a file — use this for ALL file output:
\`\`\`write:relative/path
<full file content>
\`\`\`

List directory contents:
\`\`\`ls:relative/path
\`\`\`

Rules:
- Always use relative paths. Never use absolute paths or attempt to escape the working directory.
- Before editing an existing file, read it first so you have the current content.
- If a file is truncated on read, use the ranged form to retrieve additional sections.
- You may include multiple commands in one response; they will all be executed.
- Do not invent results — wait for the harness to return them before continuing.
- NEVER show file content in a plain fenced block. Always use write: to output files.

Example — user asks: "Create a file called greet.js that logs Hello"
Correct response:

I'll create the file now.

\`\`\`write:greet.js
console.log('Hello');
\`\`\`

The write command above will be executed by the harness automatically.
`.trim();

function buildSystemPrompt(workDir) {
    return `${BASE_SYSTEM_PROMPT}\n\n${FILE_PROTOCOL}\n\nWorking directory: ${workDir}`;
}

// Sandbox helper ─

/**
 * Resolves a relative path against workDir and throws if the result
 * would escape the sandbox.
 */
function resolveSafe(workDir, relPath) {
    const abs = path.resolve(workDir, relPath);
    const prefix = workDir.endsWith(path.sep) ? workDir : workDir + path.sep;
    if (abs !== workDir && !abs.startsWith(prefix)) {
        throw new Error(`Path "${relPath}" is outside the working directory.`);
    }
    return abs;
}

// Command parser ─

// Matches fenced blocks:  ```cmd:args\n<content>```
const CMD_REGEX = /```(read|write|ls):([^\n`]*)\n([\s\S]*?)```/g;

function parseCommands(text) {
    const commands = [];
    CMD_REGEX.lastIndex = 0;
    let match;
    while ((match = CMD_REGEX.exec(text)) !== null) {
        commands.push({
            cmd: match[1],
            args: match[2].trim(),
            content: match[3],
        });
    }
    return commands;
}

// Command handlers ─

function handleRead(workDir, args) {
    // args may be "path" or "path:start:end"
    const colonIdx = args.indexOf(':');
    let relPath, start, end;
    if (colonIdx === -1) {
        relPath = args;
        start = null;
        end = null;
    } else {
        const parts = args.split(':');
        relPath = parts[0];
        start = parseInt(parts[1], 10);
        end = parseInt(parts[2], 10);
    }

    let abs;
    try {
        abs = resolveSafe(workDir, relPath);
    } catch (e) {
        return `[Error: ${e.message}]`;
    }

    let raw;
    try {
        raw = fs.readFileSync(abs, 'utf8');
    } catch (e) {
        return `[Error reading "${relPath}": ${e.message}]`;
    }

    const allLines = raw.split('\n');
    const total = allLines.length;

    if (start !== null && end !== null) {
        const s = Math.max(1, start);
        const e = Math.min(total, end);
        const slice = allLines.slice(s - 1, e).join('\n');
        return `[File: ${relPath} | Lines ${s}-${e} of ${total}]\n${slice}`;
    }

    const slice = allLines.slice(0, READ_LINE_LIMIT).join('\n');
    let result = `[File: ${relPath} | Lines 1-${Math.min(READ_LINE_LIMIT, total)} of ${total}]\n${slice}`;
    if (total > READ_LINE_LIMIT) {
        result += `\n[Truncated. Use \`\`\`read:${relPath}:${READ_LINE_LIMIT + 1}:${total}\`\`\` to read more.]`;
    }
    return result;
}

function handleWrite(workDir, args, content) {
    let abs;
    try {
        abs = resolveSafe(workDir, args);
    } catch (e) {
        return `[Error: ${e.message}]`;
    }

    try {
        fs.mkdirSync(path.dirname(abs), { recursive: true });
        // Trim exactly one trailing newline added by the fenced block syntax
        const data = content.endsWith('\n') ? content.slice(0, -1) : content;
        fs.writeFileSync(abs, data, 'utf8');
        return `[Written: ${args}]`;
    } catch (e) {
        return `[Error writing "${args}": ${e.message}]`;
    }
}

function handleLs(workDir, args) {
    const relPath = args || '.';
    let abs;
    try {
        abs = resolveSafe(workDir, relPath);
    } catch (e) {
        return `[Error: ${e.message}]`;
    }

    try {
        const entries = fs.readdirSync(abs, { withFileTypes: true });
        const lines = entries.map(e => e.isDirectory() ? `${e.name}/` : e.name);
        return `[Directory: ${relPath}]\n${lines.join('\n')}`;
    } catch (e) {
        return `[Error listing "${relPath}": ${e.message}]`;
    }
}

/**
 * Execute all commands found in a response, print results to the terminal,
 * and return the combined results string to feed back to the model.
 */
function executeCommands(workDir, commands) {
    const results = [];
    for (const { cmd, args, content } of commands) {
        let result;
        if (cmd === 'read') {
            result = handleRead(workDir, args);
        } else if (cmd === 'write') {
            result = handleWrite(workDir, args, content);
        } else if (cmd === 'ls') {
            result = handleLs(workDir, args);
        } else {
            result = `[Unknown command: ${cmd}]`;
        }
        // Show first line of result in the terminal for visibility
        const preview = result.split('\n')[0];
        console.log(`\n[cmd] ${cmd}:${args} → ${preview}`);
        results.push(result);
    }
    return results.join('\n\n');
}

// Ollama client 

async function ping() {
    try {
        const res = await fetch(`${OLLAMA_URL}/api/tags`);
        return res.ok;
    } catch {
        return false;
    }
}

/**
 * Streams a chat response from Ollama, writing tokens to stdout as they arrive.
 * Returns the full assistant reply string once the stream is complete.
 */
async function chat(history, systemPrompt) {
    const messages = [
        { role: 'system', content: systemPrompt },
        ...history,
    ];

    const res = await fetch(`${OLLAMA_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: MODEL, messages, stream: true }),
    });

    if (!res.ok) {
        throw new Error(`Ollama error ${res.status}: ${await res.text()}`);
    }

    let fullReply = '';
    const decoder = new TextDecoder();
    let buffer = '';

    for await (const chunk of res.body) {
        buffer += decoder.decode(chunk, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop(); // keep any incomplete trailing line

        for (const line of lines) {
            if (!line.trim()) continue;
            try {
                const payload = JSON.parse(line);
                const token = payload.message?.content ?? '';
                if (token) {
                    process.stdout.write(token);
                    fullReply += token;
                }
                if (payload.done) {
                    process.stdout.write('\n');
                }
            } catch {
                // ignore unparseable lines
            }
        }
    }

    return fullReply;
}

// Prompt helper 

function prompt(rl, question) {
    return new Promise(resolve => rl.question(question, resolve));
}

// Agent loop ─

async function main() {
    const reachable = await ping();
    if (!reachable) {
        console.error(`Cannot reach Ollama at ${OLLAMA_URL}. Is it running?`);
        process.exit(1);
    }

    console.log(`Connected to Ollama — model: ${MODEL}`);

    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

    // Ask for working directory
    const rawWorkDir = await prompt(rl, 'Working directory (Enter to skip file operations): ');
    let workDir = rawWorkDir.trim();
    if (workDir) {
        workDir = path.resolve(workDir);
        if (!fs.existsSync(workDir)) {
            console.error(`Directory not found: ${workDir}`);
            rl.close();
            process.exit(1);
        }
        console.log(`Working directory: ${workDir}`);
    } else {
        workDir = null;
        console.log('No working directory set — file operations disabled.');
    }

    const systemPrompt = workDir ? buildSystemPrompt(workDir) : BASE_SYSTEM_PROMPT;

    console.log('\nType a message and press Enter. Commands: /reset, /exit, /test\n');

    const history = [];

    /**
     * Send the current history to the model, handle the response, and
     * auto-loop if the model emitted file commands.
     */
    async function runTurn() {
        process.stdout.write('\nAgent: ');
        const reply = await chat(history, systemPrompt);
        history.push({ role: 'assistant', content: reply });

        if (!workDir) return;

        const commands = parseCommands(reply);
        if (commands.length === 0) return;

        const results = executeCommands(workDir, commands);

        // Feed results back to the model and continue automatically
        const feedback = `Command results:\n\n${results}`;
        console.log('\n[Feeding results back to model…]\n');
        history.push({ role: 'user', content: feedback });

        await runTurn(); // recurse until model stops issuing commands
    }

    async function handleInput(input) {
        const text = input.trim();

        if (!text) { rl.question('You: ', handleInput); return; }

        if (text === '/exit') {
            console.log('Goodbye.');
            rl.close();
            return;
        }

        if (text === '/reset') {
            history.length = 0;
            console.log('[History cleared]\n');
            rl.question('You: ', handleInput);
            return;
        }

        if (text === '/test') {
            if (!workDir) {
                console.log('[test] No working directory set — cannot run test.\n');
                rl.question('You: ', handleInput);
                return;
            }
            console.log('[test] Sending canned prompt to verify write: protocol…\n');
            const testMsg = 'Create a file called hello.txt in the working directory containing only the word: hello';
            const testHistory = [{ role: 'user', content: testMsg }];
            try {
                process.stdout.write('\nAgent: ');
                const reply = await chat(testHistory, systemPrompt);
                const commands = parseCommands(reply);
                const writeCmd = commands.find(c => c.cmd === 'write' && c.args === 'hello.txt');
                if (!writeCmd) {
                    console.log('\n[test] FAIL — no write:hello.txt command detected in response.');
                } else {
                    executeCommands(workDir, [writeCmd]);
                    const target = path.join(workDir, 'hello.txt');
                    const content = fs.existsSync(target) ? fs.readFileSync(target, 'utf8').trim() : null;
                    if (content === 'hello') {
                        console.log('\n[test] PASS — hello.txt written with correct content.');
                    } else {
                        console.log(`\n[test] FAIL — hello.txt content was: ${JSON.stringify(content)}`);
                    }
                }
            } catch (err) {
                console.error(`[test] Error: ${err.message}`);
            }
            console.log();
            rl.question('You: ', handleInput);
            return;
        }

        history.push({ role: 'user', content: text });

        try {
            await runTurn();
            console.log();
        } catch (err) {
            // Roll back the last user message if the turn failed before any reply
            if (history[history.length - 1]?.role === 'user') history.pop();
            console.error(`Error: ${err.message}\n`);
        }

        rl.question('You: ', handleInput);
    }

    rl.question('You: ', handleInput);
}

main();
