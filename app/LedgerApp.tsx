"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { parseReceipt,preprocessReceiptImage } from "./receiptOcr";

type Person = { id:number; name:string; note:string; createdAt:string };
type LedgerItem = {
  id:number; kind:"expense"|"income"; merchant:string; amountCents:number;
  category:string; transactionDate:string; note:string; sourceText:string; personId:number|null; reimbursedAt:string|null; createdAt:string;
};
type LedgerHistoryItem = Omit<LedgerItem,"id"|"createdAt"> & {
  snapshotId:string; transactionId:number; versionKind:string; recordedAt:string;
};
type Draft = {
  kind:"expense"|"income"; merchant:string; amount:string; category:string;
  transactionDate:string; note:string; sourceText:string; personId:string;
};

const categories = ["餐饮","交通","购物","居住","医疗","娱乐","教育","工资","转账","其他"];
const categorySymbols:Record<string,string> = { 餐饮:"食",交通:"行",购物:"购",居住:"居",医疗:"医",娱乐:"乐",教育:"学",工资:"薪",转账:"转",其他:"其" };
const today = () => new Date(Date.now()-new Date().getTimezoneOffset()*60000).toISOString().slice(0,10);
const blankDraft = ():Draft => ({ kind:"expense",merchant:"",amount:"",category:"其他",transactionDate:today(),note:"",sourceText:"",personId:"" });
const money = (cents:number) => new Intl.NumberFormat("zh-CN",{ style:"currency",currency:"CNY" }).format(cents/100);
const localLedgerKey = "shiguang-receipt-ledger-v3";
const localHistoryKey = "shiguang-receipt-ledger-history-v3";
const localPersonsKey = "shiguang-receipt-ledger-persons-v3";

function readStored<T>(key:string, fallback:T):T {
  try { return JSON.parse(localStorage.getItem(key)||"") as T; } catch { return fallback; }
}
function writeStored<T>(key:string, value:T) { localStorage.setItem(key,JSON.stringify(value)); }
function readLocalLedger() { return readStored<LedgerItem[]>(localLedgerKey,[]); }
function readLocalHistory() { return readStored<LedgerHistoryItem[]>(localHistoryKey,[]); }
function readLocalPersons() { return readStored<Person[]>(localPersonsKey,[]); }
function writeLocalLedger(items:LedgerItem[]) { writeStored(localLedgerKey,items); }
function itemKey(item:LedgerItem) { return item.id > 0 ? `server:${item.id}` : `local:${item.id}`; }
function mergeLedgerItems(...groups:LedgerItem[][]):LedgerItem[] {
  const unique = new Map<string,LedgerItem>();
  for (const item of groups.flat()) if (!unique.has(itemKey(item))) unique.set(itemKey(item),{ ...item,reimbursedAt:item.reimbursedAt||null });
  return [...unique.values()].sort((left,right)=>right.transactionDate.localeCompare(left.transactionDate) || String(right.createdAt).localeCompare(String(left.createdAt)));
}
function mergePersons(...groups:Person[][]) {
  const unique = new Map<string,Person>();
  for (const person of groups.flat()) if (!unique.has(`${person.id}:${person.name}`)) unique.set(`${person.id}:${person.name}`,person);
  return [...unique.values()].sort((left,right)=>left.name.localeCompare(right.name,"zh-CN"));
}
function mergeHistory(...groups:LedgerHistoryItem[][]) {
  const unique = new Map<string,LedgerHistoryItem>();
  for (const item of groups.flat()) if (!unique.has(item.snapshotId)) unique.set(item.snapshotId,item);
  return [...unique.values()].sort((left,right)=>right.recordedAt.localeCompare(left.recordedAt));
}
function createHistory(item:LedgerItem, versionKind:string):LedgerHistoryItem {
  return {
    snapshotId:`local:${item.id}:${Date.now()}:${Math.random().toString(36).slice(2,8)}`,
    transactionId:item.id, versionKind, kind:item.kind, merchant:item.merchant, amountCents:item.amountCents,
    category:item.category, transactionDate:item.transactionDate, note:item.note, sourceText:item.sourceText,
    personId:item.personId, reimbursedAt:item.reimbursedAt, recordedAt:new Date().toISOString(),
  };
}
function normalizeHistory(value:Record<string,unknown>):LedgerHistoryItem {
  return {
    snapshotId:`server:${String(value.id)}`, transactionId:Number(value.transactionId), versionKind:String(value.versionKind||"saved"),
    kind:value.kind === "income" ? "income" : "expense", merchant:String(value.merchant||""), amountCents:Number(value.amountCents)||0,
    category:String(value.category||"其他"), transactionDate:String(value.transactionDate||today()), note:String(value.note||""),
    sourceText:String(value.sourceText||""), personId:Number.isInteger(value.personId) ? Number(value.personId) : null,
    reimbursedAt:value.reimbursedAt ? String(value.reimbursedAt) : null,
    recordedAt:String(value.recordedAt||new Date().toISOString()),
  };
}
export default function LedgerApp() {
  const [items,setItems] = useState<LedgerItem[]>([]);
  const [persons,setPersons] = useState<Person[]>([]);
  const [history,setHistory] = useState<LedgerHistoryItem[]>([]);
  const [draft,setDraft] = useState<Draft>(blankDraft);
  const [editingId,setEditingId] = useState<number|null>(null);
  const [saving,setSaving] = useState(false);
  const [loading,setLoading] = useState(true);
  const [message,setMessage] = useState("");
  const [query,setQuery] = useState("");
  const [month,setMonth] = useState(today().slice(0,7));
  const [category,setCategory] = useState("全部");
  const [personFilter,setPersonFilter] = useState("全部");
  const [newPersonName,setNewPersonName] = useState("");
  const [personPendingDelete,setPersonPendingDelete] = useState<Person|null>(null);
  const [bulkMode,setBulkMode] = useState(false);
  const [selectedIds,setSelectedIds] = useState<number[]>([]);
  const [bulkCategory,setBulkCategory] = useState("keep");
  const [bulkPersonId,setBulkPersonId] = useState("keep");
  const [bulkKind,setBulkKind] = useState("keep");
  const [recoverySelection,setRecoverySelection] = useState<string[]>([]);
  const [recoveryQuery,setRecoveryQuery] = useState("");
  const [scanPreview,setScanPreview] = useState<string|null>(null);
  const [scanFile,setScanFile] = useState<File|null>(null);
  const [scanText,setScanText] = useState("");
  const [scanProgress,setScanProgress] = useState(0);
  const [scanStage,setScanStage] = useState("准备图片…");
  const [scanning,setScanning] = useState(false);
  const [draggingReceipt,setDraggingReceipt] = useState(false);
  const receiptInputRef = useRef<HTMLInputElement>(null);
  const previewUrlRef = useRef<string|null>(null);
  const ocrWorkerRef = useRef<{
    setParameters:(params:Record<string,string>)=>Promise<unknown>;
    recognize:(image:Blob,options?:{ rotateAuto?:boolean })=>Promise<{ data:{ text:string;confidence:number } }>;
    terminate:()=>Promise<unknown>;
  }|null>(null);
  const ocrWorkerPromiseRef = useRef<Promise<NonNullable<typeof ocrWorkerRef.current>>|null>(null);
  const scanJobRef = useRef(0);
  const mutationVersion = useRef(0);

  const appendHistory = (records:LedgerItem[], versionKind:string) => setHistory((current) => {
    const next = mergeHistory(records.map((item)=>createHistory(item,versionKind)),current);
    writeStored(localHistoryKey,next);
    return next;
  });

  const loadItems = async () => {
    const localItems = readLocalLedger();
    const localHistory = readLocalHistory();
    const localPersons = readLocalPersons();
    const startedAtMutation = mutationVersion.current;
    try {
      const [transactionResponse, personResponse] = await Promise.all([fetch("/api/transactions"),fetch("/api/persons")]);
      const data = await transactionResponse.json() as { transactions?:LedgerItem[]; history?:Record<string,unknown>[]; error?:string };
      if (!transactionResponse.ok) throw new Error(data.error||"读取失败");
      const peopleData = personResponse.ok ? await personResponse.json() as { persons?:Person[] } : { persons:[] };
      setItems((current)=>{
        const merged = mergeLedgerItems(mutationVersion.current > startedAtMutation ? current : [],localItems,data.transactions||[]);
        writeLocalLedger(merged);
        return merged;
      });
      setHistory((current)=>{
        const remote = (data.history||[]).map(normalizeHistory);
        const next = mergeHistory(current,localHistory,remote);
        writeStored(localHistoryKey,next);
        return next;
      });
      setPersons((current)=>{
        const next = mergePersons(current,localPersons,peopleData.persons||[]);
        writeStored(localPersonsKey,next);
        return next;
      });
    } catch {
      setItems((current)=>mergeLedgerItems(current,localItems));
      setHistory((current)=>mergeHistory(current,localHistory));
      setPersons((current)=>mergePersons(current,localPersons));
      setMessage("当前无法连接服务，已打开本机账本与历史快照；新记录仍会先保存在本机。");
    } finally { setLoading(false); }
  };

  useEffect(()=>{ void loadItems(); },[]);
  useEffect(()=>()=>{
    scanJobRef.current+=1;
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    void ocrWorkerRef.current?.terminate();
  },[]);
  const personName = (personId:number|null) => persons.find((person)=>person.id===personId)?.name || "未建档报账人";
  const filtered = useMemo(()=>items.filter((item)=>
    (!month||item.transactionDate.startsWith(month)) &&
    (category==="全部"||item.category===category) &&
    (personFilter==="全部" || (personFilter==="未归属" ? item.personId===null : item.personId===Number(personFilter))) &&
    (!query||`${item.merchant}${item.note}${item.category}${personName(item.personId)}`.toLowerCase().includes(query.toLowerCase()))
  ),[items,month,category,personFilter,query,persons]);
  const pendingItems = useMemo(()=>filtered.filter((item)=>!item.reimbursedAt),[filtered]);
  const reimbursedItems = useMemo(()=>filtered.filter((item)=>Boolean(item.reimbursedAt)),[filtered]);
  const summary = useMemo(()=>filtered.reduce((acc,item)=>{
    if (item.kind==="income") acc.income+=item.amountCents; else acc.expense+=item.amountCents;
    return acc;
  },{ income:0,expense:0 }),[filtered]);
  const peopleTotals = useMemo(()=>persons.map((person)=>{
    const entries=items.filter((item)=>item.personId===person.id);
    return {
      person,entries,count:entries.length,
      pending:entries.filter((item)=>item.kind==="expense"&&!item.reimbursedAt).length,
      reimbursed:entries.filter((item)=>Boolean(item.reimbursedAt)).length,
      balance:entries.reduce((sum,item)=>sum+(item.kind==="income"?item.amountCents:-item.amountCents),0),
    };
  }),[items,persons]);
  const recoveryItems = useMemo(()=>history.filter((item)=>!recoveryQuery || `${item.merchant}${item.note}${item.category}${personName(item.personId)}`.toLowerCase().includes(recoveryQuery.toLowerCase())),[history,recoveryQuery,persons]);

  const payloadFor = (item:LedgerItem|Draft) => ({
    kind:item.kind,merchant:item.merchant,amount:"amountCents" in item ? item.amountCents/100 : Number(item.amount),category:item.category,
    transactionDate:item.transactionDate,note:item.note,sourceText:item.sourceText,personId:"personId" in item && item.personId !== "" && item.personId !== null && item.personId !== undefined ? Number(item.personId) : null,
  });
  const persistItems = (next:LedgerItem[]) => { writeLocalLedger(next); return next; };
  const update = (key:keyof Draft,value:string) => setDraft((current)=>({ ...current,[key]:value }));

  async function saveItem() {
    setSaving(true); setMessage(""); mutationVersion.current += 1;
    const localVersion = (id:number):LedgerItem => ({
      id,kind:draft.kind,merchant:draft.merchant.trim(),amountCents:Math.round(Number(draft.amount)*100),category:draft.category,
      transactionDate:draft.transactionDate,note:draft.note.trim(),sourceText:draft.sourceText.trim(),
      personId:draft.personId ? Number(draft.personId) : null,reimbursedAt:null,createdAt:new Date().toISOString(),
    });
    try {
      if (editingId!==null) {
        const original = items.find((item)=>item.id===editingId);
        let saved = localVersion(editingId);
        saved.createdAt = original?.createdAt || saved.createdAt;
        saved.reimbursedAt = original?.reimbursedAt || null;
        let offline = editingId < 0;
        if (editingId>0) {
          try {
            const response = await fetch(`/api/transactions?id=${editingId}`,{ method:"PUT",headers:{ "content-type":"application/json" },body:JSON.stringify(payloadFor(draft)) });
            const data = await response.json() as { transaction?:LedgerItem;error?:string };
            if (!response.ok||!data.transaction) throw new Error(data.error||"编辑同步失败");
            saved=data.transaction;
          } catch { offline=true; }
        }
        setItems((current)=>persistItems(current.map((item)=>item.id===editingId?saved:item)));
        appendHistory([saved],"updated");
        setEditingId(null); setDraft(blankDraft());
        setMessage(offline ? "修改已保存在本机历史中，服务恢复后可从历史账目手动恢复或同步。" : "修改已保存；原版本已进入历史账目，可随时手动恢复。");
        return;
      }
      let saved:LedgerItem;
      let offline = false;
      try {
        const response = await fetch("/api/transactions",{ method:"POST",headers:{ "content-type":"application/json" },body:JSON.stringify(payloadFor(draft)) });
        const data = await response.json() as { transaction?:LedgerItem;error?:string };
        if (!response.ok||!data.transaction) throw new Error(data.error||"保存同步失败");
        saved=data.transaction;
      } catch {
        offline=true; saved=localVersion(-Date.now());
      }
      setItems((current)=>persistItems(mergeLedgerItems([saved],current)));
      appendHistory([saved],"created");
      setDraft(blankDraft());
      setMessage(offline ? "新账目已先保存到本机和历史快照，联网后仍可手动恢复。" : "已记入账本，并已写入可恢复历史。");
    } finally { setSaving(false); }
  }

  async function deleteItem(id:number) {
    const item=items.find((entry)=>entry.id===id);
    if (!item || !window.confirm("删除后会从当前账本隐藏，但仍保留在历史账目中供你手动恢复。确定继续吗？")) return;
    mutationVersion.current += 1;
    try {
      if (id>0) {
        const response = await fetch(`/api/transactions?id=${id}`,{ method:"DELETE" });
        if (!response.ok) throw new Error("delete failed");
      }
      setItems((current)=>persistItems(current.filter((entry)=>entry.id!==id)));
      appendHistory([item],"deleted");
      setSelectedIds((current)=>current.filter((selected)=>selected!==id));
      setMessage("账目已移入历史账目，不会被永久丢失。");
    } catch { setMessage("服务端删除失败，当前账目未移除。"); }
  }

  async function updateReimbursement(item:LedgerItem,reimbursed:boolean) {
    if (reimbursed && item.kind!=="expense") return;
    setSaving(true); mutationVersion.current+=1;
    let updated:LedgerItem={ ...item,reimbursedAt:reimbursed?new Date().toISOString():null };
    let offline=item.id<0;
    if (item.id>0) {
      try {
        const response=await fetch(`/api/transactions?id=${item.id}`,{
          method:"PATCH",headers:{ "content-type":"application/json" },body:JSON.stringify({ reimbursed }),
        });
        const data=await response.json() as { transaction?:LedgerItem;error?:string };
        if (!response.ok||!data.transaction) throw new Error(data.error||"更新报销状态失败");
        updated=data.transaction;
      } catch { offline=true; }
    }
    setItems((current)=>persistItems(current.map((entry)=>entry.id===item.id?updated:entry)));
    appendHistory([updated],reimbursed?"reimbursed":"unreimbursed");
    setSelectedIds((current)=>current.filter((id)=>id!==item.id));
    setSaving(false);
    setMessage(reimbursed
      ? `「${item.merchant}」已标记为已报销，并归入 ${personName(item.personId)} 的已报销分区${offline?"（已先保存在本机）":""}。`
      : `「${item.merchant}」已撤销报销，重新回到 ${personName(item.personId)} 的待报销账目${offline?"（已先保存在本机）":""}。`);
  }

  function startEditing(item:LedgerItem) {
    setEditingId(item.id);
    setDraft({ kind:item.kind,merchant:item.merchant,amount:(item.amountCents/100).toFixed(2),category:item.category,transactionDate:item.transactionDate,note:item.note,sourceText:item.sourceText,personId:item.personId?.toString()||"" });
    setMessage(`正在编辑「${item.merchant}」，保存后可在历史账目中恢复此版本。`);
    document.querySelector(".manual-entry-card")?.scrollIntoView({ behavior:"smooth",block:"center" });
  }
  function resetEditor() { setEditingId(null); setDraft(blankDraft()); setMessage(""); }
  function toggleSelection(id:number) { setSelectedIds((current)=>current.includes(id)?current.filter((entry)=>entry!==id):[...current,id]); }

  async function createPerson() {
    const name=newPersonName.trim();
    if (!name) return;
    let saved:Person;
    try {
      const response = await fetch("/api/persons",{ method:"POST",headers:{ "content-type":"application/json" },body:JSON.stringify({ name }) });
      const data=await response.json() as { person?:Person;error?:string };
      if (!response.ok||!data.person) throw new Error(data.error||"创建人物失败");
      saved=data.person;
    } catch { saved={ id:-Date.now(),name,note:"",createdAt:new Date().toISOString() }; }
    setPersons((current)=>{
      const next=mergePersons([saved],current); writeStored(localPersonsKey,next); return next;
    });
    setDraft((current)=>({ ...current,personId:String(saved.id) }));
    setNewPersonName(""); setMessage(`已创建人物「${name}」，之后可直接选择并归纳其账目。`);
  }

  async function deletePerson(person:Person) {
    setSaving(true); setMessage(""); mutationVersion.current += 1;
    try {
      if (person.id>0) {
        const response=await fetch(`/api/persons?id=${person.id}`,{ method:"DELETE" });
        const data=await response.json() as { error?:string };
        if (!response.ok&&response.status!==404) throw new Error(data.error||"删除建档人失败");
      }
      setPersons((current)=>{
        const next=current.filter((entry)=>entry.id!==person.id);
        writeStored(localPersonsKey,next);
        return next;
      });
      setItems((current)=>persistItems(current.map((item)=>item.personId===person.id?{ ...item,personId:null }:item)));
      setHistory((current)=>{
        const next=current.map((item)=>item.personId===person.id?{ ...item,personId:null }:item);
        writeStored(localHistoryKey,next);
        return next;
      });
      setDraft((current)=>current.personId===String(person.id)?{ ...current,personId:"" }:current);
      setPersonFilter((current)=>current===String(person.id)?"全部":current);
      setBulkPersonId((current)=>current===String(person.id)?"keep":current);
      setPersonPendingDelete(null);
      setMessage(`已删除建档人「${person.name}」；关联账目仍保留，并已归为未建档报账人。`);
    } catch (error) {
      setMessage(error instanceof Error?error.message:"删除建档人失败");
    } finally { setSaving(false); }
  }

  async function applyBulkEdit() {
    const targets=items.filter((item)=>selectedIds.includes(item.id));
    if (!targets.length || (bulkCategory==="keep"&&bulkPersonId==="keep"&&bulkKind==="keep")) return;
    setSaving(true); mutationVersion.current += 1;
    const changed=targets.map((item):LedgerItem=>({
      ...item,category:bulkCategory==="keep"?item.category:bulkCategory,
      personId:bulkPersonId==="keep"?item.personId:bulkPersonId==="none"?null:Number(bulkPersonId),
      kind:bulkKind==="keep"?item.kind:bulkKind as LedgerItem["kind"],
    }));
    const replacements=new Map(changed.map((item)=>[item.id,item]));
    const results=await Promise.all(changed.map(async (item)=>{
      if (item.id<0) return item;
      try {
        const response=await fetch(`/api/transactions?id=${item.id}`,{ method:"PUT",headers:{ "content-type":"application/json" },body:JSON.stringify(payloadFor(item)) });
        const data=await response.json() as { transaction?:LedgerItem };
        return response.ok&&data.transaction ? data.transaction : item;
      } catch { return item; }
    }));
    for (const item of results) replacements.set(item.id,item);
    setItems((current)=>persistItems(current.map((item)=>replacements.get(item.id)||item)));
    appendHistory(results,"bulk-updated");
    setSelectedIds([]); setBulkCategory("keep"); setBulkPersonId("keep"); setBulkKind("keep");
    setSaving(false); setMessage(`已批量更新 ${results.length} 笔账目；每笔修改前后的记录都可在历史账目手动找回。`);
  }

  async function restoreSelectedHistory() {
    const selected=history.filter((item)=>recoverySelection.includes(item.snapshotId));
    if (!selected.length) return;
    setSaving(true); mutationVersion.current += 1;
    const restored=await Promise.all(selected.map(async (item):Promise<LedgerItem>=>{
      const local:LedgerItem={ id:-Date.now()-Math.floor(Math.random()*1000),kind:item.kind,merchant:item.merchant,amountCents:item.amountCents,category:item.category,transactionDate:item.transactionDate,note:item.note,sourceText:item.sourceText,personId:item.personId,reimbursedAt:null,createdAt:new Date().toISOString() };
      try {
        const response=await fetch("/api/transactions",{ method:"POST",headers:{ "content-type":"application/json" },body:JSON.stringify(payloadFor(local)) });
        const data=await response.json() as { transaction?:LedgerItem };
        return response.ok&&data.transaction ? data.transaction : local;
      } catch { return local; }
    }));
    setItems((current)=>persistItems(mergeLedgerItems(restored,current)));
    appendHistory(restored,"restored");
    setRecoverySelection([]); setSaving(false);
    setMessage(`已按你的选择恢复 ${restored.length} 笔账目；恢复内容作为新账目入账，原历史记录不会被删除。`);
  }

  async function recognizeReceipt(file:File) {
    const jobId=++scanJobRef.current;
    setScanning(true); setScanProgress(2); setScanStage("正在增强图片清晰度…"); setMessage("正在识别票据文字，请稍候…");
    try {
      let image:Blob=file;
      try { image=await preprocessReceiptImage(file); } catch { /* Older browsers can still OCR the original. */ }
      if (jobId!==scanJobRef.current) return;
      setScanProgress(12); setScanStage(ocrWorkerRef.current?"正在读取票据文字…":"正在加载本地识别模型…");

      if (!ocrWorkerPromiseRef.current) {
        ocrWorkerPromiseRef.current=(async()=>{
          const { createWorker,PSM } = await import("tesseract.js");
          const worker=await createWorker(["chi_sim","eng"],1,{ logger:(event)=>{
            const recognizing=event.status==="recognizing text";
            setScanStage(recognizing?"正在读取票据文字…":"正在加载本地识别模型…");
            setScanProgress(recognizing?Math.max(24,Math.round(24+(event.progress||0)*72)):Math.max(12,Math.round(12+(event.progress||0)*12)));
          }});
          await worker.setParameters({ tessedit_pageseg_mode:PSM.AUTO,preserve_interword_spaces:"1",user_defined_dpi:"300" });
          ocrWorkerRef.current=worker;
          return worker;
        })();
      }
      const worker=await ocrWorkerPromiseRef.current;
      if (jobId!==scanJobRef.current) return;
      setScanStage("正在读取票据文字…"); setScanProgress((value)=>Math.max(value,24));
      const result=await worker.recognize(image,{ rotateAuto:true });
      if (jobId!==scanJobRef.current) return;
      const parsed=parseReceipt(result.data.text,result.data.confidence);
      setScanText(result.data.text.trim());
      setDraft((current)=>({ ...current,merchant:parsed.merchant||current.merchant,amount:parsed.amount||current.amount,transactionDate:parsed.transactionDate||current.transactionDate,category:parsed.category||current.category,sourceText:parsed.sourceText||current.sourceText }));
      setScanProgress(100); setScanStage("识别完成");
      const missing=[!parsed.amount&&"金额",parsed.merchant==="待确认商户"&&"商户"].filter(Boolean).join("、");
      setMessage(missing
        ? `识别完成（文字置信度 ${parsed.confidence}%），但${missing}未能可靠提取，请核对后补充。`
        : `识别完成（文字置信度 ${parsed.confidence}%）。已填入商户、金额、日期和分类，请核对后再保存。`);
    } catch {
      if (jobId!==scanJobRef.current) return;
      setScanProgress(0); setScanStage("识别失败");
      try { await ocrWorkerRef.current?.terminate(); } catch { /* Ignore cleanup errors. */ }
      ocrWorkerRef.current=null; ocrWorkerPromiseRef.current=null;
      setMessage("图片已载入，但文字识别未完成。请确认网络可用于首次下载中文识别模型，或换一张更清晰的图片重试。");
    } finally { if (jobId===scanJobRef.current) setScanning(false); }
  }
  function selectReceipt(file:File|undefined) {
    if (!file) return;
    if (scanning) { setMessage("当前票据仍在识别，请完成后再选择另一张图片。"); return; }
    if (!file.type.startsWith("image/")) { setMessage("请选择 JPG、PNG、WEBP 等图片文件。"); return; }
    if (file.size>12*1024*1024) { setMessage("图片请控制在 12MB 以内，以保证识别速度。"); return; }
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    previewUrlRef.current=URL.createObjectURL(file);
    setScanPreview(previewUrlRef.current);
    setScanFile(file); setScanText(""); void recognizeReceipt(file);
  }
  function clearReceipt() {
    scanJobRef.current+=1;
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    previewUrlRef.current=null;
    setScanPreview(null); setScanFile(null); setScanText(""); setScanProgress(0); setScanStage("准备图片…");
    if (receiptInputRef.current) receiptInputRef.current.value="";
  }

  function ledgerRow(item:LedgerItem,reimbursed=false) {
    return <article className={`ledger-row ${reimbursed?"reimbursed-row":""} ${editingId===item.id?"editing":""} ${selectedIds.includes(item.id)?"selected":""}`} key={item.id}>
      {bulkMode&&!reimbursed&&<input className="row-select" type="checkbox" checked={selectedIds.includes(item.id)} onChange={()=>toggleSelection(item.id)} aria-label={`选择 ${item.merchant}`}/>}
      <div className={`category-mark ${item.kind}`}><span>{categorySymbols[item.category]||"其"}</span></div>
      <div className="row-copy"><b>{item.merchant}{reimbursed&&<i className="reimbursed-badge">已报销</i>}</b><span>{item.transactionDate} · {item.category} · <em>建档人：{personName(item.personId)}</em>{item.note?` · ${item.note}`:""}{reimbursed&&item.reimbursedAt?` · 报销于 ${new Date(item.reimbursedAt).toLocaleDateString("zh-CN")}`:""}</span></div>
      <strong className={item.kind}>{item.kind==="income"?"＋":"－"}{money(item.amountCents)}</strong>
      <div className="row-actions">
        {item.kind==="expense"&&<button className="reimburse-button" disabled={saving} onClick={()=>void updateReimbursement(item,!reimbursed)}>{reimbursed?"撤销报销":"确认报销"}</button>}
        <button className="edit-button" onClick={()=>startEditing(item)}>编辑</button>
        <button className="delete-button" onClick={()=>void deleteItem(item.id)}>×</button>
      </div>
    </article>;
  }

  return <main className="app-shell">
    <header className="topbar"><a className="brand" href="#top"><span>账</span><div><strong>拾光账本</strong><small>RECOVERABLE RECEIPT LEDGER</small></div></a><div className="privacy"><i/>本机快照、远端账本与历史版本并行保存</div><button className="quiet-button" onClick={resetEditor}>＋ 新记一笔</button></header>
    <section className="hero" id="top"><div><p className="eyebrow">可恢复 · 可归档 · 可批量处理</p><h1>每一笔账，<em>都有回到手里的机会。</em></h1><p>新旧账目会全量合并，任何新增、编辑或删除都会留下历史快照。恢复由你手动勾选决定，不会自动覆盖当前账本。</p></div><div className="month-stamp"><small>当前账期</small><b>{month.replace("-"," / ")}</b><span>{items.filter((item)=>item.transactionDate.startsWith(month)).length} 笔当前账目 · {history.length} 条历史记录</span></div></section>
    <section className="summary-grid"><article className="summary-card featured"><span>本期结余</span><b>{money(summary.income-summary.expense)}</b><small>{summary.income>=summary.expense?"收支平稳，继续保持":"支出高于收入，留意预算"}</small></article><article className="summary-card"><span>收入</span><b className="income">＋{money(summary.income)}</b><small>{filtered.filter((item)=>item.kind==="income").length} 笔入账</small></article><article className="summary-card"><span>支出</span><b className="expense">－{money(summary.expense)}</b><small>{filtered.filter((item)=>item.kind==="expense").length} 笔消费</small></article><article className="summary-card"><span>报账人档案</span><b>{persons.length}</b><small>每位报账人独立建档、集中归纳</small></article></section>
    <section className="capture-grid"><article className="scan-card"><div className="section-heading"><div><small>01 · 图片识别</small><h2>拍照或上传票据</h2></div><span className={scanning?"working":""}>{scanning?`识别中 ${scanProgress}%`:scanText?"识别完成":"本地识别"}</span></div><input ref={receiptInputRef} className="receipt-input" type="file" accept="image/*" capture="environment" disabled={scanning} onChange={(event)=>selectReceipt(event.target.files?.[0])}/><div className={`drop-zone ${draggingReceipt?"dragging":""}`} onDragOver={(event)=>{ event.preventDefault(); if (!scanning) setDraggingReceipt(true); }} onDragLeave={()=>setDraggingReceipt(false)} onDrop={(event)=>{ event.preventDefault(); setDraggingReceipt(false); selectReceipt(event.dataTransfer.files?.[0]); }}><button className="drop-action" disabled={scanning} onClick={()=>receiptInputRef.current?.click()}>{scanPreview?<img src={scanPreview} alt="待识别票据"/>:<><i>＋</i><b>上传票据图片</b><span>支持拖入 JPG、PNG、WEBP，或手机拍照</span><em>图片仅在当前浏览器中进行文字识别</em></>}</button>{scanning&&<div className="scan-line" style={{"--progress":`${scanProgress}%`} as CSSProperties}><i/><span>{scanStage}</span></div>}{scanPreview&&!scanning&&<div className="image-shade"><b>{scanFile?.name||"已载入票据"}</b><button onClick={(event)=>{ event.stopPropagation(); if (scanFile) void recognizeReceipt(scanFile); }}>重新识别</button><button onClick={(event)=>{ event.stopPropagation(); clearReceipt(); }}>移除</button></div>}</div>{scanText&&<section className="ocr-output" aria-live="polite"><header><b>识别结果文字</b><button onClick={()=>{ void navigator.clipboard?.writeText(scanText);setMessage("识别文字已复制，可粘贴到备注或报账说明。 "); }}>复制文字</button></header><textarea readOnly aria-label="识别结果文字" value={scanText}/></section>}<div className="scan-tips"><span><b>1</b>自动校正方向与对比度</span><span><b>2</b>智能提取金额与日期</span><span><b>3</b>识别一次后模型可复用</span></div></article><article className="editor-card manual-entry-card"><div className="section-heading"><div><small>{editingId===null?"02 · 填写账目":"02 · 编辑账目"}</small><h2>{editingId===null?"确认并记一笔":"修改现有账目"}</h2></div><div className="kind-switch"><button className={draft.kind==="expense"?"active":""} onClick={()=>update("kind","expense")}>支出</button><button className={draft.kind==="income"?"active income-active":""} onClick={()=>update("kind","income")}>收入</button></div></div><div className="form-grid"><label className="field wide"><span>商户 / 来源</span><input id="merchant" value={draft.merchant} onChange={(event)=>update("merchant",event.target.value)} placeholder="例如：海棠里咖啡"/></label><label className="field amount"><span>金额</span><div><i>¥</i><input inputMode="decimal" value={draft.amount} onChange={(event)=>update("amount",event.target.value.replace(/[^\d.]/g,""))} placeholder="0.00"/></div></label><label className="field"><span>日期</span><input type="date" value={draft.transactionDate} onChange={(event)=>update("transactionDate",event.target.value)}/></label><label className="field"><span>分类</span><select value={draft.category} onChange={(event)=>update("category",event.target.value)}>{categories.map((name)=><option key={name}>{name}</option>)}</select></label><label className="field"><span>报账人（需建档）</span><select value={draft.personId} onChange={(event)=>update("personId",event.target.value)}><option value="">请选择已建档报账人</option>{persons.map((person)=><option key={person.id} value={person.id}>{person.name}</option>)}</select></label><label className="field person-create"><span>创建报账人档案</span><div><input value={newPersonName} onChange={(event)=>setNewPersonName(event.target.value)} onKeyDown={(event)=>{ if (event.key==="Enter") { event.preventDefault(); void createPerson(); } }} placeholder="例如：小王"/><button type="button" onClick={()=>void createPerson()}>建档</button></div></label><label className="field wide"><span>备注</span><input value={draft.note} onChange={(event)=>update("note",event.target.value)} placeholder="可选：项目、同事、用途或分摊说明"/></label></div><div className="editor-footer"><p className={message.includes("失败")?"error":""}>{message||"请选择或创建报账人；保存时会自动写入当前账本与可恢复历史。"}</p>{editingId!==null&&<button className="cancel-edit-button" onClick={resetEditor}>取消编辑</button>}<button className="save-button" disabled={saving||!draft.merchant||!draft.amount||!draft.personId} onClick={()=>void saveItem()}>{saving?"正在保存…":editingId===null?"确认并记账":"保存修改"}<span>→</span></button></div></article></section>
    <section className="ledger-section">
      <div className="ledger-main">
        <div className="ledger-header"><div><small>03 · 待处理账目</small><h2>待报销与当前记录</h2></div><div className="filters"><input aria-label="搜索账目" value={query} onChange={(event)=>setQuery(event.target.value)} placeholder="搜索商户、备注或建档人"/><input aria-label="选择月份" type="month" value={month} onChange={(event)=>setMonth(event.target.value)}/><select value={category} onChange={(event)=>setCategory(event.target.value)}><option>全部</option>{categories.map((name)=><option key={name}>{name}</option>)}</select><select value={personFilter} onChange={(event)=>setPersonFilter(event.target.value)}><option value="全部">全部建档人</option><option value="未归属">未建档人</option>{persons.map((person)=><option key={person.id} value={person.id}>{person.name}</option>)}</select></div></div>
        <div className="bulk-toolbar"><button className={bulkMode?"active":""} onClick={()=>{ setBulkMode((value)=>!value); setSelectedIds([]); }}>批量编辑</button>{bulkMode&&<><span>已选 {selectedIds.length} 笔</span><button onClick={()=>setSelectedIds(selectedIds.length===pendingItems.length?[]:pendingItems.map((item)=>item.id))}>{selectedIds.length===pendingItems.length?"取消全选":"全选当前结果"}</button><select value={bulkCategory} onChange={(event)=>setBulkCategory(event.target.value)}><option value="keep">分类不变</option>{categories.map((name)=><option key={name}>{name}</option>)}</select><select value={bulkPersonId} onChange={(event)=>setBulkPersonId(event.target.value)}><option value="keep">建档人不变</option>{persons.map((person)=><option key={person.id} value={person.id}>归到：{person.name}</option>)}</select><select value={bulkKind} onChange={(event)=>setBulkKind(event.target.value)}><option value="keep">收支不变</option><option value="expense">统一为支出</option><option value="income">统一为收入</option></select><button className="bulk-apply" disabled={!selectedIds.length||saving} onClick={()=>void applyBulkEdit()}>应用到已选账目</button></>}</div>
        <div className="ledger-list">{loading?<div className="empty-state"><i>…</i><b>正在翻开账本</b></div>:pendingItems.length===0?<div className="empty-state"><i>✓</i><b>当前没有待报销账目</b><span>已报销账目会自动移入下方专属分区。</span></div>:pendingItems.map((item)=>ledgerRow(item))}</div>
      </div>
      <aside className="category-panel"><small>建档人分档</small><h3>{peopleTotals.length?"按人员查看票据与报销":"请先建立人员档案"}</h3>{peopleTotals.length?<div className="people-totals">{peopleTotals.map(({person,count,pending,reimbursed,balance})=><div key={person.id} className={`person-total ${personFilter===String(person.id)?"active":""}`}><button className="person-filter-button" onClick={()=>setPersonFilter(String(person.id))}><span>{person.name}</span><small>{count?`${count} 笔 · 待报销 ${pending} · 已报销 ${reimbursed}`:"暂无账目"}</small><b className={balance>=0?"income":"expense"}>{balance>=0?"＋":"－"}{money(Math.abs(balance))}</b></button><button className="person-delete-button" disabled={saving} aria-label={`删除建档人 ${person.name}`} title={`删除 ${person.name}`} onClick={()=>setPersonPendingDelete(person)}>删除</button></div>)}</div>:<p>创建建档人后，OCR 识别的商户、金额、日期、分类和原文都会随账目归入该人员档案。</p>}<footer><span>待补建档人</span><b>{items.filter((item)=>item.personId===null).length} 笔</b></footer></aside>
    </section>
    <section className="reimbursed-section">
      <header><div><small>04 · 已报销专区</small><h2>已完成报销</h2><p>完成报销的账目会从待处理区移到这里，并继续保留建档人、OCR 原文与报销时间。</p></div><div><b>{reimbursedItems.length} 笔</b><span>{money(reimbursedItems.reduce((sum,item)=>sum+item.amountCents,0))}</span></div></header>
      <div className="ledger-list">{reimbursedItems.length?reimbursedItems.map((item)=>ledgerRow(item,true)):<div className="empty-state compact"><i>档</i><b>还没有已报销账目</b><span>在待处理账目中点击“确认报销”即可归档到这里。</span></div>}</div>
    </section>
    <section className="history-section"><header><div><small>03 · 历史账目恢复</small><h2>所有曾记录过的账目</h2><p>新增、修改、批量编辑和删除都会保留版本。删除会被归档而非物理清除；勾选后恢复为新的当前账目，原快照始终保留，不会自动覆盖。</p></div><div><input value={recoveryQuery} onChange={(event)=>setRecoveryQuery(event.target.value)} placeholder="搜索历史账目"/><button disabled={!recoverySelection.length||saving} onClick={()=>void restoreSelectedHistory()}>恢复已选 {recoverySelection.length} 笔</button></div></header><div className="history-list">{recoveryItems.length?recoveryItems.map((item)=><label className={recoverySelection.includes(item.snapshotId)?"selected":""} key={item.snapshotId}><input type="checkbox" checked={recoverySelection.includes(item.snapshotId)} onChange={()=>setRecoverySelection((current)=>current.includes(item.snapshotId)?current.filter((id)=>id!==item.snapshotId):[...current,item.snapshotId])}/><span className={`history-kind ${item.kind}`}>{item.versionKind==="deleted"?"已删除版本":item.versionKind==="updated"||item.versionKind==="bulk-updated"?"编辑版本":item.versionKind==="restored"?"已恢复版本":"保存版本"}</span><div><b>{item.merchant}</b><small>{item.transactionDate} · {item.category} · {personName(item.personId)} · {new Date(item.recordedAt).toLocaleString("zh-CN")}{item.note?` · ${item.note}`:""}</small></div><strong className={item.kind}>{item.kind==="income"?"＋":"－"}{money(item.amountCents)}</strong></label>):<div className="empty-state"><i>档</i><b>还没有历史快照</b><span>从现在起的每一次保存都会在这里留下可选版本。</span></div>}</div></section>
    <section className="archive-note"><b>防丢账保护已开启</b><span>远端读取只作为合并来源，不再覆盖会话中的新账目；当前账目、本机快照与版本历史会同时保存。</span></section>
    <footer className="site-footer"><span>拾光账本</span><p>恢复由你确认，人物归属可在单笔或批量编辑中调整。</p><b>全量合并 · 历史快照 · 人物归档</b></footer>
    {personPendingDelete&&<div className="confirm-backdrop"><section className="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="delete-person-title"><small>删除建档人</small><h2 id="delete-person-title">确定删除「{personPendingDelete.name}」？</h2><p>关联账目和历史记录不会删除，建档人归属会改为“未建档报账人”。</p><div><button disabled={saving} onClick={()=>setPersonPendingDelete(null)}>取消</button><button className="confirm-delete" disabled={saving} onClick={()=>void deletePerson(personPendingDelete)}>{saving?"正在删除…":"确认删除"}</button></div></section></div>}
  </main>;
}
