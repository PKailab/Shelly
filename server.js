
function handleRun(ws, requestId, command) {
  if (!requestId || !command) {
    send(ws, { type: 'error', requestId, message: 'requestId and command are required' });
    return;
  }

  // Reject if another command is already running
  if (activeProcess) {
    send(ws, {
      type: 'error',
      requestId,
      message: '別のコマンドが実行中です。しばらくお待ちください。',
    });
    return;
  }

  // Dangerous command check
  if (isDangerous(command)) {
    send(ws, {
      type: 'stderr',
      requestId,
      data: `[BLOCKED] 危険なコマンドパターンが検出されました: ${command}\n` +
            `実行するには --no-dangerous-check オプションでサーバを起動してください。\n`,
    });
    send(ws, { type: 'exit', requestId, code: 1, cwd: currentCwd });
    return;
  }

  console.log(`[shelly-bridge] [${requestId}] RUN: ${command}`);

  // Handle 'cd' specially to maintain working directory state
  const cdMatch = command.trim().match(/^cd\s*(.*)?$/);
  if (cdMatch) {
    handleCd(ws, requestId, cdMatch[1]?.trim() || os.homedir());
    return;
  }

  // Spawn shell process
  const proc = spawn('bash', ['-c', command], {
    cwd: currentCwd,
    env: {
      ...process.env,
      TERM: 'xterm-256color',
      COLUMNS: '120',
      LINES: '40',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  activeProcess = proc;
  activeRequestId = requestId;
  activeWs = ws;
  cancelPending = false;

  proc.stdout.on('data', (data) => {
    send(ws, { type: 'stdout', requestId, data: data.toString() });
  });

  proc.stderr.on('data', (data) => {
    send(ws, { type: 'stderr', requestId, data: data.toString() });
  });

  proc.on('close', (code, signal) => {
    clearSigkillTimer();

    const wasCancelled = cancelPending || signal === 'SIGINT' || code === 130;
    const exitCode = wasCancelled ? 130 : (code ?? 0);

    console.log(`[shelly-bridge] [${requestId}] EXIT: code=${code} signal=${signal} cancelled=${wasCancelled}`);

    activeProcess = null;
    activeRequestId = null;
    activeWs = null;
    cancelPending = false;

    if (wasCancelled) {
      // Send ^C indicator to stderr so it shows in the terminal
      send(ws, { type: 'stderr', requestId, data: '^C\n' });
      // Send dedicated cancelled message