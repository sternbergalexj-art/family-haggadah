import { useState, useRef, useCallback, useEffect } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import TextAlign from "@tiptap/extension-text-align";
import Image from "@tiptap/extension-image";
import { subscribeToSubmissions, addSubmission, removeSubmission, updateSubmission, updateSubmissionOrder } from "./firebase.js";

const SECTIONS = [
  { num: 1, en: "Kadeish", he: "\u05e7\u05b7\u05d3\u05bc\u05b5\u05e9\u05c1", desc: "Sanctification \u2014 first cup of wine", icon: "\ud83c\udf77" },
  { num: 2, en: "Ur\u2019chatz", he: "\u05d5\u05bc\u05e8\u05b0\u05d7\u05b7\u05e5", desc: "Washing the hands", icon: "\ud83d\udca7" },
  { num: 3, en: "Karpas", he: "\u05db\u05b7\u05bc\u05e8\u05b0\u05e4\u05b7\u05bc\u05e1", desc: "Dipping vegetable in salt water", icon: "\ud83c\udf3f" },
  { num: 4, en: "Yachatz", he: "\u05d9\u05b7\u05d7\u05b7\u05e5", desc: "Breaking the middle matzah", icon: "\u270b" },
  { num: 5, en: "Maggid", he: "\u05de\u05b7\u05d2\u05bc\u05b4\u05d9\u05d3", desc: "The telling \u2014 relating the Exodus story", icon: "\ud83d\udcd6" },
  { num: 6, en: "Rachtzah", he: "\u05e8\u05b8\u05d7\u05b0\u05e6\u05b8\u05d4", desc: "Washing hands before the meal", icon: "\ud83e\udee7" },
  { num: 7, en: "Motzi", he: "\u05de\u05d5\u05b9\u05e6\u05b4\u05d9\u05d0", desc: "Blessing over the matzah", icon: "\ud83d\ude4c" },
  { num: 8, en: "Matzah", he: "\u05de\u05b7\u05e6\u05bc\u05b8\u05d4", desc: "Specific blessing for eating matzah", icon: "\ud83e\uded3" },
  { num: 9, en: "Maror", he: "\u05de\u05b8\u05e8\u05d5\u05b9\u05e8", desc: "Eating bitter herbs", icon: "\ud83e\udd6c" },
  { num: 10, en: "Koreich", he: "\u05db\u05bc\u05d5\u05b9\u05e8\u05b5\u05da\u05b0", desc: "Sandwich of matzah and bitter herbs", icon: "\ud83e\udd6a" },
  { num: 11, en: "Shulchan Orech", he: "\u05e9\u05bb\u05c1\u05dc\u05b0\u05d7\u05b8\u05df \u05e2\u05d5\u05b9\u05e8\u05b5\u05da\u05b0", desc: "The festive meal", icon: "\ud83c\udf7d\ufe0f" },
  { num: 12, en: "Tzafun", he: "\u05e6\u05b8\u05e4\u05d5\u05bc\u05df", desc: "Eating the hidden Afikoman", icon: "\ud83d\udd0d" },
  { num: 13, en: "Bareich", he: "\u05d1\u05bc\u05b8\u05e8\u05b5\u05da\u05b0", desc: "Grace after meals", icon: "\ud83d\ude4f" },
  { num: 14, en: "Hallel", he: "\u05d4\u05b7\u05dc\u05bc\u05b5\u05dc", desc: "Songs of praise and wine", icon: "\ud83c\udfb6" },
  { num: 15, en: "Nirtzah", he: "\u05e0\u05b4\u05d9\u05e8\u05b0\u05e6\u05b8\u05d4", desc: "Acceptance \u2014 closing the Seder", icon: "\u2721\ufe0f" },
];

const HAGGADOT = [
  { id: "ottensoser", name: "Ottensoser Family" },
  { id: "siegel", name: "Siegel Family" },
];

const ADMIN_PASSWORD = "seder";

function RichEditor({ content, onUpdate }) {
  const imgInputRef = useRef(null);
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3] } }),
      Underline,
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Image.configure({ inline: false, allowBase64: true }),
    ],
    content: content || "",
    onUpdate: ({ editor }) => onUpdate(editor.getHTML()),
    editorProps: {
      attributes: { class: "rich-editor-content", dir: "auto" },
      handlePaste: (view, event) => {
        const items = event.clipboardData?.items;
        if (items) {
          for (const item of items) {
            if (item.type.startsWith("image/")) {
              event.preventDefault();
              const file = item.getAsFile();
              if (file) {
                const reader = new FileReader();
                reader.onload = (e) => {
                  view.dispatch(view.state.tr.replaceSelectionWith(
                    view.state.schema.nodes.image.create({ src: e.target.result })
                  ));
                };
                reader.readAsDataURL(file);
              }
              return true;
            }
          }
        }
        return false;
      },
      handleDrop: (view, event) => {
        const files = event.dataTransfer?.files;
        if (files?.length) {
          for (const file of files) {
            if (file.type.startsWith("image/")) {
              event.preventDefault();
              const reader = new FileReader();
              reader.onload = (e) => {
                const pos = view.posAtCoords({ left: event.clientX, top: event.clientY });
                if (pos) view.dispatch(view.state.tr.insert(pos.pos, view.state.schema.nodes.image.create({ src: e.target.result })));
              };
              reader.readAsDataURL(file);
              return true;
            }
          }
        }
        return false;
      },
    },
  });

  const handleImageFile = useCallback((e) => {
    const file = e.target.files?.[0];
    if (!file || !editor) return;
    const reader = new FileReader();
    reader.onload = (ev) => editor.chain().focus().setImage({ src: ev.target.result }).run();
    reader.readAsDataURL(file);
    e.target.value = "";
  }, [editor]);

  if (!editor) return null;

  const TB = ({ onClick, active, children, title }) => (
    <button onClick={onClick} title={title} style={{
      padding: "6px 10px", borderRadius: 6, border: "none", cursor: "pointer", fontSize: 13,
      fontFamily: "'Crimson Pro', serif", background: active ? "rgba(139,105,20,0.15)" : "transparent",
      color: active ? "#2C2416" : "#8B7D66", fontWeight: active ? 600 : 400,
      lineHeight: 1, display: "flex", alignItems: "center", justifyContent: "center", minWidth: 32, height: 32,
    }}>{children}</button>
  );

  const Sep = () => <div style={{ width: 1, height: 20, background: "rgba(139,105,20,0.12)", margin: "0 4px" }} />;

  return (
    <div style={{ border: "1px solid rgba(139,105,20,0.18)", borderRadius: 12, background: "#FFFCF7", overflow: "hidden" }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 2, padding: "8px 12px", borderBottom: "1px solid rgba(139,105,20,0.1)", background: "rgba(139,105,20,0.02)", alignItems: "center" }}>
        <TB onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive("bold")} title="Bold"><strong>B</strong></TB>
        <TB onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive("italic")} title="Italic"><em>I</em></TB>
        <TB onClick={() => editor.chain().focus().toggleUnderline().run()} active={editor.isActive("underline")} title="Underline"><span style={{textDecoration:"underline"}}>U</span></TB>
        <Sep/>
        <TB onClick={() => editor.chain().focus().toggleHeading({level:2}).run()} active={editor.isActive("heading",{level:2})} title="Heading">H</TB>
        <TB onClick={() => editor.chain().focus().toggleBulletList().run()} active={editor.isActive("bulletList")} title="Bullets">{"\u2022\u2261"}</TB>
        <TB onClick={() => editor.chain().focus().toggleOrderedList().run()} active={editor.isActive("orderedList")} title="Numbers">1.</TB>
        <TB onClick={() => editor.chain().focus().toggleBlockquote().run()} active={editor.isActive("blockquote")} title="Quote">{"\u201c"}</TB>
        <Sep/>
        <TB onClick={() => editor.chain().focus().setTextAlign("left").run()} active={editor.isActive({textAlign:"left"})} title="Left">{"\u2261\u2190"}</TB>
        <TB onClick={() => editor.chain().focus().setTextAlign("center").run()} active={editor.isActive({textAlign:"center"})} title="Center">{"\u2261\u2261"}</TB>
        <TB onClick={() => editor.chain().focus().setTextAlign("right").run()} active={editor.isActive({textAlign:"right"})} title="Right (Hebrew)">{"\u2192\u2261"}</TB>
        <Sep/>
        <TB onClick={() => imgInputRef.current?.click()} title="Image">{"\ud83d\uddbc"}</TB>
        <input type="file" ref={imgInputRef} onChange={handleImageFile} accept="image/*" style={{display:"none"}} />
        <div style={{flex:1}}/>
        <span style={{fontSize:10,color:"#B8AD98",fontFamily:"'Crimson Pro', serif"}}>Paste from Word/Docs</span>
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}

function EditRichEditor({ content, onUpdate }) {
  const editor = useEditor({
    extensions: [StarterKit.configure({heading:{levels:[2,3]}}), Underline, TextAlign.configure({types:["heading","paragraph"]}), Image.configure({inline:false,allowBase64:true})],
    content: content || "",
    onUpdate: ({editor}) => onUpdate(editor.getHTML()),
    editorProps: {attributes:{class:"rich-editor-content edit-mode",dir:"auto"}},
  });
  if (!editor) return null;
  return (
    <div style={{border:"1px solid rgba(139,105,20,0.25)",borderRadius:10,background:"#FFFCF7",overflow:"hidden"}}>
      <div style={{display:"flex",flexWrap:"wrap",gap:2,padding:"6px 10px",borderBottom:"1px solid rgba(139,105,20,0.1)",background:"rgba(139,105,20,0.02)"}}>
        <button onClick={()=>editor.chain().focus().toggleBold().run()} style={{padding:"4px 8px",border:"none",background:editor.isActive("bold")?"rgba(139,105,20,0.15)":"transparent",borderRadius:4,cursor:"pointer",fontSize:12}}><strong>B</strong></button>
        <button onClick={()=>editor.chain().focus().toggleItalic().run()} style={{padding:"4px 8px",border:"none",background:editor.isActive("italic")?"rgba(139,105,20,0.15)":"transparent",borderRadius:4,cursor:"pointer",fontSize:12}}><em>I</em></button>
        <button onClick={()=>editor.chain().focus().setTextAlign("right").run()} style={{padding:"4px 8px",border:"none",background:editor.isActive({textAlign:"right"})?"rgba(139,105,20,0.15)":"transparent",borderRadius:4,cursor:"pointer",fontSize:12}}>{"\u2192\u2261"}</button>
        <button onClick={()=>editor.chain().focus().setTextAlign("left").run()} style={{padding:"4px 8px",border:"none",background:editor.isActive({textAlign:"left"})?"rgba(139,105,20,0.15)":"transparent",borderRadius:4,cursor:"pointer",fontSize:12}}>{"\u2261\u2190"}</button>
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}

async function loadScript(src) {
  if (document.querySelector('script[src="'+src+'"]')) return;
  return new Promise((resolve, reject) => { const s=document.createElement("script"); s.src=src; s.onload=resolve; s.onerror=reject; document.head.appendChild(s); });
}

async function parsePDF(file) {
  await loadScript("https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js");
  window.pdfjsLib.GlobalWorkerOptions.workerSrc="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
  const buf=await file.arrayBuffer();
  const pdf=await window.pdfjsLib.getDocument({data:buf}).promise;
  let text="";
  for(let i=1;i<=pdf.numPages;i++){const page=await pdf.getPage(i);const c=await page.getTextContent();const lines=[];let lastY=null;for(const item of c.items){if(lastY!==null&&Math.abs(item.transform[5]-lastY)>5)lines.push("\n");lines.push(item.str);lastY=item.transform[5];}text+=lines.join("")+"\n\n";}
  return "<p>"+text.trim().split(/\n\n+/).map(p=>p.replace(/\n/g,"<br>")).join("</p><p>")+"</p>";
}

async function parseDOCX(file) {
  await loadScript("https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js");
  const buf=await file.arrayBuffer();
  const result=await window.mammoth.convertToHtml({arrayBuffer:buf},{styleMap:["p[style-name='Heading 1'] => h2:fresh","p[style-name='Heading 2'] => h3:fresh"]});
  return result.value||"<p></p>";
}

async function parseFile(file) {
  const n=file.name.toLowerCase();
  if(n.endsWith(".pdf"))return parsePDF(file);
  if(n.endsWith(".docx")||n.endsWith(".doc"))return parseDOCX(file);
  const text=await file.text();
  return "<p>"+text.split(/\n\n+/).map(p=>p.replace(/\n/g,"<br>")).join("</p><p>")+"</p>";
}

async function exportPDF(submissions, familyName, year) {
  await loadScript("https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js");
  const{jsPDF}=window.jspdf;const doc=new jsPDF({unit:"pt",format:"letter"});
  const W=doc.internal.pageSize.getWidth(),H=doc.internal.pageSize.getHeight(),ML=72,MR=72,CW=W-ML-MR;let y=0;
  const checkPage=(need)=>{if(y+need>H-72){doc.addPage();bg();y=72;}};
  const bg=()=>{doc.setFillColor(250,246,240);doc.rect(0,0,W,H,"F");};
  const strip=(html)=>{const d=document.createElement("div");d.innerHTML=html;return d.textContent||"";};
  bg();doc.setDrawColor(196,148,61);doc.setLineWidth(1.5);doc.rect(36,36,W-72,H-72);doc.setLineWidth(0.5);doc.rect(42,42,W-84,H-84);
  doc.setFont("helvetica","normal");doc.setFontSize(14);doc.setTextColor(139,105,20);doc.text("Haggadah shel Pesach",W/2,220,{align:"center"});
  doc.setLineWidth(0.8);doc.line(W/2-60,245,W/2+60,245);doc.setFontSize(36);doc.setTextColor(44,36,22);
  doc.text("The "+familyName,W/2,300,{align:"center"});doc.text("Haggadah",W/2,345,{align:"center"});
  doc.setFontSize(16);doc.setTextColor(139,105,20);doc.text("Passover "+year,W/2,395,{align:"center"});doc.line(W/2-40,420,W/2+40,420);
  SECTIONS.forEach((sec)=>{
    const subs=submissions.filter(s=>s.section===sec.num).sort((a,b)=>(a.order??a.createdAt??0)-(b.order??b.createdAt??0));
    doc.addPage();bg();y=72;doc.setFontSize(12);doc.setTextColor(139,105,20);doc.setFont("helvetica","normal");doc.text(sec.num+".",ML,y);
    doc.setFontSize(22);doc.setTextColor(44,36,22);doc.text(sec.en,ML+24,y);doc.setFontSize(10);doc.setTextColor(139,126,102);y+=18;doc.text(sec.desc,ML,y);y+=10;
    doc.setDrawColor(196,148,61);doc.setLineWidth(0.5);doc.line(ML,y,W-MR,y);y+=24;
    if(subs.length===0){doc.setFontSize(11);doc.setTextColor(180,170,150);doc.setFont("helvetica","italic");doc.text("No submissions for this section.",ML+16,y);doc.setFont("helvetica","normal");return;}
    subs.forEach((sub,idx)=>{checkPage(80);
      if(sub.title){doc.setFontSize(13);doc.setTextColor(44,36,22);doc.setFont("helvetica","italic");doc.splitTextToSize(sub.title,CW-32).forEach(line=>{checkPage(18);doc.text(line,ML+16,y);y+=18;});y+=2;}
      doc.setFont("helvetica","normal");doc.setFontSize(11);doc.setTextColor(61,53,37);
      doc.splitTextToSize(strip(sub.content),CW-32).forEach(line=>{checkPage(16);doc.text(line,ML+16,y);y+=16;});
      y+=4;checkPage(20);doc.setFontSize(10);doc.setTextColor(139,105,20);doc.setFont("helvetica","italic");doc.text("\u2014 "+sub.author,ML+16,y);doc.setFont("helvetica","normal");y+=28;
      if(idx<subs.length-1){checkPage(20);doc.setDrawColor(220,210,195);doc.setLineDashPattern([3,3],0);doc.line(ML+16,y-10,W-MR-16,y-10);doc.setLineDashPattern([],0);}
    });
  });
  doc.addPage();bg();doc.setDrawColor(196,148,61);doc.setLineWidth(0.8);doc.line(W/2-60,H/2-40,W/2+60,H/2-40);
  doc.setFontSize(18);doc.setTextColor(139,105,20);doc.setFont("helvetica","normal");doc.text("L'shanah haba'ah b'Yerushalayim",W/2,H/2,{align:"center"});
  doc.setFontSize(13);doc.setTextColor(107,90,62);doc.setFont("helvetica","italic");doc.text("Next year in Jerusalem",W/2,H/2+28,{align:"center"});
  doc.line(W/2-60,H/2+50,W/2+60,H/2+50);doc.save(familyName.replace(/\s+/g,"-")+"-Haggadah-"+year+".pdf");
}

export default function App(){
  const[view,setView]=useState("home");const[selectedSection,setSelectedSection]=useState(null);const[allSubmissions,setAllSubmissions]=useState([]);
  const[loading,setLoading]=useState(true);const[authorName,setAuthorName]=useState("");const[richContent,setRichContent]=useState("");
  const[title,setTitle]=useState("");const[uploadedFile,setUploadedFile]=useState(null);const[uploadedHTML,setUploadedHTML]=useState("");
  const[inputMode,setInputMode]=useState("text");const[submitSuccess,setSubmitSuccess]=useState(false);const[submitting,setSubmitting]=useState(false);
  const[submitError,setSubmitError]=useState(null);const[adminPassword,setAdminPassword]=useState("");const[adminAuthed,setAdminAuthed]=useState(false);
  const[selectedHaggadot,setSelectedHaggadot]=useState([]);const[adminFilter,setAdminFilter]=useState("all");
  const[editingId,setEditingId]=useState(null);const[editData,setEditData]=useState({});const[parsing,setParsing]=useState(false);
  const[exporting,setExporting]=useState(false);const[editorKey,setEditorKey]=useState(0);const fileInputRef=useRef(null);const year="5786";

  const submissions=adminFilter==="all"?allSubmissions:allSubmissions.filter(s=>s.haggadot&&s.haggadot.includes(adminFilter));

  useEffect(()=>{const unsub=subscribeToSubmissions(subs=>{setAllSubmissions(subs);setLoading(false);});return()=>unsub();},[]);

  const toggleHaggadah=useCallback((id)=>{setSelectedHaggadot(prev=>prev.includes(id)?prev.filter(h=>h!==id):[...prev,id]);},[]);

  const handleFileUpload=useCallback(async(e)=>{
    const file=e.target.files?.[0];if(!file)return;setUploadedFile(file);setParsing(true);
    try{setUploadedHTML(await parseFile(file));}catch(err){console.error(err);try{const t=await file.text();setUploadedHTML("<p>"+t.split(/\n\n+/).map(p=>p.replace(/\n/g,"<br>")).join("</p><p>")+"</p>");}catch{setUploadedHTML("<p>[Could not parse]</p>");}}
    setParsing(false);
  },[]);

  const handleSubmit=useCallback(async()=>{
    const content=inputMode==="text"?richContent:uploadedHTML;
    const isEmpty=!content||content==="<p></p>"||content.replace(/<[^>]*>/g,"").trim()==="";
    if(!authorName.trim()||isEmpty||!selectedSection||selectedHaggadot.length===0)return;
    setSubmitting(true);setSubmitError(null);
    try{await addSubmission({section:selectedSection,author:authorName.trim(),title:title.trim(),content,date:new Date().toLocaleDateString(),fileName:uploadedFile?.name||null,haggadot:selectedHaggadot,order:allSubmissions.filter(s=>s.section===selectedSection).length});
      setSubmitSuccess(true);setTimeout(()=>{setSubmitSuccess(false);setSelectedSection(null);setRichContent("");setTitle("");setUploadedHTML("");setUploadedFile(null);setSelectedHaggadot([]);setEditorKey(k=>k+1);setView("home");},2500);
    }catch(err){console.error(err);setSubmitError("Error: "+err.message);}setSubmitting(false);
  },[inputMode,richContent,uploadedHTML,authorName,title,selectedSection,uploadedFile,selectedHaggadot,allSubmissions]);

  const deleteSub=useCallback(async(id)=>{if(!confirm("Delete?"))return;try{await removeSubmission(id);}catch(e){console.error(e);}},[]);
  const startEdit=useCallback((sub)=>{setEditingId(sub.id);setEditData({author:sub.author,title:sub.title||"",content:sub.content});},[]);
  const saveEdit=useCallback(async()=>{if(!editingId)return;try{await updateSubmission(editingId,editData);setEditingId(null);}catch(e){console.error(e);}},[editingId,editData]);
  const moveSub=useCallback(async(secNum,from,to)=>{
    const subs=submissions.filter(s=>s.section===secNum).sort((a,b)=>(a.order??a.createdAt??0)-(b.order??b.createdAt??0));
    if(to<0||to>=subs.length)return;const arr=[...subs];const[m]=arr.splice(from,1);arr.splice(to,0,m);
    try{await Promise.all(arr.map((s,i)=>updateSubmissionOrder(s.id,i)));}catch(e){console.error(e);}
  },[submissions]);
  const doExport=useCallback(async(fid)=>{const fam=HAGGADOT.find(h=>h.id===fid);const filtered=allSubmissions.filter(s=>s.haggadot&&s.haggadot.includes(fid));setExporting(true);try{await exportPDF(filtered,fam.name,year);}catch(e){alert("Export error");console.error(e);}setExporting(false);},[allSubmissions,year]);
  const getHL=(sub)=>{if(!sub.haggadot||sub.haggadot.length===0)return"";if(sub.haggadot.length===2)return"Both";const h=HAGGADOT.find(x=>x.id===sub.haggadot[0]);return h?h.name:"";};

  const css=`@import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;0,600;0,700;1,400;1,500&family=Frank+Ruhl+Libre:wght@0,300;0,400;0,500;0,700&family=Crimson+Pro:ital,wght@0,300;0,400;0,500;1,300;1,400&display=swap');
*{box-sizing:border-box;margin:0;padding:0}body{background:#FAF6F0}::selection{background:rgba(139,105,20,0.2)}input:focus,textarea:focus{outline:none;border-color:#8B6914!important}
@keyframes fadeUp{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}@keyframes spin{to{transform:rotate(360deg)}}
.fade-up{animation:fadeUp .5s ease forwards}.sc:hover{transform:translateY(-3px);box-shadow:0 8px 30px rgba(139,105,20,0.12)!important}.sc{transition:all .3s ease;cursor:pointer}
.nb:hover{background:rgba(44,36,22,0.06)!important}.ab:hover{background:rgba(139,105,20,0.1)!important}.hag-chip{transition:all .2s ease;cursor:pointer;user-select:none}.hag-chip:hover{transform:translateY(-1px)}
@media(max-width:600px){.g2{grid-template-columns:1fr!important}.sr{gap:24px!important}}
.rich-editor-content{padding:16px 20px;min-height:220px;font-family:'Crimson Pro',serif;font-size:15px;line-height:1.75;color:#2C2416;outline:none}
.rich-editor-content.edit-mode{min-height:120px;font-size:13px;padding:12px 16px}
.rich-editor-content p{margin-bottom:0.75em}.rich-editor-content p:last-child{margin-bottom:0}
.rich-editor-content h2{font-family:'Cormorant Garamond',serif;font-size:22px;font-weight:600;margin:0.5em 0 0.3em;color:#2C2416}
.rich-editor-content h3{font-family:'Cormorant Garamond',serif;font-size:18px;font-weight:600;margin:0.5em 0 0.3em;color:#4A4030}
.rich-editor-content ul,.rich-editor-content ol{padding-left:1.5em;margin-bottom:0.75em}.rich-editor-content li{margin-bottom:0.25em}
.rich-editor-content blockquote{border-left:3px solid #C4943D;padding-left:16px;margin:0.75em 0;color:#6B5A3E;font-style:italic}
.rich-editor-content img{max-width:100%;height:auto;border-radius:8px;margin:12px 0}.rich-editor-content strong{font-weight:700}
.rich-editor-content em{font-style:italic}.rich-editor-content u{text-decoration:underline}
.rendered-content{font-family:'Crimson Pro',serif;font-size:15px;line-height:1.8;color:#3D3525;font-weight:300}
.rendered-content p{margin-bottom:0.6em}.rendered-content p:last-child{margin-bottom:0}
.rendered-content h2{font-family:'Cormorant Garamond',serif;font-size:20px;font-weight:600;margin:0.4em 0 0.2em}
.rendered-content h3{font-family:'Cormorant Garamond',serif;font-size:17px;font-weight:600;margin:0.4em 0 0.2em}
.rendered-content ul,.rendered-content ol{padding-left:1.5em;margin-bottom:0.6em}
.rendered-content blockquote{border-left:3px solid #C4943D;padding-left:14px;margin:0.6em 0;color:#6B5A3E;font-style:italic}
.rendered-content img{max-width:100%;height:auto;border-radius:8px;margin:10px 0}.rendered-content strong{font-weight:600}
.rendered-admin{font-size:13px;line-height:1.6;max-height:120px;overflow:hidden;mask-image:linear-gradient(to bottom,black 60%,transparent);-webkit-mask-image:linear-gradient(to bottom,black 60%,transparent)}.rendered-admin img{max-height:80px}
.ProseMirror:focus{outline:none}`;

  const inp={width:"100%",padding:"12px 16px",borderRadius:10,border:"1px solid rgba(139,105,20,0.18)",background:"#FFFCF7",fontSize:15,fontFamily:"'Crimson Pro', serif",color:"#2C2416",transition:"border-color 0.2s"};

  if(loading)return(<div style={{fontFamily:"'Cormorant Garamond', serif",minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:"#FAF6F0"}}><style>{css}</style><div style={{textAlign:"center",color:"#8B6914"}}><div style={{width:32,height:32,border:"3px solid rgba(139,105,20,0.2)",borderTopColor:"#8B6914",borderRadius:"50%",animation:"spin .8s linear infinite",margin:"0 auto 16px"}}/><div style={{fontSize:15,fontFamily:"'Crimson Pro', serif",fontWeight:300}}>Loading Haggadah...</div></div></div>);

  return(
    <div style={{fontFamily:"'Cormorant Garamond', serif",minHeight:"100vh",background:"linear-gradient(170deg, #FAF6F0 0%, #F3EDE4 40%, #EDE5D8 100%)",color:"#2C2416"}}>
      <style>{css}</style>
      <div style={{height:4,background:"linear-gradient(90deg, transparent, #8B6914, #C4943D, #8B6914, transparent)"}}/>
      <nav style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"16px 28px",borderBottom:"1px solid rgba(139,105,20,0.12)",flexWrap:"wrap",gap:8}}>
        <div onClick={()=>setView("home")} style={{fontSize:15,letterSpacing:"0.15em",textTransform:"uppercase",color:"#8B6914",fontWeight:600,fontFamily:"'Crimson Pro', serif",cursor:"pointer"}}>{"\u2721"} Family Haggadah</div>
        <div style={{display:"flex",gap:6}}>
          {[["home","Home"],["submit","Add Dvar Torah"],["admin","Admin"]].map(([v,l])=>(
            <button key={v} className="nb" onClick={()=>{if(v==="submit"){setSelectedSection(null);setSelectedHaggadot([]);setEditorKey(k=>k+1);}setView(v);}}
              style={{padding:"7px 16px",borderRadius:20,border:"none",cursor:"pointer",fontSize:13,fontFamily:"'Crimson Pro', serif",fontWeight:500,letterSpacing:"0.05em",transition:"all .25s",
                background:(view===v||(v==="admin"&&view==="preview"))?"#2C2416":"transparent",color:(view===v||(v==="admin"&&view==="preview"))?"#FAF6F0":"#6B5A3E"}}>{l}</button>
          ))}
        </div>
      </nav>
      <div style={{maxWidth:860,margin:"0 auto",padding:"32px 20px 60px"}}>

        {view==="home"&&(
          <div className="fade-up" style={{textAlign:"center",paddingTop:40}}>
            <div style={{fontSize:13,letterSpacing:"0.3em",textTransform:"uppercase",color:"#8B6914",fontFamily:"'Crimson Pro', serif",fontWeight:500,marginBottom:16}}>Passover {year}</div>
            <h1 style={{fontSize:"clamp(36px, 6vw, 52px)",fontWeight:300,lineHeight:1.15,marginBottom:12}}>Family Haggadah</h1>
            <div style={{display:"flex",justifyContent:"center",gap:16,marginBottom:40,flexWrap:"wrap"}}>
              {HAGGADOT.map(h=>(<span key={h.id} style={{fontSize:14,color:"#6B5A3E",fontFamily:"'Crimson Pro', serif",fontStyle:"italic",fontWeight:300}}>{h.name}</span>))}
            </div>
            <div style={{width:120,height:1,margin:"0 auto 40px",background:"linear-gradient(90deg, transparent, #C4943D, transparent)"}}/>
            <p style={{fontSize:17,lineHeight:1.7,color:"#5A4E3A",maxWidth:520,margin:"0 auto 48px",fontFamily:"'Crimson Pro', serif",fontWeight:300}}>
              A collection of divrei Torah and insights from our families, woven together to enrich our Seder tables.</p>
            <div className="sr" style={{display:"flex",justifyContent:"center",gap:48,marginBottom:48}}>
              {[[allSubmissions.length,"Submissions"],[new Set(allSubmissions.map(s=>s.section)).size,"Sections Filled"],[15-new Set(allSubmissions.map(s=>s.section)).size,"Remaining"]].map(([v,l],i)=>(
                <div key={i} style={{textAlign:"center"}}><div style={{fontSize:32,fontWeight:300,color:"#8B6914"}}>{v}</div><div style={{fontSize:11,letterSpacing:"0.12em",textTransform:"uppercase",color:"#9B8E78",fontFamily:"'Crimson Pro', serif"}}>{l}</div></div>
              ))}
            </div>
            <button onClick={()=>{setSelectedSection(null);setSelectedHaggadot([]);setEditorKey(k=>k+1);setView("submit");}} style={{padding:"14px 44px",borderRadius:28,background:"#2C2416",color:"#FAF6F0",border:"none",fontSize:15,fontFamily:"'Crimson Pro', serif",fontWeight:500,letterSpacing:"0.08em",cursor:"pointer",boxShadow:"0 4px 20px rgba(44,36,22,0.2)"}}>Add Your Dvar Torah</button>
          </div>
        )}

        {view==="submit"&&(
          <div className="fade-up">
            {submitSuccess?(<div className="fade-up" style={{textAlign:"center",padding:"80px 0"}}><div style={{fontSize:48,marginBottom:16}}>{"\u2728"}</div><h2 style={{fontSize:28,fontWeight:400}}>{"\u05ea\u05d5\u05d3\u05d4 \u05e8\u05d1\u05d4!"}</h2><p style={{fontSize:15,color:"#8B7D66",marginTop:8,fontFamily:"'Crimson Pro', serif",fontWeight:300}}>Your dvar Torah has been submitted</p></div>
            ):!selectedSection?(
              <div>
                <div style={{textAlign:"center",marginBottom:32}}>
                  <div style={{fontSize:12,letterSpacing:"0.25em",textTransform:"uppercase",color:"#8B6914",fontFamily:"'Crimson Pro', serif",marginBottom:8}}>Step 1</div>
                  <h2 style={{fontSize:28,fontWeight:400,marginBottom:6}}>Which Haggadah?</h2>
                </div>
                <div style={{display:"flex",justifyContent:"center",gap:12,marginBottom:36,flexWrap:"wrap"}}>
                  {[...HAGGADOT,{id:"both",name:"Both"}].map(h=>{
                    const sel=h.id==="both"?selectedHaggadot.length===2:selectedHaggadot.includes(h.id);
                    return(<div key={h.id} className="hag-chip" onClick={()=>{if(h.id==="both")setSelectedHaggadot(selectedHaggadot.length===2?[]:HAGGADOT.map(x=>x.id));else toggleHaggadah(h.id);}}
                      style={{padding:"14px 28px",borderRadius:14,background:sel?"#2C2416":"#FFFCF7",color:sel?"#FAF6F0":"#2C2416",border:"1px solid "+(sel?"#2C2416":"rgba(139,105,20,0.15)"),fontSize:16,fontFamily:"'Cormorant Garamond', serif",fontWeight:500,boxShadow:sel?"0 4px 16px rgba(44,36,22,0.2)":"0 2px 8px rgba(139,105,20,0.04)"}}>{h.name}</div>);
                  })}
                </div>
                {selectedHaggadot.length>0&&(
                  <div className="fade-up">
                    <div style={{textAlign:"center",marginBottom:28}}><div style={{fontSize:12,letterSpacing:"0.25em",textTransform:"uppercase",color:"#8B6914",fontFamily:"'Crimson Pro', serif",marginBottom:8}}>Step 2</div><h2 style={{fontSize:28,fontWeight:400}}>Choose a Section</h2></div>
                    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill, minmax(250px, 1fr))",gap:12}}>
                      {SECTIONS.map(s=>{const c=allSubmissions.filter(x=>x.section===s.num).length;return(
                        <div key={s.num} className="sc" onClick={()=>setSelectedSection(s.num)} style={{padding:"18px 20px",borderRadius:12,background:"#FFFCF7",border:"1px solid rgba(139,105,20,0.1)",display:"flex",alignItems:"center",gap:14,boxShadow:"0 2px 8px rgba(139,105,20,0.04)"}}>
                          <div style={{width:44,height:44,borderRadius:"50%",background:"linear-gradient(135deg, #FAF1DD, #F0E4C8)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,flexShrink:0}}>{s.icon}</div>
                          <div style={{flex:1,minWidth:0}}><div style={{display:"flex",alignItems:"baseline",gap:8,flexWrap:"wrap"}}><span style={{fontSize:16,fontWeight:600}}>{s.en}</span><span style={{fontSize:15,color:"#8B6914",fontFamily:"'Frank Ruhl Libre', serif",direction:"rtl"}}>{s.he}</span></div><div style={{fontSize:12,color:"#9B8E78",marginTop:2,fontFamily:"'Crimson Pro', serif",fontWeight:300,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{s.desc}</div></div>
                          {c>0&&<div style={{width:22,height:22,borderRadius:"50%",background:"#8B6914",color:"#fff",fontSize:11,display:"flex",alignItems:"center",justifyContent:"center",fontWeight:600,flexShrink:0}}>{c}</div>}
                        </div>);})}
                    </div>
                  </div>
                )}
              </div>
            ):(()=>{
              const sec=SECTIONS.find(s=>s.num===selectedSection);const content=inputMode==="text"?richContent:uploadedHTML;
              const isEmpty=!content||content==="<p></p>"||content.replace(/<[^>]*>/g,"").trim()==="";
              const ok=authorName.trim()&&selectedHaggadot.length>0&&!isEmpty&&!parsing;
              return(<div>
                <button onClick={()=>setSelectedSection(null)} style={{background:"none",border:"none",cursor:"pointer",fontSize:13,color:"#8B6914",fontFamily:"'Crimson Pro', serif",marginBottom:20}}>{"\u2190"} Back to sections</button>
                <div style={{background:"linear-gradient(135deg, #FAF1DD, #F0E4C8)",padding:"20px 24px",borderRadius:14,marginBottom:20,display:"flex",alignItems:"center",gap:16}}>
                  <div style={{fontSize:32}}>{sec.icon}</div><div><div style={{fontSize:20,fontWeight:600}}>{sec.en} <span style={{fontFamily:"'Frank Ruhl Libre', serif",fontSize:18,color:"#8B6914"}}>{sec.he}</span></div><div style={{fontSize:13,color:"#6B5A3E",fontFamily:"'Crimson Pro', serif",fontWeight:300,marginTop:2}}>{sec.desc}</div></div>
                </div>
                <div style={{marginBottom:20,fontSize:13,color:"#8B7D66",fontFamily:"'Crimson Pro', serif",display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
                  <span>Submitting to:</span>{selectedHaggadot.map(id=>{const h=HAGGADOT.find(x=>x.id===id);return h?<span key={id} style={{padding:"4px 12px",borderRadius:12,background:"rgba(139,105,20,0.1)",fontSize:12,fontWeight:500,color:"#8B6914"}}>{h.name}</span>:null;})}
                </div>
                <div className="g2" style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14,marginBottom:14}}>
                  <div><label style={{fontSize:11,letterSpacing:"0.12em",textTransform:"uppercase",color:"#8B7D66",fontFamily:"'Crimson Pro', serif",marginBottom:6,display:"block"}}>Your Name *</label><input style={inp} value={authorName} onChange={e=>setAuthorName(e.target.value)} placeholder="e.g. Sarah"/></div>
                  <div><label style={{fontSize:11,letterSpacing:"0.12em",textTransform:"uppercase",color:"#8B7D66",fontFamily:"'Crimson Pro', serif",marginBottom:6,display:"block"}}>Title (optional)</label><input style={inp} value={title} onChange={e=>setTitle(e.target.value)} placeholder="e.g. Freedom's True Meaning"/></div>
                </div>
                <div style={{display:"flex",gap:4,marginBottom:14,background:"rgba(139,105,20,0.06)",borderRadius:10,padding:4,width:"fit-content"}}>
                  {[["text","Write"],["upload","Upload File"]].map(([m,l])=>(<button key={m} onClick={()=>setInputMode(m)} style={{padding:"8px 20px",borderRadius:8,border:"none",cursor:"pointer",fontSize:13,fontFamily:"'Crimson Pro', serif",fontWeight:500,background:inputMode===m?"#FFFCF7":"transparent",color:inputMode===m?"#2C2416":"#8B7D66",boxShadow:inputMode===m?"0 1px 4px rgba(0,0,0,0.06)":"none"}}>{l}</button>))}
                </div>
                {inputMode==="text"?(<RichEditor key={editorKey} content={richContent} onUpdate={setRichContent}/>):(
                  <div>
                    <div onClick={()=>fileInputRef.current?.click()} style={{border:"2px dashed rgba(139,105,20,0.2)",borderRadius:14,padding:"48px 24px",textAlign:"center",cursor:"pointer",background:uploadedFile?"rgba(139,105,20,0.04)":"transparent"}}>
                      <input type="file" ref={fileInputRef} onChange={handleFileUpload} accept=".doc,.docx,.pdf,.txt,.md" style={{display:"none"}}/>
                      {parsing?(<div><div style={{width:28,height:28,border:"3px solid rgba(139,105,20,0.2)",borderTopColor:"#8B6914",borderRadius:"50%",animation:"spin .8s linear infinite",margin:"0 auto 12px"}}/><div style={{fontSize:14,fontFamily:"'Crimson Pro', serif",color:"#6B5A3E"}}>Parsing document...</div></div>
                      ):uploadedFile?(<div><div style={{fontSize:28,marginBottom:8}}>{"\ud83d\udcc4"}</div><div style={{fontSize:15,fontFamily:"'Crimson Pro', serif",fontWeight:500}}>{uploadedFile.name}</div><div style={{fontSize:12,color:"#8B7D66",marginTop:4}}>Click to replace</div></div>
                      ):(<div><div style={{fontSize:28,marginBottom:8}}>{"\ud83d\udce4"}</div><div style={{fontSize:15,fontFamily:"'Crimson Pro', serif",color:"#6B5A3E"}}>Click to upload .docx, .pdf, or .txt</div></div>)}
                    </div>
                    {uploadedHTML&&!parsing&&(<div style={{marginTop:14,padding:"16px 20px",borderRadius:12,background:"#FFFCF7",border:"1px solid rgba(139,105,20,0.1)"}}><div style={{fontSize:11,letterSpacing:"0.12em",textTransform:"uppercase",color:"#8B6914",fontFamily:"'Crimson Pro', serif",marginBottom:8}}>Parsed Content Preview</div><div className="rendered-content" style={{maxHeight:300,overflow:"auto"}} dangerouslySetInnerHTML={{__html:uploadedHTML}}/></div>)}
                  </div>
                )}
                {submitError&&(<div style={{marginTop:14,padding:"12px 16px",borderRadius:10,background:"#FFF0F0",border:"1px solid #FFCCCC",fontSize:13,color:"#CC3333",fontFamily:"'Crimson Pro', serif"}}>{submitError}</div>)}
                <button onClick={handleSubmit} disabled={!ok||submitting} style={{marginTop:20,padding:"14px 44px",borderRadius:28,width:"100%",background:"#2C2416",color:"#FAF6F0",border:"none",fontSize:15,fontFamily:"'Crimson Pro', serif",fontWeight:500,letterSpacing:"0.06em",cursor:"pointer",opacity:(!ok||submitting)?0.4:1,boxShadow:"0 4px 20px rgba(44,36,22,0.15)"}}>{submitting?"Submitting...":"Submit Dvar Torah"}</button>
              </div>);
            })()}
          </div>
        )}

        {view==="admin"&&(
          <div className="fade-up">
            {!adminAuthed?(
              <div style={{maxWidth:380,margin:"60px auto",textAlign:"center"}}>
                <div style={{fontSize:32,marginBottom:12}}>{"\ud83d\udd10"}</div><h2 style={{fontSize:24,fontWeight:400,marginBottom:20}}>Admin Access</h2>
                <input type="password" style={{...inp,textAlign:"center",marginBottom:14}} value={adminPassword} onChange={e=>setAdminPassword(e.target.value)} placeholder="Enter password" onKeyDown={e=>{if(e.key==="Enter"&&adminPassword===ADMIN_PASSWORD)setAdminAuthed(true)}}/>
                <p style={{fontSize:12,color:"#9B8E78",fontFamily:"'Crimson Pro', serif",marginBottom:14}}>Default password: <strong>seder</strong></p>
                <button onClick={()=>{if(adminPassword===ADMIN_PASSWORD)setAdminAuthed(true);}} style={{padding:"12px 36px",borderRadius:24,background:"#2C2416",color:"#FAF6F0",border:"none",fontSize:14,fontFamily:"'Crimson Pro', serif",fontWeight:500,cursor:"pointer"}}>Enter</button>
              </div>
            ):(
              <div>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20,flexWrap:"wrap",gap:12}}>
                  <h2 style={{fontSize:26,fontWeight:400}}>Admin Dashboard</h2>
                  <button onClick={()=>setView("preview")} style={{padding:"10px 24px",borderRadius:22,background:"#8B6914",color:"#fff",border:"none",fontSize:13,fontFamily:"'Crimson Pro', serif",fontWeight:500,cursor:"pointer"}}>Preview {"\u2728"}</button>
                </div>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20,flexWrap:"wrap",gap:12}}>
                  <div style={{display:"flex",gap:4,background:"rgba(139,105,20,0.06)",borderRadius:10,padding:4}}>
                    {[["all","All"],["ottensoser","Ottensoser"],["siegel","Siegel"]].map(([id,label])=>(<button key={id} onClick={()=>setAdminFilter(id)} style={{padding:"8px 18px",borderRadius:8,border:"none",cursor:"pointer",fontSize:13,fontFamily:"'Crimson Pro', serif",fontWeight:500,background:adminFilter===id?"#FFFCF7":"transparent",color:adminFilter===id?"#2C2416":"#8B7D66",boxShadow:adminFilter===id?"0 1px 4px rgba(0,0,0,0.06)":"none"}}>{label}</button>))}
                  </div>
                  <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                    {HAGGADOT.map(h=>(<button key={h.id} onClick={()=>doExport(h.id)} disabled={exporting} style={{padding:"8px 18px",borderRadius:18,background:"#2C2416",color:"#FAF6F0",border:"none",fontSize:12,fontFamily:"'Crimson Pro', serif",fontWeight:500,cursor:"pointer",opacity:exporting?0.5:1}}>{exporting?"...":"Export "+h.name.split(" ")[0]+" PDF"}</button>))}
                  </div>
                </div>
                {SECTIONS.map(sec=>{const subs=submissions.filter(s=>s.section===sec.num).sort((a,b)=>(a.order??a.createdAt??0)-(b.order??b.createdAt??0));if(!subs.length)return null;return(
                  <div key={sec.num} style={{marginBottom:24}}>
                    <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}><span style={{fontSize:18}}>{sec.icon}</span><span style={{fontSize:16,fontWeight:600}}>{sec.en}</span><span style={{fontSize:14,color:"#8B6914",fontFamily:"'Frank Ruhl Libre', serif"}}>{sec.he}</span><span style={{fontSize:11,color:"#9B8E78",fontFamily:"'Crimson Pro', serif"}}>{"\u2014"} {subs.length}</span></div>
                    {subs.map((sub,idx)=>(<div key={sub.id} style={{background:editingId===sub.id?"#FFF9EE":"#FFFCF7",border:"1px solid "+(editingId===sub.id?"rgba(139,105,20,0.3)":"rgba(139,105,20,0.08)"),borderRadius:12,padding:"16px 20px",marginBottom:8,marginLeft:28,transition:"all .2s"}}>
                      {editingId===sub.id?(
                        <div>
                          <div className="g2" style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
                            <input style={{...inp,fontSize:13,padding:"8px 12px"}} value={editData.author} onChange={e=>setEditData({...editData,author:e.target.value})} placeholder="Author"/>
                            <input style={{...inp,fontSize:13,padding:"8px 12px"}} value={editData.title} onChange={e=>setEditData({...editData,title:e.target.value})} placeholder="Title"/>
                          </div>
                          <EditRichEditor content={editData.content} onUpdate={html=>setEditData({...editData,content:html})}/>
                          <div style={{display:"flex",gap:8,marginTop:10}}>
                            <button onClick={saveEdit} style={{padding:"8px 20px",borderRadius:18,background:"#2C2416",color:"#FAF6F0",border:"none",fontSize:12,fontFamily:"'Crimson Pro', serif",fontWeight:500,cursor:"pointer"}}>Save</button>
                            <button onClick={()=>setEditingId(null)} style={{padding:"8px 20px",borderRadius:18,background:"transparent",color:"#8B7D66",border:"1px solid rgba(139,105,20,0.2)",fontSize:12,fontFamily:"'Crimson Pro', serif",cursor:"pointer"}}>Cancel</button>
                          </div>
                        </div>
                      ):(
                        <div>
                          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8}}>
                            <div><span style={{fontSize:15,fontWeight:600}}>{sub.author}</span>{sub.title&&<span style={{fontSize:14,color:"#6B5A3E",fontStyle:"italic",marginLeft:10}}>"{sub.title}"</span>}
                              <div style={{display:"flex",alignItems:"center",gap:8,marginTop:3}}><span style={{fontSize:11,color:"#9B8E78",fontFamily:"'Crimson Pro', serif"}}>{sub.date}</span><span style={{fontSize:10,padding:"2px 8px",borderRadius:8,background:"rgba(139,105,20,0.08)",color:"#8B6914",fontFamily:"'Crimson Pro', serif",fontWeight:500}}>{getHL(sub)}</span></div>
                            </div>
                            <div style={{display:"flex",gap:2,alignItems:"center",flexShrink:0}}>
                              <button className="ab" disabled={idx===0} onClick={()=>moveSub(sec.num,idx,idx-1)} style={{background:"none",border:"none",cursor:idx===0?"default":"pointer",color:idx===0?"#DDD5C8":"#8B6914",fontSize:14,padding:"4px 6px",borderRadius:6}}>{"\u2191"}</button>
                              <button className="ab" disabled={idx===subs.length-1} onClick={()=>moveSub(sec.num,idx,idx+1)} style={{background:"none",border:"none",cursor:idx===subs.length-1?"default":"pointer",color:idx===subs.length-1?"#DDD5C8":"#8B6914",fontSize:14,padding:"4px 6px",borderRadius:6}}>{"\u2193"}</button>
                              <button className="ab" onClick={()=>startEdit(sub)} style={{background:"none",border:"none",cursor:"pointer",color:"#8B6914",fontSize:13,padding:"4px 6px",borderRadius:6}}>{"\u270f\ufe0f"}</button>
                              <button className="ab" onClick={()=>deleteSub(sub.id)} style={{background:"none",border:"none",cursor:"pointer",color:"#C0A080",fontSize:18,padding:"4px 6px",borderRadius:6}}>{"\u00d7"}</button>
                            </div>
                          </div>
                          <div className="rendered-content rendered-admin" dangerouslySetInnerHTML={{__html:sub.content}}/>
                        </div>
                      )}
                    </div>))}
                  </div>);})}
                {!submissions.length&&(<div style={{textAlign:"center",padding:"60px 0",color:"#9B8E78",fontFamily:"'Crimson Pro', serif",fontSize:15}}>{adminFilter==="all"?"No submissions yet.":"No submissions for this family yet."}</div>)}
              </div>
            )}
          </div>
        )}

        {view==="preview"&&(
          <div className="fade-up">
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:24,flexWrap:"wrap",gap:12}}>
              <button onClick={()=>setView("admin")} style={{background:"none",border:"none",cursor:"pointer",fontSize:13,color:"#8B6914",fontFamily:"'Crimson Pro', serif"}}>{"\u2190"} Back to Admin</button>
              <div style={{display:"flex",gap:4,background:"rgba(139,105,20,0.06)",borderRadius:10,padding:4}}>
                {[["all","All"],["ottensoser","Ottensoser"],["siegel","Siegel"]].map(([id,label])=>(<button key={id} onClick={()=>setAdminFilter(id)} style={{padding:"8px 18px",borderRadius:8,border:"none",cursor:"pointer",fontSize:13,fontFamily:"'Crimson Pro', serif",fontWeight:500,background:adminFilter===id?"#FFFCF7":"transparent",color:adminFilter===id?"#2C2416":"#8B7D66",boxShadow:adminFilter===id?"0 1px 4px rgba(0,0,0,0.06)":"none"}}>{label}</button>))}
              </div>
            </div>
            <div style={{textAlign:"center",padding:"56px 24px 48px",background:"linear-gradient(170deg, #FFFDF8, #F8F0E0)",border:"1px solid rgba(139,105,20,0.12)",borderRadius:18,marginBottom:36,boxShadow:"0 8px 40px rgba(139,105,20,0.08)",position:"relative"}}>
              <div style={{position:"absolute",top:16,left:16,right:16,bottom:16,border:"1px solid rgba(139,105,20,0.1)",borderRadius:10,pointerEvents:"none"}}/>
              <div style={{fontSize:38,color:"#8B6914",fontFamily:"'Frank Ruhl Libre', serif",marginBottom:8,direction:"rtl"}}>{"\u05d4\u05b7\u05d2\u05bc\u05b8\u05d3\u05b8\u05d4 \u05e9\u05c1\u05b6\u05dc \u05e4\u05bc\u05b6\u05e1\u05b7\u05d7"}</div>
              <div style={{width:80,height:1,margin:"16px auto",background:"linear-gradient(90deg, transparent, #C4943D, transparent)"}}/>
              <h1 style={{fontSize:36,fontWeight:400,color:"#2C2416",marginBottom:4}}>{adminFilter==="all"?"Family":adminFilter==="ottensoser"?"Ottensoser":"Siegel"} Haggadah</h1>
              <div style={{fontSize:16,color:"#8B6914",fontFamily:"'Crimson Pro', serif",fontWeight:300,fontStyle:"italic"}}>Passover {year}</div>
            </div>
            {SECTIONS.map(sec=>{const subs=submissions.filter(s=>s.section===sec.num).sort((a,b)=>(a.order??a.createdAt??0)-(b.order??b.createdAt??0));return(
              <div key={sec.num} style={{marginBottom:40}}>
                <div style={{display:"flex",alignItems:"center",gap:14,marginBottom:16,paddingBottom:12,borderBottom:"1px solid rgba(139,105,20,0.1)"}}>
                  <div style={{width:36,height:36,borderRadius:"50%",background:"linear-gradient(135deg, #F0E4C8, #E8D8B8)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:16}}>{sec.icon}</div>
                  <div><div style={{display:"flex",alignItems:"baseline",gap:10,flexWrap:"wrap"}}><span style={{fontSize:22,fontWeight:500}}>{sec.num}. {sec.en}</span><span style={{fontSize:20,color:"#8B6914",fontFamily:"'Frank Ruhl Libre', serif",direction:"rtl"}}>{sec.he}</span></div><div style={{fontSize:13,color:"#8B7D66",fontFamily:"'Crimson Pro', serif",fontWeight:300}}>{sec.desc}</div></div>
                </div>
                {subs.length>0?subs.map((sub,i)=>(
                  <div key={sub.id} style={{marginLeft:50,marginBottom:i<subs.length-1?20:0,paddingBottom:i<subs.length-1?20:0,borderBottom:i<subs.length-1?"1px dashed rgba(139,105,20,0.1)":"none"}}>
                    {sub.title&&<div style={{fontSize:18,fontStyle:"italic",fontWeight:500,color:"#2C2416",marginBottom:6}}>{sub.title}</div>}
                    <div className="rendered-content" dangerouslySetInnerHTML={{__html:sub.content}}/>
                    <div style={{fontSize:13,color:"#8B6914",marginTop:10,fontStyle:"italic",fontWeight:500}}>{"\u2014"} {sub.author}</div>
                  </div>
                )):(<div style={{marginLeft:50,fontSize:14,color:"#BDB3A0",fontFamily:"'Crimson Pro', serif",fontStyle:"italic"}}>No submissions yet</div>)}
              </div>);})}
            <div style={{textAlign:"center",padding:"40px 24px",borderTop:"1px solid rgba(139,105,20,0.12)",marginTop:20}}>
              <div style={{fontSize:28,color:"#8B6914",fontFamily:"'Frank Ruhl Libre', serif",direction:"rtl"}}>{"\u05dc\u05b0\u05e9\u05b8\u05c1\u05e0\u05b8\u05d4 \u05d4\u05b7\u05d1\u05bc\u05b8\u05d0\u05b8\u05d4 \u05d1\u05bc\u05b4\u05d9\u05e8\u05d5\u05bc\u05e9\u05b8\u05c1\u05dc\u05b7\u05d9\u05b4\u05dd"}</div>
              <div style={{fontSize:15,color:"#6B5A3E",marginTop:8,fontStyle:"italic"}}>Next year in Jerusalem</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
