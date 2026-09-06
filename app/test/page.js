"use client";

import React, { useState } from "react";

// Temporary diagnostic page: tests whether this device/browser can send a
// POST request to ANY external site at all, completely unrelated to
// Supabase. Visit /test on the live site to use it. Safe to delete this
// whole app/test folder once the "Load failed" issue is resolved.
export default function TestPage() {
  const [result, setResult] = useState("");
  const [busy, setBusy] = useState(false);

  async function runTest(url, label) {
    setBusy(true);
    setResult(`Bezig met testen: ${label}...`);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ test: "hello" }),
      });
      setResult(`✅ ${label}: gelukt (status ${res.status})`);
    } catch (err) {
      setResult(`❌ ${label}: mislukt — ${err.message}`);
    }
    setBusy(false);
  }

  async function runGetTest() {
    setBusy(true);
    setResult("Bezig met testen: GET...");
    try {
      const res = await fetch("https://httpbin.org/get");
      setResult(`✅ GET naar httpbin.org: gelukt (status ${res.status})`);
    } catch (err) {
      setResult(`❌ GET naar httpbin.org: mislukt — ${err.message}`);
    }
    setBusy(false);
  }

  return (
    <div style={{ padding: 24, fontFamily: "sans-serif", maxWidth: 480, margin: "0 auto" }}>
      <h1 style={{ fontSize: 20 }}>Netwerk-diagnose</h1>
      <p style={{ color: "#555", fontSize: 14 }}>
        Deze pagina test losse externe verzoeken, niets met onze eigen reserveringen te maken.
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 16 }}>
        <button disabled={busy} onClick={runGetTest} style={{ padding: 12, fontSize: 15 }}>
          Test 1: GET naar httpbin.org
        </button>
        <button
          disabled={busy}
          onClick={() => runTest("https://httpbin.org/post", "POST naar httpbin.org")}
          style={{ padding: 12, fontSize: 15 }}
        >
          Test 2: POST naar httpbin.org (andere externe site)
        </button>
        <button
          disabled={busy}
          onClick={() =>
            runTest(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/reservations`, "POST naar Supabase (zonder data)")
          }
          style={{ padding: 12, fontSize: 15 }}
        >
          Test 3: POST naar Supabase zelf
        </button>
        <button
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setResult("Bezig met testen: POST via eigen API-route...");
            try {
              const res = await fetch("/api/reservations", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ rows: [] }),
              });
              setResult(`✅ POST via eigen API-route: gelukt (status ${res.status})`);
            } catch (err) {
              setResult(`❌ POST via eigen API-route: mislukt — ${err.message}`);
            }
            setBusy(false);
          }}
          style={{ padding: 12, fontSize: 15 }}
        >
          Test 4: POST via onze eigen API-route
        </button>
        <button
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setResult("Bezig met ophalen...");
            try {
              const now = new Date();
              const pad = (n) => n.toString().padStart(2, "0");
              const todayKey = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
              const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
              const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
              const res = await fetch(`${url}/rest/v1/reservations?date=eq.${todayKey}&select=*&_=${Date.now()}`, {
                headers: { apikey: key, Authorization: `Bearer ${key}` },
              });
              const text = await res.text();
              setResult(`Datum gezocht: ${todayKey}\nStatus: ${res.status}\n\n${text}`);
            } catch (err) {
              setResult(`❌ Ophalen mislukt — ${err.message}`);
            }
            setBusy(false);
          }}
          style={{ padding: 12, fontSize: 15 }}
        >
          Test 5: toon ruwe data van vandaag
        </button>
      </div>
      <p style={{ marginTop: 20, padding: 12, background: "#f0f0f0", borderRadius: 8, fontSize: 13, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
        {result || "Resultaat verschijnt hier..."}
      </p>
    </div>
  );
}
