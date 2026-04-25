import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/firebase-admin";
import { getApiUser } from "@/lib/api-auth";
import {
  EMPRESAS_COLLECTION,
  FINANCIAL_MOVEMENTS_SUBCOLLECTION,
} from "@/lib/empresas-db";

function toDateStart(value: string): Date | null {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  d.setHours(0, 0, 0, 0);
  return d;
}

function toDateEnd(value: string): Date | null {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  d.setHours(23, 59, 59, 999);
  return d;
}

function csvEscape(value: unknown): string {
  const text = String(value ?? "");
  if (text.includes(",") || text.includes('"') || text.includes("\n")) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export async function GET(request: NextRequest) {
  const apiUser = await getApiUser(request);
  if (!apiUser) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  if (apiUser.role === "empleado") {
    return NextResponse.json({ error: "No autorizado para exportar finanzas" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const mode = (searchParams.get("mode") ?? "daily").trim();
  const date = (searchParams.get("date") ?? "").trim();
  const month = (searchParams.get("month") ?? "").trim();
  const format = (searchParams.get("format") ?? "csv").trim().toLowerCase();

  let start: Date | null = null;
  let end: Date | null = null;
  let label = "";

  if (mode === "monthly") {
    if (!/^\d{4}-\d{2}$/.test(month)) {
      return NextResponse.json(
        { error: "month debe tener formato YYYY-MM" },
        { status: 400 }
      );
    }
    const startMonth = toDateStart(`${month}-01`);
    if (!startMonth) {
      return NextResponse.json({ error: "month inválido" }, { status: 400 });
    }
    start = startMonth;
    const endMonth = new Date(startMonth);
    endMonth.setMonth(endMonth.getMonth() + 1);
    endMonth.setMilliseconds(endMonth.getMilliseconds() - 1);
    end = endMonth;
    label = month;
  } else {
    const useDate = date || new Date().toISOString().slice(0, 10);
    const s = toDateStart(useDate);
    const e = toDateEnd(useDate);
    if (!s || !e) {
      return NextResponse.json(
        { error: "date debe tener formato YYYY-MM-DD" },
        { status: 400 }
      );
    }
    start = s;
    end = e;
    label = useDate;
  }

  const db = getAdminFirestore();
  const snap = await db
    .collection(EMPRESAS_COLLECTION)
    .doc(apiUser.empresaId)
    .collection(FINANCIAL_MOVEMENTS_SUBCOLLECTION)
    .where("createdAt", ">=", start)
    .where("createdAt", "<=", end)
    .orderBy("createdAt", "asc")
    .get();

  const rows = snap.docs.map((doc) => {
    const d = doc.data() as Record<string, unknown>;
    const createdAt = (d.createdAt as { toDate?: () => Date } | undefined)
      ?.toDate?.()
      ?.toISOString?.() ?? "";
    return {
      movementId: (d.movementId as string) ?? doc.id,
      operationId: (d.operationId as string) ?? "",
      createdAt,
      direction: (d.direction as string) ?? "",
      amount: typeof d.amount === "number" ? d.amount : 0,
      signedAmount: typeof d.signedAmount === "number" ? d.signedAmount : 0,
      eventType: (d.eventType as string) ?? "",
      scope: (d.scope as string) ?? "",
      walletType: (d.walletType as string) ?? "",
      walletId: (d.walletId as string) ?? "",
      relatedEntityType: (d.relatedEntityType as string) ?? "",
      relatedEntityId: (d.relatedEntityId as string) ?? "",
      createdBy: (d.createdBy as string) ?? "",
      status: (d.status as string) ?? "",
    };
  });

  if (format === "json") {
    return NextResponse.json({
      mode,
      period: label,
      total: rows.length,
      rows,
    });
  }

  const headers = [
    "movementId",
    "operationId",
    "createdAt",
    "direction",
    "amount",
    "signedAmount",
    "eventType",
    "scope",
    "walletType",
    "walletId",
    "relatedEntityType",
    "relatedEntityId",
    "createdBy",
    "status",
  ];
  const csvBody = [
    headers.join(","),
    ...rows.map((row) =>
      headers.map((key) => csvEscape(row[key as keyof typeof row])).join(",")
    ),
  ].join("\n");

  const filename =
    mode === "monthly"
      ? `financial-movements-${label}.csv`
      : `financial-movements-${label}.csv`;

  return new NextResponse(csvBody, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}

