import { useState, useRef, useCallback, useEffect } from "react";
import { subscribeToSubmissions, addSubmission, removeSubmission, updateSubmission, updateSubmissionOrder } from "./firebase.js";

const SECTIONS = [
  { num: 1, en: "Kadeish", he: "קַדֵּשׁ", desc: "Sanctification — first cup of wine", icon: "🍷" },
  { num: 2, en: "Ur'chatz", he: "וּרְחַץ", desc: "Washing the hands", icon: "💧" },
  { num: 3, en: "Karpas", he: "כַּרְפַּס", desc: "Dipping vegetable in salt water", icon: "🌿" },
  { num: 4, en: "Yachatz", he: "יַחַץ", desc: "Breaking the middle matzah", icon: "✋" },
  { num: 5, en: "Maggid", he: "מַגִּיד", desc: "The telling — relating the Exodus story", icon: "📖" },
  { num: 6, en: "Rachtzah", he: "רָחְצָה", desc: "Washing hands before the meal", icon: "🫧" },
  { num: 7, en: "Motzi", he: "מוֹצִיא", desc: "Blessing over the matzah", icon: "🙌" },
  { num: 8, en: "Matzah", he: "מַצָּה", desc: "Specific blessing for eating matzah", icon: "🫓" },
  { num: 9, en: "Maror", he: "מָרוֹר", desc: "Eating bitter herbs", icon: "🥬" },
  { num: 10, en: "Koreich", he: "כּוֹרֵךְ", desc: "Sandwich of matzah and bitter herbs", icon: "🥪" },
  { num: 11, en: "Shulchan Orech", he: "שֻׁלְחָן עוֹרֵךְ", desc: "The festive meal", icon: "🍽️" },
  { num: 12, en: "Tzafun", he: "צָפוּן", desc: "Eating the hidden Afikoman", icon: "🔍" },
  { num: 13, en: "Bareich", he: "בָּרֵךְ", desc: "Grace after meals", icon: "🙏" },
  { num: 14, en: "Hallel", he: "הַלֵּל", desc: "Songs of praise and wine", icon: "🎶" },
  { num: 15, en: "Nirtzah", he: "נִירְצָה", desc: "Acceptance — closing the Seder", icon: "✡️" },
];

const ADMIN_PASSWORD = "seder";

// ─── File parsing ───

async function loadScript(src) {
  if (document.querySelector(`script[src="${src}"]`)) return;
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = src;
    s.onload = resolve;
    s.onerror = reject;
    document.head.appendChild(s);
  });
}

async function parsePDF(file) {
  await loadScript("https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js");
  window.pdfjsLib.GlobalWorkerOptions.workerSrc =
    "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
  const buf = await file.arrayBuffer();
  const pdf = await window.pdfjsLib.getDocument({ data: buf }).promise;
  let text = "";
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    text += content.items.map(it => it.str).join(" ") + "\n\n";
  }
  return text.trim();
}

async function parseDOCX(file) {
  await loadScript("https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js");
  const buf = await file.arrayBuffer();
  const result = await window.mammoth.extractRawText({ arrayBuffer: buf });
  return result.value.trim();
}

async function parseFile(file) {
  const n = file.name.toLowerCase();
  if (n.endsWith(".pdf")) return parsePDF(file);
  if (n.endsWith(".docx") || n.endsWith(".doc")) return parseDOCX(file);
  return file.text();
}

// ─── PDF Export ───

async function exportPDF(submissions, familyName, year) {
  await loadScript("https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js");
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const ML = 72, MR = 72, CW = W - ML - MR;
  let y = 0;

  const checkPage = (need) => { if (y + need > H - 72) { doc.addPage(); bg(); y = 72; } };
  const bg = () => { doc.setFillColor(250, 246, 240); doc.rect(0, 0, W, H, "F"); };

  // ── Cover ──
  bg();
  doc.setDrawColor(196, 148, 61);
  doc.setLineWidth(1.5);
  doc.rect(36, 36, W - 72, H - 72);
  doc.setLineWidth(0.5);
  doc.rect(42, 42, W - 84, H - 84);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(14);
  doc.setTextColor(139, 105, 20);
  doc.text("Haggadah shel Pesach", W / 2, 220, { align: "center" });

  doc.setDrawColor(196, 148, 61);
  doc.setLineWidth(0.8);
  doc.line(W / 2 - 60, 245, W / 2 + 60, 245);

  doc.setFontSize(36);
  doc.setTextColor(44, 36, 22);
  doc.text(`The ${familyName}`, W / 2, 300, { align: "center" });
  doc.text("Haggadah", W / 2, 345, { align: "center" });

  doc.setFontSize(16);
  doc.setTextColor(139, 105, 20);
  doc.text(`Passover ${year}`, W / 2, 395, { align: "center" });
  doc.line(W / 2 - 40, 420, W / 2 + 40, 420);

  // ── Sections ──
  SECTIONS.forEach((sec) => {
    const subs = submissions
      .filter(s => s.section === sec.num)
      .sort((a, b) => (a.order ?? a.createdAt ?? 0) - (b.order ?? b.createdAt ?? 0));

    doc.addPage();
    bg();
    y = 72;

    doc.setFontSize(12);
    doc.setTextColor(139, 105, 20);
    doc.setFont("helvetica", "normal");
    doc.text(`${sec.num}.`, ML, y);

    doc.setFontSize(22);
    doc.setTextColor(44, 36, 22);
    doc.text(sec.en, ML + 24, y);

    doc.setFontSize(10);
    doc.setTextColor(139, 126, 102);
    y += 18;
    doc.text(sec.desc, ML, y);
    y += 10;

    doc.setDrawColor(196, 148, 61);
    doc.setLineWidth(0.5);
    doc.line(ML, y, W - MR, y);
    y += 24;

    if (subs.length === 0) {
      doc.setFontSize(11);
      doc.setTextColor(180, 170, 150);
      doc.setFont("helvetica", "italic");
      doc.text("No submissions for this section.", ML + 16, y);
      doc.setFont("helvetica", "normal");
      return;
    }

    subs.forEach((sub, idx) => {
      checkPage(80);

      if (sub.title) {
        doc.setFontSize(13);
        doc.setTextColor(44, 36, 22);
        doc.setFont("helvetica", "italic");
        doc.splitTextToSize(sub.title, CW - 32).forEach(line => {
          checkPage(18);
          doc.text(line, ML + 16, y);
          y += 18;
        });
        y += 2;
      }

      doc.setFont("helvetica", "normal");
      doc.setFontSize(11);
      doc.setTextColor(61, 53, 37);
      doc.splitTextToSize(sub.content, CW - 32).forEach(line => {
        checkPage(16);
        doc.text(line, ML + 16, y);
        y += 16;
      });

      y += 4;
      checkPage(20);
      doc.setFontSize(10);
      doc.setTextColor(139, 105, 20);
      doc.setFont("helvetica", "italic");
      doc.text(`— ${sub.author}`, ML + 16, y);
      doc.setFont("helvetica", "normal");
      y += 28;

      if (idx < subs.length - 1) {
        checkPage(20);
        doc.setDrawColor(220, 210, 195);
        doc.setLineDashPattern([3, 3], 0);
        doc.line(ML + 16, y - 10, W - MR - 16, y - 10);
        doc.setLineDashPattern([], 0);
      }
    });
  });

  // ── Closing ──
  doc.addPage();
  bg();
  doc.setDrawColor(196, 148, 61);
  doc.setLineWidth(0.8);
  doc.line(W / 2 - 60, H / 2 - 40, W / 2 + 60, H / 2 - 40);
  doc.setFontSize(18);
  doc.setTextColor(139, 105, 20);
  doc.setFont("helvetica", "normal");
  doc.text("L'shanah haba'ah b'Yerushalayim", W / 2, H / 2, { align: "center" });
  doc.setFontSize(13);
  doc.setTextColor(107, 90, 62);
  doc.setFont("helvetica", "italic");
  doc.text("Next year in Jerusalem", W / 2, H / 2 + 28, { align: "center" });
  doc.line(W / 2 - 60, H / 2 + 50, W / 2 + 60, H / 2 + 50);

  doc.save(`${familyName.replace(/\s+/g, "-")}-Haggadah-${year}.pdf`);
}

// ═══════════════════════════════════════
//  APP
// ═══════════════════════════════════════

export default function App() {
  const [view, setView] = useState("home");
  const [selectedSection, setSelectedSection] = useState(null);
  const [submissions, setSubmissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [authorName, setAuthorName] = useState("");
  const [dvarTorah, setDvarTorah] = useState("");
  const [title, setTitle] = useState("");
  const [uploadedFile, setUploadedFile] = useState(null);
  const [uploadedContent, setUploadedContent] = useState("");
  const [inputMode, setInputMode] = useState("text");
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [adminPassword, setAdminPassword] = useState("");
  const [adminAuthed, setAdminAuthed] = useState(false);
  const [familyName] = useState("Our Family");
  const [year] = useState("5786");
  const [editingId, setEditingId] = useState(null);
  const [editData, setEditData] = useState({});
  const [parsing, setParsing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const fileInputRef = useRef(null);

  useEffect(() => {
    const unsub = subscribeToSubmissions(subs => { setSubmissions(subs); setLoading(false); });
    return () => unsub();
  }, []);

  const handleFileUpload = useCallback(async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploadedFile(file);
    setParsing(true);
    try {
      setUploadedContent(await parseFile(file));
    } catch (err) {
      console.error(err);
      try { setUploadedContent(await file.text()); }
      catch { setUploadedContent("[Could not parse file]"); }
    }
    setParsing(false);
  }, []);

  const handleSubmit = useCallback(async () => {
    const content = inputMode === "text" ? dvarTorah : uploadedContent;
    if (!authorName.trim() || !content.trim() || !selectedSection) return;
    setSubmitting(true);
    try {
      await addSubmission({
        section: selectedSection, author: authorName.trim(), title: title.trim(),
        content: content.trim(), date: new Date().toLocaleDateString(),
        fileName: uploadedFile?.name || null,
        order: submissions.filter(s => s.section === selectedSection).length,
      });
      setSubmitSuccess(true);
      setTimeout(() => {
        setSubmitSuccess(false); setSelectedSection(null);
        setDvarTorah(""); setTitle(""); setUploadedContent(""); setUploadedFile(null);
        setView("home");
      }, 2500);
    } catch (err) { alert("Error — please try again."); console.error(err); }
    setSubmitting(false);
  }, [inputMode, dvarTorah, uploadedContent, authorName, title, selectedSection, uploadedFile, submissions]);

  const deleteSub = useCallback(async (id) => {
    if (!confirm("Delete this submission?")) return;
    try { await removeSubmission(id); } catch (e) { console.error(e); }
  }, []);

  const startEdit = useCallback((sub) => {
    setEditingId(sub.id);
    setEditData({ author: sub.author, title: sub.title || "", content: sub.content });
  }, []);

  const saveEdit = useCallback(async () => {
    if (!editingId) return;
    try { await updateSubmission(editingId, editData); setEditingId(null); }
    catch (e) { console.error(e); }
  }, [editingId, editData]);

  const moveSub = useCallback(async (secNum, from, to) => {
    const subs = submissions.filter(s => s.section === secNum)
      .sort((a, b) => (a.order ?? a.createdAt ?? 0) - (b.order ?? b.createdAt ?? 0));
    if (to < 0 || to >= subs.length) return;
    const arr = [...subs]; const [m] = arr.splice(from, 1); arr.splice(to, 0, m);
    try { await Promise.all(arr.map((s, i) => updateSubmissionOrder(s.id, i))); }
    catch (e) { console.error(e); }
  }, [submissions]);

  const doExport = useCallback(async () => {
    setExporting(true);
    try { await exportPDF(submissions, familyName, year); }
    catch (e) { alert("Export error"); console.error(e); }
    setExporting(false);
  }, [submissions, familyName, year]);

  const css = `
    @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;0,600;0,700;1,400;1,500&family=Frank+Ruhl+Libre:wght@0,300;0,400;0,500;0,700&family=Crimson+Pro:ital,wght@0,300;0,400;0,500;1,300;1,400&display=swap');
    *{box-sizing:border-box;margin:0;padding:0}
    body{background:#FAF6F0}
    ::selection{background:rgba(139,105,20,0.2)}
    input:focus,textarea:focus{outline:none;border-color:#8B6914!important}
    @keyframes fadeUp{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}
    @keyframes spin{to{transform:rotate(360deg)}}
    .fade-up{animation:fadeUp .5s ease forwards}
    .sc:hover{transform:translateY(-3px);box-shadow:0 8px 30px rgba(139,105,20,0.12)!important}
    .sc{transition:all .3s ease}
    .nb:hover{background:rgba(44,36,22,0.06)!important}
    .ab:hover{background:rgba(139,105,20,0.1)!important}
    textarea::-webkit-scrollbar{width:6px}
    textarea::-webkit-scrollbar-thumb{background:rgba(139,105,20,0.2);border-radius:3px}
    @media(max-width:600px){.g2{grid-template-columns:1fr!important}.sr{gap:24px!important}}
  `;

  const inp = {
    width: "100%", padding: "12px 16px", borderRadius: 10,
    border: "1px solid rgba(139,105,20,0.18)", background: "#FFFCF7",
    fontSize: 15, fontFamily: "'Crimson Pro', serif", color: "#2C2416",
    transition: "border-color 0.2s",
  };

  if (loading) return (
    <div style={{ fontFamily: "'Cormorant Garamond', serif", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#FAF6F0" }}>
      <style>{css}</style>
      <div style={{ textAlign: "center", color: "#8B6914" }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>✡️</div>
        <div style={{ fontSize: 15, fontFamily: "'Crimson Pro', serif", fontWeight: 300 }}>Loading Haggadah...</div>
      </div>
    </div>
  );

  return (
    <div style={{ fontFamily: "'Cormorant Garamond', serif", minHeight: "100vh", background: "linear-gradient(170deg, #FAF6F0 0%, #F3EDE4 40%, #EDE5D8 100%)", color: "#2C2416" }}>
      <style>{css}</style>
      <div style={{ height: 4, background: "linear-gradient(90deg, transparent, #8B6914, #C4943D, #8B6914, transparent)" }} />

      {/* NAV */}
      <nav style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 28px", borderBottom: "1px solid rgba(139,105,20,0.12)", flexWrap: "wrap", gap: 8 }}>
        <div onClick={() => setView("home")} style={{ fontSize: 15, letterSpacing: "0.15em", textTransform: "uppercase", color: "#8B6914", fontWeight: 600, fontFamily: "'Crimson Pro', serif", cursor: "pointer" }}>
          ✡ {familyName} Haggadah
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          {[["home","Home"],["submit","Add Dvar Torah"],["admin","Admin"]].map(([v,l]) => (
            <button key={v} className="nb" onClick={() => { if(v==="submit") setSelectedSection(null); setView(v); }}
              style={{ padding:"7px 16px", borderRadius:20, border:"none", cursor:"pointer", fontSize:13, fontFamily:"'Crimson Pro', serif", fontWeight:500, letterSpacing:"0.05em", transition:"all .25s",
                background: (view===v||(v==="admin"&&view==="preview")) ? "#2C2416":"transparent",
                color: (view===v||(v==="admin"&&view==="preview")) ? "#FAF6F0":"#6B5A3E" }}>{l}</button>
          ))}
        </div>
      </nav>

      <div style={{ maxWidth: 860, margin: "0 auto", padding: "32px 20px 60px" }}>

        {/* ═══ HOME ═══ */}
        {view === "home" && (
          <div className="fade-up" style={{ textAlign: "center", paddingTop: 40 }}>
            <div style={{ fontSize: 13, letterSpacing: "0.3em", textTransform: "uppercase", color: "#8B6914", fontFamily: "'Crimson Pro', serif", fontWeight: 500, marginBottom: 16 }}>Passover {year}</div>
            <h1 style={{ fontSize: "clamp(36px, 6vw, 56px)", fontWeight: 300, lineHeight: 1.15, marginBottom: 8 }}>{familyName}</h1>
            <h2 style={{ fontSize: "clamp(20px, 3.5vw, 30px)", fontWeight: 300, fontStyle: "italic", color: "#6B5A3E", marginBottom: 40 }}>Haggadah</h2>
            <div style={{ width: 120, height: 1, margin: "0 auto 40px", background: "linear-gradient(90deg, transparent, #C4943D, transparent)" }} />
            <p style={{ fontSize: 17, lineHeight: 1.7, color: "#5A4E3A", maxWidth: 520, margin: "0 auto 48px", fontFamily: "'Crimson Pro', serif", fontWeight: 300 }}>
              A collection of divrei Torah and insights from our family, woven together to enrich our Seder table. Each voice adds meaning to our shared story of freedom.
            </p>
            <div className="sr" style={{ display: "flex", justifyContent: "center", gap: 48, marginBottom: 48 }}>
              {[[submissions.length,"Submissions"],[new Set(submissions.map(s=>s.section)).size,"Sections Filled"],[15-new Set(submissions.map(s=>s.section)).size,"Remaining"]].map(([v,l],i) => (
                <div key={i} style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 32, fontWeight: 300, color: "#8B6914" }}>{v}</div>
                  <div style={{ fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", color: "#9B8E78", fontFamily: "'Crimson Pro', serif" }}>{l}</div>
                </div>
              ))}
            </div>
            <button onClick={() => { setSelectedSection(null); setView("submit"); }}
              style={{ padding: "14px 44px", borderRadius: 28, background: "#2C2416", color: "#FAF6F0", border: "none", fontSize: 15, fontFamily: "'Crimson Pro', serif", fontWeight: 500, letterSpacing: "0.08em", cursor: "pointer", boxShadow: "0 4px 20px rgba(44,36,22,0.2)" }}>
              Add Your Dvar Torah
            </button>
          </div>
        )}

        {/* ═══ SUBMIT ═══ */}
        {view === "submit" && (
          <div className="fade-up">
            {!selectedSection ? (
              <div>
                <div style={{ textAlign: "center", marginBottom: 36 }}>
                  <div style={{ fontSize: 12, letterSpacing: "0.25em", textTransform: "uppercase", color: "#8B6914", fontFamily: "'Crimson Pro', serif", marginBottom: 8 }}>Step 1</div>
                  <h2 style={{ fontSize: 28, fontWeight: 400 }}>Choose a Section</h2>
                  <p style={{ fontSize: 14, color: "#8B7D66", fontFamily: "'Crimson Pro', serif", marginTop: 6, fontWeight: 300 }}>Select where in the Seder your insight belongs</p>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(250px, 1fr))", gap: 12 }}>
                  {SECTIONS.map(s => {
                    const c = submissions.filter(x => x.section === s.num).length;
                    return (
                      <div key={s.num} className="sc" onClick={() => setSelectedSection(s.num)}
                        style={{ padding: "18px 20px", borderRadius: 12, background: "#FFFCF7", border: "1px solid rgba(139,105,20,0.1)", cursor: "pointer", display: "flex", alignItems: "center", gap: 14, boxShadow: "0 2px 8px rgba(139,105,20,0.04)" }}>
                        <div style={{ width: 44, height: 44, borderRadius: "50%", background: "linear-gradient(135deg, #FAF1DD, #F0E4C8)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, flexShrink: 0 }}>{s.icon}</div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
                            <span style={{ fontSize: 16, fontWeight: 600 }}>{s.en}</span>
                            <span style={{ fontSize: 15, color: "#8B6914", fontFamily: "'Frank Ruhl Libre', serif", direction: "rtl" }}>{s.he}</span>
                          </div>
                          <div style={{ fontSize: 12, color: "#9B8E78", marginTop: 2, fontFamily: "'Crimson Pro', serif", fontWeight: 300, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.desc}</div>
                        </div>
                        {c > 0 && <div style={{ width: 22, height: 22, borderRadius: "50%", background: "#8B6914", color: "#fff", fontSize: 11, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Crimson Pro', serif", fontWeight: 600, flexShrink: 0 }}>{c}</div>}
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : submitSuccess ? (
              <div className="fade-up" style={{ textAlign: "center", padding: "80px 0" }}>
                <div style={{ fontSize: 48, marginBottom: 16 }}>✨</div>
                <h2 style={{ fontSize: 28, fontWeight: 400 }}>!תודה רבה</h2>
                <p style={{ fontSize: 15, color: "#8B7D66", marginTop: 8, fontFamily: "'Crimson Pro', serif", fontWeight: 300 }}>Your dvar Torah has been submitted</p>
              </div>
            ) : (() => {
              const sec = SECTIONS.find(s => s.num === selectedSection);
              const ok = authorName.trim() && (inputMode === "text" ? dvarTorah.trim() : (uploadedContent && !parsing));
              return (
                <div>
                  <button onClick={() => setSelectedSection(null)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 13, color: "#8B6914", fontFamily: "'Crimson Pro', serif", marginBottom: 20 }}>← Back to sections</button>
                  <div style={{ background: "linear-gradient(135deg, #FAF1DD, #F0E4C8)", padding: "20px 24px", borderRadius: 14, marginBottom: 28, display: "flex", alignItems: "center", gap: 16 }}>
                    <div style={{ fontSize: 32 }}>{sec.icon}</div>
                    <div>
                      <div style={{ fontSize: 20, fontWeight: 600 }}>{sec.en} <span style={{ fontFamily: "'Frank Ruhl Libre', serif", fontSize: 18, color: "#8B6914" }}>{sec.he}</span></div>
                      <div style={{ fontSize: 13, color: "#6B5A3E", fontFamily: "'Crimson Pro', serif", fontWeight: 300, marginTop: 2 }}>{sec.desc}</div>
                    </div>
                  </div>

                  <div className="g2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
                    <div>
                      <label style={{ fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", color: "#8B7D66", fontFamily: "'Crimson Pro', serif", marginBottom: 6, display: "block" }}>Your Name *</label>
                      <input style={inp} value={authorName} onChange={e => setAuthorName(e.target.value)} placeholder="e.g. Sarah" />
                    </div>
                    <div>
                      <label style={{ fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", color: "#8B7D66", fontFamily: "'Crimson Pro', serif", marginBottom: 6, display: "block" }}>Title (optional)</label>
                      <input style={inp} value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Freedom's True Meaning" />
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: 4, marginBottom: 14, background: "rgba(139,105,20,0.06)", borderRadius: 10, padding: 4, width: "fit-content" }}>
                    {[["text","Write"],["upload","Upload File"]].map(([m,l]) => (
                      <button key={m} onClick={() => setInputMode(m)} style={{ padding: "8px 20px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 13, fontFamily: "'Crimson Pro', serif", fontWeight: 500,
                        background: inputMode===m ? "#FFFCF7":"transparent", color: inputMode===m ? "#2C2416":"#8B7D66",
                        boxShadow: inputMode===m ? "0 1px 4px rgba(0,0,0,0.06)":"none" }}>{l}</button>
                    ))}
                  </div>

                  {inputMode === "text" ? (
                    <textarea style={{ ...inp, minHeight: 220, resize: "vertical", lineHeight: 1.7 }}
                      value={dvarTorah} onChange={e => setDvarTorah(e.target.value)}
                      placeholder="Share your insight, story, or dvar Torah here..." />
                  ) : (
                    <div>
                      <div onClick={() => fileInputRef.current?.click()} style={{
                        border: "2px dashed rgba(139,105,20,0.2)", borderRadius: 14, padding: "48px 24px",
                        textAlign: "center", cursor: "pointer", background: uploadedFile ? "rgba(139,105,20,0.04)" : "transparent" }}>
                        <input type="file" ref={fileInputRef} onChange={handleFileUpload} accept=".doc,.docx,.pdf,.txt,.md" style={{ display: "none" }} />
                        {parsing ? (
                          <div>
                            <div style={{ width: 28, height: 28, border: "3px solid rgba(139,105,20,0.2)", borderTopColor: "#8B6914", borderRadius: "50%", animation: "spin .8s linear infinite", margin: "0 auto 12px" }} />
                            <div style={{ fontSize: 14, fontFamily: "'Crimson Pro', serif", color: "#6B5A3E" }}>Parsing document...</div>
                          </div>
                        ) : uploadedFile ? (
                          <div>
                            <div style={{ fontSize: 28, marginBottom: 8 }}>📄</div>
                            <div style={{ fontSize: 15, fontFamily: "'Crimson Pro', serif", fontWeight: 500 }}>{uploadedFile.name}</div>
                            <div style={{ fontSize: 12, color: "#8B7D66", marginTop: 4, fontFamily: "'Crimson Pro', serif" }}>Click to replace</div>
                          </div>
                        ) : (
                          <div>
                            <div style={{ fontSize: 28, marginBottom: 8 }}>📤</div>
                            <div style={{ fontSize: 15, fontFamily: "'Crimson Pro', serif", color: "#6B5A3E" }}>Click to upload a document</div>
                            <div style={{ fontSize: 12, color: "#9B8E78", marginTop: 4, fontFamily: "'Crimson Pro', serif" }}>.docx, .pdf, or .txt</div>
                          </div>
                        )}
                      </div>
                      {uploadedContent && !parsing && (
                        <div style={{ marginTop: 14, padding: "16px 20px", borderRadius: 12, background: "#FFFCF7", border: "1px solid rgba(139,105,20,0.1)" }}>
                          <div style={{ fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", color: "#8B6914", fontFamily: "'Crimson Pro', serif", marginBottom: 8 }}>Parsed Content Preview</div>
                          <div style={{ fontSize: 14, lineHeight: 1.65, color: "#4A4030", fontFamily: "'Crimson Pro', serif", fontWeight: 300, maxHeight: 200, overflow: "auto", whiteSpace: "pre-wrap" }}>{uploadedContent}</div>
                        </div>
                      )}
                    </div>
                  )}

                  <button onClick={handleSubmit} disabled={!ok||submitting} style={{
                    marginTop: 20, padding: "14px 44px", borderRadius: 28, width: "100%",
                    background: "#2C2416", color: "#FAF6F0", border: "none", fontSize: 15,
                    fontFamily: "'Crimson Pro', serif", fontWeight: 500, letterSpacing: "0.06em",
                    cursor: "pointer", opacity: (!ok||submitting) ? 0.4:1, boxShadow: "0 4px 20px rgba(44,36,22,0.15)" }}>
                    {submitting ? "Submitting..." : "Submit Dvar Torah"}
                  </button>
                </div>
              );
            })()}
          </div>
        )}

        {/* ═══ ADMIN ═══ */}
        {view === "admin" && (
          <div className="fade-up">
            {!adminAuthed ? (
              <div style={{ maxWidth: 380, margin: "60px auto", textAlign: "center" }}>
                <div style={{ fontSize: 32, marginBottom: 12 }}>🔐</div>
                <h2 style={{ fontSize: 24, fontWeight: 400, marginBottom: 20 }}>Admin Access</h2>
                <input type="password" style={{ ...inp, textAlign: "center", marginBottom: 14 }}
                  value={adminPassword} onChange={e => setAdminPassword(e.target.value)} placeholder="Enter password"
                  onKeyDown={e => { if(e.key==="Enter"&&adminPassword===ADMIN_PASSWORD) setAdminAuthed(true) }} />
                <p style={{ fontSize: 12, color: "#9B8E78", fontFamily: "'Crimson Pro', serif", marginBottom: 14 }}>Default password: <strong>seder</strong></p>
                <button onClick={() => { if(adminPassword===ADMIN_PASSWORD) setAdminAuthed(true); }}
                  style={{ padding: "12px 36px", borderRadius: 24, background: "#2C2416", color: "#FAF6F0", border: "none", fontSize: 14, fontFamily: "'Crimson Pro', serif", fontWeight: 500, cursor: "pointer" }}>Enter</button>
              </div>
            ) : (
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 28, flexWrap: "wrap", gap: 12 }}>
                  <h2 style={{ fontSize: 26, fontWeight: 400 }}>Admin Dashboard</h2>
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                    <button onClick={doExport} disabled={exporting}
                      style={{ padding: "10px 24px", borderRadius: 22, background: "#2C2416", color: "#FAF6F0", border: "none", fontSize: 13, fontFamily: "'Crimson Pro', serif", fontWeight: 500, cursor: "pointer", letterSpacing: "0.05em", opacity: exporting ? 0.5:1 }}>
                      {exporting ? "Exporting..." : "Export PDF 📄"}
                    </button>
                    <button onClick={() => setView("preview")}
                      style={{ padding: "10px 24px", borderRadius: 22, background: "#8B6914", color: "#fff", border: "none", fontSize: 13, fontFamily: "'Crimson Pro', serif", fontWeight: 500, cursor: "pointer", letterSpacing: "0.05em" }}>
                      Preview ✨
                    </button>
                  </div>
                </div>

                <div style={{ background: "rgba(139,105,20,0.04)", borderRadius: 10, padding: "12px 16px", marginBottom: 24, fontSize: 12, color: "#8B7D66", fontFamily: "'Crimson Pro', serif", display: "flex", gap: 20, flexWrap: "wrap", alignItems: "center" }}>
                  <span>↑↓ Reorder</span><span>✏️ Edit</span><span>× Delete</span>
                  <span style={{ marginLeft: "auto", color: "#9B8E78" }}>{submissions.length} total</span>
                </div>

                {SECTIONS.map(sec => {
                  const subs = submissions.filter(s => s.section === sec.num)
                    .sort((a,b) => (a.order??a.createdAt??0)-(b.order??b.createdAt??0));
                  if (!subs.length) return null;
                  return (
                    <div key={sec.num} style={{ marginBottom: 24 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                        <span style={{ fontSize: 18 }}>{sec.icon}</span>
                        <span style={{ fontSize: 16, fontWeight: 600 }}>{sec.en}</span>
                        <span style={{ fontSize: 14, color: "#8B6914", fontFamily: "'Frank Ruhl Libre', serif" }}>{sec.he}</span>
                        <span style={{ fontSize: 11, color: "#9B8E78", fontFamily: "'Crimson Pro', serif" }}>— {subs.length}</span>
                      </div>
                      {subs.map((sub, idx) => (
                        <div key={sub.id} style={{
                          background: editingId===sub.id ? "#FFF9EE":"#FFFCF7",
                          border: `1px solid ${editingId===sub.id ? "rgba(139,105,20,0.3)":"rgba(139,105,20,0.08)"}`,
                          borderRadius: 12, padding: "16px 20px", marginBottom: 8, marginLeft: 28, transition: "all .2s" }}>
                          {editingId === sub.id ? (
                            <div>
                              <div className="g2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
                                <input style={{ ...inp, fontSize: 13, padding: "8px 12px" }} value={editData.author} onChange={e => setEditData({...editData, author: e.target.value})} placeholder="Author" />
                                <input style={{ ...inp, fontSize: 13, padding: "8px 12px" }} value={editData.title} onChange={e => setEditData({...editData, title: e.target.value})} placeholder="Title" />
                              </div>
                              <textarea style={{ ...inp, fontSize: 13, minHeight: 120, lineHeight: 1.6, resize: "vertical" }}
                                value={editData.content} onChange={e => setEditData({...editData, content: e.target.value})} />
                              <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                                <button onClick={saveEdit} style={{ padding: "8px 20px", borderRadius: 18, background: "#2C2416", color: "#FAF6F0", border: "none", fontSize: 12, fontFamily: "'Crimson Pro', serif", fontWeight: 500, cursor: "pointer" }}>Save</button>
                                <button onClick={() => setEditingId(null)} style={{ padding: "8px 20px", borderRadius: 18, background: "transparent", color: "#8B7D66", border: "1px solid rgba(139,105,20,0.2)", fontSize: 12, fontFamily: "'Crimson Pro', serif", cursor: "pointer" }}>Cancel</button>
                              </div>
                            </div>
                          ) : (
                            <div>
                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                                <div>
                                  <span style={{ fontSize: 15, fontWeight: 600 }}>{sub.author}</span>
                                  {sub.title && <span style={{ fontSize: 14, color: "#6B5A3E", fontStyle: "italic", marginLeft: 10 }}>"{sub.title}"</span>}
                                  <div style={{ fontSize: 11, color: "#9B8E78", fontFamily: "'Crimson Pro', serif", marginTop: 2 }}>
                                    {sub.date}{sub.fileName ? ` · ${sub.fileName}` : ""}
                                  </div>
                                </div>
                                <div style={{ display: "flex", gap: 2, alignItems: "center", flexShrink: 0 }}>
                                  <button className="ab" disabled={idx===0} onClick={() => moveSub(sec.num,idx,idx-1)}
                                    style={{ background:"none", border:"none", cursor:idx===0?"default":"pointer", color:idx===0?"#DDD5C8":"#8B6914", fontSize:14, padding:"4px 6px", borderRadius:6 }}>↑</button>
                                  <button className="ab" disabled={idx===subs.length-1} onClick={() => moveSub(sec.num,idx,idx+1)}
                                    style={{ background:"none", border:"none", cursor:idx===subs.length-1?"default":"pointer", color:idx===subs.length-1?"#DDD5C8":"#8B6914", fontSize:14, padding:"4px 6px", borderRadius:6 }}>↓</button>
                                  <button className="ab" onClick={() => startEdit(sub)}
                                    style={{ background:"none", border:"none", cursor:"pointer", color:"#8B6914", fontSize:13, padding:"4px 6px", borderRadius:6 }}>✏️</button>
                                  <button className="ab" onClick={() => deleteSub(sub.id)}
                                    style={{ background:"none", border:"none", cursor:"pointer", color:"#C0A080", fontSize:18, padding:"4px 6px", borderRadius:6 }}>×</button>
                                </div>
                              </div>
                              <div style={{ fontSize: 14, lineHeight: 1.65, color: "#4A4030", fontFamily: "'Crimson Pro', serif", fontWeight: 300, maxHeight: 100, overflow: "hidden",
                                maskImage: "linear-gradient(to bottom, black 60%, transparent)", WebkitMaskImage: "linear-gradient(to bottom, black 60%, transparent)" }}>{sub.content}</div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  );
                })}
                {!submissions.length && (
                  <div style={{ textAlign: "center", padding: "60px 0", color: "#9B8E78", fontFamily: "'Crimson Pro', serif", fontSize: 15 }}>
                    No submissions yet. Share the link with your family!
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ═══ PREVIEW ═══ */}
        {view === "preview" && (
          <div className="fade-up">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
              <button onClick={() => setView("admin")} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 13, color: "#8B6914", fontFamily: "'Crimson Pro', serif" }}>← Back to Admin</button>
              <button onClick={doExport} disabled={exporting} style={{ padding: "10px 24px", borderRadius: 22, background: "#2C2416", color: "#FAF6F0", border: "none", fontSize: 13, fontFamily: "'Crimson Pro', serif", fontWeight: 500, cursor: "pointer", opacity: exporting?0.5:1 }}>
                {exporting ? "Exporting..." : "Export PDF 📄"}
              </button>
            </div>

            <div style={{ textAlign: "center", padding: "56px 24px 48px", background: "linear-gradient(170deg, #FFFDF8, #F8F0E0)", border: "1px solid rgba(139,105,20,0.12)", borderRadius: 18, marginBottom: 36, boxShadow: "0 8px 40px rgba(139,105,20,0.08)", position: "relative", overflow: "hidden" }}>
              <div style={{ position: "absolute", top: 16, left: 16, right: 16, bottom: 16, border: "1px solid rgba(139,105,20,0.1)", borderRadius: 10, pointerEvents: "none" }} />
              <div style={{ fontSize: 38, color: "#8B6914", fontFamily: "'Frank Ruhl Libre', serif", marginBottom: 8, direction: "rtl" }}>הַגָּדָה שֶׁל פֶּסַח</div>
              <div style={{ width: 80, height: 1, margin: "16px auto", background: "linear-gradient(90deg, transparent, #C4943D, transparent)" }} />
              <h1 style={{ fontSize: 36, fontWeight: 400, color: "#2C2416", marginBottom: 4 }}>The {familyName} Haggadah</h1>
              <div style={{ fontSize: 16, color: "#8B6914", fontFamily: "'Crimson Pro', serif", fontWeight: 300, fontStyle: "italic" }}>Passover {year}</div>
            </div>

            {SECTIONS.map(sec => {
              const subs = submissions.filter(s => s.section === sec.num)
                .sort((a,b) => (a.order??a.createdAt??0)-(b.order??b.createdAt??0));
              return (
                <div key={sec.num} style={{ marginBottom: 40 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 16, paddingBottom: 12, borderBottom: "1px solid rgba(139,105,20,0.1)" }}>
                    <div style={{ width: 36, height: 36, borderRadius: "50%", background: "linear-gradient(135deg, #F0E4C8, #E8D8B8)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>{sec.icon}</div>
                    <div>
                      <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
                        <span style={{ fontSize: 22, fontWeight: 500 }}>{sec.num}. {sec.en}</span>
                        <span style={{ fontSize: 20, color: "#8B6914", fontFamily: "'Frank Ruhl Libre', serif", direction: "rtl" }}>{sec.he}</span>
                      </div>
                      <div style={{ fontSize: 13, color: "#8B7D66", fontFamily: "'Crimson Pro', serif", fontWeight: 300 }}>{sec.desc}</div>
                    </div>
                  </div>
                  {subs.length > 0 ? subs.map((sub, i) => (
                    <div key={sub.id} style={{ marginLeft: 50, marginBottom: i<subs.length-1?20:0, paddingBottom: i<subs.length-1?20:0, borderBottom: i<subs.length-1?"1px dashed rgba(139,105,20,0.1)":"none" }}>
                      {sub.title && <div style={{ fontSize: 18, fontStyle: "italic", fontWeight: 500, color: "#2C2416", marginBottom: 6 }}>{sub.title}</div>}
                      <div style={{ fontSize: 15, lineHeight: 1.8, color: "#3D3525", fontFamily: "'Crimson Pro', serif", fontWeight: 300, whiteSpace: "pre-wrap" }}>{sub.content}</div>
                      <div style={{ fontSize: 13, color: "#8B6914", marginTop: 10, fontStyle: "italic", fontWeight: 500 }}>— {sub.author}</div>
                    </div>
                  )) : (
                    <div style={{ marginLeft: 50, fontSize: 14, color: "#BDB3A0", fontFamily: "'Crimson Pro', serif", fontStyle: "italic" }}>No submissions yet for this section</div>
                  )}
                </div>
              );
            })}

            <div style={{ textAlign: "center", padding: "40px 24px", borderTop: "1px solid rgba(139,105,20,0.12)", marginTop: 20 }}>
              <div style={{ fontSize: 28, color: "#8B6914", fontFamily: "'Frank Ruhl Libre', serif", direction: "rtl" }}>לְשָׁנָה הַבָּאָה בִּירוּשָׁלָיִם</div>
              <div style={{ fontSize: 15, color: "#6B5A3E", marginTop: 8, fontStyle: "italic" }}>Next year in Jerusalem</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
