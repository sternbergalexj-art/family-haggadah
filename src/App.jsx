import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import TextAlign from "@tiptap/extension-text-align";
import ImageExt from "@tiptap/extension-image";
import Placeholder from "@tiptap/extension-placeholder";
import {
  subscribeToSubmissions, addSubmission, removeSubmission,
  updateSubmission, updateSubmissionOrder, uploadFile,
  savePdfSettings, loadPdfSettings
} from "./firebase.js";

const SECTIONS = [
  { num: 0, en: "Introduction", he: "הקדמה", desc: "Welcome and opening words", icon: "📜" },
  { num: -1, en: "General Thoughts", he: "מחשבות כלליות", desc: "Reflections on Passover and freedom", icon: "💭" },
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
  { num: 99, en: "Miscellaneous", he: "שונות", desc: "Recipes, poems, stories, and more", icon: "📝" },
];

const HAGGADOT = [
  { id: "ottensoser", name: "Ottensoser Family" },
  { id: "siegel", name: "Siegel Family" },
];

const ADMIN_PASSWORD = "seder";

const DEFAULT_PDF_SETTINGS = {
  fontFamily: "'Crimson Pro', 'David Libre', serif",
  headingFont: "'Cormorant Garamond', 'Frank Ruhl Libre', serif",
  fontSize: 15,
  headingSize: 26,
  lineHeight: 1.85,
  accentColor: "#8B6914",
  textColor: "#2C2416",
  bgColor: "#FFFDF8",
  sectionBg: "#FAF1DD",
  coverImage: "",
  sectionImages: {},
  pageMargin: 60,
  contentWidth: 680,
  showSectionIcons: true,
  coverSubtitle: "",
};

// ─── Rich Text Editor ───

function RichEditor({ content, onChange, placeholder: ph }) {
  const imgRef = useRef(null);
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3] } }),
      Underline,
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      ImageExt.configure({ inline: false, allowBase64: true }),
      Placeholder.configure({ placeholder: ph || "Start writing..." }),
    ],
    content: content || "",
    onUpdate: ({ editor: e }) => onChange(e.getHTML()),
    editorProps: {
      handlePaste: (view, event) => {
        const items = event.clipboardData?.items;
        if (items) for (const item of items) {
          if (item.type.startsWith("image/")) {
            event.preventDefault();
            const file = item.getAsFile();
            if (file) insertImg(file);
            return true;
          }
        }
        return false;
      },
      handleDrop: (view, event) => {
        const files = event.dataTransfer?.files;
        if (files?.length) for (const file of files) {
          if (file.type.startsWith("image/")) {
            event.preventDefault(); insertImg(file); return true;
          }
        }
        return false;
      },
    },
  });

  const insertImg = useCallback((file) => {
    const r = new FileReader();
    r.onload = (e) => editor?.chain().focus().setImage({ src: e.target.result }).run();
    r.readAsDataURL(file);
  }, [editor]);

  if (!editor) return null;

  const B = ({ onClick, active, children, title: t }) => (
    <button onClick={onClick} title={t} style={{
      padding: "6px 10px", borderRadius: 6, border: "none", cursor: "pointer",
      fontSize: 13, fontWeight: active ? 700 : 400, lineHeight: 1, minWidth: 30,
      background: active ? "rgba(139,105,20,0.15)" : "transparent",
      color: active ? "#8B6914" : "#6B5A3E", transition: "all .15s",
    }}>{children}</button>
  );
  const Sep = () => <div style={{ width: 1, height: 20, background: "rgba(139,105,20,0.12)", margin: "0 2px" }} />;

  return (
    <div style={{ border: "1px solid rgba(139,105,20,0.18)", borderRadius: 12, background: "#FFFCF7", overflow: "hidden" }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 2, padding: "8px 10px", borderBottom: "1px solid rgba(139,105,20,0.1)", background: "rgba(139,105,20,0.02)", alignItems: "center" }}>
        <B onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive("bold")} title="Bold">B</B>
        <B onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive("italic")} title="Italic"><em>I</em></B>
        <B onClick={() => editor.chain().focus().toggleUnderline().run()} active={editor.isActive("underline")} title="Underline"><u>U</u></B>
        <Sep />
        <B onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} active={editor.isActive("heading", { level: 2 })} title="Heading">H</B>
        <B onClick={() => editor.chain().focus().toggleBlockquote().run()} active={editor.isActive("blockquote")} title="Quote">❝</B>
        <Sep />
        <B onClick={() => editor.chain().focus().toggleBulletList().run()} active={editor.isActive("bulletList")} title="Bullets">•</B>
        <B onClick={() => editor.chain().focus().toggleOrderedList().run()} active={editor.isActive("orderedList")} title="Numbers">1.</B>
        <Sep />
        <B onClick={() => editor.chain().focus().setTextAlign("left").run()} active={editor.isActive({ textAlign: "left" })} title="Left">⇤</B>
        <B onClick={() => editor.chain().focus().setTextAlign("center").run()} active={editor.isActive({ textAlign: "center" })} title="Center">⇔</B>
        <B onClick={() => editor.chain().focus().setTextAlign("right").run()} active={editor.isActive({ textAlign: "right" })} title="Right / Hebrew">⇥</B>
        <Sep />
        <B onClick={() => imgRef.current?.click()} title="Image">🖼️</B>
        <input type="file" ref={imgRef} accept="image/*" onChange={(e) => { if (e.target.files?.[0]) insertImg(e.target.files[0]); e.target.value = ""; }} style={{ display: "none" }} />
        <B onClick={() => editor.chain().focus().setHorizontalRule().run()} title="Divider">―</B>
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}

function MiniEditor({ content, onChange }) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3] } }),
      Underline, TextAlign.configure({ types: ["heading", "paragraph"] }),
      ImageExt.configure({ inline: false, allowBase64: true }),
    ],
    content: content || "",
    onUpdate: ({ editor: e }) => onChange(e.getHTML()),
  });
  if (!editor) return null;
  const B = ({ onClick, active, children }) => (
    <button onClick={onClick} style={{ padding: "4px 8px", borderRadius: 4, border: "none", cursor: "pointer", fontSize: 12, background: active ? "rgba(139,105,20,0.15)" : "transparent", color: active ? "#8B6914" : "#6B5A3E", lineHeight: 1 }}>{children}</button>
  );
  return (
    <div style={{ border: "1px solid rgba(139,105,20,0.18)", borderRadius: 10, background: "#FFFCF7", overflow: "hidden" }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 2, padding: "6px 8px", borderBottom: "1px solid rgba(139,105,20,0.1)", background: "rgba(139,105,20,0.02)" }}>
        <B onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive("bold")}>B</B>
        <B onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive("italic")}><em>I</em></B>
        <B onClick={() => editor.chain().focus().setTextAlign("left").run()} active={editor.isActive({ textAlign: "left" })}>⇤</B>
        <B onClick={() => editor.chain().focus().setTextAlign("right").run()} active={editor.isActive({ textAlign: "right" })}>⇥</B>
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}

// ─── PDF Export via browser print (supports Hebrew) ───

function generatePrintHTML(submissions, familyName, year, settings) {
  const s = { ...DEFAULT_PDF_SETTINGS, ...settings };
  const sectionHTML = SECTIONS.map(sec => {
    const subs = submissions.filter(x => x.section === sec.num)
      .sort((a, b) => (a.order ?? a.createdAt ?? 0) - (b.order ?? b.createdAt ?? 0));
    const secImg = s.sectionImages?.[sec.num];
    return `
      <div class="section" style="page-break-before:always">
        ${secImg ? `<img src="${secImg}" class="section-img" />` : ""}
        <div class="section-header">
          ${s.showSectionIcons ? `<span class="sec-icon">${sec.icon}</span>` : ""}
          <div>
            <span class="sec-en">${sec.num > 0 && sec.num < 99 ? sec.num + ". " : ""}${sec.en}</span>
            <span class="sec-he">${sec.he}</span>
            <div class="sec-desc">${sec.desc}</div>
          </div>
        </div>
        ${subs.length ? subs.map((sub, i) => `
          <div class="submission${i < subs.length - 1 ? " with-border" : ""}">
            ${sub.title ? `<div class="sub-title">${sub.title}</div>` : ""}
            <div class="sub-content">${sub.content}</div>
            <div class="sub-author">— ${sub.author}</div>
          </div>
        `).join("") : `<div class="no-subs">No submissions for this section</div>`}
      </div>
    `;
  }).join("");

  return `<!DOCTYPE html>
<html lang="en" dir="auto">
<head>
<meta charset="UTF-8">
<title>${familyName} Haggadah ${year}</title>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;0,600;0,700;1,400&family=Frank+Ruhl+Libre:wght@0,300;0,400;0,500;0,700&family=Crimson+Pro:ital,wght@0,300;0,400;0,500;1,300;1,400&family=David+Libre:wght@400;500;700&display=swap" rel="stylesheet">
<style>
  @page { size: letter; margin: ${s.pageMargin}px; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: ${s.fontFamily}; font-size: ${s.fontSize}px; line-height: ${s.lineHeight}; color: ${s.textColor}; background: ${s.bgColor}; max-width: ${s.contentWidth}px; margin: 0 auto; }

  /* Cover */
  .cover { text-align: center; page-break-after: always; padding: 120px 40px 80px; position: relative; }
  .cover-border { position: absolute; top: 24px; left: 24px; right: 24px; bottom: 24px; border: 1.5px solid ${s.accentColor}; opacity: 0.4; }
  .cover-border-inner { position: absolute; top: 30px; left: 30px; right: 30px; bottom: 30px; border: 0.5px solid ${s.accentColor}; opacity: 0.3; }
  .cover-img { max-width: 300px; max-height: 200px; margin: 0 auto 30px; border-radius: 12px; }
  .cover-he { font-family: 'Frank Ruhl Libre', serif; font-size: 32px; color: ${s.accentColor}; direction: rtl; margin-bottom: 12px; }
  .cover-line { width: 80px; height: 1px; background: ${s.accentColor}; margin: 20px auto; opacity: 0.6; }
  .cover-title { font-family: ${s.headingFont}; font-size: 42px; font-weight: 400; margin-bottom: 8px; }
  .cover-subtitle { font-size: 16px; color: ${s.accentColor}; font-style: italic; margin-top: 8px; }
  .cover-year { font-size: 18px; color: ${s.accentColor}; font-style: italic; margin-top: 4px; }

  /* Sections */
  .section { padding: 20px 0; }
  .section-img { max-width: 100%; max-height: 250px; border-radius: 10px; margin-bottom: 20px; display: block; }
  .section-header { display: flex; align-items: center; gap: 14px; padding-bottom: 14px; border-bottom: 1px solid ${s.accentColor}33; margin-bottom: 20px; }
  .sec-icon { font-size: 24px; }
  .sec-en { font-family: ${s.headingFont}; font-size: ${s.headingSize}px; font-weight: 500; }
  .sec-he { font-family: 'Frank Ruhl Libre', serif; font-size: ${s.headingSize - 4}px; color: ${s.accentColor}; margin-left: 12px; direction: rtl; }
  .sec-desc { font-size: 13px; color: ${s.textColor}88; margin-top: 2px; }

  /* Submissions */
  .submission { margin-left: 20px; margin-bottom: 16px; padding-bottom: 16px; }
  .submission.with-border { border-bottom: 1px dashed ${s.accentColor}22; }
  .sub-title { font-family: ${s.headingFont}; font-size: 19px; font-style: italic; font-weight: 500; margin-bottom: 6px; }
  .sub-content { line-height: ${s.lineHeight}; }
  .sub-content p { margin-bottom: 0.5em; }
  .sub-content h2 { font-family: ${s.headingFont}; font-size: 20px; font-weight: 600; margin: 0.8em 0 0.4em; }
  .sub-content h3 { font-family: ${s.headingFont}; font-size: 17px; font-weight: 600; margin: 0.6em 0 0.3em; }
  .sub-content blockquote { border-right: 3px solid ${s.accentColor}; border-left: 3px solid ${s.accentColor}; padding: 8px 20px; margin: 12px 0; background: ${s.accentColor}08; font-style: italic; }
  .sub-content ul, .sub-content ol { padding-left: 24px; margin: 8px 0; }
  .sub-content img { max-width: 100%; height: auto; border-radius: 8px; margin: 12px 0; }
  .sub-content hr { border: none; border-top: 1px solid ${s.accentColor}22; margin: 16px 0; }
  .sub-author { font-size: 13px; color: ${s.accentColor}; font-style: italic; font-weight: 500; margin-top: 10px; }
  .no-subs { font-size: 14px; color: #BBB; font-style: italic; margin-left: 20px; }

  /* Closing */
  .closing { text-align: center; padding: 100px 40px; page-break-before: always; }
  .closing-he { font-family: 'Frank Ruhl Libre', serif; font-size: 28px; color: ${s.accentColor}; direction: rtl; }
  .closing-en { font-size: 15px; color: ${s.textColor}88; margin-top: 10px; font-style: italic; }

  @media print {
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
</style>
</head>
<body>
  <div class="cover">
    <div class="cover-border"></div>
    <div class="cover-border-inner"></div>
    ${s.coverImage ? `<img src="${s.coverImage}" class="cover-img" />` : ""}
    <div class="cover-he">הַגָּדָה שֶׁל פֶּסַח</div>
    <div class="cover-line"></div>
    <div class="cover-title">The ${familyName} Haggadah</div>
    ${s.coverSubtitle ? `<div class="cover-subtitle">${s.coverSubtitle}</div>` : ""}
    <div class="cover-year">Passover ${year}</div>
  </div>
  ${sectionHTML}
  <div class="closing">
    <div class="cover-line" style="margin-bottom:30px"></div>
    <div class="closing-he">לְשָׁנָה הַבָּאָה בִּירוּשָׁלָיִם</div>
    <div class="closing-en">Next year in Jerusalem</div>
  </div>
</body>
</html>`;
}

function exportHaggadah(submissions, familyName, year, settings) {
  const html = generatePrintHTML(submissions, familyName, year, settings);
  const win = window.open("", "_blank");
  win.document.write(html);
  win.document.close();
  setTimeout(() => { win.print(); }, 800);
}

// ─── File parsing ───

async function loadScript(src) {
  if (document.querySelector(`script[src="${src}"]`)) return;
  return new Promise((r, j) => { const s = document.createElement("script"); s.src = src; s.onload = r; s.onerror = j; document.head.appendChild(s); });
}

async function parsePDF(file) {
  await loadScript("https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js");
  window.pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
  const pdf = await window.pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
  let t = "";
  for (let i = 1; i <= pdf.numPages; i++) {
    const c = await (await pdf.getPage(i)).getTextContent();
    t += c.items.map(x => x.str).join(" ") + "\n\n";
  }
  return t.trim();
}

async function parseDOCX(file) {
  await loadScript("https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js");
  const r = await window.mammoth.convertToHtml({ arrayBuffer: await file.arrayBuffer() });
  return r.value;
}

async function parseFile(file) {
  const n = file.name.toLowerCase();
  if (n.endsWith(".pdf")) return await parsePDF(file);
  if (n.endsWith(".docx") || n.endsWith(".doc")) return await parseDOCX(file);
  const text = await file.text();
  return `<p>${text.replace(/\n\n/g, "</p><p>").replace(/\n/g, "<br>")}</p>`;
}

// ═══════════════════════════════════════
export default function App() {
  const [view, setView] = useState("home");
  const [selectedSection, setSelectedSection] = useState(null);
  const [allSubmissions, setAllSubmissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [richContent, setRichContent] = useState("");
  const [title, setTitle] = useState("");
  const [uploadedFile, setUploadedFile] = useState(null);
  const [uploadedContent, setUploadedContent] = useState("");
  const [inputMode, setInputMode] = useState("text");
  const [parsing, setParsing] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [adminPassword, setAdminPassword] = useState("");
  const [adminAuthed, setAdminAuthed] = useState(false);
  const [selectedHaggadot, setSelectedHaggadot] = useState([]);
  const [adminFilter, setAdminFilter] = useState("all");
  const [editingId, setEditingId] = useState(null);
  const [editData, setEditData] = useState({});
  const [exporting, setExporting] = useState(false);
  const [pdfSettings, setPdfSettings] = useState(DEFAULT_PDF_SETTINGS);
  const [showPdfSettings, setShowPdfSettings] = useState(false);
  const fileInputRef = useRef(null);
  const year = "5786";

  const submissions = adminFilter === "all"
    ? allSubmissions
    : allSubmissions.filter(s => s.haggadot?.includes(adminFilter));

  useEffect(() => {
    const unsub = subscribeToSubmissions(subs => { setAllSubmissions(subs); setLoading(false); });
    return () => unsub();
  }, []);

  useEffect(() => {
    loadPdfSettings().then(s => { if (s) setPdfSettings(prev => ({ ...prev, ...s })); }).catch(() => {});
  }, []);

  const toggleHaggadah = useCallback((id) => {
    setSelectedHaggadot(prev => prev.includes(id) ? prev.filter(h => h !== id) : [...prev, id]);
  }, []);

  const handleFileUpload = useCallback(async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploadedFile(file);
    setParsing(true);
    try { setUploadedContent(await parseFile(file)); }
    catch (err) {
      console.error(err);
      try { const t = await file.text(); setUploadedContent(`<p>${t.replace(/\n/g, "<br>")}</p>`); }
      catch { setUploadedContent("<p>[Could not parse file]</p>"); }
    }
    setParsing(false);
  }, []);

  const handleSubmit = useCallback(async () => {
    const content = inputMode === "text" ? richContent : uploadedContent;
    const authorName = `${firstName.trim()} ${lastName.trim()}`;
    if (!firstName.trim() || !lastName.trim() || !title.trim() || !content || content === "<p></p>" || !selectedSection === null || !selectedHaggadot.length) return;
    setSubmitting(true); setSubmitError(null);
    try {
      let fileUrl = null;
      if (uploadedFile && inputMode === "upload") {
        const path = `uploads/${Date.now()}_${uploadedFile.name}`;
        fileUrl = await uploadFile(uploadedFile, path);
      }
      await addSubmission({
        section: selectedSection, author: authorName, title: title.trim(),
        content, date: new Date().toLocaleDateString(),
        haggadot: selectedHaggadot,
        order: allSubmissions.filter(s => s.section === selectedSection).length,
        fileName: uploadedFile?.name || null,
        fileUrl: fileUrl,
      });
      setSubmitSuccess(true);
      setTimeout(() => {
        setSubmitSuccess(false); setSelectedSection(null);
        setRichContent(""); setTitle(""); setSelectedHaggadot([]);
        setUploadedFile(null); setUploadedContent("");
        setView("home");
      }, 2500);
    } catch (err) {
      console.error(err);
      setSubmitError("Error: " + err.message);
    }
    setSubmitting(false);
  }, [inputMode, richContent, uploadedContent, firstName, lastName, title, selectedSection, selectedHaggadot, allSubmissions, uploadedFile]);

  const deleteSub = useCallback(async (id) => {
    if (!confirm("Delete this submission?")) return;
    try { await removeSubmission(id); } catch (e) { console.error(e); }
  }, []);

  const startEdit = useCallback((sub) => {
    setEditingId(sub.id); setEditData({ author: sub.author, title: sub.title || "", content: sub.content });
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

  const doExport = useCallback(async (familyId) => {
    const fam = HAGGADOT.find(h => h.id === familyId);
    const filtered = allSubmissions.filter(s => s.haggadot?.includes(familyId));
    exportHaggadah(filtered, fam.name, year, pdfSettings);
  }, [allSubmissions, year, pdfSettings]);

  const handleSavePdfSettings = useCallback(async () => {
    try { await savePdfSettings(pdfSettings); alert("Settings saved!"); }
    catch (e) { console.error(e); }
  }, [pdfSettings]);

  const handleCoverImage = useCallback((e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const r = new FileReader();
    r.onload = (ev) => setPdfSettings(prev => ({ ...prev, coverImage: ev.target.result }));
    r.readAsDataURL(file);
  }, []);

  const handleSectionImage = useCallback((secNum, e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const r = new FileReader();
    r.onload = (ev) => setPdfSettings(prev => ({
      ...prev, sectionImages: { ...prev.sectionImages, [secNum]: ev.target.result }
    }));
    r.readAsDataURL(file);
  }, []);

  const getHaggadahLabel = (sub) => {
    if (!sub.haggadot?.length) return "";
    if (sub.haggadot.length === 2) return "Both";
    return HAGGADOT.find(x => x.id === sub.haggadot[0])?.name || "";
  };

  const TOTAL_SECTIONS = SECTIONS.length; // always 18 (15 + intro + general + misc)

  const css = `
    @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;0,600;0,700;1,400;1,500&family=Frank+Ruhl+Libre:wght@0,300;0,400;0,500;0,700&family=Crimson+Pro:ital,wght@0,300;0,400;0,500;1,300;1,400&family=David+Libre:wght@400;500;700&display=swap');
    *{box-sizing:border-box;margin:0;padding:0}
    body{background:#FAF6F0}
    ::selection{background:rgba(139,105,20,0.2)}
    input:focus,textarea:focus{outline:none;border-color:#8B6914!important}
    @keyframes fadeUp{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}
    @keyframes spin{to{transform:rotate(360deg)}}
    .fade-up{animation:fadeUp .5s ease forwards}
    .sc:hover{transform:translateY(-3px);box-shadow:0 8px 30px rgba(139,105,20,0.12)!important}
    .sc{transition:all .3s ease;cursor:pointer}
    .nb:hover{background:rgba(44,36,22,0.06)!important}
    .ab:hover{background:rgba(139,105,20,0.1)!important}
    .hag-chip{transition:all .2s ease;cursor:pointer;user-select:none}
    .hag-chip:hover{transform:translateY(-1px)}
    @media(max-width:600px){.g2{grid-template-columns:1fr!important}.sr{gap:24px!important}}
    .ProseMirror{padding:16px 20px;min-height:220px;outline:none;font-family:'Crimson Pro','David Libre',serif;font-size:15px;line-height:1.75;color:#2C2416}
    .ProseMirror p.is-editor-empty:first-child::before{content:attr(data-placeholder);float:left;color:#BDB3A0;pointer-events:none;height:0;font-style:italic}
    .ProseMirror p{margin-bottom:0.5em}
    .ProseMirror h2{font-family:'Cormorant Garamond',serif;font-size:22px;font-weight:600;margin:0.8em 0 0.4em}
    .ProseMirror h3{font-family:'Cormorant Garamond',serif;font-size:18px;font-weight:600;margin:0.6em 0 0.3em}
    .ProseMirror blockquote{border-right:3px solid #C4943D;border-left:3px solid #C4943D;padding:8px 20px;margin:12px 0;background:rgba(139,105,20,0.03);font-style:italic;color:#6B5A3E}
    .ProseMirror ul,.ProseMirror ol{padding-left:24px;margin:8px 0}
    .ProseMirror img{max-width:100%;height:auto;border-radius:8px;margin:12px 0;display:block}
    .ProseMirror hr{border:none;border-top:1px solid rgba(139,105,20,0.15);margin:16px 0}
    .rich-content p{margin-bottom:0.5em}
    .rich-content h2{font-family:'Cormorant Garamond',serif;font-size:20px;font-weight:600;margin:0.6em 0 0.3em}
    .rich-content blockquote{border-right:3px solid #C4943D;border-left:3px solid #C4943D;padding:6px 16px;margin:8px 0;background:rgba(139,105,20,0.03);font-style:italic;color:#6B5A3E}
    .rich-content ul,.rich-content ol{padding-left:24px;margin:6px 0}
    .rich-content img{max-width:100%;height:auto;border-radius:8px;margin:8px 0;display:block}
    .rich-content hr{border:none;border-top:1px solid rgba(139,105,20,0.12);margin:12px 0}
    .settings-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}
    .settings-group{margin-bottom:20px}
    .settings-label{font-size:11px;letter-spacing:0.1em;text-transform:uppercase;color:#8B7D66;font-family:'Crimson Pro',serif;margin-bottom:6px;display:block}
    .settings-input{width:100%;padding:8px 12px;border-radius:8px;border:1px solid rgba(139,105,20,0.18);background:#FFFCF7;font-size:13px;font-family:'Crimson Pro',serif;color:#2C2416}
    .color-row{display:flex;align-items:center;gap:8px}
    .color-swatch{width:32px;height:32px;border-radius:8px;border:1px solid rgba(0,0,0,0.1);cursor:pointer}
    .color-swatch input{opacity:0;width:32px;height:32px;cursor:pointer}
  `;

  const inp = {
    width: "100%", padding: "12px 16px", borderRadius: 10,
    border: "1px solid rgba(139,105,20,0.18)", background: "#FFFCF7",
    fontSize: 15, fontFamily: "'Crimson Pro', serif", color: "#2C2416",
  };

  if (loading) return (
    <div style={{ fontFamily: "'Cormorant Garamond', serif", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#FAF6F0" }}>
      <style>{css}</style>
      <div style={{ textAlign: "center", color: "#8B6914" }}>
        <div style={{ width: 32, height: 32, border: "3px solid rgba(139,105,20,0.2)", borderTopColor: "#8B6914", borderRadius: "50%", animation: "spin .8s linear infinite", margin: "0 auto 16px" }} />
        <div style={{ fontSize: 15, fontFamily: "'Crimson Pro', serif", fontWeight: 300 }}>Loading Haggadah...</div>
      </div>
    </div>
  );

  return (
    <div style={{ fontFamily: "'Cormorant Garamond', serif", minHeight: "100vh", background: "linear-gradient(170deg, #FAF6F0 0%, #F3EDE4 40%, #EDE5D8 100%)", color: "#2C2416" }}>
      <style>{css}</style>
      <div style={{ height: 4, background: "linear-gradient(90deg, transparent, #8B6914, #C4943D, #8B6914, transparent)" }} />

      <nav style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 28px", borderBottom: "1px solid rgba(139,105,20,0.12)", flexWrap: "wrap", gap: 8 }}>
        <div onClick={() => setView("home")} style={{ fontSize: 15, letterSpacing: "0.15em", textTransform: "uppercase", color: "#8B6914", fontWeight: 600, fontFamily: "'Crimson Pro', serif", cursor: "pointer" }}>✡ Family Haggadah</div>
        <div style={{ display: "flex", gap: 6 }}>
          {[["home","Home"],["submit","Add Dvar Torah"],["admin","Admin"]].map(([v,l]) => (
            <button key={v} className="nb" onClick={() => { if(v==="submit"){ setSelectedSection(null); setSelectedHaggadot([]); setRichContent(""); setUploadedFile(null); setUploadedContent(""); } setView(v); }}
              style={{ padding:"7px 16px", borderRadius:20, border:"none", cursor:"pointer", fontSize:13, fontFamily:"'Crimson Pro', serif", fontWeight:500, letterSpacing:"0.05em", transition:"all .25s",
                background: (view===v||(v==="admin"&&view==="preview")) ? "#2C2416":"transparent",
                color: (view===v||(v==="admin"&&view==="preview")) ? "#FAF6F0":"#6B5A3E" }}>{l}</button>
          ))}
        </div>
      </nav>

      <div style={{ maxWidth: 860, margin: "0 auto", padding: "32px 20px 60px" }}>

        {/* HOME */}
        {view === "home" && (
          <div className="fade-up" style={{ textAlign: "center", paddingTop: 40 }}>
            <div style={{ fontSize: 13, letterSpacing: "0.3em", textTransform: "uppercase", color: "#8B6914", fontFamily: "'Crimson Pro', serif", fontWeight: 500, marginBottom: 16 }}>Passover {year}</div>
            <h1 style={{ fontSize: "clamp(36px, 6vw, 52px)", fontWeight: 300, lineHeight: 1.15, marginBottom: 12 }}>Family Haggadah</h1>
            <div style={{ display: "flex", justifyContent: "center", gap: 16, marginBottom: 40, flexWrap: "wrap" }}>
              {HAGGADOT.map(h => <span key={h.id} style={{ fontSize: 14, color: "#6B5A3E", fontFamily: "'Crimson Pro', serif", fontStyle: "italic", fontWeight: 300 }}>{h.name}</span>)}
            </div>
            <div style={{ width: 120, height: 1, margin: "0 auto 40px", background: "linear-gradient(90deg, transparent, #C4943D, transparent)" }} />
            <p style={{ fontSize: 17, lineHeight: 1.7, color: "#5A4E3A", maxWidth: 520, margin: "0 auto 48px", fontFamily: "'Crimson Pro', serif", fontWeight: 300 }}>
              A collection of divrei Torah and insights from our families, woven together to enrich our Seder tables. Each voice adds meaning to our shared story of freedom.
            </p>
            <div className="sr" style={{ display: "flex", justifyContent: "center", gap: 48, marginBottom: 48 }}>
              {[[allSubmissions.length,"Total Submissions"],[TOTAL_SECTIONS,"Sections"]].map(([v,l],i) => (
                <div key={i} style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 32, fontWeight: 300, color: "#8B6914" }}>{v}</div>
                  <div style={{ fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", color: "#9B8E78", fontFamily: "'Crimson Pro', serif" }}>{l}</div>
                </div>
              ))}
            </div>
            <button onClick={() => { setSelectedSection(null); setSelectedHaggadot([]); setRichContent(""); setUploadedFile(null); setUploadedContent(""); setView("submit"); }}
              style={{ padding: "14px 44px", borderRadius: 28, background: "#2C2416", color: "#FAF6F0", border: "none", fontSize: 15, fontFamily: "'Crimson Pro', serif", fontWeight: 500, letterSpacing: "0.08em", cursor: "pointer", boxShadow: "0 4px 20px rgba(44,36,22,0.2)" }}>
              Add Your Dvar Torah
            </button>
          </div>
        )}

        {/* SUBMIT */}
        {view === "submit" && (
          <div className="fade-up">
            {submitSuccess ? (
              <div className="fade-up" style={{ textAlign: "center", padding: "80px 0" }}>
                <div style={{ fontSize: 48, marginBottom: 16 }}>✨</div>
                <h2 style={{ fontSize: 28, fontWeight: 400 }}>!תודה רבה</h2>
                <p style={{ fontSize: 15, color: "#8B7D66", marginTop: 8, fontFamily: "'Crimson Pro', serif", fontWeight: 300 }}>Your dvar Torah has been submitted</p>
              </div>
            ) : !selectedSection && selectedSection !== 0 && selectedSection !== -1 && selectedSection !== 99 ? (
              <div>
                <div style={{ textAlign: "center", marginBottom: 32 }}>
                  <div style={{ fontSize: 12, letterSpacing: "0.25em", textTransform: "uppercase", color: "#8B6914", fontFamily: "'Crimson Pro', serif", marginBottom: 8 }}>Step 1</div>
                  <h2 style={{ fontSize: 28, fontWeight: 400, marginBottom: 6 }}>Which Haggadah?</h2>
                  <p style={{ fontSize: 14, color: "#8B7D66", fontFamily: "'Crimson Pro', serif", fontWeight: 300 }}>Select which family Haggadah to add your dvar Torah to</p>
                </div>
                <div style={{ display: "flex", justifyContent: "center", gap: 12, marginBottom: 36, flexWrap: "wrap" }}>
                  {[...HAGGADOT, { id: "both", name: "Both" }].map(h => {
                    const isSel = h.id === "both" ? selectedHaggadot.length === 2 : selectedHaggadot.includes(h.id);
                    return (
                      <div key={h.id} className="hag-chip" onClick={() => {
                        if (h.id === "both") setSelectedHaggadot(selectedHaggadot.length === 2 ? [] : HAGGADOT.map(x => x.id));
                        else toggleHaggadah(h.id);
                      }} style={{
                        padding: "14px 28px", borderRadius: 14,
                        background: isSel ? "#2C2416" : "#FFFCF7", color: isSel ? "#FAF6F0" : "#2C2416",
                        border: `1px solid ${isSel ? "#2C2416" : "rgba(139,105,20,0.15)"}`,
                        fontSize: 16, fontFamily: "'Cormorant Garamond', serif", fontWeight: 500,
                        boxShadow: isSel ? "0 4px 16px rgba(44,36,22,0.2)" : "0 2px 8px rgba(139,105,20,0.04)",
                      }}>{h.name}</div>
                    );
                  })}
                </div>
                {selectedHaggadot.length > 0 && (
                  <div className="fade-up">
                    <div style={{ textAlign: "center", marginBottom: 28 }}>
                      <div style={{ fontSize: 12, letterSpacing: "0.25em", textTransform: "uppercase", color: "#8B6914", fontFamily: "'Crimson Pro', serif", marginBottom: 8 }}>Step 2</div>
                      <h2 style={{ fontSize: 28, fontWeight: 400 }}>Choose a Section</h2>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(250px, 1fr))", gap: 12 }}>
                      {SECTIONS.map(s => {
                        const c = allSubmissions.filter(x => x.section === s.num).length;
                        return (
                          <div key={s.num} className="sc" onClick={() => setSelectedSection(s.num)}
                            style={{ padding: "18px 20px", borderRadius: 12, background: "#FFFCF7", border: "1px solid rgba(139,105,20,0.1)", display: "flex", alignItems: "center", gap: 14, boxShadow: "0 2px 8px rgba(139,105,20,0.04)" }}>
                            <div style={{ width: 44, height: 44, borderRadius: "50%", background: "linear-gradient(135deg, #FAF1DD, #F0E4C8)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, flexShrink: 0 }}>{s.icon}</div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
                                <span style={{ fontSize: 16, fontWeight: 600 }}>{s.en}</span>
                                <span style={{ fontSize: 15, color: "#8B6914", fontFamily: "'Frank Ruhl Libre', serif", direction: "rtl" }}>{s.he}</span>
                              </div>
                              <div style={{ fontSize: 12, color: "#9B8E78", marginTop: 2, fontFamily: "'Crimson Pro', serif", fontWeight: 300, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.desc}</div>
                            </div>
                            {c > 0 && <div style={{ width: 22, height: 22, borderRadius: "50%", background: "#8B6914", color: "#fff", fontSize: 11, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 600, flexShrink: 0 }}>{c}</div>}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            ) : (() => {
              const sec = SECTIONS.find(s => s.num === selectedSection);
              const content = inputMode === "text" ? richContent : uploadedContent;
              const hasContent = content && content !== "<p></p>" && content.replace(/<[^>]*>/g, "").trim().length > 0;
              const ok = firstName.trim() && lastName.trim() && title.trim() && selectedHaggadot.length > 0 && hasContent && !parsing;
              return (
                <div>
                  <button onClick={() => setSelectedSection(null)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 13, color: "#8B6914", fontFamily: "'Crimson Pro', serif", marginBottom: 20 }}>← Back to sections</button>

                  <div style={{ background: "linear-gradient(135deg, #FAF1DD, #F0E4C8)", padding: "20px 24px", borderRadius: 14, marginBottom: 20, display: "flex", alignItems: "center", gap: 16 }}>
                    <div style={{ fontSize: 32 }}>{sec.icon}</div>
                    <div>
                      <div style={{ fontSize: 20, fontWeight: 600 }}>{sec.en} <span style={{ fontFamily: "'Frank Ruhl Libre', serif", fontSize: 18, color: "#8B6914" }}>{sec.he}</span></div>
                      <div style={{ fontSize: 13, color: "#6B5A3E", fontFamily: "'Crimson Pro', serif", fontWeight: 300, marginTop: 2 }}>{sec.desc}</div>
                    </div>
                  </div>

                  <div style={{ marginBottom: 20, fontSize: 13, color: "#8B7D66", fontFamily: "'Crimson Pro', serif", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span>Submitting to:</span>
                    {selectedHaggadot.map(id => {
                      const h = HAGGADOT.find(x => x.id === id);
                      return h ? <span key={id} style={{ padding: "4px 12px", borderRadius: 12, background: "rgba(139,105,20,0.1)", fontSize: 12, fontWeight: 500, color: "#8B6914" }}>{h.name}</span> : null;
                    })}
                  </div>

                  <div className="g2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
                    <div>
                      <label style={{ fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", color: "#8B7D66", fontFamily: "'Crimson Pro', serif", marginBottom: 6, display: "block" }}>First Name *</label>
                      <input style={inp} value={firstName} onChange={e => setFirstName(e.target.value)} placeholder="e.g. Sarah" />
                    </div>
                    <div>
                      <label style={{ fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", color: "#8B7D66", fontFamily: "'Crimson Pro', serif", marginBottom: 6, display: "block" }}>Last Name *</label>
                      <input style={inp} value={lastName} onChange={e => setLastName(e.target.value)} placeholder="e.g. Cohen" />
                    </div>
                  </div>

                  <div style={{ marginBottom: 16 }}>
                    <label style={{ fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", color: "#8B7D66", fontFamily: "'Crimson Pro', serif", marginBottom: 6, display: "block" }}>Title *</label>
                    <input style={inp} value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Freedom's True Meaning" />
                  </div>

                  <div style={{ display: "flex", gap: 4, marginBottom: 14, background: "rgba(139,105,20,0.06)", borderRadius: 10, padding: 4, width: "fit-content" }}>
                    {[["text","Write"],["upload","Upload File"]].map(([m,l]) => (
                      <button key={m} onClick={() => setInputMode(m)} style={{ padding: "8px 20px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 13, fontFamily: "'Crimson Pro', serif", fontWeight: 500,
                        background: inputMode===m ? "#FFFCF7":"transparent", color: inputMode===m ? "#2C2416":"#8B7D66",
                        boxShadow: inputMode===m ? "0 1px 4px rgba(0,0,0,0.06)":"none" }}>{l}</button>
                    ))}
                  </div>

                  {inputMode === "text" ? (
                    <>
                      <label style={{ fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", color: "#8B7D66", fontFamily: "'Crimson Pro', serif", marginBottom: 8, display: "block" }}>
                        Your Dvar Torah * <span style={{ fontWeight: 300, textTransform: "none", letterSpacing: 0, fontSize: 11, color: "#9B8E78" }}>— Hebrew, formatting, images, paste from Word/Docs</span>
                      </label>
                      <RichEditor content={richContent} onChange={setRichContent}
                        placeholder="Share your insight, story, or dvar Torah here..." />
                    </>
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
                          <div className="rich-content" style={{ fontSize: 14, lineHeight: 1.65, color: "#4A4030", fontFamily: "'Crimson Pro', serif", fontWeight: 300, maxHeight: 200, overflow: "auto" }}
                            dangerouslySetInnerHTML={{ __html: uploadedContent }} />
                        </div>
                      )}
                    </div>
                  )}

                  {submitError && (
                    <div style={{ marginTop: 14, padding: "12px 16px", borderRadius: 10, background: "#FFF0F0", border: "1px solid #FFCCCC", fontSize: 13, color: "#CC3333", fontFamily: "'Crimson Pro', serif" }}>{submitError}</div>
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

        {/* ADMIN */}
        {view === "admin" && (
          <div className="fade-up">
            {!adminAuthed ? (
              <div style={{ maxWidth: 380, margin: "60px auto", textAlign: "center" }}>
                <div style={{ fontSize: 32, marginBottom: 12 }}>🔐</div>
                <h2 style={{ fontSize: 24, fontWeight: 400, marginBottom: 20 }}>Admin Access</h2>
                <input type="password" style={{ ...inp, textAlign: "center", marginBottom: 14 }}
                  value={adminPassword} onChange={e => setAdminPassword(e.target.value)} placeholder="Enter password"
                  onKeyDown={e => { if(e.key==="Enter"&&adminPassword===ADMIN_PASSWORD) setAdminAuthed(true) }} />
                <button onClick={() => { if(adminPassword===ADMIN_PASSWORD) setAdminAuthed(true); }}
                  style={{ padding: "12px 36px", borderRadius: 24, background: "#2C2416", color: "#FAF6F0", border: "none", fontSize: 14, fontFamily: "'Crimson Pro', serif", fontWeight: 500, cursor: "pointer", marginTop: 8 }}>Enter</button>
              </div>
            ) : (
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
                  <h2 style={{ fontSize: 26, fontWeight: 400 }}>Admin Dashboard</h2>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button onClick={() => setShowPdfSettings(!showPdfSettings)} style={{ padding: "10px 20px", borderRadius: 22, background: showPdfSettings ? "#8B6914" : "rgba(139,105,20,0.08)", color: showPdfSettings ? "#fff" : "#8B6914", border: "none", fontSize: 13, fontFamily: "'Crimson Pro', serif", fontWeight: 500, cursor: "pointer" }}>
                      {showPdfSettings ? "Hide Settings" : "PDF Settings ⚙️"}
                    </button>
                    <button onClick={() => setView("preview")} style={{ padding: "10px 24px", borderRadius: 22, background: "#8B6914", color: "#fff", border: "none", fontSize: 13, fontFamily: "'Crimson Pro', serif", fontWeight: 500, cursor: "pointer" }}>Preview ✨</button>
                  </div>
                </div>

                {/* PDF Settings Panel */}
                {showPdfSettings && (
                  <div className="fade-up" style={{ background: "#FFFCF7", border: "1px solid rgba(139,105,20,0.12)", borderRadius: 14, padding: "24px 28px", marginBottom: 24 }}>
                    <h3 style={{ fontSize: 18, fontWeight: 500, marginBottom: 16 }}>PDF Export Settings</h3>

                    <div className="settings-grid">
                      <div>
                        <label className="settings-label">Body Font Size</label>
                        <input className="settings-input" type="number" value={pdfSettings.fontSize}
                          onChange={e => setPdfSettings({...pdfSettings, fontSize: +e.target.value})} />
                      </div>
                      <div>
                        <label className="settings-label">Heading Size</label>
                        <input className="settings-input" type="number" value={pdfSettings.headingSize}
                          onChange={e => setPdfSettings({...pdfSettings, headingSize: +e.target.value})} />
                      </div>
                      <div>
                        <label className="settings-label">Line Height</label>
                        <input className="settings-input" type="number" step="0.05" value={pdfSettings.lineHeight}
                          onChange={e => setPdfSettings({...pdfSettings, lineHeight: +e.target.value})} />
                      </div>
                      <div>
                        <label className="settings-label">Page Margin (px)</label>
                        <input className="settings-input" type="number" value={pdfSettings.pageMargin}
                          onChange={e => setPdfSettings({...pdfSettings, pageMargin: +e.target.value})} />
                      </div>
                    </div>

                    <div className="settings-grid" style={{ marginTop: 16 }}>
                      <div>
                        <label className="settings-label">Accent Color</label>
                        <div className="color-row">
                          <div className="color-swatch" style={{ background: pdfSettings.accentColor }}>
                            <input type="color" value={pdfSettings.accentColor} onChange={e => setPdfSettings({...pdfSettings, accentColor: e.target.value})} />
                          </div>
                          <span style={{ fontSize: 13, fontFamily: "'Crimson Pro', serif" }}>{pdfSettings.accentColor}</span>
                        </div>
                      </div>
                      <div>
                        <label className="settings-label">Text Color</label>
                        <div className="color-row">
                          <div className="color-swatch" style={{ background: pdfSettings.textColor }}>
                            <input type="color" value={pdfSettings.textColor} onChange={e => setPdfSettings({...pdfSettings, textColor: e.target.value})} />
                          </div>
                          <span style={{ fontSize: 13, fontFamily: "'Crimson Pro', serif" }}>{pdfSettings.textColor}</span>
                        </div>
                      </div>
                      <div>
                        <label className="settings-label">Background Color</label>
                        <div className="color-row">
                          <div className="color-swatch" style={{ background: pdfSettings.bgColor }}>
                            <input type="color" value={pdfSettings.bgColor} onChange={e => setPdfSettings({...pdfSettings, bgColor: e.target.value})} />
                          </div>
                          <span style={{ fontSize: 13, fontFamily: "'Crimson Pro', serif" }}>{pdfSettings.bgColor}</span>
                        </div>
                      </div>
                      <div>
                        <label className="settings-label">Show Section Icons</label>
                        <button onClick={() => setPdfSettings({...pdfSettings, showSectionIcons: !pdfSettings.showSectionIcons})}
                          style={{ padding: "8px 20px", borderRadius: 8, border: "1px solid rgba(139,105,20,0.2)", background: pdfSettings.showSectionIcons ? "#2C2416" : "#FFFCF7", color: pdfSettings.showSectionIcons ? "#FAF6F0" : "#2C2416", fontSize: 13, fontFamily: "'Crimson Pro', serif", cursor: "pointer" }}>
                          {pdfSettings.showSectionIcons ? "Yes" : "No"}
                        </button>
                      </div>
                    </div>

                    <div style={{ marginTop: 16 }}>
                      <label className="settings-label">Cover Subtitle</label>
                      <input className="settings-input" value={pdfSettings.coverSubtitle}
                        onChange={e => setPdfSettings({...pdfSettings, coverSubtitle: e.target.value})}
                        placeholder='e.g. "A family tradition since 1985"' />
                    </div>

                    <div style={{ marginTop: 16 }}>
                      <label className="settings-label">Cover Image</label>
                      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        <input type="file" accept="image/*" onChange={handleCoverImage} style={{ fontSize: 13, fontFamily: "'Crimson Pro', serif" }} />
                        {pdfSettings.coverImage && <img src={pdfSettings.coverImage} style={{ height: 50, borderRadius: 6 }} />}
                      </div>
                    </div>

                    <div style={{ marginTop: 20 }}>
                      <label className="settings-label">Section Images</label>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 8, marginTop: 8 }}>
                        {SECTIONS.map(sec => (
                          <div key={sec.num} style={{ padding: "8px 12px", borderRadius: 8, background: "rgba(139,105,20,0.03)", border: "1px solid rgba(139,105,20,0.08)", fontSize: 12 }}>
                            <div style={{ fontWeight: 600, marginBottom: 4 }}>{sec.icon} {sec.en}</div>
                            <input type="file" accept="image/*" onChange={(e) => handleSectionImage(sec.num, e)}
                              style={{ fontSize: 11, width: "100%" }} />
                            {pdfSettings.sectionImages?.[sec.num] && (
                              <div style={{ marginTop: 4, display: "flex", alignItems: "center", gap: 6 }}>
                                <img src={pdfSettings.sectionImages[sec.num]} style={{ height: 30, borderRadius: 4 }} />
                                <button onClick={() => setPdfSettings({...pdfSettings, sectionImages: { ...pdfSettings.sectionImages, [sec.num]: undefined }})}
                                  style={{ background: "none", border: "none", color: "#C0A080", cursor: "pointer", fontSize: 14 }}>×</button>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>

                    <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
                      <button onClick={handleSavePdfSettings} style={{ padding: "10px 28px", borderRadius: 20, background: "#2C2416", color: "#FAF6F0", border: "none", fontSize: 13, fontFamily: "'Crimson Pro', serif", fontWeight: 500, cursor: "pointer" }}>Save Settings</button>
                      <button onClick={() => setPdfSettings(DEFAULT_PDF_SETTINGS)} style={{ padding: "10px 28px", borderRadius: 20, background: "transparent", color: "#8B7D66", border: "1px solid rgba(139,105,20,0.2)", fontSize: 13, fontFamily: "'Crimson Pro', serif", cursor: "pointer" }}>Reset to Default</button>
                    </div>
                  </div>
                )}

                {/* Filter + Export */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
                  <div style={{ display: "flex", gap: 4, background: "rgba(139,105,20,0.06)", borderRadius: 10, padding: 4 }}>
                    {[["all","All"],["ottensoser","Ottensoser"],["siegel","Siegel"]].map(([id,label]) => (
                      <button key={id} onClick={() => setAdminFilter(id)} style={{
                        padding: "8px 18px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 13, fontFamily: "'Crimson Pro', serif", fontWeight: 500,
                        background: adminFilter===id ? "#FFFCF7":"transparent", color: adminFilter===id ? "#2C2416":"#8B7D66",
                        boxShadow: adminFilter===id ? "0 1px 4px rgba(0,0,0,0.06)":"none",
                      }}>{label}</button>
                    ))}
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {HAGGADOT.map(h => (
                      <button key={h.id} onClick={() => doExport(h.id)} disabled={exporting}
                        style={{ padding: "8px 18px", borderRadius: 18, background: "#2C2416", color: "#FAF6F0", border: "none", fontSize: 12, fontFamily: "'Crimson Pro', serif", fontWeight: 500, cursor: "pointer", opacity: exporting?0.5:1 }}>
                        Export {h.name.split(" ")[0]} PDF
                      </button>
                    ))}
                  </div>
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
                          borderRadius: 12, padding: "16px 20px", marginBottom: 8, marginLeft: 28 }}>
                          {editingId === sub.id ? (
                            <div>
                              <div className="g2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
                                <input style={{ ...inp, fontSize: 13, padding: "8px 12px" }} value={editData.author} onChange={e => setEditData({...editData, author: e.target.value})} placeholder="Author" />
                                <input style={{ ...inp, fontSize: 13, padding: "8px 12px" }} value={editData.title} onChange={e => setEditData({...editData, title: e.target.value})} placeholder="Title" />
                              </div>
                              <MiniEditor content={editData.content} onChange={(html) => setEditData({...editData, content: html})} />
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
                                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 3, flexWrap: "wrap" }}>
                                    <span style={{ fontSize: 11, color: "#9B8E78", fontFamily: "'Crimson Pro', serif" }}>{sub.date}</span>
                                    <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 8, background: "rgba(139,105,20,0.08)", color: "#8B6914", fontFamily: "'Crimson Pro', serif", fontWeight: 500 }}>{getHaggadahLabel(sub)}</span>
                                    {sub.fileUrl && (
                                      <a href={sub.fileUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: "#8B6914", fontFamily: "'Crimson Pro', serif", textDecoration: "underline" }}>
                                        📎 {sub.fileName || "Original file"}
                                      </a>
                                    )}
                                  </div>
                                </div>
                                <div style={{ display: "flex", gap: 2, alignItems: "center", flexShrink: 0 }}>
                                  <button className="ab" disabled={idx===0} onClick={() => moveSub(sec.num,idx,idx-1)} style={{ background:"none", border:"none", cursor:idx===0?"default":"pointer", color:idx===0?"#DDD5C8":"#8B6914", fontSize:14, padding:"4px 6px", borderRadius:6 }}>↑</button>
                                  <button className="ab" disabled={idx===subs.length-1} onClick={() => moveSub(sec.num,idx,idx+1)} style={{ background:"none", border:"none", cursor:idx===subs.length-1?"default":"pointer", color:idx===subs.length-1?"#DDD5C8":"#8B6914", fontSize:14, padding:"4px 6px", borderRadius:6 }}>↓</button>
                                  <button className="ab" onClick={() => startEdit(sub)} style={{ background:"none", border:"none", cursor:"pointer", color:"#8B6914", fontSize:13, padding:"4px 6px", borderRadius:6 }}>✏️</button>
                                  <button className="ab" onClick={() => deleteSub(sub.id)} style={{ background:"none", border:"none", cursor:"pointer", color:"#C0A080", fontSize:18, padding:"4px 6px", borderRadius:6 }}>×</button>
                                </div>
                              </div>
                              <div className="rich-content" style={{ fontSize: 14, lineHeight: 1.65, color: "#4A4030", fontFamily: "'Crimson Pro', serif", fontWeight: 300, maxHeight: 150, overflow: "hidden",
                                maskImage: "linear-gradient(to bottom, black 70%, transparent)", WebkitMaskImage: "linear-gradient(to bottom, black 70%, transparent)" }}
                                dangerouslySetInnerHTML={{ __html: sub.content }} />
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

        {/* PREVIEW */}
        {view === "preview" && (
          <div className="fade-up">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
              <button onClick={() => setView("admin")} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 13, color: "#8B6914", fontFamily: "'Crimson Pro', serif" }}>← Back to Admin</button>
              <div style={{ display: "flex", gap: 4, background: "rgba(139,105,20,0.06)", borderRadius: 10, padding: 4 }}>
                {[["all","All"],["ottensoser","Ottensoser"],["siegel","Siegel"]].map(([id,label]) => (
                  <button key={id} onClick={() => setAdminFilter(id)} style={{
                    padding: "8px 18px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 13, fontFamily: "'Crimson Pro', serif", fontWeight: 500,
                    background: adminFilter===id ? "#FFFCF7":"transparent", color: adminFilter===id ? "#2C2416":"#8B7D66",
                  }}>{label}</button>
                ))}
              </div>
            </div>

            <div style={{ textAlign: "center", padding: "56px 24px 48px", background: "linear-gradient(170deg, #FFFDF8, #F8F0E0)", border: "1px solid rgba(139,105,20,0.12)", borderRadius: 18, marginBottom: 36, boxShadow: "0 8px 40px rgba(139,105,20,0.08)", position: "relative" }}>
              <div style={{ position: "absolute", top: 16, left: 16, right: 16, bottom: 16, border: "1px solid rgba(139,105,20,0.1)", borderRadius: 10, pointerEvents: "none" }} />
              <div style={{ fontSize: 38, color: "#8B6914", fontFamily: "'Frank Ruhl Libre', serif", marginBottom: 8, direction: "rtl" }}>הַגָּדָה שֶׁל פֶּסַח</div>
              <div style={{ width: 80, height: 1, margin: "16px auto", background: "linear-gradient(90deg, transparent, #C4943D, transparent)" }} />
              <h1 style={{ fontSize: 36, fontWeight: 400, marginBottom: 4 }}>
                {adminFilter === "all" ? "Family" : adminFilter === "ottensoser" ? "Ottensoser" : "Siegel"} Haggadah
              </h1>
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
                        <span style={{ fontSize: 22, fontWeight: 500 }}>{sec.num > 0 && sec.num < 99 ? sec.num + ". " : ""}{sec.en}</span>
                        <span style={{ fontSize: 20, color: "#8B6914", fontFamily: "'Frank Ruhl Libre', serif", direction: "rtl" }}>{sec.he}</span>
                      </div>
                      <div style={{ fontSize: 13, color: "#8B7D66", fontFamily: "'Crimson Pro', serif", fontWeight: 300 }}>{sec.desc}</div>
                    </div>
                  </div>
                  {subs.length > 0 ? subs.map((sub, i) => (
                    <div key={sub.id} style={{ marginLeft: 50, marginBottom: i<subs.length-1?20:0, paddingBottom: i<subs.length-1?20:0, borderBottom: i<subs.length-1?"1px dashed rgba(139,105,20,0.1)":"none" }}>
                      {sub.title && <div style={{ fontSize: 18, fontStyle: "italic", fontWeight: 500, color: "#2C2416", marginBottom: 6 }}>{sub.title}</div>}
                      <div className="rich-content" style={{ fontSize: 15, lineHeight: 1.8, color: "#3D3525", fontFamily: "'Crimson Pro', serif", fontWeight: 300 }}
                        dangerouslySetInnerHTML={{ __html: sub.content }} />
                      <div style={{ fontSize: 13, color: "#8B6914", marginTop: 10, fontStyle: "italic", fontWeight: 500 }}>— {sub.author}</div>
                    </div>
                  )) : (
                    <div style={{ marginLeft: 50, fontSize: 14, color: "#BDB3A0", fontFamily: "'Crimson Pro', serif", fontStyle: "italic" }}>No submissions yet</div>
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
