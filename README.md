# Llama 3.2 Setup on Windows Lenovo ThinkPad P1 Gen 4 (with a RTX A3000 6GB VRAM)

## Introduction

This documentation covers set up of a local LLM Llama 3.2 on a Lenovo ThinkPad P1 Gen 4 (with a RTX A3000 6GB VRAM) graphics card.

## Setting up Ollama

In Powershell run the Ollama installer:

<https://ollama.com/download/windows>

```powershell
irm https://ollama.com/install.ps1 | iex
```

Initial Run: Once installed, an Ollama icon will appear in your system tray. The installer automatically adds the "ollama" command to your PATH, so you can use it in any terminal.

Check NVIDIA drivers active:

```powershell
nvidia-smi
```

![NVIDIA drivers active](nvidia-drivers-active.png)

Run the `ollama serve` comman

```powershell
ollama serve
```

If you see an error like `Error: listen tcp 127.0.0.1:11434: bind: Only one usage of each socket address (protocol/network address/port) is normally permitted.` - this means that Ollama was actually already running.

Run `ollama run llama3.2`

```powershell
ollama run llama3.2
```

![ollama run command](/ollama-run-command.png)

**What the initial run command does:**

Pulling Manifest: It fetches a small file that tells your computer which "layers" (the brain parts) it needs to download.

Downloading Layers: You'll see several progress bars. For Llama 3.2 3B, the total download is roughly 2.0 GB.

Verifying/Checksum: It double-checks that the download wasn't corrupted.

Interactive Chat: Once it hits 100%, the prompt will change to >>>, and you can start talking to the model immediately.

![Chatting with Llama 3.2](chatting-with-lamma-3.2.png)

Performance Verification: While you are chatting, open a new terminal and type ollama ps.

The "100% GPU" Goal: Under the "PROCESSOR" column, it should say 100% GPU. If it says "CPU/GPU," it means your context window is too big and it's spilling into your system RAM, which will slow it down.

```powershell
ollama ps
```

Expected output:

```
NAME               ID              SIZE      PROCESSOR    CONTEXT    UNTIL
llama3.2:latest    a80c4f17acd5    2.8 GB    100% GPU     4096       4 minutes from now
```

**How to check what you have:**

If you want to see exactly what has finished downloading onto your ThinkPad, you can open a second terminal window and type:

```powershell
ollama list
```

Expected output:

```powershell
NAME               ID              SIZE      MODIFIED
llama3.2:latest    a80c4f17acd5    2.0 GB    6 minutes ago
```
