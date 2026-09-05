"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "../lib/supabaseClient";

// Writes (insert/update/delete) go through our OWN API route
// (/api/reservations) instead of talking to Supabase directly from the
// browser. On some iOS Safari/WebKit devices, direct browser writes to
// Supabase fail with "TypeError: Load failed" even though reads work fine
// and the same device can POST to other external sites without issue --
// routing through our own same-origin API avoids whatever is special
// about a mobile-Safari-to-Supabase POST specifically. Reads still use
// supabase-js directly (loadReservations), since those already work fine.
async function apiInsert(rows) {
  const res = await fetch("/api/reservations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ rows }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `HTTP ${res.status}`);
  }
}

async function apiUpdate(id, patch) {
  const res = await fetch("/api/reservations", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, patch }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `HTTP ${res.status}`);
  }
}

async function apiDelete(id) {
  const res = await fetch("/api/reservations", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `HTTP ${res.status}`);
  }
}

const TABLES = [
  { id: "wit", label: "Wit", sub: "Tafel 1", ball: "#F5F1E8", ballRing: "#D9D2C2", textOn: "#1a1a1a" },
  { id: "zwart", label: "Zwart", sub: "Tafel 2", ball: "#1a1a1a", ballRing: "#3a3a3a", textOn: "#F5F1E8" },
];

const START_HOUR = 14;
const END_HOUR = 24; // last slot starts at 23:00
const DEFAULT_MAX_SELECT = 3;
const COMPETITION_MAX_SELECT = 6;
const OPEN_DAYS = 8; // today + 7 more days
const MODES = [
  { id: "mij", label: "Mij" },
  { id: "nidm", label: "NIDM" },
  { id: "kbbb", label: "KBBB" },
];
const DEVICE_TOKEN_KEY = "tsplace-device-token";

function pad(n) {
  return n.toString().padStart(2, "0");
}

function toDateKey(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function formatDateLong(d) {
  return d.toLocaleDateString("nl-NL", { weekday: "long", day: "numeric", month: "long" });
}

function buildSlots() {
  const slots = [];
  for (let h = START_HOUR; h < END_HOUR; h++) {
    slots.push(`${pad(h)}:00`);
  }
  return slots;
}

const SLOTS = buildSlots();

function startOfDay(d) {
  const n = new Date(d);
  n.setHours(0, 0, 0, 0);
  return n;
}

function parseDateKey(key) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

// End time = one hour after the latest booked slot on that date.
function computeEndsAt(dateKeyStr, slots) {
  const lastHour = Math.max(...slots.map((s) => parseInt(s.split(":")[0], 10)));
  const d = parseDateKey(dateKeyStr);
  d.setHours(lastHour + 1, 0, 0, 0);
  return d;
}

function getDeviceToken() {
  if (typeof window === "undefined") return null;
  try {
    let token = window.localStorage.getItem(DEVICE_TOKEN_KEY);
    if (!token) {
      token = `dev-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      window.localStorage.setItem(DEVICE_TOKEN_KEY, token);
    }
    return token;
  } catch (e) {
    // localStorage unavailable (e.g. private browsing edge cases) -- fall
    // back to a session-only token so the app still works.
    return `dev-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }
}

export default function BiljartReserveringen() {
  const today = useMemo(() => startOfDay(new Date()), []);
  const maxDate = useMemo(() => {
    const d = new Date(today);
    d.setDate(d.getDate() + OPEN_DAYS - 1);
    return d;
  }, [today]);
  const todayKey = toDateKey(today);

  const [deviceToken, setDeviceToken] = useState(null);
  const [selectedDate, setSelectedDate] = useState(today);
  const [competition, setCompetition] = useState("mij"); // 'mij' | 'nidm' | 'kbbb'
  const [reservations, setReservations] = useState({}); // key: tableId|slot -> row
  const [loading, setLoading] = useState(true);
  const [selection, setSelection] = useState([]); // [{tableId, slot}]
  const [cancelTarget, setCancelTarget] = useState(null); // {tableId, slot}
  const [nameInput, setNameInput] = useState("");
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [activeReservation, setActiveReservation] = useState(null); // {dateKey, tableId, slots, endsAt}
  const [opponentInput, setOpponentInput] = useState(""); // at booking time
  const [opponentLocked, setOpponentLocked] = useState(false); // at booking time
  const [opponentTarget, setOpponentTarget] = useState(null); // {tableId, slot, row, mode: 'claim' | 'manage'}
  const [opponentEditName, setOpponentEditName] = useState("");
  const [opponentEditLocked, setOpponentEditLocked] = useState(false);

  const maxSelect = competition === "mij" ? DEFAULT_MAX_SELECT : COMPETITION_MAX_SELECT;
  const isPersonalMode = competition === "mij";
  const dateKey = toDateKey(selectedDate);
  const atMin = dateKey === todayKey;
  const atMax = dateKey === toDateKey(maxDate);

  useEffect(() => {
    setDeviceToken(getDeviceToken());
  }, []);

  // Fetch the bookings for the currently viewed day.
  const loadReservations = useCallback(async () => {
    setLoading(true);
    const { data, error: err } = await supabase
      .from("reservations")
      .select("*")
      .eq("date", dateKey);
    if (err) {
      console.error(err);
      setReservations({});
    } else {
      const map = {};
      (data || []).forEach((row) => {
        map[`${row.table_id}|${row.slot}`] = row;
      });
      setReservations(map);
    }
    setLoading(false);
  }, [dateKey]);

  useEffect(() => {
    loadReservations();
    setSelection([]);
    setError("");
  }, [loadReservations]);

  // Live updates: refetch whenever any change happens for this date, from
  // any browser -- this is what makes the board "shared" in real time.
  useEffect(() => {
    const channel = supabase
      .channel(`reservations-${dateKey}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "reservations", filter: `date=eq.${dateKey}` },
        () => loadReservations()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [dateKey, loadReservations]);

  // Figure out whether this device already has an ongoing/future PERSONAL
  // ("Mij") reservation anywhere in the open booking window, so we can
  // block a second one. NIDM/KBBB bookings never count toward this.
  const refreshActiveReservation = useCallback(async () => {
    if (!deviceToken) return;
    const { data, error: err } = await supabase
      .from("reservations")
      .select("*")
      .eq("owner_token", deviceToken)
      .eq("competition", "mij")
      .gte("date", todayKey);
    if (err || !data || data.length === 0) {
      setActiveReservation(null);
      return;
    }
    // Group by date+table, find the group whose end time is furthest out.
    const groups = {};
    data.forEach((row) => {
      const gKey = `${row.date}|${row.table_id}`;
      if (!groups[gKey]) groups[gKey] = { dateKey: row.date, tableId: row.table_id, slots: [] };
      groups[gKey].slots.push(row.slot);
    });
    const now = new Date();
    let best = null;
    Object.values(groups).forEach((g) => {
      const endsAt = computeEndsAt(g.dateKey, g.slots);
      if (endsAt > now && (!best || endsAt > best.endsAt)) {
        best = { ...g, endsAt };
      }
    });
    setActiveReservation(best);
  }, [deviceToken, todayKey]);

  useEffect(() => {
    refreshActiveReservation();
  }, [refreshActiveReservation, reservations]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 8000);
    return () => clearTimeout(t);
  }, [toast]);

  function toggleCompetition(id) {
    setCompetition(id);
  }

  function shiftDay(delta) {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() + delta);
    if (d < today || d > maxDate) return;
    setSelectedDate(d);
  }

  function isToday() {
    return dateKey === todayKey;
  }

  function isPastSlot(slot) {
    if (!isToday()) return false;
    const now = new Date();
    const [h] = slot.split(":").map(Number);
    return h <= now.getHours();
  }

  function isSelected(tableId, slot) {
    return selection.some((s) => s.tableId === tableId && s.slot === slot);
  }

  function isActiveReservationOngoing() {
    return activeReservation && activeReservation.endsAt > new Date();
  }

  function toggleSlot(tableId, slot) {
    if (isPastSlot(slot)) return;
    const key = `${tableId}|${slot}`;
    if (reservations[key]) {
      setCancelTarget({ tableId, slot });
      return;
    }
    if (isPersonalMode && isActiveReservationOngoing()) {
      const until = activeReservation.endsAt;
      setToast(
        `Nog een lopende reservering — nieuw kan pas vanaf ${pad(until.getHours())}:${pad(until.getMinutes())}.`
      );
      return;
    }
    setError("");
    setSelection((prev) => {
      const exists = prev.some((s) => s.tableId === tableId && s.slot === slot);
      if (exists) {
        return prev.filter((s) => !(s.tableId === tableId && s.slot === slot));
      }
      const sameTable = prev.filter((s) => s.tableId === tableId);
      if (sameTable.length >= maxSelect) return prev;
      const base = prev.length && prev[0].tableId !== tableId ? [] : prev;
      return [...base, { tableId, slot }];
    });
  }

  function clearSelection() {
    setSelection([]);
    setError("");
  }

  async function confirmReservation() {
    const trimmed = nameInput.trim();
    if (!trimmed) {
      setError("Vul een naam in om te reserveren.");
      return;
    }
    if (selection.length === 0) {
      setError("Kies eerst een vrij uur.");
      return;
    }
    if (isPersonalMode && isActiveReservationOngoing()) {
      setError("Je hebt al een lopende reservering; je kan pas opnieuw boeken nadat die is afgelopen.");
      return;
    }

    const trimmedOpponent = opponentInput.trim();
    const rows = selection.map(({ tableId, slot }) => ({
      date: dateKey,
      table_id: tableId,
      slot,
      name: trimmed,
      owner_token: deviceToken,
      competition,
      opponent_name: trimmedOpponent || null,
      opponent_locked: opponentLocked,
    }));

    if (!deviceToken) {
      // Extremely rare, but if the browser blocked/failed localStorage this
      // would otherwise fail silently as a generic insert error below.
      setToast("Fout: geen toestel-ID beschikbaar (localStorage geblokkeerd?). Herlaad de pagina.");
      return;
    }

    try {
      await apiInsert(rows);
    } catch (err) {
      console.error(err);
      // Show the real error text so we can diagnose without needing
      // devtools access (e.g. not possible on some mobile browsers).
      setToast(`Opslaan mislukt: ${err.message || "onbekende fout"}`);
      return;
    }

    setSelection([]);
    setNameInput("");
    setOpponentInput("");
    setOpponentLocked(false);
    setError("");
    setToast(selection.length > 1 ? "Uren gereserveerd" : "Gereserveerd");
    loadReservations();
    refreshActiveReservation();
  }

  async function cancelReservation() {
    const key = `${cancelTarget.tableId}|${cancelTarget.slot}`;
    const row = reservations[key];
    setCancelTarget(null);
    if (!row) return;

    try {
      await apiDelete(row.id);
    } catch (err) {
      console.error(err);
      setToast(`Annuleren mislukt: ${err.message || "onbekende fout"}`);
      return;
    }
    setToast("Reservering geannuleerd");
    loadReservations();
    refreshActiveReservation();
  }

  function isOpponentOwner(row) {
    return !!(row && deviceToken && row.owner_token === deviceToken);
  }

  // Anyone (not just the reserver) may add their name in the open opponent
  // slot -- but only while it's unlocked and still empty. Once it's locked
  // or filled in, only the reserver ("Owner") can change it further.
  function isOpponentOpenForAnyone(row) {
    return !!row && !row.opponent_locked && !row.opponent_name;
  }

  function openOpponentSlot(tableId, slot, row) {
    if (!row) return;
    const owner = isOpponentOwner(row);
    if (!owner && !isOpponentOpenForAnyone(row)) {
      // Locked/filled and not yours: just show a read-only view.
      setOpponentTarget({ tableId, slot, row, mode: "readonly" });
      return;
    }
    setOpponentEditName(row.opponent_name || "");
    setOpponentEditLocked(row.opponent_locked || false);
    setOpponentTarget({ tableId, slot, row, mode: owner ? "manage" : "claim" });
  }

  async function saveOpponent() {
    const { row, mode } = opponentTarget;
    const trimmed = opponentEditName.trim();
    const patch =
      mode === "manage"
        ? { opponent_name: trimmed || null, opponent_locked: opponentEditLocked }
        : { opponent_name: trimmed || null };
    if (mode === "claim" && !trimmed) {
      setToast("Vul een naam in.");
      return;
    }
    setOpponentTarget(null);
    try {
      await apiUpdate(row.id, patch);
    } catch (err) {
      console.error(err);
      setToast(`Opslaan tegenstander mislukt: ${err.message || "onbekende fout"}`);
      return;
    }
    setToast("Tegenstander bijgewerkt");
    loadReservations();
  }

  async function clearOpponent() {
    const { row } = opponentTarget;
    setOpponentTarget(null);
    try {
      await apiUpdate(row.id, { opponent_name: null, opponent_locked: false });
    } catch (err) {
      console.error(err);
      setToast(`Wissen mislukt: ${err.message || "onbekende fout"}`);
      return;
    }
    setToast("Tegenstandersveld geopend");
    loadReservations();
  }

  const selectedTableId = selection[0]?.tableId;

  return (
    <div style={styles.page}>
      <style>{responsiveCss}</style>
      <div style={styles.railTop} />
      <div style={styles.wrap}>
        <header style={styles.header}>
          <h1 style={styles.title}>Café T&apos;s Place - PDB</h1>
          <div style={styles.subtitleEyebrow}>Biljartreserveringen</div>
          <p style={styles.subtitle}>Kies tot {maxSelect} vrije uren op één tafel en zet daarna je naam erop.</p>
        </header>

        <div style={styles.competitionRow}>
          {MODES.map((m) => {
            const active = competition === m.id;
            return (
              <button
                key={m.id}
                onClick={() => toggleCompetition(m.id)}
                style={{ ...styles.competitionPill, ...(active ? styles.competitionPillActive : {}) }}
              >
                {m.label}
              </button>
            );
          })}
        </div>
        <div style={styles.competitionNote}>
          {isPersonalMode
            ? `Mij geselecteerd — max ${DEFAULT_MAX_SELECT} uur, en pas een nieuwe reservering na afloop van je vorige.`
            : `${MODES.find((m) => m.id === competition)?.label} geselecteerd — tot ${COMPETITION_MAX_SELECT} uur tegelijk, geen blokkade.`}
        </div>

        {isPersonalMode && isActiveReservationOngoing() && (
          <div style={styles.activeNote}>
            Je hebt al een reservering ({TABLES.find((t) => t.id === activeReservation.tableId)?.label},{" "}
            {activeReservation.slots.slice().sort().join(", ")} op{" "}
            {formatDateLong(parseDateKey(activeReservation.dateKey))}). Een nieuwe reservering kan vanaf{" "}
            {pad(activeReservation.endsAt.getHours())}:{pad(activeReservation.endsAt.getMinutes())}.
          </div>
        )}

        <div style={styles.dateNav}>
          <button style={styles.navBtn} onClick={() => shiftDay(-1)} disabled={atMin} aria-label="Vorige dag">
            ‹
          </button>
          <div style={styles.dateLabel}>
            {formatDateLong(selectedDate)}
            {isToday() && <span style={styles.todayPill}>vandaag</span>}
          </div>
          <button style={styles.navBtn} onClick={() => shiftDay(1)} disabled={atMax} aria-label="Volgende dag">
            ›
          </button>
        </div>

        {loading ? (
          <div style={styles.loading}>Rek wordt opgezet…</div>
        ) : (
          <div className="tables-grid">
            {TABLES.map((table) => (
              <section key={table.id} className="felt-table" style={styles.felt} aria-label={`Tafel ${table.label}`}>
                <div style={styles.feltHeader}>
                  <span
                    className="mini-ball"
                    style={{
                      ...styles.miniBall,
                      background: table.ball,
                      border: `2px solid ${table.ballRing}`,
                      color: table.textOn,
                    }}
                  >
                    {""}
                  </span>
                  <div>
                    <div className="table-label" style={styles.tableLabel}>
                      {table.label}
                    </div>
                    <div className="table-sub" style={styles.tableSub}>
                      {table.sub}
                    </div>
                  </div>
                </div>

                <div style={styles.slotList}>
                  {SLOTS.map((slot) => {
                    const key = `${table.id}|${slot}`;
                    const booking = reservations[key];
                    const past = isPastSlot(slot);
                    const selected = isSelected(table.id, slot);
                    const disableAsFull = !booking && !selected && selectedTableId && selectedTableId !== table.id;
                    const blockedByActive = !booking && !selected && isPersonalMode && isActiveReservationOngoing();
                    const disabled = past || disableAsFull || blockedByActive;
                    return (
                      <div key={slot} style={styles.slotGroup}>
                        <button
                          className="slot-row"
                          onClick={() => toggleSlot(table.id, slot)}
                          disabled={disabled}
                          style={{
                            ...styles.slotRow,
                            ...(booking ? styles.slotRowBooked : {}),
                            ...(selected ? styles.slotRowSelected : {}),
                            ...(disabled ? styles.slotRowPast : {}),
                          }}
                        >
                          <span className="slot-time" style={styles.slotTime}>
                            {slot}
                          </span>
                          <span className="slot-status" style={styles.slotStatus}>
                            {past ? "verstreken" : booking ? booking.name : selected ? "geselecteerd" : "vrij"}
                          </span>
                          <span
                            className="slot-dot"
                            style={{
                              ...styles.dot,
                              background: past
                                ? "#9a948324"
                                : booking
                                ? table.ball
                                : selected
                                ? "#C9A227"
                                : "transparent",
                              border: `1.5px solid ${
                                past ? "#9a9483" : booking ? table.ballRing : selected ? "#C9A227" : "#9a9483"
                              }`,
                            }}
                          />
                        </button>
                        {booking && !past && (
                          <button
                            className="opponent-row"
                            onClick={() => openOpponentSlot(table.id, slot, booking)}
                            style={styles.opponentRow}
                          >
                            <span style={styles.opponentLabel}>vs</span>
                            <span style={styles.opponentValue}>
                              {booking.opponent_name
                                ? booking.opponent_name
                                : booking.opponent_locked
                                ? "speelt alleen"
                                : "vrij — voeg tegenstander toe"}
                            </span>
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>

      {selection.length > 0 && (
        <div style={styles.selectionBar}>
          <div style={styles.selectionTop}>
            <span style={styles.selectionText}>
              {TABLES.find((t) => t.id === selectedTableId)?.label} ·{" "}
              {selection.map((s) => s.slot).sort().join(", ")}
            </span>
            <button style={styles.ghostBtnDark} onClick={clearSelection}>
              Wissen
            </button>
          </div>
          <div style={styles.selectionForm}>
            <input
              style={styles.inputDark}
              placeholder="Jouw naam"
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && confirmReservation()}
            />
            <button style={styles.primaryBtn} onClick={confirmReservation}>
              Reserveer
            </button>
          </div>
          <div style={styles.opponentBookingRow}>
            <input
              style={styles.inputDark}
              placeholder="Naam tegenstander (optioneel)"
              value={opponentInput}
              onChange={(e) => setOpponentInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && confirmReservation()}
            />
            <label style={styles.opponentCheckboxLabel}>
              <input
                type="checkbox"
                checked={opponentLocked}
                onChange={(e) => setOpponentLocked(e.target.checked)}
              />
              Vergrendelen
            </label>
          </div>
          <div style={styles.opponentHint}>
            {opponentLocked
              ? "Vergrendeld: enkel jij kan dit later nog aanpassen. Leeg = je speelt alleen."
              : "Niet vergrendeld: eender wie kan later zelf zijn naam als tegenstander invullen."}
          </div>
          {error && <div style={styles.errorTextLight}>{error}</div>}
        </div>
      )}

      {cancelTarget && (
        <div style={styles.overlay} onClick={() => setCancelTarget(null)}>
          <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalEyebrow}>
              {TABLES.find((t) => t.id === cancelTarget.tableId).label} · {cancelTarget.slot}
            </div>
            <h2 style={styles.modalTitle}>
              Gereserveerd door {reservations[`${cancelTarget.tableId}|${cancelTarget.slot}`]?.name}
            </h2>
            <div style={styles.modalActions}>
              <button style={styles.ghostBtn} onClick={() => setCancelTarget(null)}>
                Sluiten
              </button>
              <button style={styles.dangerBtn} onClick={cancelReservation}>
                Annuleer reservering
              </button>
            </div>
          </div>
        </div>
      )}

      {opponentTarget && (
        <div style={styles.overlay} onClick={() => setOpponentTarget(null)}>
          <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalEyebrow}>
              {TABLES.find((t) => t.id === opponentTarget.tableId).label} · {opponentTarget.slot} · vs
            </div>

            {opponentTarget.mode === "readonly" && (
              <>
                <h2 style={styles.modalTitle}>
                  {opponentTarget.row.opponent_name
                    ? `Tegenstander: ${opponentTarget.row.opponent_name}`
                    : "Speelt alleen"}
                </h2>
                <p style={styles.readOnlyNote}>
                  Dit tegenstandersveld is vergrendeld door de reservering zelf — enkel die persoon kan het
                  wijzigen.
                </p>
                <div style={styles.modalActions}>
                  <button style={styles.ghostBtn} onClick={() => setOpponentTarget(null)}>
                    Sluiten
                  </button>
                </div>
              </>
            )}

            {opponentTarget.mode === "claim" && (
              <>
                <h2 style={styles.modalTitle}>Speel mee als tegenstander</h2>
                <input
                  style={styles.input}
                  placeholder="Jouw naam"
                  value={opponentEditName}
                  onChange={(e) => setOpponentEditName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && saveOpponent()}
                />
                <div style={styles.modalActions}>
                  <button style={styles.ghostBtn} onClick={() => setOpponentTarget(null)}>
                    Sluiten
                  </button>
                  <button style={styles.primaryBtn} onClick={saveOpponent}>
                    Bevestigen
                  </button>
                </div>
              </>
            )}

            {opponentTarget.mode === "manage" && (
              <>
                <h2 style={styles.modalTitle}>Tegenstander beheren</h2>
                <input
                  style={styles.input}
                  placeholder="Naam tegenstander (leeg = alleen spelen)"
                  value={opponentEditName}
                  onChange={(e) => setOpponentEditName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && saveOpponent()}
                />
                <label style={styles.opponentCheckboxLabelDark}>
                  <input
                    type="checkbox"
                    checked={opponentEditLocked}
                    onChange={(e) => setOpponentEditLocked(e.target.checked)}
                  />
                  Vergrendelen (niemand anders kan dan zijn naam invullen)
                </label>
                <div style={styles.modalActions}>
                  <button style={styles.ghostBtn} onClick={clearOpponent}>
                    Wissen &amp; openen
                  </button>
                  <button style={styles.primaryBtn} onClick={saveOpponent}>
                    Opslaan
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {toast && <div style={styles.toast}>{toast}</div>}

      <p style={styles.footnote}>
        Reserveren kan tot {OPEN_DAYS} dagen vooruit · zichtbaar voor iedereen · alleen jij kan je eigen reservering
        op dit toestel annuleren.
      </p>
    </div>
  );
}

const responsiveCss = `
.tables-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 24px;
}
.felt-table { min-width: 0; }
@media (max-width: 620px) {
  .tables-grid { gap: 10px; }
  .felt-table { padding: 14px 10px 16px !important; border-radius: 10px !important; }
  .felt-table .mini-ball { width: 28px !important; height: 28px !important; font-size: 12px !important; }
  .felt-table .table-label { font-size: 16px !important; }
  .felt-table .table-sub { font-size: 10.5px !important; }
  .felt-table .slot-row { padding: 7px 6px !important; gap: 5px !important; }
  .felt-table .slot-time { font-size: 11.5px !important; width: 34px !important; }
  .felt-table .slot-status { font-size: 10.5px !important; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .felt-table .slot-dot { width: 10px !important; height: 10px !important; }
  .felt-table .opponent-row { padding: 4px 8px 4px 20px !important; font-size: 10.5px !important; }
}
@media (max-width: 480px) {
  .tables-grid { gap: 7px; }
}
`;

const styles = {
  page: {
    minHeight: "100vh",
    background: "#cfe8f7",
    backgroundImage:
      "radial-gradient(circle at 20% 15%, rgba(255,255,255,0.5), transparent 40%), radial-gradient(circle at 85% 80%, rgba(255,255,255,0.35), transparent 45%)",
    fontFamily: "'Inter', sans-serif",
    color: "#12293b",
    paddingBottom: 90,
    position: "relative",
  },
  railTop: {
    height: 10,
    width: "100%",
    background: "linear-gradient(90deg, #C9A227, #e4c766, #C9A227)",
  },
  wrap: { maxWidth: 880, margin: "0 auto", padding: "36px 20px 0" },
  header: { marginBottom: 20 },
  title: {
    fontFamily: "'Fraunces', serif",
    fontWeight: 700,
    fontSize: "clamp(2.4rem, 6vw, 3.6rem)",
    margin: 0,
    letterSpacing: "-0.01em",
  },
  subtitleEyebrow: {
    fontSize: 13,
    letterSpacing: "0.12em",
    textTransform: "uppercase",
    color: "#C9A227",
    fontWeight: 600,
    marginTop: 8,
  },
  subtitle: { color: "#3c5568", marginTop: 12, fontSize: 15.5, maxWidth: 480, lineHeight: 1.5 },
  dateNav: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 18,
    margin: "8px 0 32px",
  },
  navBtn: {
    width: 38,
    height: 38,
    borderRadius: "50%",
    border: "1.5px solid rgba(18,41,59,0.25)",
    background: "transparent",
    color: "#12293b",
    fontSize: 20,
    cursor: "pointer",
    lineHeight: 1,
  },
  dateLabel: {
    fontFamily: "'Fraunces', serif",
    fontSize: 19,
    fontWeight: 600,
    minWidth: 220,
    textAlign: "center",
    textTransform: "capitalize",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  todayPill: {
    fontFamily: "'Inter', sans-serif",
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: "0.05em",
    textTransform: "uppercase",
    background: "#C9A227",
    color: "#1a1a1a",
    padding: "3px 9px",
    borderRadius: 20,
  },
  loading: { textAlign: "center", color: "#3c5568", padding: "60px 0" },
  competitionRow: {
    display: "flex",
    justifyContent: "center",
    gap: 10,
    marginBottom: 10,
  },
  competitionPill: {
    padding: "8px 20px",
    borderRadius: 22,
    border: "1.5px solid rgba(18,41,59,0.3)",
    background: "rgba(255,255,255,0.5)",
    color: "#12293b",
    fontSize: 13.5,
    fontWeight: 600,
    letterSpacing: "0.03em",
    cursor: "pointer",
  },
  competitionPillActive: {
    background: "#1B4332",
    borderColor: "#1B4332",
    color: "#F5F1E8",
  },
  competitionNote: {
    textAlign: "center",
    fontSize: 12.5,
    color: "#2c5f47",
    marginBottom: 14,
  },
  activeNote: {
    textAlign: "center",
    fontSize: 13,
    color: "#1a1a1a",
    background: "#e9c25f",
    border: "1px solid #C9A227",
    borderRadius: 10,
    padding: "10px 14px",
    marginBottom: 16,
    lineHeight: 1.5,
  },
  felt: {
    background: "linear-gradient(180deg, #1B4332, #163a2b)",
    border: "1px solid rgba(201,162,39,0.35)",
    borderRadius: 14,
    padding: "20px 18px 22px",
    boxShadow: "inset 0 0 0 6px rgba(62,39,23,0.35), 0 12px 30px rgba(0,0,0,0.35)",
  },
  feltHeader: { display: "flex", alignItems: "center", gap: 12, marginBottom: 16 },
  miniBall: {
    width: 36,
    height: 36,
    borderRadius: "50%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontFamily: "'Fraunces', serif",
    fontWeight: 700,
    fontSize: 14,
    boxShadow: "0 2px 5px rgba(0,0,0,0.4)",
    flexShrink: 0,
  },
  tableLabel: { fontFamily: "'Fraunces', serif", fontWeight: 700, fontSize: 20 },
  tableSub: { fontSize: 12.5, color: "#a9c2b3", letterSpacing: "0.03em" },
  slotList: { display: "flex", flexDirection: "column", gap: 7 },
  slotGroup: { display: "flex", flexDirection: "column", gap: 2 },
  opponentRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    width: "100%",
    padding: "5px 12px 5px 26px",
    borderRadius: 7,
    border: "1px dashed rgba(245,241,232,0.18)",
    background: "rgba(0,0,0,0.1)",
    color: "#c9d6cf",
    cursor: "pointer",
    fontFamily: "'Inter', sans-serif",
    fontSize: 12,
    textAlign: "left",
  },
  opponentLabel: { fontStyle: "italic", opacity: 0.7 },
  opponentValue: { flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  slotRow: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    width: "100%",
    padding: "10px 12px",
    borderRadius: 9,
    border: "1px solid rgba(245,241,232,0.14)",
    background: "rgba(245,241,232,0.04)",
    color: "#F5F1E8",
    cursor: "pointer",
    fontFamily: "'Inter', sans-serif",
    textAlign: "left",
  },
  slotRowBooked: {
    background: "rgba(201,162,39,0.12)",
    border: "1px solid rgba(201,162,39,0.4)",
  },
  slotRowSelected: {
    background: "rgba(201,162,39,0.22)",
    border: "1.5px solid #C9A227",
  },
  slotRowPast: {
    opacity: 0.35,
    cursor: "not-allowed",
  },
  slotTime: { fontVariantNumeric: "tabular-nums", fontWeight: 600, fontSize: 14, width: 48 },
  slotStatus: { flex: 1, fontSize: 13.5, color: "#dfe6de", textTransform: "capitalize" },
  dot: { width: 14, height: 14, borderRadius: "50%", flexShrink: 0 },
  selectionBar: {
    position: "fixed",
    bottom: 0,
    left: 0,
    right: 0,
    background: "#1B4332",
    borderTop: "1px solid rgba(201,162,39,0.4)",
    padding: "12px 16px 16px",
    display: "flex",
    flexDirection: "column",
    gap: 10,
    zIndex: 40,
    boxShadow: "0 -10px 30px rgba(0,0,0,0.35)",
  },
  selectionTop: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  selectionForm: {
    display: "flex",
    gap: 10,
  },
  inputDark: {
    flex: 1,
    minWidth: 0,
    boxSizing: "border-box",
    padding: "11px 13px",
    borderRadius: 8,
    border: "1.5px solid rgba(245,241,232,0.35)",
    background: "rgba(245,241,232,0.08)",
    color: "#F5F1E8",
    fontSize: 15,
    fontFamily: "'Inter', sans-serif",
    outline: "none",
  },
  errorTextLight: { color: "#f3b4b4", fontSize: 13 },
  opponentBookingRow: {
    display: "flex",
    gap: 10,
    alignItems: "center",
  },
  opponentCheckboxLabel: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    fontSize: 12.5,
    color: "#e4c766",
    whiteSpace: "nowrap",
  },
  opponentHint: {
    fontSize: 11.5,
    color: "#a9c2b3",
    lineHeight: 1.4,
  },
  selectionText: { fontSize: 13.5, color: "#F5F1E8" },
  ghostBtnDark: {
    padding: "9px 16px",
    borderRadius: 8,
    border: "1.5px solid rgba(245,241,232,0.35)",
    background: "transparent",
    color: "#F5F1E8",
    cursor: "pointer",
    fontSize: 14,
    fontWeight: 500,
  },
  overlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(10,20,15,0.6)",
    backdropFilter: "blur(2px)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 50,
    padding: 20,
  },
  modal: {
    background: "#F5F1E8",
    color: "#1a1a1a",
    borderRadius: 14,
    padding: "26px 26px 22px",
    width: "100%",
    maxWidth: 360,
    boxShadow: "0 20px 60px rgba(0,0,0,0.45)",
  },
  modalEyebrow: {
    fontSize: 11.5,
    letterSpacing: "0.1em",
    textTransform: "uppercase",
    color: "#7a6b3f",
    fontWeight: 600,
    marginBottom: 6,
  },
  modalTitle: { fontFamily: "'Fraunces', serif", fontSize: 21, fontWeight: 600, margin: "0 0 16px" },
  input: {
    width: "100%",
    boxSizing: "border-box",
    padding: "11px 13px",
    borderRadius: 8,
    border: "1.5px solid #d9d2c2",
    fontSize: 15,
    fontFamily: "'Inter', sans-serif",
    outline: "none",
    marginBottom: 12,
  },
  readOnlyNote: { fontSize: 13.5, color: "#6b6455", margin: "0 0 6px", lineHeight: 1.5 },
  opponentCheckboxLabelDark: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    fontSize: 13,
    color: "#4a4335",
    marginTop: 4,
  },
  modalActions: { display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 20 },
  ghostBtn: {
    padding: "9px 16px",
    borderRadius: 8,
    border: "1.5px solid #d9d2c2",
    background: "transparent",
    color: "#1a1a1a",
    cursor: "pointer",
    fontSize: 14,
    fontWeight: 500,
  },
  primaryBtn: {
    padding: "9px 18px",
    borderRadius: 8,
    border: "none",
    background: "#C9A227",
    color: "#1a1a1a",
    cursor: "pointer",
    fontSize: 14,
    fontWeight: 700,
  },
  dangerBtn: {
    padding: "9px 18px",
    borderRadius: 8,
    border: "none",
    background: "#8a2f2f",
    color: "#F5F1E8",
    cursor: "pointer",
    fontSize: 14,
    fontWeight: 600,
  },
  toast: {
    position: "fixed",
    bottom: 70,
    left: "50%",
    transform: "translateX(-50%)",
    background: "#1a1a1a",
    color: "#F5F1E8",
    padding: "10px 18px",
    borderRadius: 24,
    fontSize: 13.5,
    fontWeight: 500,
    boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
    zIndex: 60,
  },
  footnote: {
    textAlign: "center",
    fontSize: 12,
    color: "#5a7286",
    marginTop: 36,
  },
};
