import postgres from "postgres";

export type StoredReceipt = {
  paymentId: string;
  orderId: string;
  sender: string | null;
  amount: string;
  recipient: string;
  status: "completed";
};

type ClaimResult =
  | { created: true; receipt: StoredReceipt }
  | { created: false; receipt: StoredReceipt };

const memoryReceipts = new Map<string, StoredReceipt>();
let sqlClient: ReturnType<typeof postgres> | null = null;
let schemaReady: Promise<void> | null = null;

function sql() {
  const url = process.env.DATABASE_URL;
  if (!url) return null;

  if (!sqlClient) {
    sqlClient = postgres(url, {
      max: 1,
      idle_timeout: 20,
      connect_timeout: 10,
    });
  }

  return sqlClient;
}

async function ensureSchema() {
  const client = sql();
  if (!client) return;

  if (!schemaReady) {
    schemaReady = (async () => {
      await client`
        create table if not exists base_receipt_payments (
          payment_id text primary key,
          order_id text not null,
          sender text,
          amount text not null,
          recipient text not null,
          status text not null check (status = 'completed'),
          created_at timestamptz not null default now()
        )
      `;
    })();
  }

  await schemaReady;
}

export async function claimPayment(receipt: StoredReceipt): Promise<ClaimResult> {
  const client = sql();

  if (!client) {
    const existing = memoryReceipts.get(receipt.paymentId);
    if (existing) return { created: false, receipt: existing };
    memoryReceipts.set(receipt.paymentId, receipt);
    return { created: true, receipt };
  }

  await ensureSchema();

  const inserted = await client<StoredReceipt[]>`
    insert into base_receipt_payments (
      payment_id,
      order_id,
      sender,
      amount,
      recipient,
      status
    ) values (
      ${receipt.paymentId},
      ${receipt.orderId},
      ${receipt.sender},
      ${receipt.amount},
      ${receipt.recipient},
      ${receipt.status}
    )
    on conflict (payment_id) do nothing
    returning
      payment_id as "paymentId",
      order_id as "orderId",
      sender,
      amount,
      recipient,
      status
  `;

  if (inserted[0]) return { created: true, receipt: inserted[0] };

  const existing = await client<StoredReceipt[]>`
    select
      payment_id as "paymentId",
      order_id as "orderId",
      sender,
      amount,
      recipient,
      status
    from base_receipt_payments
    where payment_id = ${receipt.paymentId}
    limit 1
  `;

  if (!existing[0]) throw new Error("Unable to load claimed payment");
  return { created: false, receipt: existing[0] };
}
