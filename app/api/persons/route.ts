import { asc, eq } from "drizzle-orm";
import { ensureDb } from "@/db";
import { persons, transactions, transactionVersions } from "@/db/schema";

export async function GET() {
  try {
    const db = await ensureDb();
    return Response.json({ persons:await db.select().from(persons).orderBy(asc(persons.name)) });
  } catch (error) {
    return Response.json({ error:error instanceof Error ? error.message : "读取人物失败" },{ status:500 });
  }
}

export async function POST(request:Request) {
  try {
    const payload = await request.json() as Record<string,unknown>;
    const name = String(payload.name || "").trim().slice(0,40);
    const note = String(payload.note || "").trim().slice(0,120);
    if (!name) return Response.json({ error:"请填写人物名称" },{ status:400 });
    const db = await ensureDb();
    const [existing] = await db.select().from(persons).where(eq(persons.name,name)).limit(1);
    if (existing) return Response.json({ person:existing });
    const [person] = await db.insert(persons).values({ name,note }).returning();
    return Response.json({ person },{ status:201 });
  } catch (error) {
    return Response.json({ error:error instanceof Error ? error.message : "创建人物失败" },{ status:500 });
  }
}

export async function DELETE(request:Request) {
  const id = Number(new URL(request.url).searchParams.get("id"));
  if (!Number.isInteger(id) || id <= 0) return Response.json({ error:"无效建档人" },{ status:400 });
  try {
    const db = await ensureDb();
    const [person] = await db.select().from(persons).where(eq(persons.id,id)).limit(1);
    if (!person) return Response.json({ error:"建档人不存在" },{ status:404 });
    await db.batch([
      db.update(transactions).set({ personId:null }).where(eq(transactions.personId,id)),
      db.update(transactionVersions).set({ personId:null }).where(eq(transactionVersions.personId,id)),
      db.delete(persons).where(eq(persons.id,id)),
    ]);
    return Response.json({ ok:true, person });
  } catch (error) {
    return Response.json({ error:error instanceof Error ? error.message : "删除建档人失败" },{ status:500 });
  }
}
