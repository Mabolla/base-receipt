"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { BUILDER_CODE, getMetaMaskProvider } from "@/lib/base-payment";
import { CHECK_STORAGE_KEY, checkSchema, checkWallet, connectCheckWallet, issueCheckReceipt, paymentHash, prepareSelfCheck, submitSelfCheck, type LiveCheck } from "@/lib/live-check";

async function withMcp<T>(run: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client({ name: "base-receipt-live-check", version: "1.0.0" });
  try {
    await client.connect(new StreamableHTTPClientTransport(new URL("/mcp", window.location.origin)));
    return await run(client);
  } finally { await client.close().catch(() => undefined); }
}

export default function LiveCheckPage() {
  const [ready, setReady] = useState(false);
  const [payer, setPayer] = useState("");
  const [check, setCheck] = useState<LiveCheck | null>(null);
  const [busy, setBusy] = useState(false);
  const [hashInput, setHashInput] = useState("");
  const [message, setMessage] = useState("Önce cüzdanı bağla. Bağlanmak ödeme yapmaz.");
  const locked = useRef(false);

  useEffect(() => {
    // Read after hydration, and block payments if recovery storage is unavailable.
    Promise.resolve().then(() => {
      try {
        const saved = localStorage.getItem(CHECK_STORAGE_KEY);
        if (saved) {
          const value = checkSchema.parse(JSON.parse(saved));
          setCheck(value); setPayer(value.payer);
          setMessage(value.receipt ? "Kayıtlı MCP makbuzu aşağıda. Kontrol tamamlandı." : "Önceki kontrol bulundu. Yeni ödeme yapmadan makbuzu doğrulayabilirsin.");
        }
        setReady(true);
      } catch { setMessage("Kontrol kaydı okunamadı. Yeni ödeme başlatılmadı; bu ekranı paylaşarak yardım iste."); }
    });
  }, []);

  function save(value: LiveCheck) {
    setCheck(value);
    localStorage.setItem(CHECK_STORAGE_KEY, JSON.stringify(value));
  }

  async function run(action: () => Promise<void>) {
    if (locked.current) return;
    locked.current = true; setBusy(true);
    try { await action(); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Kontrol tamamlanamadı."); }
    finally { locked.current = false; setBusy(false); }
  }

  async function verify(value: LiveCheck) {
    if (!value.paymentId) throw new Error("Cüzdandaki işlemin kimliğini gir. Yeni ödeme yapma.");
    setMessage("İşlem gönderildi. Aynı MCP siparişiyle makbuz doğrulanıyor…");
    const receipt = await withMcp(async client => {
      for (let attempt = 0; attempt < 12; attempt += 1) {
        try { return await issueCheckReceipt(client, value); }
        catch (error) {
          // The RPC can briefly lag a freshly broadcast transaction. Only retry
          // that transient response, with the same token and transaction hash.
          if (!(error instanceof Error) || error.message !== "Unable to verify payment" || attempt === 11) throw error;
          await new Promise(resolve => setTimeout(resolve, 2_000));
        }
      }
      throw new Error("Makbuz henüz alınamadı. Yeni ödeme yapmadan tekrar doğrula.");
    });
    save({ ...value, receipt });
    setMessage("Başarılı: MCP siparişi, gerçek Base işlemi ve aynı siparişin MCP makbuzu doğrulandı.");
  }

  async function connect() {
    const provider = getMetaMaskProvider();
    const account = await connectCheckWallet(provider);
    await checkWallet(provider, account);
    setPayer(account);
    setMessage("Cüzdan hazır. Gönderen ve alıcı aşağıdaki aynı adres. Ağ ücretini cüzdanda inceleyip onaylayacaksın.");
  }

  async function pay() {
    if (check || localStorage.getItem(CHECK_STORAGE_KEY)) throw new Error("Bir kontrol kaydı zaten var. Sayfayı yenileyip mevcut işlemi doğrula.");
    const provider = getMetaMaskProvider();
    await checkWallet(provider, payer);
    setMessage("MCP üzerinden 15 dakika geçerli sipariş hazırlanıyor…");
    const prepared = await withMcp(client => prepareSelfCheck(client, payer));
    let value: LiveCheck = { payer, prepared };
    let walletRequested = false;
    try {
      const hash = await submitSelfCheck(provider, value, () => {
        save(value); // Persist the original token before opening the wallet.
        walletRequested = true;
        setMessage("Cüzdanda 0,01 USDC kendi adresine gönderimini ve ağ ücretini onayla.");
      });
      value = { ...value, paymentId: hash };
      save(value); // Persist the hash before waiting for confirmation.
    } catch (error) {
      const rejected = typeof error === "object" && error !== null && "code" in error && error.code === 4001;
      if (!walletRequested || rejected) {
        localStorage.removeItem(CHECK_STORAGE_KEY); setCheck(null);
      } else {
        throw new Error("Cüzdan yanıtı tamamlanamadı. Yeni ödeme yapma. İşlem gönderildiyse kimliğini aşağıya yapıştırıp aynı siparişi doğrula.");
      }
      throw error;
    }
    await verify(value);
  }

  const proof = check?.receipt ? {
    network: "eip155:8453", tools: ["prepare_base_payment", "issue_base_receipt"],
    builderCode: BUILDER_CODE, checkType: "self-transfer functionality check", receipt: check.receipt,
  } : null;

  return (
    <main className="shell" lang="tr">
      <section className="hero">
        <p className="eyebrow">BASE RECEIPT · CANLI MCP KONTROLÜ</p>
        <h1>Siparişten makbuza.</h1>
        <p className="lede">Agent&apos;ların kullandığı iki MCP aracını gerçek bir Base işlemiyle birlikte kontrol et.</p>
      </section>
      <section className="card agentDocs receipt">
        <p className="networkWarning"><strong>Gerçek Base Mainnet işlemi.</strong> 0,01 USDC kendi cüzdan adresine gönderilir. USDC bakiyen değişmez; ağ ücreti ETH olarak harcanır. Cüzdanda en az 0,01 USDC ve ağ ücreti için ETH bulunmalı.</p>
        <p>Mevcut MetaMask hesabını kullan. Telefonda bu sayfayı MetaMask&apos;ın içinden açabilirsin.</p>
        <a className="explorerLink" href="https://link.metamask.io/dapp/base-receipt-six.vercel.app/agents/check">Mevcut MetaMask uygulamasında aç ↗</a>
        <p>Bu kontrol normal cüzdan hesabıyla çalışır; akıllı hesap desteklenmez.</p>
        <p>Ödeme onayından sonra makbuz görünene kadar sayfayı açık tut. Sipariş 15 dakika geçerlidir.</p>
        {payer && <dl><div><dt>Gönderen ve alıcı</dt><dd><code>{payer}</code></dd></div><div><dt>Tutar</dt><dd>0,01 USDC · Base Mainnet</dd></div></dl>}
        <p className="status" role="status" aria-live="polite">{message}</p>
        <div className="checkActions">
          {!check && !payer && <button disabled={!ready || busy} onClick={() => void run(connect)}>1. Cüzdanı bağla</button>}
          {!check && payer && <button disabled={!ready || busy} onClick={() => void run(pay)}>2. Kendi adresime 0,01 USDC gönder</button>}
          {check && !check.receipt && <>
            {!check.paymentId && <label>İşlem kimliği (cüzdanda gönderildiyse)<input placeholder="0x…" value={hashInput} onChange={event => setHashInput(event.target.value.trim())} /></label>}
            <button disabled={busy || (!check.paymentId && !paymentHash.safeParse(hashInput).success)} onClick={() => void run(async () => {
              const value = check.paymentId ? check : { ...check, paymentId: paymentHash.parse(hashInput) };
              save(value); await verify(value);
            })}>Makbuzu doğrula · yeni ödeme yapmaz</button>
          </>}
        </div>
        {check?.paymentId && <a className="explorerLink" href={`https://basescan.org/tx/${check.paymentId}`} target="_blank" rel="noreferrer">BaseScan üzerinde işlemi gör ↗</a>}
      </section>
      {proof && <section className="card agentDocs receipt">
        <h2>MCP makbuzu doğrulandı</h2>
        <dl><div><dt>Sipariş</dt><dd><code>{proof.receipt.orderId}</code></dd></div><div><dt>İşlem</dt><dd><code>{proof.receipt.paymentId}</code></dd></div><div><dt>Builder Code</dt><dd><code>{BUILDER_CODE}</code></dd></div></dl>
        <p>Bu kayıt teknik akışın çalıştığını gösterir. Bağımsız kullanıcı veya ticari kullanım kanıtı değildir.</p>
        <button onClick={() => void run(async () => { await navigator.clipboard.writeText(JSON.stringify(proof, null, 2)); setMessage("Sonuç kopyalandı. Kontrol için sohbetine yapıştırabilirsin."); })}>Sonucu kopyala</button>
        <details><summary>Kontrol sonucu</summary><pre>{JSON.stringify(proof, null, 2)}</pre></details>
      </section>}
      <Link className="explorerLink" href="/agents">MCP araçlarının belgeleri ↗</Link>
    </main>
  );
}
