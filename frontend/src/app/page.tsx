"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import ReactMarkdown from "react-markdown";

// ── Types ──
interface Question {
  question: string;
  options: string[];
  correct_answer: string;
  explanation?: string;
}
interface Flashcard { term: string; definition: string; }
interface Notes {
  key_concepts?: string[];
  important_dates?: string[];
  formulas?: string[];
}

const API = "http://127.0.0.1:5000";
type AppView = "landing" | "loading" | "dashboard" | "results";
type DashTab = "quiz" | "flashcards" | "notes";

export default function Home() {
  const [view, setView] = useState<AppView>("landing");
  const [file, setFile] = useState<File | null>(null);
  const [numQuestions, setNumQuestions] = useState(10);
  const [difficulty, setDifficulty] = useState("Medium");
  const [loaderMsg, setLoaderMsg] = useState("Extracting text with Llama 3.2 Vision...");
  const [loaderPct, setLoaderPct] = useState(0);

  const [summary, setSummary] = useState("");
  const [questions, setQuestions] = useState<Question[]>([]);
  const [flashcards, setFlashcards] = useState<Flashcard[]>([]);
  const [notes, setNotes] = useState<Notes>({});
  const [currentQ, setCurrentQ] = useState(0);
  const [score, setScore] = useState(0);
  const [answered, setAnswered] = useState<number | null>(null);
  const [showExplanation, setShowExplanation] = useState(false);
  const [activeTab, setActiveTab] = useState<DashTab>("quiz");
  const [flippedCards, setFlippedCards] = useState<Set<number>>(new Set());

  const [chatMessages, setChatMessages] = useState<{ role: string; text: string }[]>([
    { role: "bot", text: "I've analyzed your document. Ask me any questions about the material!" },
  ]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [chatOpen, setChatOpen] = useState(true);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const sourceTextRef = useRef("");
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [chatMessages]);

  // ── File Handlers ──
  const handleFileDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer.files?.[0];
    if (f && f.type === "application/pdf") setFile(f);
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; if (f) setFile(f);
  };

  // ── Generate ──
  const handleGenerate = async () => {
    if (!file) return;
    setView("loading"); setLoaderPct(10);
    setLoaderMsg("Uploading your PDF...");
    try {
      const formData = new FormData();
      formData.append("pdf", file);
      formData.append("num_questions", String(numQuestions));
      formData.append("difficulty", difficulty);
      setLoaderPct(30); setLoaderMsg("Extracting key concepts via Llama 3.2...");
      const res = await fetch(`${API}/api/upload`, { method: "POST", body: formData });
      setLoaderPct(70); setLoaderMsg("Generating quiz, flashcards & notes...");
      if (!res.ok) { const err = await res.json(); throw new Error(err.error || "Server error"); }
      const data = await res.json();
      setLoaderPct(100); setLoaderMsg("Done!");
      setSummary(data.summary || "");
      setQuestions(data.quiz || []);
      setFlashcards(data.flashcards || []);
      setNotes(data.notes || {});
      sourceTextRef.current = data.source_text || "";
      if ((data.quiz || []).length === 0) throw new Error("No questions generated.");
      setTimeout(() => { setCurrentQ(0); setScore(0); setAnswered(null); setShowExplanation(false); setView("dashboard"); }, 500);
    } catch (err: unknown) {
      setLoaderMsg("Error: " + (err instanceof Error ? err.message : "Unknown"));
      setTimeout(() => setView("landing"), 3000);
    }
  };

  // ── Quiz Logic ──
  const handleAnswer = (idx: number) => { if (answered !== null) return; setAnswered(idx); if (questions[currentQ].options[idx] === questions[currentQ].correct_answer) setScore(s => s + 1); };
  const handleNext = () => { if (currentQ + 1 >= questions.length) setView("results"); else { setCurrentQ(c => c + 1); setAnswered(null); setShowExplanation(false); } };

  // ── Chat ──
  const sendChat = async () => {
    if (!chatInput.trim() || chatLoading) return;
    const userMsg = chatInput.trim(); setChatInput("");
    setChatMessages(prev => [...prev, { role: "user", text: userMsg }]);
    setChatLoading(true);
    try {
      const res = await fetch(`${API}/api/chat`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question: userMsg, context: sourceTextRef.current }) });
      const data = await res.json();
      setChatMessages(prev => [...prev, { role: "bot", text: data.answer || "I'm not sure about that." }]);
    } catch { setChatMessages(prev => [...prev, { role: "bot", text: "Connection error. Please try again." }]); }
    finally { setChatLoading(false); }
  };

  const toggleFlip = (idx: number) => { setFlippedCards(prev => { const n = new Set(prev); n.has(idx) ? n.delete(idx) : n.add(idx); return n; }); };

  const downloadSummaryPDF = () => {
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(`<!DOCTYPE html><html><head><title>QuizCraft Summary - ${file?.name || 'Document'}</title>
      <style>body{font-family:Georgia,serif;max-width:700px;margin:40px auto;padding:20px;color:#1a1a1a;line-height:1.8}
      h1{color:#0d9488;border-bottom:2px solid #0d9488;padding-bottom:8px} h2{color:#0891b2;margin-top:24px}
      h3{color:#374151} ul,ol{padding-left:24px} li{margin:6px 0}
      strong{color:#111827} p{margin:12px 0} .header{text-align:center;margin-bottom:30px}
      .footer{margin-top:40px;border-top:1px solid #e5e7eb;padding-top:16px;font-size:12px;color:#9ca3af;text-align:center}</style>
      </head><body><div class="header"><h1>QuizCraft</h1><p style="color:#6b7280">AI-Generated Document Summary</p><p style="font-size:13px;color:#9ca3af">${file?.name || ''}</p></div>
      ${summary.replace(/^## /gm, '<h2>').replace(/^### /gm, '<h3>').replace(/^# /gm, '<h1>').replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/^- (.*)/gm, '<li>$1</li>').replace(/\n/g, '<br>')}
      <div class="footer">Generated by QuizCraft · Powered by Llama 3.2 & Groq</div></body></html>`);
    w.document.close();
    w.print();
  };

  const q = questions[currentQ];
  const pct = questions.length > 0 ? Math.round((score / questions.length) * 100) : 0;
  const letters = ["A", "B", "C", "D"];

  // ═══════════════════════════════════════════════
  //  LANDING
  // ═══════════════════════════════════════════════
  if (view === "landing") {
    return (
      <div className="min-h-screen flex flex-col">
        {/* Navbar */}
        <nav className="w-full max-w-7xl mx-auto px-6 py-5 flex items-center justify-between">
          <a href="/" className="flex items-center gap-3 group">
            <div className="p-1.5 rounded-xl bg-gradient-to-br from-primary/20 to-accent-emerald/20 border border-white/10 group-hover:from-primary/30 group-hover:to-accent-emerald/30 transition-all shadow-lg overflow-hidden">
              <img src="/favicon.png" alt="QuizCraft" className="size-7 rounded-lg" />
            </div>
            <span className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white via-white to-primary/80 tracking-tight">QuizCraft</span>
          </a>
          <div className="hidden md:flex items-center gap-8 bg-white/5 px-6 py-2.5 rounded-full border border-white/10 backdrop-blur-md">
            <a href="#features" className="text-sm font-medium text-slate-300 hover:text-primary transition-colors">Features</a>
            <a href="#how" className="text-sm font-medium text-slate-300 hover:text-primary transition-colors">How It Works</a>
          </div>
        </nav>

        {/* Hero */}
        <section className="flex-1 flex flex-col items-center justify-center text-center px-6 pb-10 pt-16 max-w-5xl mx-auto">
          <div className="inline-flex items-center gap-2 px-5 py-2 rounded-full bg-gradient-to-r from-primary/10 to-accent-emerald/10 border border-primary/20 mb-8 backdrop-blur-sm hover:scale-105 transition-transform cursor-default shadow-[0_0_30px_rgba(37,209,244,0.1)]">
            <span className="size-2 rounded-full bg-primary animate-pulse" />
            <span className="text-xs font-semibold text-primary uppercase tracking-wider">Powered by Llama 3.2 Vision & Groq</span>
          </div>
          <h1 className="text-5xl md:text-7xl font-extrabold text-white tracking-tight leading-[1.1] mb-6">
            Turn any <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-accent-emerald drop-shadow-[0_0_20px_rgba(37,209,244,0.3)]">PDF</span> into an<br />
            interactive <span className="text-transparent bg-clip-text bg-gradient-to-r from-accent-emerald to-primary drop-shadow-[0_0_20px_rgba(16,185,129,0.3)]">Masterclass</span>
          </h1>
          <p className="text-lg md:text-xl text-slate-400 max-w-2xl leading-relaxed mb-14">
            Upload your document. Get an AI-generated summary, adaptive quiz, 3D flashcards, and personalized AI tutoring — all in seconds.
          </p>

          {/* Upload Card */}
          <div className="w-full max-w-2xl glass-panel rounded-3xl p-8 md:p-10 flex flex-col items-center relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-accent-emerald/5 pointer-events-none" />
            <div className="relative z-10 w-full flex flex-col items-center">
              <div className="flex items-center gap-4 mb-8 self-start">
                <div className="size-10 rounded-xl bg-gradient-to-br from-primary/20 to-accent-emerald/20 border border-white/10 flex items-center justify-center font-mono font-bold text-primary shadow-inner">01</div>
                <div className="text-left"><h2 className="text-xl font-bold text-white">Upload Your PDF</h2><p className="text-sm text-slate-400">Drag & drop or click to browse.</p></div>
              </div>
              <div onClick={() => fileInputRef.current?.click()} onDrop={handleFileDrop} onDragOver={e => e.preventDefault()}
                className="w-full h-52 border-2 border-dashed border-slate-700 hover:border-primary/60 rounded-2xl flex flex-col items-center justify-center bg-white/[0.02] hover:bg-primary/[0.03] transition-all cursor-pointer group mb-6">
                <div className="p-4 rounded-full bg-white/5 group-hover:bg-primary/20 text-slate-500 group-hover:text-primary transition-all mb-3 shadow-lg">
                  <span className="material-symbols-outlined text-4xl">cloud_upload</span>
                </div>
                <p className="text-lg font-semibold text-white group-hover:text-primary transition-colors">{file ? file.name : "Drop your PDF here"}</p>
                <p className="text-sm text-slate-500">or click to browse · Max 25 MB</p>
                <input ref={fileInputRef} type="file" accept=".pdf" hidden onChange={handleFileSelect} />
              </div>
              <div className="flex flex-col md:flex-row gap-8 w-full mb-8">
                <div className="flex-1">
                  <label className="block text-sm font-semibold text-slate-300 uppercase tracking-wider mb-3">Questions</label>
                  <div className="flex items-center bg-white/5 border border-white/10 rounded-xl overflow-hidden w-fit">
                    <button onClick={() => setNumQuestions(Math.max(5, numQuestions - 5))} className="px-4 py-2 text-slate-300 hover:text-white hover:bg-white/10 transition-colors">−</button>
                    <span className="px-6 py-2 border-x border-white/10 font-bold text-white min-w-[3rem] text-center">{numQuestions}</span>
                    <button onClick={() => setNumQuestions(Math.min(30, numQuestions + 5))} className="px-4 py-2 text-slate-300 hover:text-white hover:bg-white/10 transition-colors">+</button>
                  </div>
                </div>
                <div className="flex-1">
                  <label className="block text-sm font-semibold text-slate-300 uppercase tracking-wider mb-3">Difficulty</label>
                  <div className="flex items-center gap-2">
                    {["Easy", "Medium", "Hard"].map(d => (
                      <button key={d} onClick={() => setDifficulty(d)} className={`px-4 py-2 rounded-xl text-sm font-medium border transition-all ${difficulty === d ? "border-primary bg-primary/20 text-white neon-glow-cyan" : "border-white/10 bg-white/5 text-slate-300 hover:bg-white/10"}`}>{d}</button>
                    ))}
                  </div>
                </div>
              </div>
              <button onClick={handleGenerate} disabled={!file}
                className="w-full md:w-auto px-10 py-4 bg-gradient-to-r from-primary to-primary-dark hover:from-primary-dark hover:to-primary disabled:from-slate-800 disabled:to-slate-800 disabled:text-slate-600 disabled:cursor-not-allowed text-bg-dark font-bold rounded-xl shadow-[0_4px_25px_rgba(37,209,244,0.4)] hover:shadow-[0_4px_35px_rgba(37,209,244,0.6)] hover:-translate-y-0.5 transition-all flex items-center justify-center gap-3 text-lg">
                <span className="material-symbols-outlined">auto_awesome</span> Generate Masterclass
              </button>
            </div>
          </div>
        </section>

        {/* Features */}
        <section id="features" className="w-full max-w-6xl mx-auto px-6 py-20">
          <div className="text-center mb-14">
            <h2 className="text-3xl md:text-5xl font-bold text-white mb-4">The Complete <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-accent-emerald">Study Suite</span></h2>
            <p className="text-slate-400">Everything you need to master your material in record time.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              { icon: "style", title: "AI Flashcards", desc: "Memorize faster with 3D flip cards generated from your key terms.", c: "bg-primary/10 text-primary", border: "hover:border-primary/40" },
              { icon: "menu_book", title: "Smart Notes", desc: 'Get a "Cheat Sheet" of crucial formulas, dates, and concepts.', c: "bg-emerald-500/10 text-emerald-400", border: "hover:border-emerald-400/40" },
              { icon: "forum", title: "Chat with PDF", desc: "Ask your personal AI tutor questions right on the screen.", c: "bg-blue-500/10 text-blue-400", border: "hover:border-blue-400/40" },
              { icon: "quiz", title: "Instant Quizzes", desc: "Test yourself with adaptive questions and AI-powered explanations.", c: "bg-purple-500/10 text-purple-400", border: "hover:border-purple-400/40" },
            ].map(f => (
              <div key={f.title} className={`p-7 rounded-2xl bg-white/[0.03] border border-white/10 ${f.border} hover:bg-white/[0.06] transition-all duration-300 group relative overflow-hidden`}>
                <div className="absolute inset-0 bg-gradient-to-br from-white/[0.02] to-transparent pointer-events-none" />
                <div className={`relative z-10 size-12 rounded-xl ${f.c} flex items-center justify-center mb-5 group-hover:scale-110 transition-transform`}>
                  <span className="material-symbols-outlined text-2xl">{f.icon}</span>
                </div>
                <h3 className="relative z-10 text-lg font-bold text-white mb-2">{f.title}</h3>
                <p className="relative z-10 text-sm text-slate-400 leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* How It Works */}
        <section id="how" className="w-full max-w-5xl mx-auto px-6 py-20">
          <div className="text-center mb-14">
            <h2 className="text-3xl md:text-5xl font-bold text-white">How It <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-accent-emerald">Works</span></h2>
          </div>
          <div className="flex flex-col md:flex-row justify-between items-start gap-8 relative">
            <div className="hidden md:block absolute top-12 left-[10%] right-[10%] h-px bg-gradient-to-r from-transparent via-primary/30 to-transparent" />
            {[
              { n: "1", title: "Upload", desc: "Drop any PDF — textbooks, notes, research papers.", c: "text-primary border-primary" },
              { n: "2", title: "Analyze", desc: "AI extracts text, summarizes key concepts.", c: "text-emerald-400 border-emerald-400" },
              { n: "3", title: "Quiz", desc: "Take an interactive, adaptive quiz.", c: "text-blue-400 border-blue-400" },
              { n: "4", title: "Learn", desc: "AI explains mistakes and reinforces concepts.", c: "text-purple-400 border-purple-400" },
            ].map(s => (
              <div key={s.n} className="flex-1 flex flex-col items-center text-center group">
                <div className={`size-20 rounded-full bg-bg-dark border-2 border-slate-700 group-hover:${s.c} flex items-center justify-center text-2xl font-bold text-slate-400 group-hover:${s.c.split(' ')[0]} transition-all duration-500 mb-5 relative z-10 shadow-lg`}>{s.n}</div>
                <h3 className="text-lg font-bold text-white mb-1">{s.title}</h3>
                <p className="text-sm text-slate-400 max-w-[180px]">{s.desc}</p>
              </div>
            ))}
          </div>
        </section>

        <footer className="border-t border-white/10 py-8 text-center bg-black/20">
          <p className="text-slate-500">© 2024 QuizCraft · Built with <span className="text-accent-emerald">♥</span> for Project Exhibition</p>
        </footer>
      </div>
    );
  }

  // ═══════════════════════════════════════════════
  //  LOADING
  // ═══════════════════════════════════════════════
  if (view === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center max-w-md text-center">
          <div className="relative size-32 mb-10">
            <div className="absolute inset-0 rounded-full border-[3px] border-transparent border-t-primary animate-spin shadow-[0_0_20px_rgba(37,209,244,0.3)]" />
            <div className="absolute inset-3 rounded-full border-[3px] border-transparent border-b-accent-emerald animate-spin shadow-[0_0_15px_rgba(16,185,129,0.2)]" style={{ animationDirection: "reverse", animationDuration: "1.5s" }} />
            <div className="absolute inset-6 rounded-full border-[2px] border-transparent border-l-blue-400 animate-spin" style={{ animationDuration: "2s" }} />
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="size-14 rounded-2xl bg-gradient-to-br from-primary/20 to-accent-emerald/20 border border-white/10 flex items-center justify-center backdrop-blur shadow-lg overflow-hidden">
                <img src="/favicon.png" alt="QuizCraft" className="size-10 rounded-xl animate-pulse" />
              </div>
            </div>
          </div>
          <h2 className="text-3xl font-bold text-white mb-3 tracking-tight">Synthesizing Course...</h2>
          <div className="w-full bg-surface-dark/80 border border-border-dark rounded-2xl p-4 mb-8 backdrop-blur">
            <p className="text-primary font-medium text-sm">{loaderMsg}</p>
          </div>
          <div className="w-full h-2 bg-slate-800/80 rounded-full overflow-hidden shadow-inner">
            <div className="h-full bg-gradient-to-r from-primary via-blue-400 to-accent-emerald shadow-[0_0_15px_rgba(37,209,244,0.5)] transition-all duration-500 rounded-full" style={{ width: `${loaderPct}%` }} />
          </div>
          <p className="text-xs text-slate-500 mt-3">{loaderPct}% complete</p>
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════
  //  DASHBOARD — Premium Redesign
  // ═══════════════════════════════════════════════
  if (view === "dashboard") {
    const sidebarItems: { icon: string; label: string; tab: DashTab }[] = [
      { icon: "quiz", label: "Quiz", tab: "quiz" },
      { icon: "style", label: "Cards", tab: "flashcards" },
      { icon: "menu_book", label: "Notes", tab: "notes" },
    ];

    return (
      <div className="h-screen flex flex-col bg-bg-dark">
        {/* ── Top Header ── */}
        <header className="h-[52px] bg-surface-dark/90 backdrop-blur-xl border-b border-border-dark flex items-center px-5 shrink-0 z-50">
          <div className="flex items-center gap-3">
            <div className="size-8 rounded-lg bg-gradient-to-br from-primary/30 to-accent-emerald/30 border border-white/10 flex items-center justify-center shadow-md overflow-hidden">
              <img src="/favicon.png" alt="QuizCraft" className="size-6 rounded" />
            </div>
            <span className="font-bold text-white tracking-tight text-sm">QuizCraft</span>
            <span className="text-[10px] px-2 py-0.5 bg-primary/15 text-primary rounded-full border border-primary/20 font-semibold hidden sm:inline">AI Study</span>
          </div>
          <div className="ml-auto flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-2 bg-white/5 px-3 py-1.5 rounded-lg border border-white/10">
              <span className="material-symbols-outlined text-primary text-sm">description</span>
              <span className="text-xs text-slate-400 font-medium truncate max-w-[200px]">{file?.name}</span>
            </div>
            <button onClick={() => setChatOpen(!chatOpen)} className={`p-1.5 rounded-lg border transition-all ${chatOpen ? 'bg-primary/20 border-primary/30 text-primary' : 'bg-white/5 border-white/10 text-slate-400 hover:text-white'}`}>
              <span className="material-symbols-outlined text-lg">smart_toy</span>
            </button>
          </div>
        </header>

        <div className="flex flex-1 overflow-hidden">
          {/* ── Left Sidebar ── */}
          <nav className="w-[68px] flex flex-col items-center py-5 gap-2 bg-surface-dark/50 border-r border-border-dark shrink-0 backdrop-blur">
            {sidebarItems.map(item => (
              <button key={item.tab} onClick={() => setActiveTab(item.tab)} title={item.label}
                className={`w-11 h-11 rounded-xl flex flex-col items-center justify-center gap-0.5 transition-all duration-200 relative group ${activeTab === item.tab
                  ? "bg-gradient-to-br from-primary/20 to-primary/10 text-primary shadow-[0_0_15px_rgba(37,209,244,0.15)] border border-primary/20"
                  : "text-slate-500 hover:text-white hover:bg-white/5 border border-transparent"
                  }`}>
                {activeTab === item.tab && <div className="absolute -left-[1px] top-2 bottom-2 w-[3px] bg-primary rounded-full shadow-[0_0_8px_rgba(37,209,244,0.5)]" />}
                <span className="material-symbols-outlined text-lg">{item.icon}</span>
                <span className="text-[9px] font-semibold tracking-wide">{item.label}</span>
              </button>
            ))}
            <div className="flex-1" />
            <div className="w-8 h-px bg-border-dark my-2" />
            <button onClick={() => { setView("landing"); setFile(null); }} title="New PDF"
              className="w-11 h-11 rounded-xl text-slate-500 hover:text-accent-emerald hover:bg-accent-emerald/10 border border-transparent hover:border-accent-emerald/20 flex items-center justify-center transition-all">
              <span className="material-symbols-outlined text-lg">add_circle</span>
            </button>
          </nav>

          {/* ── Summary Sidebar ── */}
          <aside className="w-[280px] hidden lg:flex flex-col border-r border-border-dark bg-surface-dark/30 backdrop-blur-sm">
            <div className="p-4 border-b border-border-dark flex items-center gap-2">
              <span className="material-symbols-outlined text-primary text-base">auto_awesome</span>
              <span className="text-sm font-semibold text-white">AI Summary</span>
              <div className="ml-auto flex items-center gap-1.5">
                {summary && (
                  <button onClick={downloadSummaryPDF} title="Download as PDF" className="p-1 rounded-md hover:bg-white/10 text-slate-400 hover:text-primary transition-all">
                    <span className="material-symbols-outlined text-sm">download</span>
                  </button>
                )}
                {summary && <span className="size-2 rounded-full bg-accent-emerald animate-pulse" />}
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              {summary ? (
                <div className="prose-summary text-[13px] text-slate-300 leading-relaxed">
                  <ReactMarkdown components={{
                    h1: ({ children }) => <h2 className="text-base font-bold text-primary mb-2 mt-4 first:mt-0 border-b border-border-dark pb-1">{children}</h2>,
                    h2: ({ children }) => <h3 className="text-sm font-bold text-white mb-1.5 mt-3">{children}</h3>,
                    h3: ({ children }) => <h4 className="text-[13px] font-semibold text-slate-200 mb-1 mt-2">{children}</h4>,
                    p: ({ children }) => <p className="mb-2 text-slate-300 leading-relaxed">{children}</p>,
                    strong: ({ children }) => <strong className="text-white font-semibold">{children}</strong>,
                    ul: ({ children }) => <ul className="list-disc list-outside pl-4 mb-2 space-y-1">{children}</ul>,
                    ol: ({ children }) => <ol className="list-decimal list-outside pl-4 mb-2 space-y-1">{children}</ol>,
                    li: ({ children }) => <li className="text-slate-300">{children}</li>,
                  }}>{summary}</ReactMarkdown>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-center px-4">
                  <div className="size-12 rounded-xl bg-white/5 flex items-center justify-center mb-3">
                    <span className="material-symbols-outlined text-slate-600 text-2xl">summarize</span>
                  </div>
                  <p className="text-sm text-slate-500">Summary generation complete. Review will appear here once processed.</p>
                </div>
              )}
            </div>
          </aside>

          {/* ════ MAIN CONTENT ════ */}
          <main className="flex-1 flex flex-col relative overflow-hidden">
            {/* Tab Header */}
            <div className="px-6 py-4 flex items-center justify-between border-b border-border-dark bg-bg-dark/80 backdrop-blur-sm shrink-0">
              <div className="flex items-center gap-1 bg-surface-dark/80 p-1 rounded-xl border border-border-dark shadow-lg">
                {sidebarItems.map(item => (
                  <button key={item.tab} onClick={() => setActiveTab(item.tab)}
                    className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all flex items-center gap-2 ${activeTab === item.tab
                      ? "bg-gradient-to-r from-primary to-primary-dark text-bg-dark shadow-[0_2px_15px_rgba(37,209,244,0.3)]"
                      : "text-slate-400 hover:text-white hover:bg-white/5"
                      }`}>
                    <span className="material-symbols-outlined text-base">{item.icon}</span>
                    {item.label === "Cards" ? "Flashcards" : item.label}
                  </button>
                ))}
              </div>
              {activeTab === "quiz" && <span className="text-xs text-slate-500 bg-white/5 px-3 py-1.5 rounded-lg border border-white/10 font-mono">{currentQ + 1}/{questions.length}</span>}
            </div>

            {/* ── QUIZ TAB ── */}
            {activeTab === "quiz" && q && (
              <div className="flex-1 overflow-y-auto flex justify-center px-6 py-8">
                <div className="w-full max-w-3xl">
                  {/* Progress */}
                  <div className="mb-8">
                    <div className="flex justify-between items-end mb-2">
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-bold text-primary">Question {currentQ + 1}</span>
                        <span className="text-xs text-slate-500">of {questions.length}</span>
                      </div>
                      <div className="flex items-center gap-2 bg-accent-emerald/10 px-3 py-1 rounded-lg border border-accent-emerald/20">
                        <span className="material-symbols-outlined text-accent-emerald text-sm">stars</span>
                        <span className="text-sm font-bold text-accent-emerald">{score}</span>
                      </div>
                    </div>
                    <div className="h-1 w-full bg-slate-800/80 rounded-full overflow-hidden">
                      <div className="h-full bg-gradient-to-r from-primary to-accent-emerald transition-all duration-500 rounded-full shadow-[0_0_10px_rgba(37,209,244,0.4)]" style={{ width: `${((currentQ + 1) / questions.length) * 100}%` }} />
                    </div>
                  </div>

                  {/* Question Card */}
                  <div className="glass-panel rounded-2xl p-8 mb-8 relative overflow-hidden group">
                    <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-primary via-blue-400 to-accent-emerald opacity-60" />
                    <div className="absolute bottom-0 right-0 opacity-[0.04] pointer-events-none">
                      <span className="material-symbols-outlined text-[120px] text-primary">psychology_alt</span>
                    </div>
                    <h2 className="text-xl md:text-2xl font-bold text-white leading-relaxed tracking-tight relative z-10">{q.question}</h2>
                  </div>

                  {/* Options */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                    {q.options.map((opt, i) => {
                      const sel = answered === i;
                      const correct = opt === q.correct_answer;
                      const done = answered !== null;
                      let cls: string, barCls: string, letCls: string, txtCls: string;
                      if (!done) {
                        cls = "border-slate-700/60 bg-surface-dark/30 hover:bg-surface-dark/60 hover:border-primary/40 cursor-pointer group";
                        barCls = "bg-transparent group-hover:bg-primary"; letCls = "bg-slate-800/80 text-slate-400 border-slate-700 group-hover:bg-primary group-hover:text-bg-dark group-hover:border-primary"; txtCls = "text-slate-200 group-hover:text-white";
                      } else if (correct) {
                        cls = "border-accent-emerald bg-accent-emerald/10 neon-glow-emerald"; barCls = "bg-accent-emerald"; letCls = "bg-accent-emerald text-bg-dark border-accent-emerald"; txtCls = "text-white font-semibold";
                      } else if (sel) {
                        cls = "border-red-500 bg-red-500/10 shadow-[0_0_10px_rgba(239,68,68,0.2)]"; barCls = "bg-red-500"; letCls = "bg-red-500 text-white border-red-500"; txtCls = "text-white";
                      } else {
                        cls = "border-slate-800/50 bg-surface-dark/10 opacity-40"; barCls = "bg-transparent"; letCls = "bg-slate-800 text-slate-600 border-slate-800"; txtCls = "text-slate-500";
                      }
                      return (
                        <button key={i} onClick={() => handleAnswer(i)} disabled={done} className={`relative p-5 rounded-xl border transition-all duration-300 text-left ${cls}`}>
                          <div className={`absolute left-0 top-0 bottom-0 w-1 rounded-l-xl transition-all ${barCls}`} />
                          <div className="flex items-start gap-4">
                            <div className={`size-9 rounded-lg flex items-center justify-center font-bold text-sm border shrink-0 transition-all ${letCls}`}>{letters[i]}</div>
                            <p className={`text-[15px] leading-relaxed ${txtCls}`}>{opt}</p>
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  {/* Explanation */}
                  {showExplanation && q.explanation && (
                    <div className="p-5 rounded-xl border border-primary/20 bg-gradient-to-r from-primary/5 to-transparent text-slate-300 text-sm leading-relaxed mb-6">
                      <div className="flex items-center gap-2 text-primary font-semibold mb-2">
                        <span className="material-symbols-outlined text-base">lightbulb</span> Explanation
                      </div>
                      {q.explanation}
                    </div>
                  )}

                  {/* Actions */}
                  {answered !== null && (
                    <div className="flex gap-3 justify-end">
                      {!showExplanation && q.explanation && (
                        <button onClick={() => setShowExplanation(true)} className="px-5 py-2.5 bg-white/5 border border-border-dark hover:border-primary/40 text-white rounded-xl transition-all flex items-center gap-2 text-sm font-medium hover:bg-white/10">
                          <span className="material-symbols-outlined text-primary text-base">lightbulb</span> Explain
                        </button>
                      )}
                      <button onClick={handleNext} className="px-7 py-2.5 bg-gradient-to-r from-primary to-primary-dark text-bg-dark font-bold rounded-xl shadow-[0_2px_20px_rgba(37,209,244,0.3)] hover:shadow-[0_2px_30px_rgba(37,209,244,0.5)] transition-all flex items-center gap-2 text-sm">
                        {currentQ + 1 >= questions.length ? "View Results" : "Next"}
                        <span className="material-symbols-outlined text-base">arrow_forward</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ── FLASHCARDS TAB ── */}
            {activeTab === "flashcards" && (
              <div className="flex-1 overflow-y-auto p-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 max-w-5xl mx-auto">
                  {flashcards.map((fc, i) => {
                    const gradients = [
                      "from-primary/20 to-blue-600/20", "from-accent-emerald/20 to-teal-600/20",
                      "from-purple-500/20 to-pink-500/20", "from-orange-500/20 to-red-500/20",
                      "from-blue-500/20 to-indigo-500/20",
                    ];
                    const icons = ["psychology", "neurology", "model_training", "data_object", "science"];
                    const borderColors = ["border-primary/30", "border-emerald-500/30", "border-purple-500/30", "border-orange-500/30", "border-blue-500/30"];
                    const isFlipped = flippedCards.has(i);

                    return (
                      <div key={i} onClick={() => toggleFlip(i)} className="h-56 cursor-pointer perspective-1000 group">
                        <div className={`relative w-full h-full transition-transform duration-700 preserve-3d ${isFlipped ? "rotate-y-180" : ""}`}>
                          {/* Front */}
                          <div className={`absolute inset-0 backface-hidden rounded-2xl border ${borderColors[i % 5]} bg-surface-dark/60 overflow-hidden`}>
                            <div className={`absolute inset-0 bg-gradient-to-br ${gradients[i % 5]} opacity-30`} />
                            <div className="relative z-10 p-6 flex flex-col justify-between h-full">
                              <div className="size-10 rounded-xl bg-white/10 flex items-center justify-center backdrop-blur-sm">
                                <span className="material-symbols-outlined text-white/70">{icons[i % 5]}</span>
                              </div>
                              <div>
                                <h3 className="text-lg font-bold text-white leading-snug mb-2">{fc.term}</h3>
                                <p className="text-xs text-slate-500 flex items-center gap-1">
                                  <span className="material-symbols-outlined text-[10px]">touch_app</span> Click to reveal
                                </p>
                              </div>
                            </div>
                          </div>
                          {/* Back */}
                          <div className={`absolute inset-0 backface-hidden rotate-y-180 rounded-2xl border ${borderColors[i % 5]} bg-surface-dark overflow-hidden`}>
                            <div className="absolute inset-0 bg-gradient-to-br from-primary/10 to-accent-emerald/10 opacity-40" />
                            <div className="relative z-10 p-6 flex items-center justify-center h-full">
                              <p className="text-slate-200 text-sm leading-relaxed text-center">{fc.definition}</p>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ── NOTES TAB ── */}
            {activeTab === "notes" && (
              <div className="flex-1 overflow-y-auto p-6">
                <div className="max-w-3xl mx-auto space-y-6">
                  {notes.key_concepts && notes.key_concepts.length > 0 && (
                    <div className="glass-panel rounded-2xl overflow-hidden">
                      <div className="px-6 py-4 border-b border-border-dark flex items-center gap-3 bg-primary/5">
                        <div className="size-8 rounded-lg bg-primary/15 flex items-center justify-center"><span className="material-symbols-outlined text-primary text-base">lightbulb</span></div>
                        <h3 className="font-bold text-white">Key Concepts</h3>
                        <span className="ml-auto text-xs text-slate-500 font-mono">{notes.key_concepts.length} items</span>
                      </div>
                      <div className="p-6 space-y-3">
                        {notes.key_concepts.map((c, i) => (
                          <div key={i} className="flex items-start gap-3 group">
                            <span className="size-6 rounded-md bg-primary/10 text-primary text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">{i + 1}</span>
                            <p className="text-sm text-slate-300 leading-relaxed">{c}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {notes.formulas && notes.formulas.length > 0 && (
                    <div className="glass-panel rounded-2xl overflow-hidden">
                      <div className="px-6 py-4 border-b border-border-dark flex items-center gap-3 bg-accent-emerald/5">
                        <div className="size-8 rounded-lg bg-accent-emerald/15 flex items-center justify-center"><span className="material-symbols-outlined text-accent-emerald text-base">function</span></div>
                        <h3 className="font-bold text-white">Formulas & Equations</h3>
                      </div>
                      <div className="p-6 space-y-3">
                        {notes.formulas.map((f, i) => (
                          <div key={i} className="p-3 bg-white/[0.03] rounded-lg border border-white/5 text-sm text-slate-300 font-mono">{f}</div>
                        ))}
                      </div>
                    </div>
                  )}
                  {notes.important_dates && notes.important_dates.length > 0 && (
                    <div className="glass-panel rounded-2xl overflow-hidden">
                      <div className="px-6 py-4 border-b border-border-dark flex items-center gap-3 bg-blue-500/5">
                        <div className="size-8 rounded-lg bg-blue-500/15 flex items-center justify-center"><span className="material-symbols-outlined text-blue-400 text-base">event</span></div>
                        <h3 className="font-bold text-white">Important Dates & Facts</h3>
                      </div>
                      <div className="p-6 space-y-3">
                        {notes.important_dates.map((d, i) => (
                          <div key={i} className="flex items-start gap-3"><span className="size-1.5 rounded-full bg-blue-400 mt-2 shrink-0" /><p className="text-sm text-slate-300">{d}</p></div>
                        ))}
                      </div>
                    </div>
                  )}
                  {(!notes.key_concepts || notes.key_concepts.length === 0) && (!notes.formulas || notes.formulas.length === 0) && (
                    <div className="flex flex-col items-center justify-center py-20 text-center">
                      <div className="size-16 rounded-2xl bg-white/5 flex items-center justify-center mb-4"><span className="material-symbols-outlined text-slate-600 text-3xl">menu_book</span></div>
                      <h3 className="text-lg font-semibold text-white mb-2">No Notes Available</h3>
                      <p className="text-sm text-slate-500 max-w-sm">Notes could not be generated for this document. Try uploading a text-heavy PDF.</p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </main>

          {/* ════ AI CHAT SIDEBAR ════ */}
          {chatOpen && (
            <aside className="w-[300px] flex flex-col bg-surface-dark/50 border-l border-border-dark shrink-0 backdrop-blur">
              <div className="p-4 border-b border-border-dark flex items-center bg-surface-dark/80">
                <div className="size-9 rounded-xl bg-gradient-to-br from-primary to-blue-600 flex items-center justify-center shadow-[0_0_20px_rgba(37,209,244,0.2)]">
                  <span className="material-symbols-outlined text-white text-base">smart_toy</span>
                </div>
                <div className="ml-3 flex-1">
                  <h3 className="text-sm font-bold text-white">AI Tutor</h3>
                  <p className="text-[10px] text-primary flex items-center gap-1"><span className="block size-1.5 rounded-full bg-accent-emerald animate-pulse" />Document analyzed</p>
                </div>
                <button onClick={() => setChatOpen(false)} className="p-1 text-slate-500 hover:text-white transition-colors">
                  <span className="material-symbols-outlined text-base">close</span>
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {chatMessages.map((msg, i) => (
                  <div key={i} className={`flex gap-2.5 ${msg.role === "user" ? "flex-row-reverse" : ""}`}>
                    {msg.role === "bot" && (
                      <div className="size-7 rounded-lg bg-gradient-to-br from-primary/20 to-blue-600/20 border border-white/10 flex items-center justify-center shrink-0">
                        <span className="material-symbols-outlined text-primary text-xs">smart_toy</span>
                      </div>
                    )}
                    <div className={`px-3.5 py-2.5 rounded-2xl text-[13px] leading-relaxed max-w-[210px] shadow-sm ${msg.role === "user"
                      ? "bg-gradient-to-r from-primary/25 to-primary/15 border border-primary/20 text-white rounded-tr-sm"
                      : "bg-white/[0.06] border border-white/10 text-slate-200 rounded-tl-sm"
                      }`}>
                      {msg.text}
                    </div>
                  </div>
                ))}
                {chatLoading && (
                  <div className="flex gap-2.5">
                    <div className="size-7 rounded-lg bg-gradient-to-br from-primary/20 to-blue-600/20 border border-white/10 flex items-center justify-center shrink-0">
                      <span className="material-symbols-outlined text-primary text-xs animate-spin">progress_activity</span>
                    </div>
                    <div className="bg-white/[0.06] border border-white/10 px-4 py-2.5 rounded-2xl rounded-tl-sm">
                      <div className="flex gap-1"><span className="size-1.5 bg-slate-400 rounded-full animate-bounce" /><span className="size-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: "0.15s" }} /><span className="size-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: "0.3s" }} /></div>
                    </div>
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>
              <div className="p-3 border-t border-border-dark bg-surface-dark/80">
                <div className="relative">
                  <input type="text" value={chatInput} onChange={e => setChatInput(e.target.value)} onKeyDown={e => e.key === "Enter" && sendChat()}
                    className="w-full bg-bg-dark/80 border border-border-dark rounded-xl py-2.5 pl-4 pr-11 text-sm text-white placeholder-slate-600 focus:ring-1 focus:ring-primary focus:border-primary outline-none transition-all"
                    placeholder="Ask about this topic..." />
                  <button onClick={sendChat} className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1.5 bg-primary/20 text-primary hover:bg-primary hover:text-bg-dark rounded-lg transition-all">
                    <span className="material-symbols-outlined text-[16px]">send</span>
                  </button>
                </div>
              </div>
            </aside>
          )}
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════
  //  RESULTS — Analytics View
  // ═══════════════════════════════════════════════
  if (view === "results") {
    const circ = 2 * Math.PI * 45;
    const off = circ - (pct / 100) * circ;
    let title: string, detail: string;
    if (pct >= 90) { title = "Outstanding Performance"; detail = "You've demonstrated exceptional mastery of this material."; }
    else if (pct >= 70) { title = "Great Work"; detail = "Strong performance with room for targeted improvement."; }
    else if (pct >= 50) { title = "Keep Improving"; detail = "You're building a solid foundation. Review weak areas."; }
    else { title = "Review Recommended"; detail = "This topic needs more study. Use the flashcards and notes to reinforce concepts."; }

    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/8 rounded-full blur-[100px] pointer-events-none" />
        <div className="absolute bottom-1/4 right-1/4 w-64 h-64 bg-accent-emerald/8 rounded-full blur-[80px] pointer-events-none" />

        <div className="relative z-10 w-full max-w-5xl glass-panel rounded-3xl shadow-2xl overflow-hidden border border-border-dark">
          {/* Top Gradient Bar */}
          <div className="h-1 bg-gradient-to-r from-primary via-blue-400 to-accent-emerald" />

          <div className="flex flex-col md:flex-row min-h-[520px]">
            {/* Left: Score */}
            <div className="flex-1 p-10 flex flex-col items-center justify-center border-b md:border-b-0 md:border-r border-white/10 relative">
              <span className="absolute top-6 left-6 px-3 py-1.5 rounded-lg text-[10px] font-bold bg-gradient-to-r from-primary/15 to-accent-emerald/15 text-primary uppercase tracking-widest border border-primary/20">Module Complete</span>
              <div className="relative size-52 md:size-60 flex items-center justify-center mb-8">
                <svg className="transform -rotate-90 w-full h-full drop-shadow-[0_0_20px_rgba(37,209,244,0.2)]" viewBox="0 0 100 100">
                  <circle className="text-slate-800/60" cx="50" cy="50" fill="none" r="45" stroke="currentColor" strokeWidth="3" />
                  <circle className="text-primary" cx="50" cy="50" fill="none" r="45" stroke="currentColor" strokeDasharray={circ} strokeDashoffset={off} strokeLinecap="round" strokeWidth="3.5" style={{ transition: "stroke-dashoffset 1.5s cubic-bezier(0.4, 0, 0.2, 1)", filter: "drop-shadow(0 0 8px rgba(37, 209, 244, 0.5))" }} />
                </svg>
                <div className="absolute flex flex-col items-center">
                  <span className="text-6xl font-extrabold text-white tracking-tighter">{pct}<span className="text-2xl text-slate-400 font-bold">%</span></span>
                  <span className="text-primary text-xs font-semibold uppercase tracking-[0.2em] mt-1">Mastery</span>
                </div>
              </div>
              <h1 className="text-2xl font-bold text-white mb-2">{title}</h1>
              <p className="text-slate-400 text-sm max-w-xs text-center leading-relaxed">{detail}</p>
            </div>

            {/* Right: Stats */}
            <div className="flex-[1.3] p-8 md:p-10 flex flex-col bg-bg-dark/30">
              <div className="flex items-center gap-2 mb-8">
                <span className="material-symbols-outlined text-primary">analytics</span>
                <h3 className="text-xl font-bold text-white">Performance</h3>
              </div>
              <div className="grid grid-cols-2 gap-4 mb-8 flex-1">
                <div className="bg-white/[0.04] border border-white/10 rounded-xl p-5 hover:bg-white/[0.07] transition-colors">
                  <div className="p-2 bg-primary/10 rounded-lg text-primary w-fit mb-3"><span className="material-symbols-outlined text-base">target</span></div>
                  <span className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold block">Total Correct</span>
                  <span className="text-2xl text-white font-bold">{score} / {questions.length}</span>
                </div>
                <div className="bg-white/[0.04] border border-white/10 rounded-xl p-5 hover:bg-white/[0.07] transition-colors">
                  <div className="p-2 bg-accent-emerald/10 rounded-lg text-accent-emerald w-fit mb-3"><span className="material-symbols-outlined text-base">speed</span></div>
                  <span className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold block">Accuracy Rate</span>
                  <span className="text-2xl text-white font-bold">{pct}%</span>
                </div>
                <div className="bg-white/[0.04] border border-white/10 rounded-xl p-5 hover:bg-white/[0.07] transition-colors">
                  <div className="p-2 bg-blue-500/10 rounded-lg text-blue-400 w-fit mb-3"><span className="material-symbols-outlined text-base">school</span></div>
                  <span className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold block">AI Engine</span>
                  <span className="text-lg text-white font-bold">Llama 3.2</span>
                </div>
                <div className="bg-white/[0.04] border border-white/10 rounded-xl p-5 hover:bg-white/[0.07] transition-colors">
                  <div className="p-2 bg-purple-500/10 rounded-lg text-purple-400 w-fit mb-3"><span className="material-symbols-outlined text-base">style</span></div>
                  <span className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold block">Flashcards</span>
                  <span className="text-2xl text-white font-bold">{flashcards.length}</span>
                </div>
              </div>
              <div className="mt-auto pt-6 border-t border-border-dark flex flex-col sm:flex-row gap-3">
                <button onClick={() => { setView("dashboard"); setCurrentQ(0); setScore(0); setAnswered(null); setShowExplanation(false); setActiveTab("quiz"); }}
                  className="flex-1 px-5 py-3 rounded-xl border border-primary/40 text-white hover:bg-primary/10 hover:shadow-[0_0_15px_rgba(37,209,244,0.2)] transition-all font-semibold text-sm flex items-center justify-center gap-2">
                  <span className="material-symbols-outlined text-base">replay</span> Retake Quiz
                </button>
                <button onClick={() => { setView("landing"); setFile(null); }}
                  className="flex-1 px-5 py-3 rounded-xl bg-gradient-to-r from-accent-emerald to-emerald-600 text-white shadow-lg hover:shadow-[0_0_20px_rgba(16,185,129,0.3)] transition-all font-bold text-sm flex items-center justify-center gap-2">
                  <span className="material-symbols-outlined text-base">upload_file</span> New PDF
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
