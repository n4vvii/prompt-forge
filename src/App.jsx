import { useMemo, useRef, useState } from "react";

/* ============ 除外ルール ============ */
const SKIP_DIR_RE =
  /(^|\/)(node_modules|\.git|dist|build|out|\.next|vendor|Pods|DerivedData|__pycache__|\.venv|venv|coverage|\.idea|\.vscode)(\/|$)/;
const SKIP_FILE_NAMES = new Set([
  "package-lock.json", "yarn.lock", "pnpm-lock.yaml", "Podfile.lock",
  "Gemfile.lock", "composer.lock", ".DS_Store",
]);
const BIN_EXT = new Set([
  "png","jpg","jpeg","gif","webp","ico","svg","pdf","zip","gz","tar","ipa",
  "mobileprovision","ttf","otf","woff","woff2","mp4","mp3","mov","jar",
  "class","o","a","dylib","so","bin","exe","dll","keystore","p12",
]);
const MANIFEST_NAMES = new Set([
  "package.json","requirements.txt","pyproject.toml","pubspec.yaml",
  "Package.swift","go.mod","Cargo.toml","Gemfile","composer.json",
  "build.gradle","Podfile","README.md",
]);

/* ============ 選択肢 ============ */
const TASKS = [
  { id: "feature",  label: "新機能" },
  { id: "bugfix",   label: "バグ修正" },
  { id: "refactor", label: "リファクタ" },
  { id: "review",   label: "レビュー" },
  { id: "design",   label: "設計・推論" },
  { id: "general",  label: "汎用" },
];
const FORMATS_CODE = [
  { id: "full",      label: "完全なコード" },
  { id: "diff",      label: "差分のみ" },
  { id: "explained", label: "コード＋解説" },
  { id: "compare",   label: "複数案を比較" },
];
const FORMATS_GEN = [
  { id: "concise", label: "要点のみ" },
  { id: "detail",  label: "詳しい説明" },
  { id: "bullets", label: "箇条書き" },
  { id: "table",   label: "表形式" },
];
const CONSTRAINTS = [
  { id: "style",   ja: "既存のコードスタイル・命名規則に合わせる", en: "Follow the existing code style and naming conventions." },
  { id: "nodep",   ja: "新しい依存ライブラリを追加しない",         en: "Do not add new dependencies." },
  { id: "error",   ja: "エラーハンドリングを含める",               en: "Include proper error handling." },
  { id: "test",    ja: "テストコードも書く",                       en: "Include tests." },
  { id: "comment", ja: "変更理由をコメントで残す",                 en: "Explain the reason for each change in comments." },
  { id: "jaans",   ja: "日本語で回答する",                         en: "Respond in Japanese." },
];
const DIRECTIVES = [
  { id: "plan",    label: "まず実装方針を出させる",
    ja: "コードを書く前に、実装方針を3〜5行で示してください。",
    en: "Before writing code, outline your implementation plan in 3–5 lines." },
  { id: "clarify", label: "不明点は先に質問させる",
    ja: "前提や要件が不足している場合は、作業を始める前に確認の質問をしてください。",
    en: "If any requirements are unclear, ask clarifying questions before starting." },
  { id: "steps",   label: "段階的に推論させる",
    ja: "結論の前に、検討の過程を段階的に示してください。",
    en: "Show your reasoning step by step before the conclusion." },
];

/* ============ テンプレート文言 ============ */
const TPL = {
  ja: {
    roleCode: (s) => `あなたは${s ? s + "に精通した" : ""}シニアソフトウェアエンジニアです。`,
    roleDesign: "あなたは経験豊富なソフトウェアアーキテクトです。技術選定とトレードオフの分析を得意とします。",
    roleGeneral: "あなたは的確で信頼できるアシスタントです。",
    lead: {
      feature: "次の機能を実装してください。",
      bugfix: "次の不具合を修正してください。",
      refactor: "次の目的でリファクタリングしてください。",
      review: "次のコードをレビューしてください。特に重視する観点:",
      design: "次の課題について、設計と技術選定を検討してください。",
      general: "",
    },
    stack: "技術スタック", tree: "ファイル構成", code: "関連コード", extra: "補足情報",
    fmt: {
      full: "変更が必要なファイルごとに、ファイルパスを明記した上で完全なコードを提示してください。",
      diff: "変更箇所のみを、変更前後が分かる形で提示してください。",
      explained: "コードに加えて、実装の要点と注意点を簡潔に説明してください。",
      compare: "実現方法を2〜3案挙げ、メリット・デメリットを比較した上で推奨案と理由を示してください。",
      concise: "要点を簡潔にまとめてください。",
      detail: "背景から順を追って詳しく説明してください。",
      bullets: "箇条書きで整理してください。",
      table: "表形式で整理してください。",
    },
  },
  en: {
    roleCode: (s) => `You are a senior software engineer${s ? " with deep expertise in " + s : ""}.`,
    roleDesign: "You are an experienced software architect, skilled at technology selection and trade-off analysis.",
    roleGeneral: "You are a precise and reliable assistant.",
    lead: {
      feature: "Implement the following feature.",
      bugfix: "Fix the following bug.",
      refactor: "Refactor the code with the following goal.",
      review: "Review the following code. Focus especially on:",
      design: "Evaluate the design and technology choices for the following problem.",
      general: "",
    },
    stack: "Tech stack", tree: "File structure", code: "Relevant code", extra: "Additional context",
    fmt: {
      full: "For every file that changes, provide the complete code with its file path.",
      diff: "Show only the changed parts, in a clear before/after format.",
      explained: "Provide the code along with a concise explanation of key decisions and caveats.",
      compare: "Propose 2–3 approaches, compare their trade-offs, then recommend one with reasons.",
      concise: "Summarize only the key points.",
      detail: "Explain step by step, starting from the background.",
      bullets: "Organize the answer as bullet points.",
      table: "Organize the answer in a table.",
    },
  },
};

/* ============ 技術スタック自動検出 ============ */
const EXT_LANG = {
  swift: "Swift", py: "Python", ts: "TypeScript", tsx: "React", jsx: "React",
  js: "JavaScript", go: "Go", rs: "Rust", rb: "Ruby", php: "PHP", java: "Java",
  kt: "Kotlin", dart: "Dart", vue: "Vue", html: "HTML/CSS", css: "HTML/CSS",
  scss: "HTML/CSS", sql: "SQL", sh: "Shell",
};
function detectStack(entries) {
  const hit = new Set();
  const counts = {};
  for (const e of entries) {
    const lang = EXT_LANG[e.ext];
    if (lang) counts[lang] = (counts[lang] || 0) + 1;
    if (e.path.includes(".github/workflows/")) hit.add("GitHub Actions");
    if (e.name === "Dockerfile") hit.add("Docker");
    if (e.name === "pubspec.yaml") hit.add("Flutter");
    if (e.name === "Package.swift" || e.path.includes(".xcodeproj")) hit.add("Swift");
    const c = e.content || "";
    if (e.name === "package.json" && c) {
      let deps = {};
      try {
        const j = JSON.parse(c);
        deps = { ...(j.dependencies || {}), ...(j.devDependencies || {}) };
      } catch { /* ignore */ }
      if (deps.react) hit.add("React");
      if (deps.next) hit.add("Next.js");
      if (deps.vue) hit.add("Vue");
      if (deps.typescript) hit.add("TypeScript");
      if (deps.tailwindcss) hit.add("Tailwind CSS");
      if (deps.express) hit.add("Express");
      if (deps.vite) hit.add("Vite");
    }
    if ((e.name === "requirements.txt" || e.name === "pyproject.toml") && c) {
      if (/django/i.test(c)) hit.add("Django");
      if (/flask/i.test(c)) hit.add("Flask");
      if (/fastapi/i.test(c)) hit.add("FastAPI");
    }
    if (e.ext === "swift" && c && /SwiftUI/.test(c)) hit.add("SwiftUI");
  }
  Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 3).forEach(([l]) => hit.add(l));
  return [...hit];
}

function readText(file) {
  return new Promise((res) => {
    const r = new FileReader();
    r.onload = () => {
      const t = String(r.result || "");
      res(t.length > 9000 ? t.slice(0, 9000) + "\n…(以下省略)" : t);
    };
    r.onerror = () => res("");
    r.readAsText(file);
  });
}
const kb = (s) => (s >= 1024 ? Math.round(s / 1024) + "KB" : s + "B");
const CC_PREFIX =
  "prompt-optimizer サブエージェントを使って、以下のプロンプト草案を仕上げてください。改善後のプロンプト本文のみを返してください。\n\n";

/* ---- 小物UI ---- */
function Sec({ n, title, hint, children }) {
  return (
    <section className="mb-8">
      <div className="flex items-baseline gap-3 mb-3">
        <span className="font-mono text-red-600 text-[11px] tracking-widest">{n}</span>
        <h2 className="text-slate-900 text-sm font-bold tracking-wide">{title}</h2>
        {hint && <span className="text-slate-400 text-xs">{hint}</span>}
      </div>
      {children}
    </section>
  );
}

function Chip({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={
        "px-3 py-1.5 rounded-full text-xs border transition-colors " +
        (active
          ? "bg-slate-900 border-slate-900 text-white font-semibold"
          : "bg-white border-slate-300 text-slate-600 hover:border-slate-500")
      }
    >
      {children}
    </button>
  );
}

function CheckRow({ checked, onChange, label }) {
  return (
    <button onClick={onChange} className="flex items-center gap-2 text-left w-full py-1.5 group">
      <span
        className={
          "w-4 h-4 rounded border flex items-center justify-center text-[10px] shrink-0 " +
          (checked
            ? "bg-slate-900 border-slate-900 text-white"
            : "bg-white border-slate-400 text-transparent group-hover:border-slate-600")
        }
      >
        ✓
      </span>
      <span className={"text-xs " + (checked ? "text-slate-800" : "text-slate-500")}>{label}</span>
    </button>
  );
}

function Plate({ label, text, copyKey, copied, onCopy, accent }) {
  return (
    <div className={"rounded-xl overflow-hidden border border-slate-800 " + (accent ? "border-t-4 border-t-red-600" : "")}>
      <div className="bg-slate-900 border-b border-slate-700 px-4 py-2 flex items-center justify-between gap-2">
        <span className="font-mono text-[11px] tracking-widest text-slate-400">
          {label} <span className="text-slate-500">/ {text.length}字</span>
        </span>
        <button
          onClick={() => onCopy(text, copyKey)}
          className="text-xs border border-slate-600 rounded px-2.5 py-1 text-slate-200 hover:border-slate-400"
        >
          {copied === copyKey ? "✓ コピー済み" : "コピー"}
        </button>
      </div>
      <pre className="bg-slate-900 p-4 text-xs font-mono text-slate-100 whitespace-pre-wrap break-words max-h-96 overflow-y-auto leading-relaxed">
        {text}
      </pre>
    </div>
  );
}

/* ============ 本体 ============ */
export default function App() {
  const [taskType, setTaskType] = useState("feature");
  const [goal, setGoal] = useState("");
  const [pasted, setPasted] = useState("");
  const [files, setFiles] = useState([]);
  const [ingesting, setIngesting] = useState(false);
  const [stack, setStack] = useState([]);
  const [stackInput, setStackInput] = useState("");
  const [outFormat, setOutFormat] = useState("full");
  const [cons, setCons] = useState(["style"]);
  const [customCons, setCustomCons] = useState([]);
  const [consInput, setConsInput] = useState("");
  const [dirs, setDirs] = useState(["clarify"]);
  const [lang, setLang] = useState("ja");
  const [prompt, setPrompt] = useState("");
  const [copied, setCopied] = useState("");
  const [fileFilter, setFileFilter] = useState("");
  const [showCount, setShowCount] = useState(30);
  const folderRef = useRef(null);
  const filesRef = useRef(null);

  const isCode = taskType !== "general";
  const formats = isCode ? FORMATS_CODE : FORMATS_GEN;

  /* ---- プロジェクト読み込み ---- */
  async function ingest(list) {
    setIngesting(true);
    try {
      const arr = [];
      for (const f of Array.from(list)) {
        const path = f.webkitRelativePath || f.name;
        if (SKIP_DIR_RE.test(path)) continue;
        if (SKIP_FILE_NAMES.has(f.name)) continue;
        const ext = (f.name.split(".").pop() || "").toLowerCase();
        if (BIN_EXT.has(ext)) continue;
        arr.push({ path, name: f.name, ext, size: f.size, file: f, content: null, included: false });
        if (arr.length >= 500) break;
      }
      arr.sort((a, b) => a.path.localeCompare(b.path));
      for (const e of arr) {
        if (MANIFEST_NAMES.has(e.name) && e.size < 200000) e.content = await readText(e.file);
      }
      setFiles(arr);
      setShowCount(30);
      setFileFilter("");
      setStack((prev) => [...new Set([...prev, ...detectStack(arr)])]);
    } finally {
      setIngesting(false);
    }
  }

  async function toggleInclude(path) {
    const target = files.find((f) => f.path === path);
    setFiles((fs) => fs.map((f) => (f.path === path ? { ...f, included: !f.included } : f)));
    if (target && !target.included && target.content == null && target.file) {
      const txt = await readText(target.file);
      setFiles((fs) => fs.map((f) => (f.path === path ? { ...f, content: txt } : f)));
    }
  }

  const filtered = useMemo(
    () => files.filter((f) => !fileFilter || f.path.toLowerCase().includes(fileFilter.toLowerCase())),
    [files, fileFilter]
  );
  const visible = filtered.slice(0, showCount);
  const includedCount = files.filter((f) => f.included).length;
  const includedChars = useMemo(
    () => files.reduce((n, f) => n + (f.included && f.content ? f.content.length : 0), 0),
    [files]
  );

  /* ---- 事前チェック ---- */
  const warnings = useMemo(() => {
    const w = [];
    if (goal.trim() && goal.trim().length < 12)
      w.push("「やりたいこと」が短すぎます。現状・期待する動作・触ってほしくない範囲まで書くと精度が上がります。");
    if (isCode && stack.length === 0)
      w.push("技術スタックが未指定です。フォルダ読み込みか手入力で追加すると、見当違いな技術で回答されにくくなります。");
    if (taskType === "bugfix" && includedChars === 0 && !pasted.trim())
      w.push("バグ修正は、エラーメッセージや該当コードを含めると解決率が大きく上がります。");
    if (includedChars > 24000)
      w.push("関連コードが長すぎます。本当に必要なファイルだけに絞ってください。");
    return w;
  }, [goal, isCode, taskType, stack, includedChars, pasted]);

  /* ---- プロンプト組み立て（APIなし） ---- */
  function buildPrompt() {
    const t = TPL[lang];
    const stackStr = stack.join(", ");
    const parts = [];
    parts.push(taskType === "design" ? t.roleDesign : isCode ? t.roleCode(stackStr) : t.roleGeneral);

    const proj = [];
    if (isCode && stackStr) proj.push(`${t.stack}: ${stackStr}`);
    if (isCode && files.length) {
      const paths = files.map((f) => f.path);
      const shown = paths.slice(0, 100).map((p) => "- " + p).join("\n");
      proj.push(`${t.tree}:\n${shown}${paths.length > 100 ? `\n…(+${paths.length - 100})` : ""}`);
    }
    const inc = files.filter((f) => f.included && f.content);
    if (isCode && inc.length) {
      const blocks = inc
        .map((f) => `### ${f.path}\n` + "```" + `\n${f.content}\n` + "```")
        .join("\n\n");
      proj.push(`${t.code}:\n${blocks}`);
    }
    if (isCode && pasted.trim()) proj.push(`${t.extra}:\n${pasted.trim()}`);
    if (isCode && proj.length) parts.push(`<project>\n${proj.join("\n\n")}\n</project>`);
    if (!isCode && pasted.trim()) parts.push(`<background>\n${pasted.trim()}\n</background>`);

    const lead = t.lead[taskType];
    parts.push(`<task>\n${lead ? lead + "\n" : ""}${goal.trim()}\n</task>`);

    const consLines = [
      ...CONSTRAINTS.filter((c) => cons.includes(c.id)).map((c) => c[lang]),
      ...customCons,
    ];
    if (consLines.length)
      parts.push(`<constraints>\n${consLines.map((c) => "- " + c).join("\n")}\n</constraints>`);

    parts.push(`<output_format>\n${t.fmt[outFormat]}\n</output_format>`);

    const dl = DIRECTIVES.filter((d) => dirs.includes(d.id)).map((d) => d[lang]);
    if (dl.length) parts.push(dl.join("\n"));

    return parts.join("\n\n");
  }

  async function copy(text, key) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand("copy"); } catch { /* ignore */ }
      document.body.removeChild(ta);
    }
    setCopied(key);
    setTimeout(() => setCopied(""), 1600);
  }

  const toggle = (arr, setArr, id) =>
    setArr(arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id]);

  /* ---- 画面 ---- */
  return (
    <div
      className="min-h-screen text-slate-800"
      style={{
        fontFamily:
          '-apple-system, BlinkMacSystemFont, "Hiragino Sans", "Noto Sans JP", "Yu Gothic", sans-serif',
        backgroundColor: "#f6f7f4",
        backgroundImage:
          "repeating-linear-gradient(0deg, rgba(15,23,42,0.05) 0 1px, transparent 1px 24px), repeating-linear-gradient(90deg, rgba(15,23,42,0.05) 0 1px, transparent 1px 24px)",
      }}
    >
      <div className="max-w-2xl mx-auto px-5 py-10">
        <header className="mb-10">
          <div className="font-mono text-red-600 text-xs tracking-widest mb-2">PROMPT FORGE</div>
          <h1 className="text-2xl font-bold text-slate-900 leading-snug">
            思考を、そのまま渡せるプロンプトに。
          </h1>
          <p className="text-slate-500 text-sm mt-2 leading-relaxed">
            やりたいことをラフに書くだけで、AIが理解しやすい構造化プロンプトを組み立てます。
            組み立てはブラウザ内で完結（API消費ゼロ）。
          </p>
        </header>

        {/* 01 タスク */}
        <Sec n="01" title="タスクの種類">
          <div className="flex flex-wrap gap-2">
            {TASKS.map((t) => (
              <Chip
                key={t.id}
                active={taskType === t.id}
                onClick={() => {
                  setTaskType(t.id);
                  setOutFormat(t.id === "general" ? "concise" : "full");
                }}
              >
                {t.label}
              </Chip>
            ))}
          </div>
        </Sec>

        {/* 02 プロジェクト */}
        <Sec n="02" title="プロジェクトを読み込む" hint="任意">
          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
            <div className="flex flex-wrap gap-2">
              <input
                ref={folderRef}
                type="file"
                multiple
                className="hidden"
                onChange={(e) => {
                  if (e.target.files && e.target.files.length) ingest(e.target.files);
                  e.target.value = "";
                }}
                {...{ webkitdirectory: "", directory: "" }}
              />
              <input
                ref={filesRef}
                type="file"
                multiple
                className="hidden"
                onChange={(e) => {
                  if (e.target.files && e.target.files.length) ingest(e.target.files);
                  e.target.value = "";
                }}
              />
              <button
                onClick={() => folderRef.current && folderRef.current.click()}
                className="px-3 py-2 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-slate-700 hover:border-slate-500"
              >
                フォルダを読み込む
              </button>
              <button
                onClick={() => filesRef.current && filesRef.current.click()}
                className="px-3 py-2 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-slate-700 hover:border-slate-500"
              >
                ファイルを選択
              </button>
              {ingesting && <span className="text-xs text-slate-400 self-center">読み込み中…</span>}
            </div>
            <p className="text-[11px] text-slate-400 mt-2 leading-relaxed">
              node_modules・.git・ロックファイル等は自動で除外。スマホでは「ファイルを選択」か下の貼り付けが確実です。
              内容はブラウザ内でのみ処理され、外部には送信されません。
            </p>

            {/* スタック */}
            <div className="mt-4">
              <div className="text-[11px] font-semibold text-slate-500 mb-1.5">
                技術スタック（自動検出・編集可）
              </div>
              <div className="flex flex-wrap gap-1.5 items-center">
                {stack.map((s) => (
                  <span
                    key={s}
                    className="bg-slate-100 border border-slate-300 rounded-full px-2.5 py-1 text-xs text-slate-700 flex items-center gap-1"
                  >
                    {s}
                    <button
                      onClick={() => setStack(stack.filter((x) => x !== s))}
                      className="text-slate-400 hover:text-red-600"
                      aria-label={s + " を削除"}
                    >
                      ×
                    </button>
                  </span>
                ))}
                <input
                  value={stackInput}
                  onChange={(e) => setStackInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      const v = stackInput.trim();
                      if (v && !stack.includes(v)) setStack([...stack, v]);
                      setStackInput("");
                    }
                  }}
                  placeholder="＋追加してEnter"
                  className="border border-slate-300 rounded-full px-2.5 py-1 text-xs w-32 focus:outline-none focus:border-slate-500 placeholder-slate-400 bg-white"
                />
              </div>
            </div>

            {/* ファイル一覧 */}
            {files.length > 0 && (
              <div className="mt-4 border border-slate-200 rounded-lg overflow-hidden">
                <div className="px-3 py-2 border-b border-slate-200 bg-slate-50 text-[11px] text-slate-500">
                  {files.length}ファイル ／ 本文に含める: {includedCount}件（約
                  {Math.round(includedChars / 1000)}k字）— タップで含める/外す
                </div>
                <input
                  value={fileFilter}
                  onChange={(e) => {
                    setFileFilter(e.target.value);
                    setShowCount(30);
                  }}
                  placeholder="ファイル名で絞り込み"
                  className="w-full px-3 py-2 text-xs border-b border-slate-200 focus:outline-none placeholder-slate-400"
                />
                <div className="max-h-56 overflow-y-auto">
                  {visible.map((f) => (
                    <button
                      key={f.path}
                      onClick={() => toggleInclude(f.path)}
                      className="w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-slate-50"
                    >
                      <span
                        className={
                          "w-3.5 h-3.5 rounded border flex items-center justify-center text-[9px] shrink-0 " +
                          (f.included
                            ? "bg-slate-900 border-slate-900 text-white"
                            : "border-slate-300 text-transparent")
                        }
                      >
                        ✓
                      </span>
                      <span className="text-[11px] font-mono text-slate-700 truncate flex-1">
                        {f.path}
                      </span>
                      <span className="text-[10px] text-slate-400 shrink-0">{kb(f.size)}</span>
                    </button>
                  ))}
                  {filtered.length > showCount && (
                    <button
                      onClick={() => setShowCount((c) => c + 50)}
                      className="w-full py-2 text-xs text-red-600 hover:bg-slate-50"
                    >
                      さらに表示（残り{filtered.length - showCount}）
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* 貼り付け */}
            <textarea
              value={pasted}
              onChange={(e) => setPasted(e.target.value)}
              rows={3}
              placeholder="エラーメッセージ・既存コード・仕様メモなどを貼り付け（任意）"
              className="mt-4 w-full border border-slate-300 rounded-lg px-3 py-2 text-xs font-mono focus:outline-none focus:border-slate-500 placeholder-slate-400 bg-white"
            />
          </div>
        </Sec>

        {/* 03 やりたいこと */}
        <Sec n="03" title="やりたいこと">
          <textarea
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            rows={4}
            placeholder="例: 計算結果を端末に保存して、次に開いたとき復元したい。どの技術を使えばいいか分からない。UIは変えたくない。"
            className="w-full bg-white border border-slate-300 rounded-xl px-4 py-3 text-sm leading-relaxed focus:outline-none focus:border-slate-500 placeholder-slate-400 shadow-sm"
          />
        </Sec>

        {/* 04 出力の指定 */}
        <Sec n="04" title="出力の指定">
          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm space-y-5">
            <div>
              <div className="text-[11px] font-semibold text-slate-500 mb-2">回答の形式</div>
              <div className="flex flex-wrap gap-2">
                {formats.map((f) => (
                  <Chip key={f.id} active={outFormat === f.id} onClick={() => setOutFormat(f.id)}>
                    {f.label}
                  </Chip>
                ))}
              </div>
            </div>

            <div>
              <div className="text-[11px] font-semibold text-slate-500 mb-1">制約条件</div>
              {CONSTRAINTS.map((c) => (
                <CheckRow
                  key={c.id}
                  checked={cons.includes(c.id)}
                  onChange={() => toggle(cons, setCons, c.id)}
                  label={c.ja}
                />
              ))}
              {customCons.map((c, i) => (
                <div key={i} className="flex items-center gap-2 py-1.5">
                  <span className="w-4 h-4 rounded border bg-slate-900 border-slate-900 text-white flex items-center justify-center text-[10px] shrink-0">
                    ✓
                  </span>
                  <span className="text-xs text-slate-800 flex-1">{c}</span>
                  <button
                    onClick={() => setCustomCons(customCons.filter((_, j) => j !== i))}
                    className="text-slate-400 hover:text-red-600 text-xs"
                  >
                    ×
                  </button>
                </div>
              ))}
              <div className="flex gap-2 mt-1">
                <input
                  value={consInput}
                  onChange={(e) => setConsInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && consInput.trim()) {
                      setCustomCons([...customCons, consInput.trim()]);
                      setConsInput("");
                    }
                  }}
                  placeholder="独自の制約を追加してEnter"
                  className="flex-1 border border-slate-300 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:border-slate-500 placeholder-slate-400 bg-white"
                />
              </div>
            </div>

            <div>
              <div className="text-[11px] font-semibold text-slate-500 mb-1">進め方</div>
              {DIRECTIVES.map((d) => (
                <CheckRow
                  key={d.id}
                  checked={dirs.includes(d.id)}
                  onChange={() => toggle(dirs, setDirs, d.id)}
                  label={d.label}
                />
              ))}
            </div>

            <div>
              <div className="text-[11px] font-semibold text-slate-500 mb-2">プロンプトの言語</div>
              <div className="flex gap-2">
                <Chip active={lang === "ja"} onClick={() => setLang("ja")}>日本語</Chip>
                <Chip active={lang === "en"} onClick={() => setLang("en")}>English</Chip>
              </div>
            </div>
          </div>
        </Sec>

        {/* 警告 */}
        {warnings.length > 0 && (
          <div className="mb-4 bg-white border border-slate-200 border-l-4 border-l-red-500 rounded-r-xl p-3 space-y-1.5 shadow-sm">
            {warnings.map((w, i) => (
              <p key={i} className="text-xs text-slate-600 leading-relaxed">※ {w}</p>
            ))}
          </div>
        )}

        {/* 生成 */}
        <button
          disabled={!goal.trim()}
          onClick={() => setPrompt(buildPrompt())}
          className="w-full py-3.5 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-sm tracking-wide disabled:bg-slate-300 disabled:text-slate-500 transition-colors shadow-sm"
        >
          プロンプトを生成
        </button>
        <p className="text-center text-[11px] text-slate-400 mt-2">
          ブラウザ内で組み立て — API消費なし
        </p>

        {/* 出力 */}
        {prompt && (
          <div className="mt-8 space-y-4">
            <Plate label="OUTPUT ／ 生成プロンプト" text={prompt} copyKey="p" copied={copied} onCopy={copy} />
            <div className="flex items-center gap-3 flex-wrap">
              <button
                onClick={() => copy(CC_PREFIX + prompt, "cc")}
                className="px-4 py-2 rounded-lg border border-red-600 text-red-600 text-xs font-bold hover:bg-red-50 transition-colors bg-white"
              >
                {copied === "cc" ? "✓ コピー済み" : "Claude Code用にコピー"}
              </button>
              <span className="text-[11px] text-slate-400">
                prompt-optimizerサブエージェントへの仕上げ指示つき。Claude Codeに貼るだけで仕上げが始まります。
              </span>
            </div>
          </div>
        )}

        <footer className="mt-12 pt-4 border-t border-slate-200 text-[11px] text-slate-400 leading-relaxed">
          Prompt Forge — 完全オフライン動作（API消費ゼロ）。同じコードをGitHub Pagesへそのまま移植可能。仕上げはClaude Code側のprompt-optimizerが担当。
        </footer>
      </div>
    </div>
  );
}
