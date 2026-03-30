import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import TextAlign from "@tiptap/extension-text-align";
import ImageExt from "@tiptap/extension-image";
import Placeholder from "@tiptap/extension-placeholder";
import * as mammoth from "mammoth/mammoth.browser.js";
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
  insertedImages: {},
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
      <div style={{ display: "flex", flexWrap: "nowrap", gap: 2, padding: "8px 10px", borderBottom: "1px solid rgba(139,105,20,0.1)", background: "rgba(139,105,20,0.02)", alignItems: "center", overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
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

  // Only include sections that have submissions
  const activeSections = SECTIONS.filter(sec =>
    submissions.some(x => x.section === sec.num)
  );

  // Table of contents
  const tocHTML = activeSections.map(sec => {
    const count = submissions.filter(x => x.section === sec.num).length;
    return `<div class="toc-item">
      <span class="toc-name">${s.showSectionIcons ? sec.icon + " " : ""}${sec.en} <span class="toc-he">${sec.he}</span></span>
      <span class="toc-dots"></span>
      <span class="toc-count">${count} submission${count > 1 ? "s" : ""}</span>
    </div>`;
  }).join("");

  const sectionHTML = activeSections.map(sec => {
    const subs = submissions.filter(x => x.section === sec.num)
      .sort((a, b) => (a.order ?? a.createdAt ?? 0) - (b.order ?? b.createdAt ?? 0));
    const secImg = s.sectionImages?.[sec.num];
    // Check for inserted images (stored in settings)
    const insertedImgs = s.insertedImages?.[sec.num] || [];
    return `
      <div class="section" style="page-break-before:always">
        ${secImg ? `<img src="${secImg}" class="section-img" style="width:100%;max-height:300px;object-fit:cover" />` : ""}
        <div class="section-header">
          ${s.showSectionIcons ? `<div class="sec-icon">${sec.icon}</div>` : ""}
          <div class="sec-label">Section</div>
          <span class="sec-en">${sec.en}</span>
          <span class="sec-he">${sec.he}</span>
          <div class="sec-desc">${sec.desc}</div>
        </div>
        <div class="section-body">
          ${subs.map((sub, i) => `
            <div class="submission${i < subs.length - 1 ? " with-border" : ""}">
              ${sub.title ? `<div class="sub-title">${sub.title}</div>` : ""}
              <div class="sub-author">— ${sub.author}</div>
              <div class="sub-content">${sub.content}</div>
            </div>
            ${insertedImgs[i] ? `<img src="${insertedImgs[i]}" class="inserted-image" />` : ""}
          `).join("")}
        </div>
      </div>
    `;
  }).join("");

  return `<!DOCTYPE html>
<html lang="en" dir="auto">
<head>
<meta charset="UTF-8">
<title>${familyName} Haggadah ${year}</title>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;0,600;0,700;1,400&family=Frank+Ruhl+Libre:wght@0,300;0,400;0,500;0,700&family=Crimson+Pro:ital,wght@0,300;0,400;0,500;1,300;1,400&family=David+Libre:wght@400;500;700&family=Playfair+Display:ital,wght@0,400;0,500;0,600;0,700;1,400;1,500&display=swap" rel="stylesheet">
<style>
  @page { size: letter; margin: ${s.pageMargin}px; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: ${s.fontFamily}; font-size: ${s.fontSize - 1}px; line-height: ${s.lineHeight}; color: ${s.textColor}; background: ${s.bgColor}; margin: 0 auto; }

  /* Cover — full-page editorial */
  .cover { text-align: center; page-break-after: always; padding: 100px 40px 60px; position: relative; min-height: 90vh; display: flex; flex-direction: column; align-items: center; justify-content: center; }
  .cover-border { position: absolute; top: 20px; left: 20px; right: 20px; bottom: 20px; border: 1px solid ${s.accentColor}66; }
  .cover-border-inner { position: absolute; top: 26px; left: 26px; right: 26px; bottom: 26px; border: 0.5px solid ${s.accentColor}33; }
  .cover-img { max-width: 340px; max-height: 240px; margin: 0 auto 40px; border-radius: 0; object-fit: cover; }
  .cover-label { font-family: 'Crimson Pro', serif; font-size: 11px; letter-spacing: 0.35em; text-transform: uppercase; color: ${s.accentColor}; margin-bottom: 20px; }
  .cover-he { font-family: 'Frank Ruhl Libre', serif; font-size: 28px; color: ${s.accentColor}88; direction: rtl; margin-bottom: 16px; }
  .cover-line { width: 50px; height: 1.5px; background: ${s.accentColor}; margin: 24px auto; }
  .cover-title { font-family: 'Playfair Display', ${s.headingFont}; font-size: 52px; font-weight: 400; margin-bottom: 4px; letter-spacing: -0.02em; line-height: 1.1; }
  .cover-subtitle { font-size: 14px; color: ${s.accentColor}; font-style: italic; margin-top: 12px; font-family: 'Crimson Pro', serif; }
  .cover-year { font-size: 12px; color: ${s.textColor}66; font-family: 'Crimson Pro', serif; letter-spacing: 0.2em; text-transform: uppercase; margin-top: 8px; }

  /* TOC — clean editorial */
  .toc { page-break-after: always; padding: 60px 40px; max-width: 500px; margin: 0 auto; }
  .toc-label { font-family: 'Crimson Pro', serif; font-size: 10px; letter-spacing: 0.3em; text-transform: uppercase; color: ${s.accentColor}; text-align: center; margin-bottom: 6px; }
  .toc-title { font-family: 'Playfair Display', ${s.headingFont}; font-size: 32px; font-weight: 400; text-align: center; margin-bottom: 4px; }
  .toc-line { width: 40px; height: 1.5px; background: ${s.accentColor}; margin: 20px auto 32px; }
  .toc-item { display: flex; align-items: baseline; gap: 8px; margin-bottom: 12px; font-size: 14px; }
  .toc-name { white-space: nowrap; font-family: 'Playfair Display', ${s.headingFont}; font-weight: 500; font-size: 15px; }
  .toc-he { font-family: 'Frank Ruhl Libre', serif; color: ${s.accentColor}; font-size: 13px; direction: rtl; }
  .toc-dots { flex: 1; border-bottom: 1px dotted ${s.accentColor}33; margin: 0 4px; min-width: 20px; position: relative; top: -3px; }
  .toc-count { white-space: nowrap; font-size: 11px; color: ${s.textColor}66; font-family: 'Crimson Pro', serif; }

  /* Section — magazine two-column */
  .section { page-break-before: always; padding: 0; }
  .section-img { width: 100%; max-height: 300px; object-fit: cover; border-radius: 0; margin-bottom: 24px; display: block; }
  .section-header { text-align: center; padding: 40px 20px 24px; border-bottom: 1px solid ${s.accentColor}22; margin-bottom: 24px; }
  .sec-label { font-family: 'Crimson Pro', serif; font-size: 10px; letter-spacing: 0.3em; text-transform: uppercase; color: ${s.accentColor}; margin-bottom: 8px; }
  .sec-icon { font-size: 28px; display: block; margin-bottom: 8px; }
  .sec-en { font-family: 'Playfair Display', ${s.headingFont}; font-size: ${s.headingSize + 4}px; font-weight: 400; display: block; letter-spacing: -0.01em; }
  .sec-he { font-family: 'Frank Ruhl Libre', serif; font-size: ${s.headingSize - 4}px; color: ${s.accentColor}; display: block; direction: rtl; margin-top: 4px; }
  .sec-desc { font-size: 12px; color: ${s.textColor}66; margin-top: 6px; font-style: italic; font-family: 'Crimson Pro', serif; }

  /* Two-column content */
  .section-body { column-count: 2; column-gap: 36px; column-rule: 1px solid ${s.accentColor}11; }

  /* Submissions */
  .submission { margin-bottom: 20px; padding-bottom: 16px; }
  .submission.with-border { border-bottom: 0.5px solid ${s.accentColor}22; }
  .sub-title { font-family: 'Playfair Display', ${s.headingFont}; font-size: 17px; font-style: italic; font-weight: 500; margin-bottom: 3px; line-height: 1.3; break-after: avoid; }
  .sub-author { font-size: 11px; color: ${s.accentColor}; font-style: normal; font-weight: 500; margin-bottom: 8px; font-family: 'Crimson Pro', serif; letter-spacing: 0.05em; text-transform: uppercase; break-before: avoid; break-after: avoid; }
  .sub-content { line-height: ${s.lineHeight}; font-size: ${s.fontSize - 1}px; }
  .sub-content p { margin-bottom: 0.4em; text-align: justify; }
  .sub-content h2 { font-family: 'Playfair Display', ${s.headingFont}; font-size: 18px; font-weight: 500; margin: 0.8em 0 0.3em; }
  .sub-content h3 { font-family: 'Playfair Display', ${s.headingFont}; font-size: 16px; font-weight: 500; margin: 0.6em 0 0.2em; }
  .sub-content blockquote { border-left: 2px solid ${s.accentColor}; padding: 6px 16px; margin: 10px 0; font-style: italic; color: ${s.textColor}99; font-size: ${s.fontSize - 2}px; }
  .sub-content ul, .sub-content ol { padding-left: 20px; margin: 6px 0; }
  .sub-content img { max-width: 100%; height: auto; margin: 10px 0; display: block; break-inside: avoid; }
  .sub-content hr { border: none; border-top: 0.5px solid ${s.accentColor}22; margin: 14px 0; }

  /* Full-width images break out of columns */
  .inserted-image { column-span: all; width: 100%; max-height: 350px; object-fit: cover; margin: 20px 0; display: block; }

  /* Closing */
  .closing { text-align: center; padding: 120px 40px; page-break-before: always; }
  .closing-he { font-family: 'Frank Ruhl Libre', serif; font-size: 24px; color: ${s.accentColor}; direction: rtl; }
  .closing-en { font-size: 14px; color: ${s.textColor}66; margin-top: 10px; font-style: italic; font-family: 'Crimson Pro', serif; }
  .closing-sig { font-family: 'Playfair Display', serif; font-size: 16px; color: ${s.textColor}88; margin-top: 20px; }

  @media print {
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .section-body { column-count: 2; }
  }
  @media screen {
    body { max-width: 800px; padding: 0 20px; }
  }
</style>
</head>
<body>
  <div class="cover">
    <div class="cover-border"></div>
    <div class="cover-border-inner"></div>
    <div class="cover-label">Passover ${year}</div>
    ${s.coverImage ? `<img src="${s.coverImage}" class="cover-img" />` : ""}
    <div class="cover-he">הַגָּדָה שֶׁל פֶּסַח</div>
    <div class="cover-line"></div>
    <div class="cover-title">The ${familyName}<br>Haggadah</div>
    ${s.coverSubtitle ? `<div class="cover-subtitle">${s.coverSubtitle}</div>` : ""}
    <div class="cover-year">A Collection of Family Torah</div>
  </div>
  <div class="toc">
    <div class="toc-label">In This Haggadah</div>
    <div class="toc-title">Contents</div>
    <div class="toc-line"></div>
    ${tocHTML}
  </div>
  ${sectionHTML}
  <div class="closing">
    <div class="cover-line" style="margin-bottom:30px"></div>
    <div class="closing-he">לְשָׁנָה הַבָּאָה בִּירוּשָׁלָיִם</div>
    <div class="closing-en">Next year in Jerusalem</div>
    <div class="closing-sig">— Anna & Harry</div>
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

async function loadScript(src, timeout = 10000) {
  if (document.querySelector(`script[src="${src}"]`)) return;
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = src;
    s.onload = resolve;
    s.onerror = () => reject(new Error("Failed to load: " + src));
    document.head.appendChild(s);
    setTimeout(() => reject(new Error("Timeout loading: " + src)), timeout);
  });
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
  const buf = await file.arrayBuffer();
  // Add timeout to prevent infinite hang
  const result = await Promise.race([
    mammoth.convertToHtml({ arrayBuffer: buf }),
    new Promise((_, reject) => setTimeout(() => reject(new Error("Parsing timed out after 30s")), 30000))
  ]);
  return result.value;
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
  const [fullName, setFullName] = useState("");
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
  const [expandedIds, setExpandedIds] = useState(new Set());
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
    setUploadedContent("");
    setParsing(true);
    setSubmitError(null);
    try {
      const parsed = await parseFile(file);
      setUploadedContent(parsed);
    } catch (err) {
      console.error("File parse error:", err);
      setSubmitError("File parsing issue: " + err.message + ". Trying plain text fallback...");
      try {
        const t = await file.text();
        setUploadedContent(`<p>${t.replace(/\n\n/g, "</p><p>").replace(/\n/g, "<br>")}</p>`);
        setSubmitError(null);
      } catch {
        setUploadedContent("<p>[Could not parse file — please try copy-pasting the content using the Write tab instead]</p>");
      }
    }
    setParsing(false);
  }, []);

  const handleSubmit = useCallback(async () => {
    const content = inputMode === "text" ? richContent : uploadedContent;
    const authorName = fullName.trim();
    const plainContent = content ? content.replace(/<[^>]*>/g, "").trim() : "";
    if (!authorName || !title.trim() || !plainContent || !selectedHaggadot.length || selectedSection === null) return;
    setSubmitting(true); setSubmitError(null);
    try {
      // Save submission immediately (no waiting for file upload)
      const savedFileName = (uploadedFile && inputMode === "upload") ? uploadedFile.name : null;
      // Capture file data NOW before state gets cleared
      let fileBlob = null;
      if (uploadedFile && inputMode === "upload") {
        try {
          fileBlob = new Blob([await uploadedFile.arrayBuffer()], { type: uploadedFile.type || "application/octet-stream" });
        } catch (e) {
          console.error("Failed to read file for upload:", e);
        }
      }

      const docRef = await addSubmission({
        section: selectedSection, author: authorName, title: title.trim(),
        content, date: new Date().toLocaleDateString(),
        haggadot: selectedHaggadot,
        order: allSubmissions.filter(s => s.section === selectedSection).length,
        fileName: savedFileName,
        fileUrl: null,
      });
      setSubmitSuccess(true);

      // Upload original file in background (non-blocking)
      if (fileBlob && savedFileName) {
        const docId = docRef.id;
        // Sanitize filename - remove non-ASCII characters for storage path
        const safeName = savedFileName.replace(/[^a-zA-Z0-9._-]/g, "_");
        const path = `uploads/${Date.now()}_${safeName}`;
        (async () => {
          try {
            const url = await uploadFile(fileBlob, path);
            await updateSubmission(docId, { fileUrl: url, fileError: null });
            console.log("File uploaded successfully:", url);
          } catch (e) {
            console.error("Background file upload failed:", e.message, e);
            // Save the error so admin can see it
            try { await updateSubmission(docId, { fileError: e.message }); } catch (_) {}
          }
        })();
      }

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
  }, [inputMode, richContent, uploadedContent, fullName, title, selectedSection, selectedHaggadot, allSubmissions, uploadedFile]);

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
            <p style={{ fontSize: 17, lineHeight: 1.7, color: "#5A4E3A", maxWidth: 520, margin: "0 auto 32px", fontFamily: "'Crimson Pro', serif", fontWeight: 300 }}>
              A collection of divrei Torah and insights from our families, woven together to enrich our Seder tables. Each voice adds meaning to our shared story of freedom.
            </p>
            <div style={{ textAlign: "center", marginBottom: 48 }}>
              <div style={{ fontSize: 32, fontWeight: 300, color: "#8B6914" }}>{allSubmissions.length}</div>
              <div style={{ fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", color: "#9B8E78", fontFamily: "'Crimson Pro', serif" }}>Total Submissions</div>
            </div>
            <button onClick={() => { setSelectedSection(null); setSelectedHaggadot([]); setRichContent(""); setUploadedFile(null); setUploadedContent(""); setView("submit"); }}
              style={{ padding: "14px 44px", borderRadius: 28, background: "#2C2416", color: "#FAF6F0", border: "none", fontSize: 15, fontFamily: "'Crimson Pro', serif", fontWeight: 500, letterSpacing: "0.08em", cursor: "pointer", boxShadow: "0 4px 20px rgba(44,36,22,0.2)" }}>
              Add Your Dvar Torah
            </button>

            <div style={{ marginTop: 56 }}>
              <div style={{ width: 80, height: 1, margin: "0 auto 20px", background: "linear-gradient(90deg, transparent, #C4943D, transparent)" }} />
              <div style={{ fontSize: 20, color: "#8B6914", fontFamily: "'Frank Ruhl Libre', serif", direction: "rtl", marginBottom: 6 }}>לְשָׁנָה הַבָּאָה בִּירוּשָׁלָיִם</div>
              <div style={{ fontSize: 15, color: "#6B5A3E", fontStyle: "italic", fontFamily: "'Crimson Pro', serif", fontWeight: 300 }}>Next Year in Jerusalem</div>
              <div style={{ fontSize: 14, color: "#8B6914", fontFamily: "'Cormorant Garamond', serif", fontWeight: 500, marginTop: 12, letterSpacing: "0.05em" }}>— Anna and Harry</div>
            </div>
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
                <div style={{ textAlign: "center", marginBottom: 28 }}>
                  <div style={{ fontSize: 12, letterSpacing: "0.25em", textTransform: "uppercase", color: "#8B6914", fontFamily: "'Crimson Pro', serif", marginBottom: 8 }}>Step 1</div>
                  <h2 style={{ fontSize: 28, fontWeight: 400 }}>Choose a Section</h2>
                  <p style={{ fontSize: 14, color: "#8B7D66", fontFamily: "'Crimson Pro', serif", marginTop: 6, fontWeight: 300 }}>Select where in the Seder your insight belongs</p>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12 }}>
                  {SECTIONS.map(s => {
                    const c = allSubmissions.filter(x => x.section === s.num).length;
                    return (
                      <div key={s.num} className="sc" onClick={() => setSelectedSection(s.num)}
                        style={{ padding: "14px 14px", borderRadius: 12, background: "#FFFCF7", border: "1px solid rgba(139,105,20,0.1)", display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: 8, boxShadow: "0 2px 8px rgba(139,105,20,0.04)" }}>
                        <div style={{ width: 40, height: 40, borderRadius: "50%", background: "linear-gradient(135deg, #FAF1DD, #F0E4C8)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0 }}>{s.icon}</div>
                        <div>
                          <div style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.3 }}>{s.en}</div>
                          <div style={{ fontSize: 13, color: "#8B6914", fontFamily: "'Frank Ruhl Libre', serif", direction: "rtl", marginTop: 2 }}>{s.he}</div>
                          <div style={{ fontSize: 11, color: "#9B8E78", marginTop: 3, fontFamily: "'Crimson Pro', serif", fontWeight: 300, lineHeight: 1.3 }}>{s.desc}</div>
                        </div>
                        {c > 0 && <div style={{ width: 20, height: 20, borderRadius: "50%", background: "#8B6914", color: "#fff", fontSize: 10, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 600 }}>{c}</div>}
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (() => {
              const sec = SECTIONS.find(s => s.num === selectedSection);
              const content = inputMode === "text" ? richContent : uploadedContent;
              const hasContent = content && content !== "<p></p>" && content.replace(/<[^>]*>/g, "").trim().length > 0;
              const ok = fullName.trim() && title.trim() && selectedHaggadot.length > 0 && hasContent && !parsing;
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

                  {/* Haggadah selector */}
                  <div style={{ marginBottom: 20 }}>
                    <label style={{ fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", color: "#8B7D66", fontFamily: "'Crimson Pro', serif", marginBottom: 8, display: "block" }}>Which Haggadah? *</label>
                    <div style={{ display: "flex", gap: 6, flexWrap: "nowrap" }}>
                      {[...HAGGADOT, { id: "both", name: "Both" }].map(h => {
                        const isSel = h.id === "both" ? selectedHaggadot.length === 2 : selectedHaggadot.includes(h.id);
                        return (
                          <button key={h.id} className="hag-chip" onClick={() => {
                            if (h.id === "both") setSelectedHaggadot(selectedHaggadot.length === 2 ? [] : HAGGADOT.map(x => x.id));
                            else toggleHaggadah(h.id);
                          }} style={{
                            padding: "8px 14px", borderRadius: 10, cursor: "pointer", flex: 1,
                            background: isSel ? "#2C2416" : "#FFFCF7",
                            color: isSel ? "#FAF6F0" : "#2C2416",
                            fontSize: 13, fontFamily: "'Crimson Pro', serif", fontWeight: 500,
                            boxShadow: isSel ? "0 2px 12px rgba(44,36,22,0.15)" : "0 1px 4px rgba(139,105,20,0.08)",
                            border: isSel ? "1px solid #2C2416" : "1px solid rgba(139,105,20,0.15)",
                            whiteSpace: "nowrap",
                          }}>{h.name}</button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="g2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
                    <div>
                      <label style={{ fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", color: "#8B7D66", fontFamily: "'Crimson Pro', serif", marginBottom: 6, display: "block" }}>Full Name *</label>
                      <input style={inp} value={fullName} onChange={e => setFullName(e.target.value)} placeholder="e.g. Sarah Cohen" />
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
                      <div onClick={() => fileInputRef.current?.click()}
                        onDragOver={(e) => { e.preventDefault(); e.currentTarget.style.borderColor = "#8B6914"; e.currentTarget.style.background = "rgba(139,105,20,0.06)"; }}
                        onDragLeave={(e) => { e.preventDefault(); e.currentTarget.style.borderColor = "rgba(139,105,20,0.2)"; e.currentTarget.style.background = uploadedFile ? "rgba(139,105,20,0.04)" : "transparent"; }}
                        onDrop={(e) => {
                          e.preventDefault();
                          e.currentTarget.style.borderColor = "rgba(139,105,20,0.2)";
                          e.currentTarget.style.background = "rgba(139,105,20,0.04)";
                          const file = e.dataTransfer.files?.[0];
                          if (file) {
                            // Trigger the same handler as file input
                            const dt = new DataTransfer();
                            dt.items.add(file);
                            fileInputRef.current.files = dt.files;
                            fileInputRef.current.dispatchEvent(new Event("change", { bubbles: true }));
                          }
                        }}
                        style={{
                        border: "2px dashed rgba(139,105,20,0.2)", borderRadius: 14, padding: "48px 24px",
                        textAlign: "center", cursor: "pointer", background: uploadedFile ? "rgba(139,105,20,0.04)" : "transparent",
                        transition: "all 0.2s ease" }}>
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
                            <div style={{ fontSize: 12, color: "#8B7D66", marginTop: 4, fontFamily: "'Crimson Pro', serif" }}>Click or drag to replace</div>
                          </div>
                        ) : (
                          <div>
                            <div style={{ fontSize: 28, marginBottom: 8 }}>📤</div>
                            <div style={{ fontSize: 15, fontFamily: "'Crimson Pro', serif", color: "#6B5A3E" }}>Click or drag & drop a document</div>
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

                {/* Stats */}
                {submissions.length > 0 && (() => {
                  const stripHtml = (html) => { const d = document.createElement("div"); d.innerHTML = html; return d.textContent || ""; };
                  const withLength = submissions.map(s => ({ ...s, plainLength: stripHtml(s.content || "").length }));
                  const longest = withLength.reduce((a, b) => a.plainLength > b.plainLength ? a : b);
                  const totalWords = withLength.reduce((sum, s) => sum + stripHtml(s.content || "").split(/\s+/).filter(Boolean).length, 0);
                  const sectionsWithContent = new Set(submissions.map(s => s.section)).size;
                  const uniqueAuthors = new Set(submissions.map(s => s.author)).size;

                  // Family comparison (use allSubmissions to always show both)
                  const ottensoserCount = allSubmissions.filter(s => s.haggadot?.includes("ottensoser")).length;
                  const siegelCount = allSubmissions.filter(s => s.haggadot?.includes("siegel")).length;
                  const familyLeader = ottensoserCount === siegelCount ? "Tied!" : ottensoserCount > siegelCount ? "Ottensoser" : "Siegel";

                  // Most popular section
                  const sectionCounts = {};
                  submissions.forEach(s => { sectionCounts[s.section] = (sectionCounts[s.section] || 0) + 1; });
                  const topSectionNum = Object.entries(sectionCounts).sort((a, b) => b[1] - a[1])[0];
                  const topSection = topSectionNum ? SECTIONS.find(s => s.num === Number(topSectionNum[0])) : null;

                  return (
                    <div style={{
                      background: "rgba(139,105,20,0.03)", border: "1px solid rgba(139,105,20,0.08)",
                      borderRadius: 12, padding: "16px 20px", marginBottom: 24,
                    }}>
                      <div style={{ fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", color: "#8B6914", fontFamily: "'Crimson Pro', serif", marginBottom: 12 }}>Stats</div>
                      <div style={{ display: "flex", gap: 32, flexWrap: "wrap" }}>
                        <div style={{ textAlign: "center" }}>
                          <div style={{ fontSize: 22, fontWeight: 300, color: "#8B6914" }}>{submissions.length}</div>
                          <div style={{ fontSize: 10, color: "#9B8E78", fontFamily: "'Crimson Pro', serif", letterSpacing: "0.05em" }}>Submissions</div>
                        </div>
                        <div style={{ textAlign: "center" }}>
                          <div style={{ fontSize: 22, fontWeight: 300, color: "#8B6914" }}>{uniqueAuthors}</div>
                          <div style={{ fontSize: 10, color: "#9B8E78", fontFamily: "'Crimson Pro', serif", letterSpacing: "0.05em" }}>Contributors</div>
                        </div>
                        <div style={{ textAlign: "center" }}>
                          <div style={{ fontSize: 22, fontWeight: 300, color: "#8B6914" }}>{sectionsWithContent}/{SECTIONS.length}</div>
                          <div style={{ fontSize: 10, color: "#9B8E78", fontFamily: "'Crimson Pro', serif", letterSpacing: "0.05em" }}>Sections Filled</div>
                        </div>
                        <div style={{ textAlign: "center" }}>
                          <div style={{ fontSize: 22, fontWeight: 300, color: "#8B6914" }}>{totalWords.toLocaleString()}</div>
                          <div style={{ fontSize: 10, color: "#9B8E78", fontFamily: "'Crimson Pro', serif", letterSpacing: "0.05em" }}>Total Words</div>
                        </div>
                      </div>
                      <div style={{ marginTop: 12, paddingTop: 10, borderTop: "1px solid rgba(139,105,20,0.08)", fontSize: 12, color: "#8B7D66", fontFamily: "'Crimson Pro', serif", display: "flex", flexDirection: "column", gap: 6 }}>
                        <div>📏 <strong>Longest:</strong> {longest.author} — "{longest.title}" ({longest.plainLength.toLocaleString()} chars)</div>
                        <div>👨‍👩‍👧‍👦 <strong>Family race:</strong> Ottensoser {ottensoserCount} vs Siegel {siegelCount} — <strong>{familyLeader}{familyLeader !== "Tied!" ? " leads!" : ""}</strong></div>
                        {topSection && <div>🏆 <strong>Most popular section:</strong> {topSection.icon} {topSection.en} ({topSectionNum[1]} submission{topSectionNum[1] > 1 ? "s" : ""})</div>}
                      </div>
                    </div>
                  );
                })()}

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
                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                                <div style={{ flex: 1, minWidth: 0, cursor: "pointer" }} onClick={() => setExpandedIds(prev => {
                                  const next = new Set(prev);
                                  if (next.has(sub.id)) next.delete(sub.id); else next.add(sub.id);
                                  return next;
                                })}>
                                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                    <span style={{
                                      fontSize: 16, color: "#8B6914", fontWeight: 600,
                                      width: 26, height: 26, borderRadius: "50%",
                                      border: "1.5px solid #8B6914",
                                      display: "inline-flex", alignItems: "center", justifyContent: "center",
                                      flexShrink: 0, transition: "all .2s",
                                      background: expandedIds.has(sub.id) ? "#8B6914" : "transparent",
                                      color: expandedIds.has(sub.id) ? "#fff" : "#8B6914",
                                    }}>{expandedIds.has(sub.id) ? "−" : "+"}</span>
                                    <span style={{ fontSize: 15, fontWeight: 600 }}>{sub.author}</span>
                                    {sub.title && <span style={{ fontSize: 14, color: "#6B5A3E", fontStyle: "italic" }}>"{sub.title}"</span>}
                                  </div>
                                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 3, marginLeft: 20, flexWrap: "wrap" }}>
                                    <span style={{ fontSize: 11, color: "#9B8E78", fontFamily: "'Crimson Pro', serif" }}>{sub.date}</span>
                                    {HAGGADOT.map(h => {
                                      const tagged = sub.haggadot?.includes(h.id);
                                      return (
                                        <button key={h.id} onClick={async (e) => {
                                          e.stopPropagation();
                                          const current = sub.haggadot || [];
                                          const next = tagged ? current.filter(x => x !== h.id) : [...current, h.id];
                                          try { await updateSubmission(sub.id, { haggadot: next }); } catch(e) { console.error(e); }
                                        }} style={{
                                          fontSize: 10, padding: "2px 10px", borderRadius: 10, cursor: "pointer",
                                          border: tagged ? "1px solid #8B6914" : "1px dashed rgba(139,105,20,0.3)",
                                          background: tagged ? "#8B6914" : "transparent",
                                          color: tagged ? "#fff" : "#8B7D66",
                                          fontFamily: "'Crimson Pro', serif", fontWeight: 500,
                                          transition: "all .2s",
                                        }}>{h.name.split(" ")[0]}</button>
                                      );
                                    })}
                                    {sub.fileName && (
                                      sub.fileUrl ? (
                                        <a href={sub.fileUrl} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} style={{ fontSize: 11, color: "#8B6914", fontFamily: "'Crimson Pro', serif", textDecoration: "underline" }}>
                                          📎 {sub.fileName}
                                        </a>
                                      ) : sub.fileError ? (
                                        <span style={{ fontSize: 11, color: "#CC3333", fontFamily: "'Crimson Pro', serif" }}>📎 Upload failed</span>
                                      ) : (
                                        <span style={{ fontSize: 11, color: "#9B8E78", fontFamily: "'Crimson Pro', serif" }}>📎 {sub.fileName} <span style={{ color: "#BDB3A0" }}>(uploading...)</span></span>
                                      )
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

                              {/* Expanded content */}
                              {expandedIds.has(sub.id) && (
                                <div style={{ marginTop: 12, marginLeft: 20, paddingTop: 12, borderTop: "1px solid rgba(139,105,20,0.08)" }}>
                                  {/* Attached file banner */}
                                  {sub.fileName && (
                                    <div style={{
                                      display: "flex", alignItems: "center", gap: 10, padding: "10px 14px",
                                      background: "rgba(139,105,20,0.04)", borderRadius: 8, marginBottom: 12,
                                      border: "1px solid rgba(139,105,20,0.08)",
                                    }}>
                                      <span style={{ fontSize: 20 }}>📄</span>
                                      <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontSize: 13, fontFamily: "'Crimson Pro', serif", fontWeight: 500, color: "#2C2416", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                          {sub.fileName}
                                        </div>
                                        <div style={{ fontSize: 11, color: "#9B8E78", fontFamily: "'Crimson Pro', serif" }}>
                                          Original uploaded file
                                        </div>
                                      </div>
                                      {sub.fileUrl ? (
                                        <a href={sub.fileUrl} target="_blank" rel="noopener noreferrer" style={{
                                          padding: "6px 14px", borderRadius: 8, background: "#8B6914", color: "#fff",
                                          fontSize: 12, fontFamily: "'Crimson Pro', serif", fontWeight: 500,
                                          textDecoration: "none", whiteSpace: "nowrap", flexShrink: 0,
                                        }}>Download</a>
                                      ) : sub.fileError ? (
                                        <span style={{ fontSize: 11, color: "#CC3333", fontFamily: "'Crimson Pro', serif", flexShrink: 0 }}>
                                          Upload failed: {sub.fileError}
                                        </span>
                                      ) : (
                                        <span style={{ fontSize: 11, color: "#BDB3A0", fontFamily: "'Crimson Pro', serif", flexShrink: 0 }}>Uploading...</span>
                                      )}
                                    </div>
                                  )}

                                  <div className="rich-content" style={{ fontSize: 14, lineHeight: 1.65, color: "#4A4030", fontFamily: "'Crimson Pro', serif", fontWeight: 300 }}
                                    dangerouslySetInnerHTML={{ __html: sub.content }} />
                                </div>
                              )}
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

            {/* Table of Contents */}
            {(() => {
              const activeSecs = SECTIONS.filter(sec => submissions.some(s => s.section === sec.num));
              return activeSecs.length > 0 && (
                <div style={{
                  background: "#FFFCF7", border: "1px solid rgba(139,105,20,0.1)",
                  borderRadius: 14, padding: "32px 36px", marginBottom: 36,
                }}>
                  <h3 style={{ fontSize: 22, fontWeight: 400, textAlign: "center", marginBottom: 4 }}>Table of Contents</h3>
                  <div style={{ width: 60, height: 1, margin: "12px auto 24px", background: "linear-gradient(90deg, transparent, #C4943D, transparent)" }} />
                  {activeSecs.map(sec => {
                    const count = submissions.filter(s => s.section === sec.num).length;
                    return (
                      <div key={sec.num} style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 10, fontSize: 15 }}>
                        <span style={{ whiteSpace: "nowrap", fontWeight: 500 }}>
                          {sec.icon} {sec.en}{" "}
                          <span style={{ fontFamily: "'Frank Ruhl Libre', serif", color: "#8B6914", fontSize: 14, direction: "rtl" }}>{sec.he}</span>
                        </span>
                        <span style={{ flex: 1, borderBottom: "1px dotted rgba(139,105,20,0.2)", minWidth: 20, position: "relative", top: -3 }} />
                        <span style={{ whiteSpace: "nowrap", fontSize: 12, color: "#9B8E78", fontFamily: "'Crimson Pro', serif" }}>{count}</span>
                      </div>
                    );
                  })}
                </div>
              );
            })()}

            {SECTIONS.filter(sec => submissions.some(s => s.section === sec.num)).map(sec => {
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
                  {subs.map((sub, i) => (
                    <div key={sub.id}>
                      <div style={{ marginLeft: 50, marginBottom: i<subs.length-1?20:0, paddingBottom: i<subs.length-1?20:0, borderBottom: i<subs.length-1?"1px dashed rgba(139,105,20,0.1)":"none" }}>
                        {sub.title && <div style={{ fontSize: 18, fontStyle: "italic", fontWeight: 500, color: "#2C2416", marginBottom: 4 }}>{sub.title}</div>}
                        <div style={{ fontSize: 13, color: "#8B6914", marginBottom: 10, fontStyle: "italic", fontWeight: 500 }}>— {sub.author}</div>
                        <div className="rich-content" style={{ fontSize: 15, lineHeight: 1.8, color: "#3D3525", fontFamily: "'Crimson Pro', serif", fontWeight: 300 }}
                          dangerouslySetInnerHTML={{ __html: sub.content }} />
                      </div>
                      {/* Image insertion point */}
                      <div style={{ margin: "12px 0", textAlign: "center" }}>
                        {pdfSettings.insertedImages?.[sec.num]?.[i] ? (
                          <div style={{ position: "relative", display: "inline-block" }}>
                            <img src={pdfSettings.insertedImages[sec.num][i]} style={{ maxWidth: "100%", maxHeight: 250, borderRadius: 8, display: "block" }} />
                            <button onClick={() => {
                              const updated = { ...pdfSettings.insertedImages };
                              if (updated[sec.num]) { delete updated[sec.num][i]; }
                              setPdfSettings({ ...pdfSettings, insertedImages: updated });
                            }} style={{
                              position: "absolute", top: 6, right: 6, width: 24, height: 24, borderRadius: "50%",
                              background: "rgba(0,0,0,0.5)", color: "#fff", border: "none", cursor: "pointer",
                              fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center",
                            }}>×</button>
                          </div>
                        ) : (
                          <label style={{
                            display: "inline-flex", alignItems: "center", gap: 6,
                            padding: "6px 16px", borderRadius: 20, cursor: "pointer",
                            border: "1px dashed rgba(139,105,20,0.2)", color: "#BDB3A0",
                            fontSize: 12, fontFamily: "'Crimson Pro', serif",
                            transition: "all .2s",
                          }}>
                            <span>+ Insert image here</span>
                            <input type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (!file) return;
                              const reader = new FileReader();
                              reader.onload = (ev) => {
                                const updated = { ...pdfSettings.insertedImages };
                                if (!updated[sec.num]) updated[sec.num] = {};
                                updated[sec.num][i] = ev.target.result;
                                setPdfSettings({ ...pdfSettings, insertedImages: updated });
                              };
                              reader.readAsDataURL(file);
                              e.target.value = "";
                            }} />
                          </label>
                        )}
                      </div>
                    </div>
                  ))}
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
