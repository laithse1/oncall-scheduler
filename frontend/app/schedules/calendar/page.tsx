"use client";

import { useEffect, useMemo, useState } from "react";
import { apiGet, apiPost } from "@/lib/api";

interface Team {
  id: number;
  name: string;
}

interface Person {
  id: number;
  name: string;
}

interface Slot {
  id: number;
  slot: number;
  start: string;
  end: string;
  primary_person_id: number;
  secondary_person_id?: number | null;
  notes?: string | null;
}

interface ScheduleResponse {
  schedule: {
    id: number;
    team_id: number;
    year: number;
    rotation_days: number;
    week_starts_on: number;
  };
  slots: Slot[];
}

export default function CalendarPage() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [teamId, setTeamId] = useState<number | "">("");
  const [year, setYear] = useState<number>(new Date().getFullYear());
  const [schedule, setSchedule] = useState<ScheduleResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [editError, setEditError] = useState<string | null>(null);
  const [editMessage, setEditMessage] = useState<string | null>(null);

  const personNameById = useMemo(() => {
    const map: Record<number, string> = {};
    people.forEach((p) => {
      map[p.id] = p.name;
    });
    return map;
  }, [people]);

  useEffect(() => {
    async function load() {
      try {
        const [t, p] = await Promise.all([
          apiGet<Team[]>("/teams/"),
          apiGet<Person[]>("/people/"),
        ]);
        setTeams(t);
        setPeople(p);
      } catch (e: any) {
        setError(e.message ?? String(e));
      }
    }
    load();
  }, []);

  async function handleLoad(e: React.FormEvent) {
    e.preventDefault();
    if (teamId === "") return;
    setLoading(true);
    setError(null);
    setEditError(null);
    setEditMessage(null);
    try {
      const result = await apiGet<ScheduleResponse>(
        `/schedules/teams/${teamId}?year=${year}`
      );
      setSchedule(result);
    } catch (e: any) {
      setError(e.message ?? String(e));
      setSchedule(null);
    } finally {
      setLoading(false);
    }
  }

  // ---- NEW: use existing override endpoint to edit a slot ----
  async function updateSlot(
    slotNumber: number,
    primaryId: number | null | undefined,
    secondaryId: number | null | undefined,
    notes: string | null | undefined
  ) {
    if (!schedule) return;
    setEditError(null);
    setEditMessage(null);
    try {
      await apiPost(`/schedules/${schedule.schedule.id}/override`, {
        slot: slotNumber,
        primary_person_id: primaryId ?? null,
        secondary_person_id: secondaryId ?? null,
        notes: notes ?? null,
      });
      const refreshed = await apiGet<ScheduleResponse>(
        `/schedules/${schedule.schedule.id}`
      );
      setSchedule(refreshed);
      setEditMessage(`Updated slot #${slotNumber}.`);
    } catch (e: any) {
      setEditError(e.message ?? String(e));
    }
  }

  function handleChangePrimary(slotNumber: number, value: string) {
    if (!schedule) return;
    const newPrimary = value ? Number(value) : null;
    const slot = schedule.slots.find((s) => s.slot === slotNumber);
    if (!slot) return;
    updateSlot(slotNumber, newPrimary, slot.secondary_person_id, slot.notes);
  }

  function handleChangeSecondary(slotNumber: number, value: string) {
    if (!schedule) return;
    const newSecondary = value ? Number(value) : null;
    const slot = schedule.slots.find((s) => s.slot === slotNumber);
    if (!slot) return;
    updateSlot(slotNumber, slot.primary_person_id, newSecondary, slot.notes);
  }

  function handleEditNotes(slotNumber: number) {
    if (!schedule) return;
    const slot = schedule.slots.find((s) => s.slot === slotNumber);
    if (!slot) return;
    const current = slot.notes ?? "";
    const updated = window.prompt(`Edit notes for slot #${slotNumber}:`, current);
    if (updated === null) {
      return; // user cancelled
    }
    updateSlot(slotNumber, slot.primary_person_id, slot.secondary_person_id, updated);
  }

  return (
    <div style={{ padding: 24 }}>
      <h1>Team Schedule Calendar</h1>

      <form onSubmit={handleLoad} style={{ marginBottom: 24 }}>
        <div>
          <label>
            Team:
            <select
              value={teamId}
              onChange={(e) =>
                setTeamId(e.target.value ? Number(e.target.value) : "")
              }
              style={{ marginLeft: 8 }}
            >
              <option value="">-- select team --</option>
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} (id {t.id})
                </option>
              ))}
            </select>
          </label>
        </div>
        <div style={{ marginTop: 8 }}>
          <label>
            Year:
            <input
              type="number"
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              style={{ marginLeft: 8 }}
            />
          </label>
        </div>
        <button type="submit" style={{ marginTop: 8 }} disabled={loading}>
          {loading ? "Loading..." : "Load Schedule"}
        </button>
      </form>

      {error && <p style={{ color: "red" }}>{error}</p>}
      {editError && <p style={{ color: "red" }}>{editError}</p>}
      {editMessage && <p style={{ color: "green" }}>{editMessage}</p>}

      {schedule && (
        <>
          <h2>
            Schedule #{schedule.schedule.id} (Team {schedule.schedule.team_id},{" "}
            {schedule.schedule.year})
          </h2>
          <p>
            Rotation: {schedule.schedule.rotation_days}-day blocks. Week starts
            on{" "}
            {schedule.schedule.week_starts_on === 0 ? "Monday" : "Sunday"}.
          </p>

          <table border={1} cellPadding={4} style={{ marginTop: 12 }}>
            <thead>
              <tr>
                <th>Slot</th>
                <th>Primary</th>
                <th>Secondary</th>
                <th>Start</th>
                <th>End</th>
                <th>Notes</th>
                <th>Edit Notes</th>
              </tr>
            </thead>
            <tbody>
              {schedule.slots.map((s) => {
                const primaryName =
                  personNameById[s.primary_person_id] ??
                  `ID ${s.primary_person_id}`;
                const secondaryName =
                  s.secondary_person_id != null
                    ? personNameById[s.secondary_person_id] ??
                      `ID ${s.secondary_person_id}`
                    : "";

                return (
                  <tr key={s.slot}>
                    <td>{s.slot}</td>
                    <td>
                      <select
                        value={s.primary_person_id}
                        onChange={(e) =>
                          handleChangePrimary(s.slot, e.target.value)
                        }
                      >
                        {people.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <select
                        value={
                          s.secondary_person_id != null
                            ? String(s.secondary_person_id)
                            : ""
                        }
                        onChange={(e) =>
                          handleChangeSecondary(s.slot, e.target.value)
                        }
                      >
                        <option value="">(none)</option>
                        {people.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>{s.start}</td>
                    <td>{s.end}</td>
                    <td>{s.notes ?? ""}</td>
                    <td>
                      <button
                        type="button"
                        onClick={() => handleEditNotes(s.slot)}
                      >
                        Edit
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}
