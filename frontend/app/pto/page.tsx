"use client";

import { useEffect, useState } from "react";
import { apiGet, apiPost } from "@/lib/api";

interface Person {
  id: number;
  name: string;
}

export default function PtoPage() {
  const [people, setPeople] = useState<Person[]>([]);
  const [personId, setPersonId] = useState<number | "">("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [note, setNote] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    async function loadPeople() {
      try {
        const data = await apiGet<Person[]>("/people");
        setPeople(data);
      } catch (e: any) {
        setError(e.message ?? String(e));
      }
    }
    loadPeople();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!personId || !startDate || !endDate) {
      setError("Please select person, start date, and end date.");
      return;
    }
    setSubmitting(true);
    setError(null);
    setStatus(null);
    try {
      await apiPost("/pto", {
        person_id: personId,
        start_date: startDate,
        end_date: endDate,
        note: note || null,
      });
      setStatus("PTO/blackout saved.");
      setNote("");
    } catch (e: any) {
      setError(e.message ?? String(e));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <h1>PTO / Blackout Dates</h1>
      <section className="card">
        <h2>Add PTO</h2>
        {error && <p style={{ color: "red" }}>{error}</p>}
        {status && <p style={{ color: "green" }}>{status}</p>}

        <form
          onSubmit={handleSubmit}
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 10,
            maxWidth: 400,
          }}
        >
          <label>
            Person:
            <select
              value={personId}
              onChange={(e) =>
                setPersonId(e.target.value ? Number(e.target.value) : "")
              }
            >
              <option value="">-- select person --</option>
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} (id {p.id})
                </option>
              ))}
            </select>
          </label>

          <label>
            Start date:
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </label>

          <label>
            End date:
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </label>

          <label>
            Note (optional):
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </label>

          <button type="submit" disabled={submitting}>
            {submitting ? "Saving..." : "Save PTO"}
          </button>
        </form>
      </section>
    </div>
  );
}
