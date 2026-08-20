import { desc, eq, isNull } from "drizzle-orm";
import { ensureDb } from "@/db";
import { persons, transactions, transactionVersions } from "@/db/schema";

const categories = new Set(["餐饮","交通","购物","居住","医疗","娱乐","教育","工资","转账","其他"]);
type TransactionRow = typeof transactions.$inferSelect;
type VersionKind = "created"|"updated"|"deleted"|"reimbursed"|"unreimbursed";

function validatePayload(payload:Record<string,unknown>) {
  const kind = payload.kind === "income" ? "income" : "expense";
  const merchant = String(payload.merchant || "").trim().slice(0,80);
  const category = categories.has(String(payload.category)) ? String(payload.category) : "其他";
  const transactionDate = String(payload.transactionDate || "").slice(0,10);
  const amount = Number(payload.amount);
  const rawPersonId = payload.personId;
  const personId = rawPersonId === undefined || rawPersonId === null || rawPersonId === "" ? null : Number(rawPersonId);
  if (!merchant) return { error:"请填写商户或来源" };
  if (!Number.isFinite(amount) || amount <= 0 || amount > 9999999) return { error:"请输入正确金额" };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(transactionDate)) return { error:"请选择记账日期" };
  if (personId === null) return { error:"请选择已建档的报账人" };
  if (personId !== null && (!Number.isInteger(personId) || personId <= 0)) return { error:"人物选择无效" };
  return { value:{
    kind, merchant, category, transactionDate, amountCents:Math.round(amount*100), personId,
    note:String(payload.note || "").trim().slice(0,240),
    sourceText:String(payload.sourceText || "").trim().slice(0,6000),
  } };
}

async function ensurePersonExists(db:Awaited<ReturnType<typeof ensureDb>>, personId:number|null) {
  if (personId === null) return true;
  const [person] = await db.select({ id:persons.id }).from(persons).where(eq(persons.id,personId)).limit(1);
  return Boolean(person);
}

async function writeVersion(db:Awaited<ReturnType<typeof ensureDb>>, row:TransactionRow, versionKind:VersionKind) {
  await db.insert(transactionVersions).values({
    transactionId:row.id, versionKind, kind:row.kind, merchant:row.merchant,
    amountCents:row.amountCents, category:row.category, transactionDate:row.transactionDate,
    note:row.note, sourceText:row.sourceText, personId:row.personId, reimbursedAt:row.reimbursedAt,
  });
}

export async function GET() {
  try {
    const db = await ensureDb();
    const [rows, history] = await Promise.all([
      db.select().from(transactions).where(isNull(transactions.deletedAt)).orderBy(desc(transactions.transactionDate),desc(transactions.id)),
      db.select().from(transactionVersions).orderBy(desc(transactionVersions.recordedAt),desc(transactionVersions.id)),
    ]);
    return Response.json({ transactions:rows, history });
  } catch (error) {
    return Response.json({ error:error instanceof Error ? error.message : "读取账目失败" },{ status:500 });
  }
}

export async function POST(request:Request) {
  try {
    const parsed = validatePayload(await request.json() as Record<string,unknown>);
    if ("error" in parsed) return Response.json({ error:parsed.error },{ status:400 });
    const db = await ensureDb();
    if (!await ensurePersonExists(db,parsed.value.personId)) return Response.json({ error:"所选人物不存在" },{ status:400 });
    const [row] = await db.insert(transactions).values(parsed.value).returning();
    await writeVersion(db,row,"created");
    return Response.json({ transaction:row },{ status:201 });
  } catch (error) {
    return Response.json({ error:error instanceof Error ? error.message : "保存账目失败" },{ status:500 });
  }
}

export async function PUT(request:Request) {
  const id = Number(new URL(request.url).searchParams.get("id"));
  if (!Number.isInteger(id) || id <= 0) return Response.json({ error:"无效账目" },{ status:400 });
  try {
    const parsed = validatePayload(await request.json() as Record<string,unknown>);
    if ("error" in parsed) return Response.json({ error:parsed.error },{ status:400 });
    const db = await ensureDb();
    if (!await ensurePersonExists(db,parsed.value.personId)) return Response.json({ error:"所选人物不存在" },{ status:400 });
    const [row] = await db.update(transactions).set(parsed.value).where(eq(transactions.id,id)).returning();
    if (!row) return Response.json({ error:"账目不存在" },{ status:404 });
    await writeVersion(db,row,"updated");
    return Response.json({ transaction:row });
  } catch (error) {
    return Response.json({ error:error instanceof Error ? error.message : "编辑账目失败" },{ status:500 });
  }
}

export async function PATCH(request:Request) {
  const id = Number(new URL(request.url).searchParams.get("id"));
  if (!Number.isInteger(id) || id <= 0) return Response.json({ error:"无效账目" },{ status:400 });
  try {
    const payload = await request.json() as Record<string,unknown>;
    if (typeof payload.reimbursed !== "boolean") return Response.json({ error:"报销状态无效" },{ status:400 });
    const db = await ensureDb();
    const [existing] = await db.select().from(transactions).where(eq(transactions.id,id)).limit(1);
    if (!existing || existing.deletedAt) return Response.json({ error:"账目不存在" },{ status:404 });
    if (payload.reimbursed && existing.kind !== "expense") return Response.json({ error:"只有支出账目可以报销" },{ status:400 });
    const [row] = await db.update(transactions)
      .set({ reimbursedAt:payload.reimbursed ? new Date().toISOString() : null })
      .where(eq(transactions.id,id)).returning();
    await writeVersion(db,row,payload.reimbursed?"reimbursed":"unreimbursed");
    return Response.json({ transaction:row });
  } catch (error) {
    return Response.json({ error:error instanceof Error ? error.message : "更新报销状态失败" },{ status:500 });
  }
}

export async function DELETE(request:Request) {
  const id = Number(new URL(request.url).searchParams.get("id"));
  if (!Number.isInteger(id) || id <= 0) return Response.json({ error:"无效账目" },{ status:400 });
  try {
    const db = await ensureDb();
    const [existing] = await db.select().from(transactions).where(eq(transactions.id,id)).limit(1);
    if (!existing) return Response.json({ error:"账目不存在" },{ status:404 });
    await writeVersion(db,existing,"deleted");
    await db.update(transactions).set({ deletedAt:new Date().toISOString() }).where(eq(transactions.id,id));
    return Response.json({ ok:true });
  } catch (error) {
    return Response.json({ error:error instanceof Error ? error.message : "删除失败" },{ status:500 });
  }
}
