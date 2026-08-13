"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";

type ButtonState = {
  pressed: boolean;
  touched: boolean;
  value: number;
};

type PadSnapshot = {
  id: string;
  index: number;
  mapping: string;
  connected: boolean;
  timestamp: number;
  buttons: ButtonState[];
  axes: number[];
  vibration: boolean;
};

type ControllerOption = {
  id: string;
  index: number;
  mapping: string;
};

type InputLogItem = {
  label: string;
  value: number;
  time: string;
};

type RumbleActuator = {
  playEffect?: (
    effect: "dual-rumble",
    options: {
      startDelay: number;
      duration: number;
      weakMagnitude: number;
      strongMagnitude: number;
    },
  ) => Promise<unknown>;
};

const BUTTON_LABELS = [
  "A", "B", "X", "Y", "LB", "RB", "LT", "RT", "VIEW",
  "MENU", "LS", "RS", "D↑", "D↓", "D←", "D→", "HOME", "SHARE",
];

const EMPTY_BUTTON: ButtonState = { pressed: false, touched: false, value: 0 };

const EMPTY_SNAPSHOT: PadSnapshot = {
  id: "Waiting for a controller",
  index: -1,
  mapping: "—",
  connected: false,
  timestamp: 0,
  buttons: Array.from({ length: 18 }, () => ({ ...EMPTY_BUTTON })),
  axes: [0, 0, 0, 0],
  vibration: false,
};

function readPad(pad: Gamepad): PadSnapshot {
  return {
    id: pad.id,
    index: pad.index,
    mapping: pad.mapping || "non-standard",
    connected: pad.connected,
    timestamp: pad.timestamp,
    buttons: pad.buttons.map((item) => ({
      pressed: item.pressed,
      touched: item.touched,
      value: item.value,
    })),
    axes: Array.from(pad.axes),
    vibration: Boolean((pad as Gamepad & { vibrationActuator?: unknown }).vibrationActuator),
  };
}

function demoPad(now: number): PadSnapshot {
  const t = now / 1000;
  const buttons = Array.from({ length: 18 }, () => ({ ...EMPTY_BUTTON }));
  const activeButton = Math.floor(t * 1.25) % 18;
  const pulse = (Math.sin(t * 7) + 1) / 2;

  buttons[activeButton] = { pressed: pulse > 0.36, touched: true, value: pulse };
  buttons[6] = { pressed: false, touched: true, value: (Math.sin(t * 1.7) + 1) / 2 };
  buttons[7] = { pressed: false, touched: true, value: (Math.cos(t * 1.35) + 1) / 2 };

  return {
    id: "XUSB Demo Controller",
    index: 0,
    mapping: "standard",
    connected: true,
    timestamp: now,
    buttons,
    axes: [
      Math.sin(t * 1.3) * 0.82,
      Math.cos(t * 1.1) * 0.82,
      Math.sin(t * 0.83 + 2) * 0.72,
      Math.cos(t * 1.47 + 1) * 0.72,
    ],
    vibration: true,
  };
}

function axis(snapshot: PadSnapshot, index: number) {
  return snapshot.axes[index] ?? 0;
}

function button(snapshot: PadSnapshot, index: number) {
  return snapshot.buttons[index] ?? EMPTY_BUTTON;
}

function formatValue(value: number) {
  return (Math.abs(value) < 0.0005 ? 0 : value).toFixed(3);
}

function clampAxis(value: number) {
  return Math.max(-1, Math.min(1, value));
}

function StickPlot({
  label,
  x,
  y,
  pressed,
  deadZone,
  trailEnabled,
  clearToken,
  className,
}: {
  label: string;
  x: number;
  y: number;
  pressed: boolean;
  deadZone: number;
  trailEnabled: boolean;
  clearToken: number;
  className: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const latestRef = useRef({ x, y, trailEnabled });
  const previousRef = useRef<{ x: number; y: number } | null>(null);
  latestRef.current = { x, y, trailEnabled };

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;

    let frameId = 0;

    const draw = () => {
      const rect = canvas.getBoundingClientRect();
      const width = Math.max(1, rect.width);
      const height = Math.max(1, rect.height);
      const scale = Math.min(window.devicePixelRatio || 1, 2);
      const pixelWidth = Math.max(1, Math.round(width * scale));
      const pixelHeight = Math.max(1, Math.round(height * scale));

      if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
        canvas.width = pixelWidth;
        canvas.height = pixelHeight;
        previousRef.current = null;
      }

      context.setTransform(scale, 0, 0, scale, 0, 0);
      const latest = latestRef.current;

      if (!latest.trailEnabled) {
        context.clearRect(0, 0, width, height);
        previousRef.current = null;
      } else {
        context.save();
        context.globalCompositeOperation = "destination-out";
        context.fillStyle = "rgba(0, 0, 0, 0.012)";
        context.fillRect(0, 0, width, height);
        context.restore();

        const point = {
          x: ((clampAxis(latest.x) + 1) / 2) * width,
          y: ((clampAxis(latest.y) + 1) / 2) * height,
        };
        const previous = previousRef.current;

        if (previous) {
          context.beginPath();
          context.moveTo(previous.x, previous.y);
          context.lineTo(point.x, point.y);
          context.strokeStyle = "rgba(184, 241, 59, 0.58)";
          context.lineWidth = 1.7;
          context.lineCap = "round";
          context.stroke();
        }

        context.beginPath();
        context.arc(point.x, point.y, 1.5, 0, Math.PI * 2);
        context.fillStyle = "rgba(184, 241, 59, 0.72)";
        context.fill();
        previousRef.current = point;
      }

      frameId = requestAnimationFrame(draw);
    };

    frameId = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frameId);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, canvas.width, canvas.height);
    previousRef.current = null;
  }, [clearToken]);

  const rawX = clampAxis(x);
  const rawY = clampAxis(y);
  const plotStyle = {
    "--dead-zone-size": `${deadZone * 100}%`,
  } as CSSProperties;
  const cursorStyle = {
    left: `${((rawX + 1) / 2) * 100}%`,
    top: `${((rawY + 1) / 2) * 100}%`,
  };

  return (
    <div
      className={`schematic-stick ${className} ${pressed ? "is-pressed" : ""}`}
      aria-label={`${label}: x ${formatValue(x)}, y ${formatValue(y)}`}
    >
      <div className="stick-plot-heading">
        <strong>{label}</strong>
        <code>{formatValue(x)} / {formatValue(y)}</code>
      </div>
      <div className="stick-plot" style={plotStyle}>
        <canvas ref={canvasRef} aria-hidden="true" />
        <span className="plot-dead-zone" />
        <span className="plot-origin" />
        <span className="plot-cursor" style={cursorStyle} />
        <span className="plot-axis-label plot-axis-x">X</span>
        <span className="plot-axis-label plot-axis-y">Y</span>
      </div>
    </div>
  );
}

function SchematicFaceButton({ label, index, snapshot }: {
  label: string;
  index: number;
  snapshot: PadSnapshot;
}) {
  const state = button(snapshot, index);
  return (
    <div
      className={`schematic-face-button schematic-face-${label.toLowerCase()} ${state.pressed ? "is-pressed" : ""}`}
      style={{ "--button-value": state.value } as CSSProperties}
      aria-label={`${label}: ${formatValue(state.value)}`}
    >
      {label}
    </div>
  );
}

function SchematicDPad({ snapshot }: { snapshot: PadSnapshot }) {
  return (
    <div className="schematic-dpad-wrap" aria-label="Directional pad">
      <div className="schematic-dpad">
        <div className={`schematic-dpad-key schematic-dpad-up ${button(snapshot, 12).pressed ? "is-pressed" : ""}`}>▲</div>
        <div className={`schematic-dpad-key schematic-dpad-right ${button(snapshot, 15).pressed ? "is-pressed" : ""}`}>▶</div>
        <div className={`schematic-dpad-key schematic-dpad-down ${button(snapshot, 13).pressed ? "is-pressed" : ""}`}>▼</div>
        <div className={`schematic-dpad-key schematic-dpad-left ${button(snapshot, 14).pressed ? "is-pressed" : ""}`}>◀</div>
        <div className="schematic-dpad-center" />
      </div>
      <span className="schematic-control-label">DPAD</span>
    </div>
  );
}

function TriggerAxis({ label, shoulder, value, shoulderPressed }: {
  label: string;
  shoulder: string;
  value: number;
  shoulderPressed: boolean;
}) {
  const normalized = Math.max(0, Math.min(1, value));

  return (
    <div className="schematic-trigger-module">
      <div className={`schematic-shoulder ${shoulderPressed ? "is-pressed" : ""}`}>{shoulder}</div>
      <div className="schematic-trigger-axis">
        <div className="schematic-trigger-heading"><strong>{label}</strong><code>{formatValue(normalized)}</code></div>
        <div className="schematic-trigger-ruler">
          <i style={{ width: `${normalized * 100}%` }} />
          <span style={{ left: `${normalized * 100}%` }} />
        </div>
        <div className="schematic-trigger-scale"><span>0</span><span>0.5</span><span>1</span></div>
      </div>
    </div>
  );
}

function ControllerFigure({
  snapshot,
  deadZone,
  trailEnabled,
  clearToken,
  onTrailChange,
  onClearTrail,
}: {
  snapshot: PadSnapshot;
  deadZone: number;
  trailEnabled: boolean;
  clearToken: number;
  onTrailChange: (enabled: boolean) => void;
  onClearTrail: () => void;
}) {
  return (
    <div className="input-visualizer">
      <div className="schematic-trigger-row">
        <TriggerAxis label="LT" shoulder="LB" value={button(snapshot, 6).value} shoulderPressed={button(snapshot, 4).pressed} />
        <TriggerAxis label="RT" shoulder="RB" value={button(snapshot, 7).value} shoulderPressed={button(snapshot, 5).pressed} />
      </div>

      <div className="controller-schematic">
        <div className="schematic-layout">
          <StickPlot
            label="LS"
            x={axis(snapshot, 0)}
            y={axis(snapshot, 1)}
            pressed={button(snapshot, 10).pressed}
            deadZone={deadZone}
            trailEnabled={trailEnabled}
            clearToken={clearToken}
            className="schematic-stick-left"
          />

          <SchematicDPad snapshot={snapshot} />

          <div className="schematic-face-cluster" aria-label="Face buttons">
            <SchematicFaceButton label="Y" index={3} snapshot={snapshot} />
            <SchematicFaceButton label="B" index={1} snapshot={snapshot} />
            <SchematicFaceButton label="A" index={0} snapshot={snapshot} />
            <SchematicFaceButton label="X" index={2} snapshot={snapshot} />
            <span className="schematic-control-label">FACE</span>
          </div>

          <StickPlot
            label="RS"
            x={axis(snapshot, 2)}
            y={axis(snapshot, 3)}
            pressed={button(snapshot, 11).pressed}
            deadZone={deadZone}
            trailEnabled={trailEnabled}
            clearToken={clearToken}
            className="schematic-stick-right"
          />

          <div className="schematic-meta-zone">
            <div className={`schematic-meta-button ${button(snapshot, 8).pressed ? "is-pressed" : ""}`} aria-label="View button">▣</div>
            <div className={`schematic-meta-button schematic-home-button ${button(snapshot, 16).pressed ? "is-pressed" : ""}`} aria-label="Home button">X</div>
            <div className={`schematic-meta-button ${button(snapshot, 9).pressed ? "is-pressed" : ""}`} aria-label="Menu button">≡</div>
            <div className={`schematic-meta-button schematic-share-button ${button(snapshot, 17).pressed ? "is-pressed" : ""}`} aria-label="Share button">◇</div>
          </div>
        </div>
      </div>

      <div className="trail-toolbar">
        <div className="trail-description">
          <strong>Stick trail</strong>
          <span>Fading path · approximately 4 seconds</span>
        </div>
        <label className="trail-switch">
          <input
            type="checkbox"
            checked={trailEnabled}
            aria-label="Enable fading stick trail"
            onChange={(event) => onTrailChange(event.target.checked)}
          />
          <span className="trail-switch-track"><i /></span>
          <b>{trailEnabled ? "ON" : "OFF"}</b>
        </label>
        <button className="clear-trail-button" type="button" onClick={onClearTrail} disabled={!trailEnabled}>Clear trail</button>
      </div>
    </div>
  );
}

export default function Home() {
  const [snapshot, setSnapshot] = useState<PadSnapshot>(EMPTY_SNAPSHOT);
  const [controllers, setControllers] = useState<ControllerOption[]>([]);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [demoMode, setDemoMode] = useState(false);
  const [deadZone, setDeadZone] = useState(0.08);
  const [trailEnabled, setTrailEnabled] = useState(true);
  const [trailClearToken, setTrailClearToken] = useState(0);
  const [sampleRate, setSampleRate] = useState(0);
  const [inputLog, setInputLog] = useState<InputLogItem[]>([]);
  const [actionMessage, setActionMessage] = useState("READY");
  const selectedIndexRef = useRef<number | null>(null);
  const demoModeRef = useRef(false);
  const previousButtonsRef = useRef<boolean[]>([]);

  useEffect(() => { selectedIndexRef.current = selectedIndex; }, [selectedIndex]);
  useEffect(() => { demoModeRef.current = demoMode; }, [demoMode]);

  useEffect(() => {
    const saved = window.localStorage.getItem("xusb-dead-zone");
    if (saved !== null) {
      const parsed = Number(saved);
      if (Number.isFinite(parsed) && parsed >= 0 && parsed <= 0.3) setDeadZone(parsed);
    }

    const savedTrail = window.localStorage.getItem("xusb-stick-trail");
    if (savedTrail !== null) setTrailEnabled(savedTrail === "true");
  }, []);

  useEffect(() => {
    const current = snapshot.buttons.map((item) => item.pressed);
    const newPresses = current
      .map((pressed, index) => ({ pressed, index }))
      .filter(({ pressed, index }) => pressed && !previousButtonsRef.current[index]);

    previousButtonsRef.current = current;
    if (!newPresses.length) return;

    const time = new Date().toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
    const entries = newPresses.map(({ index }) => ({
      label: BUTTON_LABELS[index] ?? `B${index}`,
      value: snapshot.buttons[index]?.value ?? 0,
      time,
    }));
    setInputLog((currentLog) => [...entries, ...currentLog].slice(0, 4));
  }, [snapshot]);

  useEffect(() => {
    let frameId = 0;
    let frames = 0;
    let rateStart = performance.now();
    let controllerSignature = "";

    const poll = (now: number) => {
      frames += 1;
      if (now - rateStart >= 600) {
        setSampleRate(Math.round((frames * 1000) / (now - rateStart)));
        frames = 0;
        rateStart = now;
      }

      const connected = navigator.getGamepads
        ? Array.from(navigator.getGamepads()).filter((pad): pad is Gamepad => Boolean(pad?.connected))
        : [];
      const signature = connected.map((pad) => `${pad.index}:${pad.id}:${pad.mapping}`).join("|");

      if (signature !== controllerSignature) {
        controllerSignature = signature;
        setControllers(connected.map((pad) => ({ id: pad.id, index: pad.index, mapping: pad.mapping || "non-standard" })));
        if (connected.length && !connected.some((pad) => pad.index === selectedIndexRef.current)) {
          selectedIndexRef.current = connected[0].index;
          setSelectedIndex(connected[0].index);
        }
      }

      if (demoModeRef.current) {
        setSnapshot(demoPad(now));
      } else {
        const active = connected.find((pad) => pad.index === selectedIndexRef.current) ?? connected[0];
        setSnapshot(active ? readPad(active) : EMPTY_SNAPSHOT);
      }

      frameId = requestAnimationFrame(poll);
    };

    frameId = requestAnimationFrame(poll);
    return () => cancelAnimationFrame(frameId);
  }, []);

  const setDeadZoneAndSave = (value: number) => {
    setDeadZone(value);
    window.localStorage.setItem("xusb-dead-zone", String(value));
  };

  const setTrailAndSave = (enabled: boolean) => {
    setTrailEnabled(enabled);
    window.localStorage.setItem("xusb-stick-trail", String(enabled));
  };

  const copySnapshot = async () => {
    const json = JSON.stringify({
      id: snapshot.id,
      index: snapshot.index,
      mapping: snapshot.mapping,
      timestamp: snapshot.timestamp,
      axes: snapshot.axes,
      buttons: snapshot.buttons.map(({ pressed, touched, value }) => ({ pressed, touched, value })),
    }, null, 2);

    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard API unavailable");
      await navigator.clipboard.writeText(json);
      setActionMessage("SNAPSHOT COPIED");
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = json;
      textarea.setAttribute("readonly", "");
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      const copied = document.execCommand("copy");
      textarea.remove();
      setActionMessage(copied ? "SNAPSHOT COPIED" : "COPY BLOCKED");
    }
  };

  const testRumble = async () => {
    if (demoMode || selectedIndex === null) return;
    const pad = navigator.getGamepads?.()[selectedIndex];
    const actuator = (pad as (Gamepad & { vibrationActuator?: RumbleActuator }) | null)?.vibrationActuator;

    if (!actuator?.playEffect) {
      setActionMessage("RUMBLE UNAVAILABLE");
      return;
    }

    try {
      await actuator.playEffect("dual-rumble", {
        startDelay: 0,
        duration: 320,
        weakMagnitude: 0.55,
        strongMagnitude: 0.9,
      });
      setActionMessage("RUMBLE SENT");
    } catch {
      setActionMessage("RUMBLE FAILED");
    }
  };

  const isLive = snapshot.connected;
  const isStandard = snapshot.mapping === "standard";

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-lockup">
          <div className="brand-mark" aria-hidden="true"><span>X</span></div>
          <div><p className="eyebrow">INPUT LAB / 01</p><h1>XUSB GAMEPAD VISUALIZER</h1></div>
        </div>

        <div className="topbar-actions">
          <div className={`connection-pill ${isLive ? "is-online" : ""}`}>
            <span className="status-dot" />
            {demoMode ? "DEMO STREAM" : isLive ? "DEVICE LIVE" : "NO DEVICE"}
          </div>
          <button className="demo-button" type="button" onClick={() => setDemoMode((current) => !current)}>
            {demoMode ? "Stop demo" : "Run input demo"}
          </button>
        </div>
      </header>

      <section className="workspace">
        <article className="visualizer-panel panel">
          <div className="panel-heading">
            <div><p className="section-index">01 / LIVE STATE</p><h2>Controller surface</h2></div>
            <div className="device-select-wrap">
              <label htmlFor="controller-select">ACTIVE DEVICE</label>
              <select
                id="controller-select"
                value={selectedIndex ?? ""}
                onChange={(event) => setSelectedIndex(Number(event.target.value))}
                disabled={controllers.length === 0 || demoMode}
              >
                {controllers.length === 0 ? (
                  <option value="">Waiting for input…</option>
                ) : controllers.map((controller) => (
                  <option key={controller.index} value={controller.index}>{controller.index}: {controller.id}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="device-strip">
            <div className="device-name"><span>IDENT</span><strong>{snapshot.id}</strong></div>
            <div><span>MAP</span><strong className={isLive && !isStandard ? "warning-text" : ""}>{snapshot.mapping.toUpperCase()}</strong></div>
            <div><span>SAMPLE</span><strong>{sampleRate || "—"} HZ</strong></div>
          </div>

          <ControllerFigure
            snapshot={snapshot}
            deadZone={deadZone}
            trailEnabled={trailEnabled}
            clearToken={trailClearToken}
            onTrailChange={setTrailAndSave}
            onClearTrail={() => setTrailClearToken((token) => token + 1)}
          />

          {!isLive && !demoMode && (
            <div className="connection-callout">
              <span className="usb-icon">⌁</span>
              <div><strong>Connect an XUSB controller</strong><p>Plug it in, then press any button to allow the browser to expose it.</p></div>
            </div>
          )}
        </article>

        <aside className="telemetry-panel panel">
          <div className="panel-heading compact-heading">
            <div><p className="section-index">02 / TELEMETRY</p><h2>Raw input</h2></div>
            <span className="mono-chip">API</span>
          </div>

          <section className="telemetry-section axes-section">
            <div className="section-title-row"><h3>Axes</h3><span>RAW / −1.0…+1.0</span></div>
            {["LX", "LY", "RX", "RY"].map((label, index) => {
              const value = axis(snapshot, index);
              return (
                <div className="axis-row" key={label}>
                  <span className="axis-name">{label}</span>
                  <div className="axis-track">
                    <span className="axis-center" />
                    <i
                      className={value < 0 ? "negative" : "positive"}
                      style={{ left: value < 0 ? `${50 + value * 50}%` : "50%", width: `${Math.abs(value) * 50}%` }}
                    />
                  </div>
                  <code>{formatValue(value)}</code>
                </div>
              );
            })}
          </section>

          <section className="telemetry-section">
            <div className="section-title-row"><h3>Buttons</h3><span>VALUE / 0.0…1.0</span></div>
            <div className="button-matrix">
              {BUTTON_LABELS.map((label, index) => {
                const state = button(snapshot, index);
                return (
                  <div className={`button-cell ${state.pressed ? "is-pressed" : ""}`} key={label}>
                    <div><span>{index.toString().padStart(2, "0")}</span><strong>{label}</strong></div>
                    <code>{state.value.toFixed(2)}</code>
                    <i style={{ transform: `scaleX(${state.value})` }} />
                  </div>
                );
              })}
            </div>
          </section>

          <section className="dead-zone-card">
            <div className="section-title-row">
              <div><h3>Visual dead zone</h3><p>Raw values remain unchanged.</p></div>
              <code>{deadZone.toFixed(2)}</code>
            </div>
            <input
              type="range"
              min="0"
              max="0.3"
              step="0.01"
              value={deadZone}
              style={{ "--range-progress": `${(deadZone / 0.3) * 100}%` } as CSSProperties}
              onChange={(event) => setDeadZoneAndSave(Number(event.target.value))}
              aria-label="Visual stick dead zone"
            />
            <div className="range-labels"><span>0</span><span>0.15</span><span>0.30</span></div>
          </section>

          <section className="system-card">
            <div className="system-grid">
              <div><span>AXES</span><strong>{snapshot.axes.length}</strong></div>
              <div><span>BUTTONS</span><strong>{snapshot.buttons.length}</strong></div>
              <div><span>HAPTICS</span><strong>{snapshot.vibration && !demoMode ? "YES" : "NO"}</strong></div>
              <div><span>INDEX</span><strong>{snapshot.index < 0 ? "—" : snapshot.index}</strong></div>
            </div>
            <div className="tool-actions">
              <button type="button" onClick={testRumble} disabled={!snapshot.vibration || demoMode}>Test rumble</button>
              <button type="button" onClick={copySnapshot} disabled={!isLive}>Copy JSON</button>
            </div>
            <p className="action-message"><span />{actionMessage}</p>
          </section>

          <section className="event-log">
            <div className="section-title-row"><h3>Press log</h3><span>NEWEST FIRST</span></div>
            {inputLog.length ? (
              <ol>
                {inputLog.map((item, index) => (
                  <li key={`${item.time}-${item.label}-${index}`}>
                    <time>{item.time}</time><strong>{item.label}</strong><code>{item.value.toFixed(3)}</code>
                  </li>
                ))}
              </ol>
            ) : <p>Press a button to begin logging.</p>}
          </section>

          {isLive && !isStandard && <p className="mapping-warning">Non-standard mapping detected. Raw indices are accurate; the controller labels may differ.</p>}
        </aside>
      </section>

      <footer>
        <p><span className="footer-pulse" /> Browser Gamepad API active</p>
        <p>Frame rate is the browser sampling loop—not the USB report rate.</p>
      </footer>
    </main>
  );
}
