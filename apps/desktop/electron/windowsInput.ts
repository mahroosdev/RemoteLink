import { execFile, spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { createInterface, type Interface } from 'node:readline'

export type WindowsInputStatus = 'idle' | 'starting' | 'ready' | 'fallback' | 'unavailable'

const powershellHelper = String.raw`
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;

public static class RemoteLinkInput {
  private const int INPUT_KEYBOARD = 1;
  private const uint KEYEVENTF_KEYUP = 0x0002;
  private const uint KEYEVENTF_UNICODE = 0x0004;
  private const uint MOUSEEVENTF_MOVE = 0x0001;
  private const uint MOUSEEVENTF_LEFTDOWN = 0x0002;
  private const uint MOUSEEVENTF_LEFTUP = 0x0004;
  private const uint MOUSEEVENTF_RIGHTDOWN = 0x0008;
  private const uint MOUSEEVENTF_RIGHTUP = 0x0010;
  private const uint MOUSEEVENTF_WHEEL = 0x0800;

  [StructLayout(LayoutKind.Sequential)]
  private struct INPUT {
    public int type;
    public InputUnion U;
  }

  [StructLayout(LayoutKind.Explicit)]
  private struct InputUnion {
    [FieldOffset(0)] public KEYBDINPUT ki;
  }

  [StructLayout(LayoutKind.Sequential)]
  private struct KEYBDINPUT {
    public ushort wVk;
    public ushort wScan;
    public uint dwFlags;
    public uint time;
    public IntPtr dwExtraInfo;
  }

  [DllImport("user32.dll", SetLastError = true)]
  private static extern uint SendInput(uint nInputs, INPUT[] pInputs, int cbSize);

  [DllImport("user32.dll")]
  private static extern void mouse_event(uint dwFlags, uint dx, uint dy, uint dwData, UIntPtr dwExtraInfo);

  private static INPUT CreateKeyInput(ushort vk, uint flags) {
    return new INPUT {
      type = INPUT_KEYBOARD,
      U = new InputUnion {
        ki = new KEYBDINPUT {
          wVk = vk,
          wScan = 0,
          dwFlags = flags,
          time = 0,
          dwExtraInfo = IntPtr.Zero,
        }
      }
    };
  }

  private static INPUT CreateUnicodeInput(ushort scan, uint flags) {
    return new INPUT {
      type = INPUT_KEYBOARD,
      U = new InputUnion {
        ki = new KEYBDINPUT {
          wVk = 0,
          wScan = scan,
          dwFlags = KEYEVENTF_UNICODE | flags,
          time = 0,
          dwExtraInfo = IntPtr.Zero,
        }
      }
    };
  }

  private static void SendKey(ushort vk, uint flags) {
    var input = new INPUT[] { CreateKeyInput(vk, flags) };
    SendInput(1, input, Marshal.SizeOf(typeof(INPUT)));
  }

  public static void MouseMove(int dx, int dy) {
    mouse_event(MOUSEEVENTF_MOVE, unchecked((uint)dx), unchecked((uint)dy), 0, UIntPtr.Zero);
  }

  public static void MouseDownLeft() {
    mouse_event(MOUSEEVENTF_LEFTDOWN, 0, 0, 0, UIntPtr.Zero);
  }

  public static void MouseUpLeft() {
    mouse_event(MOUSEEVENTF_LEFTUP, 0, 0, 0, UIntPtr.Zero);
  }

  public static void MouseDownRight() {
    mouse_event(MOUSEEVENTF_RIGHTDOWN, 0, 0, 0, UIntPtr.Zero);
  }

  public static void MouseUpRight() {
    mouse_event(MOUSEEVENTF_RIGHTUP, 0, 0, 0, UIntPtr.Zero);
  }

  public static void MouseClickLeft() {
    MouseDownLeft();
    MouseUpLeft();
  }

  public static void MouseClickRight() {
    MouseDownRight();
    MouseUpRight();
  }

  public static void MouseScroll(int delta) {
    mouse_event(MOUSEEVENTF_WHEEL, 0, 0, unchecked((uint)delta), UIntPtr.Zero);
  }

  public static void KeyDown(ushort vk) {
    SendKey(vk, 0);
  }

  public static void KeyUp(ushort vk) {
    SendKey(vk, KEYEVENTF_KEYUP);
  }

  public static void PressKey(ushort vk) {
    KeyDown(vk);
    KeyUp(vk);
  }

  public static void TypeText(string text) {
    foreach (char ch in text) {
      var down = new INPUT[] { CreateUnicodeInput(ch, 0) };
      var up = new INPUT[] { CreateUnicodeInput(ch, KEYEVENTF_KEYUP) };
      SendInput(1, down, Marshal.SizeOf(typeof(INPUT)));
      SendInput(1, up, Marshal.SizeOf(typeof(INPUT)));
    }
  }
}
"@
`

const READY_TOKEN = '__RL_INPUT_READY__'
const WORKER_READY_TIMEOUT_MS = 6000
const COMMAND_TIMEOUT_MS = 1200
const FALLBACK_TIMEOUT_MS = 1800
const CLIXML_HEADER_PATTERN = /^#<\s*CLIXML\s*$/i

const modifierVirtualKeys: Record<string, number> = {
  ctrl: 0x11,
  alt: 0x12,
  shift: 0x10,
  win: 0x5B,
}

const namedVirtualKeys: Record<string, number> = {
  enter: 0x0D,
  tab: 0x09,
  escape: 0x1B,
  backspace: 0x08,
  delete: 0x2E,
  space: 0x20,
  f1: 0x70,
  f2: 0x71,
  f3: 0x72,
  f4: 0x73,
  f5: 0x74,
  f6: 0x75,
  f7: 0x76,
  f8: 0x77,
  f9: 0x78,
  f10: 0x79,
  f11: 0x7A,
  f12: 0x7B,
}

for (let code = 0; code < 26; code += 1) {
  namedVirtualKeys[String.fromCharCode(97 + code)] = 0x41 + code
}

for (let code = 0; code < 10; code += 1) {
  namedVirtualKeys[String(code)] = 0x30 + code
}

interface PendingInputAction {
  resolve: () => void
  reject: (error: Error) => void
  timeout: ReturnType<typeof setTimeout>
}

interface ReadyWaiter {
  resolve: () => void
  reject: (error: Error) => void
  timeout: ReturnType<typeof setTimeout>
}

export class WindowsInputExecutor {
  private queue: Promise<void> = Promise.resolve()
  private generation = 0
  private worker: ChildProcessWithoutNullStreams | null = null
  private stdout: Interface | null = null
  private pending = new Map<string, PendingInputAction>()
  private actionId = 0
  private workerReady = false
  private readyWaiter: ReadyWaiter | null = null
  private readyPromise: Promise<void> | null = null
  private startupErrors: string[] = []
  private fallbackActive = false
  private expectedStop = false
  private status: WindowsInputStatus = 'idle'
  // Persistent fallback worker: loads the C# helper once and reuses the
  // process so fallback mode does not recompile Add-Type on every command.
  private fallbackWorker: ChildProcessWithoutNullStreams | null = null
  private fallbackStdout: Interface | null = null
  private fallbackReady = false
  private fallbackReadyPromise: Promise<void> | null = null
  private fallbackReadyWaiter: ReadyWaiter | null = null
  private fallbackStartupErrors: string[] = []

  constructor(private readonly onStatusChange?: (status: WindowsInputStatus) => void) {}

  getStatus() {
    return this.status
  }

  async warmUp() {
    if (process.platform !== 'win32') {
      this.setStatus('unavailable')
      return
    }
    this.fallbackActive = false
    try {
      await this.ensureWorker()
      // Primary worker is healthy again; release any lingering fallback process.
      this.stopFallbackWorker()
    } catch {
      this.fallbackActive = true
      this.setStatus('fallback')
    }
  }

  clearQueue() {
    this.generation += 1
    this.queue = Promise.resolve()
    for (const [id, pending] of this.pending) {
      clearTimeout(pending.timeout)
      pending.resolve()
      this.pending.delete(id)
    }
  }

  markIdle() {
    if (!this.fallbackActive && this.workerReady) return
    this.setStatus('idle')
  }

  stopWorker() {
    this.clearQueue()
    this.stopWorkerProcess()
    this.stopFallbackWorker()
    this.fallbackActive = false
    this.setStatus('idle')
  }

  mouseMove(dx: number, dy: number) {
    return this.runInput(`[RemoteLinkInput]::MouseMove(${toInt(dx)}, ${toInt(dy)})`, false)
  }

  mouseMoveOrdered(dx: number, dy: number) {
    return this.enqueue(`[RemoteLinkInput]::MouseMove(${toInt(dx)}, ${toInt(dy)})`)
  }

  mouseButtonDown(button: 'left' | 'right') {
    return this.enqueue(
      button === 'left'
        ? '[RemoteLinkInput]::MouseDownLeft()'
        : '[RemoteLinkInput]::MouseDownRight()',
    )
  }

  mouseButtonUp(button: 'left' | 'right') {
    return this.enqueue(
      button === 'left'
        ? '[RemoteLinkInput]::MouseUpLeft()'
        : '[RemoteLinkInput]::MouseUpRight()',
    )
  }

  mouseClick(button: 'left' | 'right') {
    return this.enqueue(
      button === 'left'
        ? '[RemoteLinkInput]::MouseClickLeft()'
        : '[RemoteLinkInput]::MouseClickRight()',
    )
  }

  mouseScroll(delta: number) {
    return this.enqueue(`[RemoteLinkInput]::MouseScroll(${toInt(delta)})`)
  }

  keyPress(key: string) {
    const vk = resolveVirtualKey(key)
    if (vk == null) throw new Error(`Unsupported key: ${key}`)
    return this.enqueue(`[RemoteLinkInput]::PressKey(${vk})`)
  }

  keyDown(key: string) {
    const vk = resolveVirtualKey(key)
    if (vk == null) throw new Error(`Unsupported modifier: ${key}`)
    return this.enqueue(`[RemoteLinkInput]::KeyDown(${vk})`)
  }

  keyUp(key: string) {
    const vk = resolveVirtualKey(key)
    if (vk == null) throw new Error(`Unsupported modifier: ${key}`)
    return this.enqueue(`[RemoteLinkInput]::KeyUp(${vk})`)
  }

  typeText(text: string) {
    return this.enqueue(`[RemoteLinkInput]::TypeText(${toPowerShellString(text)})`)
  }

  shortcut(keys: string[]) {
    if (keys.length === 0) return Promise.resolve()
    const [first, ...rest] = keys
    const modifierKeys = keys.slice(0, -1)
    const finalKey = rest.length > 0 ? rest[rest.length - 1] : first
    const scriptParts = modifierKeys.map((key) => `[RemoteLinkInput]::KeyDown(${resolveRequiredVirtualKey(key)})`)
    scriptParts.push(`[RemoteLinkInput]::PressKey(${resolveRequiredVirtualKey(finalKey)})`)
    scriptParts.push(...modifierKeys.slice().reverse().map((key) => `[RemoteLinkInput]::KeyUp(${resolveRequiredVirtualKey(key)})`))
    return this.enqueue(scriptParts.join('; '))
  }

  releaseAllModifiers() {
    return this.enqueue([
      '[RemoteLinkInput]::KeyUp(0x11)',
      '[RemoteLinkInput]::KeyUp(0x12)',
      '[RemoteLinkInput]::KeyUp(0x10)',
      '[RemoteLinkInput]::KeyUp(0x5B)',
    ].join('; '))
  }

  private enqueue(script: string) {
    const generation = this.generation
    const next = this.queue.catch(() => undefined).then(() => {
      if (generation !== this.generation) return
      return this.runInput(script, true)
    })
    this.queue = next.then(() => undefined, () => undefined)
    return next
  }

  private async runInput(script: string, waitForAck: boolean) {
    if (process.platform !== 'win32') {
      this.setStatus('unavailable')
      throw new Error('Remote input is supported only on Windows hosts')
    }

    if (this.fallbackActive) {
      await this.runFallback(script)
      return
    }

    try {
      await this.runWithWorker(script, waitForAck)
      return
    } catch (firstError) {
      this.stopWorkerProcess()
      try {
        await this.runWithWorker(script, waitForAck)
        return
      } catch {
        this.stopWorkerProcess()
        await this.runFallback(script, firstError)
      }
    }
  }

  private async runWithWorker(script: string, waitForAck: boolean) {
    await this.ensureWorker()
    if (!this.worker || !this.workerReady || this.worker.stdin.destroyed) {
      throw new Error('Input worker is not ready')
    }

    if (!waitForAck) {
      this.worker.stdin.write(`try { ${script} } catch { }\n`)
      return
    }

    const index = ++this.actionId
    const doneToken = `__RL_DONE_${index}__`
    const errorToken = `__RL_ERROR_${index}__`
    return new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(doneToken)
        reject(new Error('Input worker timed out'))
      }, COMMAND_TIMEOUT_MS)
      this.pending.set(doneToken, { resolve, reject, timeout })
      this.worker?.stdin.write(
        `try { ${script}; [Console]::Out.WriteLine('${doneToken}') } catch { [Console]::Out.WriteLine('${errorToken}::' + $_.Exception.Message) }\n`,
      )
    })
  }

  private ensureWorker() {
    if (process.platform !== 'win32') {
      return Promise.reject(new Error('Remote input is supported only on Windows hosts'))
    }
    if (this.worker && this.workerReady && !this.worker.killed) {
      this.setStatus('ready')
      return Promise.resolve()
    }
    if (this.readyPromise) return this.readyPromise

    this.startupErrors = []
    this.expectedStop = false
    this.workerReady = false
    this.setStatus('starting')

    const worker = spawn('powershell.exe', [
      '-NoLogo',
      '-NoProfile',
      '-NonInteractive',
      '-ExecutionPolicy',
      'Bypass',
      '-Command',
      '-',
    ], { windowsHide: true })

    this.worker = worker
    this.stdout = createInterface({ input: worker.stdout })
    this.stdout.on('line', (line) => this.handleWorkerLine(line.trim()))
    worker.stderr.on('data', (chunk) => this.handleWorkerStderr(chunk))
    worker.on('exit', () => this.handleWorkerExit())
    worker.on('error', (error) => this.failReady(`Input worker process failed: ${error.message}`))

    this.readyPromise = new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        const detail = this.startupErrors.find(Boolean) ?? 'Input worker did not become ready'
        this.stopWorkerProcess()
        reject(new Error(detail))
      }, WORKER_READY_TIMEOUT_MS)
      this.readyWaiter = { resolve, reject, timeout }
    }).finally(() => {
      this.readyPromise = null
      this.readyWaiter = null
    })

    worker.stdin.write(`${powershellHelper}\n[Console]::Out.WriteLine('${READY_TOKEN}')\n`)
    return this.readyPromise
  }

  private handleWorkerLine(line: string) {
    if (!line) return

    if (line === READY_TOKEN) {
      this.workerReady = true
      if (this.readyWaiter) {
        clearTimeout(this.readyWaiter.timeout)
        this.readyWaiter.resolve()
      }
      this.setStatus('ready')
      return
    }

    const errorMatch = /^__RL_ERROR_(\d+)__::(.*)$/.exec(line)
    if (errorMatch) {
      const doneToken = `__RL_DONE_${errorMatch[1]}__`
      const pending = this.pending.get(doneToken)
      if (!pending) return
      clearTimeout(pending.timeout)
      this.pending.delete(doneToken)
      pending.reject(new Error(errorMatch[2] || 'Input worker command failed'))
      return
    }

    const pending = this.pending.get(line)
    if (!pending) return
    clearTimeout(pending.timeout)
    this.pending.delete(line)
    pending.resolve()
  }

  private handleWorkerStderr(chunk: Buffer) {
    const message = sanitizeWorkerDiagnostic(String(chunk))
    if (!message) return
    if (!this.workerReady) {
      this.startupErrors.push(message)
      return
    }
    if (process.env.REMOTELINK_DEBUG_INPUT === '1') {
      console.warn(`[RemoteLink][input] worker diagnostic: ${message}`)
    }
  }

  private handleWorkerExit() {
    const wasExpected = this.expectedStop
    this.worker = null
    this.workerReady = false
    this.stdout?.close()
    this.stdout = null
    this.failReady(this.startupErrors.find(Boolean) ?? 'Input worker exited before ready')
    for (const [id, pending] of this.pending) {
      clearTimeout(pending.timeout)
      pending.reject(new Error('Input worker exited'))
      this.pending.delete(id)
    }
    if (!wasExpected && !this.fallbackActive) this.setStatus('unavailable')
  }

  private failReady(message: string) {
    if (!this.readyWaiter) return
    clearTimeout(this.readyWaiter.timeout)
    this.readyWaiter.reject(new Error(message))
  }

  private stopWorkerProcess() {
    this.expectedStop = true
    this.stdout?.close()
    this.stdout = null
    this.workerReady = false
    const worker = this.worker
    this.worker = null
    if (worker && !worker.killed) worker.kill()
    if (this.readyWaiter) {
      clearTimeout(this.readyWaiter.timeout)
      this.readyWaiter.reject(new Error('Input worker stopped'))
      this.readyWaiter = null
    }
    this.readyPromise = null
    for (const [id, pending] of this.pending) {
      clearTimeout(pending.timeout)
      pending.reject(new Error('Input worker stopped'))
      this.pending.delete(id)
    }
  }

  private async runFallback(script: string, cause?: unknown) {
    this.fallbackActive = true
    this.setStatus('fallback')
    try {
      await this.ensureFallbackWorker()
      const worker = this.fallbackWorker
      if (!worker || !this.fallbackReady || worker.stdin.destroyed) {
        throw new Error('Fallback input worker is not ready')
      }
      // Fire-and-forget: the helper is already loaded in this persistent
      // process, so no per-command Add-Type recompilation happens. A single
      // stdin pipe keeps command ordering intact.
      worker.stdin.write(`try { ${script} } catch { }\n`)
    } catch (fallbackError) {
      this.stopFallbackWorker()
      // Last resort for a single transient failure: one isolated process.
      try {
        await runOneShotPowerShell(`${powershellHelper}\n${script}\n`, FALLBACK_TIMEOUT_MS)
      } catch (oneShotError) {
        this.setStatus('unavailable')
        if (process.env.REMOTELINK_DEBUG_INPUT === '1') {
          console.warn('[RemoteLink][input] fallback failed', { cause, fallbackError, oneShotError })
        }
        throw new Error('Remote input is temporarily unavailable')
      }
    }
  }

  private ensureFallbackWorker(): Promise<void> {
    if (process.platform !== 'win32') {
      return Promise.reject(new Error('Remote input is supported only on Windows hosts'))
    }
    const existing = this.fallbackWorker
    if (existing && this.fallbackReady && !existing.killed && !existing.stdin.destroyed) {
      return Promise.resolve()
    }
    if (this.fallbackReadyPromise) return this.fallbackReadyPromise

    this.stopFallbackWorker()
    this.fallbackStartupErrors = []
    this.fallbackReady = false

    const worker = spawn('powershell.exe', [
      '-NoLogo',
      '-NoProfile',
      '-NonInteractive',
      '-ExecutionPolicy',
      'Bypass',
      '-Command',
      '-',
    ], { windowsHide: true })

    this.fallbackWorker = worker
    this.fallbackStdout = createInterface({ input: worker.stdout })
    this.fallbackStdout.on('line', (line) => this.handleFallbackLine(line.trim()))
    worker.stderr.on('data', (chunk) => {
      if (this.fallbackReady) return
      const message = sanitizeWorkerDiagnostic(String(chunk))
      if (message) this.fallbackStartupErrors.push(message)
    })
    worker.on('exit', () => this.handleFallbackExit())
    worker.on('error', (error) => this.failFallbackReady(`Fallback input worker failed: ${error.message}`))

    this.fallbackReadyPromise = new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        const detail = this.fallbackStartupErrors.find(Boolean) ?? 'Fallback input worker did not become ready'
        this.stopFallbackWorker()
        reject(new Error(detail))
      }, WORKER_READY_TIMEOUT_MS)
      this.fallbackReadyWaiter = { resolve, reject, timeout }
    }).finally(() => {
      this.fallbackReadyPromise = null
      this.fallbackReadyWaiter = null
    })

    worker.stdin.write(`${powershellHelper}\n[Console]::Out.WriteLine('${READY_TOKEN}')\n`)
    return this.fallbackReadyPromise
  }

  private handleFallbackLine(line: string) {
    if (line !== READY_TOKEN) return
    this.fallbackReady = true
    if (this.fallbackReadyWaiter) {
      clearTimeout(this.fallbackReadyWaiter.timeout)
      this.fallbackReadyWaiter.resolve()
    }
  }

  private handleFallbackExit() {
    this.fallbackWorker = null
    this.fallbackReady = false
    this.fallbackStdout?.close()
    this.fallbackStdout = null
    this.failFallbackReady('Fallback input worker exited')
  }

  private failFallbackReady(message: string) {
    if (!this.fallbackReadyWaiter) return
    clearTimeout(this.fallbackReadyWaiter.timeout)
    this.fallbackReadyWaiter.reject(new Error(message))
    this.fallbackReadyWaiter = null
  }

  private stopFallbackWorker() {
    this.fallbackStdout?.close()
    this.fallbackStdout = null
    this.fallbackReady = false
    const worker = this.fallbackWorker
    this.fallbackWorker = null
    if (worker && !worker.killed) worker.kill()
    this.failFallbackReady('Fallback input worker stopped')
    this.fallbackReadyPromise = null
  }

  private setStatus(status: WindowsInputStatus) {
    if (this.status === status) return
    this.status = status
    this.onStatusChange?.(status)
  }
}

function runOneShotPowerShell(script: string, timeoutMs: number) {
  const encoded = Buffer.from(script, 'utf16le').toString('base64')
  return new Promise<void>((resolve, reject) => {
    execFile(
      'powershell.exe',
      ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded],
      { windowsHide: true, timeout: timeoutMs, maxBuffer: 64 * 1024 },
      (error, stdout, stderr) => {
        if (error) {
          reject(new Error(sanitizeWorkerDiagnostic(stderr) || error.message || 'Fallback input failed'))
          return
        }
        const diagnostic = sanitizeWorkerDiagnostic(stderr || stdout)
        if (diagnostic) {
          reject(new Error(diagnostic))
          return
        }
        resolve()
      },
    )
  })
}

function sanitizeWorkerDiagnostic(value: string) {
  const text = value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !CLIXML_HEADER_PATTERN.test(line) && !/^<Objs\b/i.test(line) && !/^<\/Objs>$/i.test(line))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (!text || CLIXML_HEADER_PATTERN.test(text)) return ''
  return text.slice(0, 300)
}

function resolveVirtualKey(key: string) {
  const normalized = normalizeKeyName(key)
  return namedVirtualKeys[normalized] ?? modifierVirtualKeys[normalized] ?? null
}

function resolveRequiredVirtualKey(key: string) {
  const resolved = resolveVirtualKey(key)
  if (resolved == null) throw new Error(`Unsupported shortcut key: ${key}`)
  return `0x${resolved.toString(16).toUpperCase()}`
}

function normalizeKeyName(key: string) {
  return key.trim().toLowerCase()
}

function toInt(value: number) {
  if (!Number.isFinite(value)) return 0
  return Math.trunc(Math.max(-1200, Math.min(1200, value)))
}

function toPowerShellString(value: string) {
  return `'${value.replace(/'/g, "''")}'`
}
