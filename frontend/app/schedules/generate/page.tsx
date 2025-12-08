"use client";

import { useEffect, useState, useMemo } from "react";
import { apiGet, apiPost } from "@/lib/api";

interface Team {
  id: number;
  name: string;
  member_ids: number[];
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

interface Person {
  id: number;
  name: string;
  // email exists on backend, but we don't strictly need it here
}

export default function GenerateSchedulePage() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [teamId, setTeamId] = useState<number | "">("");
  const [year, setYear] = useState<number>(new Date().getFullYear());
  const [rotationDays, setRotationDays] = useState<number>(7);
  const [weekStartsOn, setWeekStartsOn] = useState<number>(0);
  const [schedule, setSchedule] = useState<ScheduleResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [selectedSlots, setSelectedSlots] = useState<number[]>([]);
  const [swapError, setSwapError] = useState<string | null>(null);
  const [swapMessage, setSwapMessage] = useState<string | null>(null);

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

  async function handleGenerate(e: React.FormEvent) {
    e.preventDefault();
    if (teamId === "") return;
    try {
      const result = await apiPost<ScheduleResponse>(
        `/schedules/teams/${teamId}/generate`,
        {
          year,
          rotation_days: rotationDays,
          week_starts_on: weekStartsOn,
        }
      );
      setSchedule(result);
      setError(null);
      setSelectedSlots([]);
      setSwapError(null);
      setSwapMessage(null);
      setEditError(null);
      setEditMessage("Schedule generated and saved.");
    } catch (e: any) {
      setError(e.message ?? String(e));
    }
  }

  function toggleSlotSelection(slotNumber: number) {
    setSelectedSlots((prev) => {
      if (prev.includes(slotNumber)) {
        return prev.filter((s) => s !== slotNumber);
      }
      if (prev.length >= 2) {
        return [prev[1], slotNumber];
      }
      return [...prev, slotNumber];
    });
  }

  async function handleSwapWeeks() {
    setSwapError(null);
    setSwapMessage(null);
    if (!schedule) return;
    if (selectedSlots.length !== 2) {
      setSwapError("Please select exactly two slots to swap.");
      return;
    }

    const [slotA, slotB] = [...selectedSlots].sort((a, b) => a - b);

    const slotObjA = schedule.slots.find((s) => s.slot === slotA);
    const slotObjB = schedule.slots.find((s) => s.slot === slotB);

    if (!slotObjA || !slotObjB) {
      setSwapError("Could not find selected slots.");
      return;
    }

    try {
      await apiPost(`/schedules/${schedule.schedule.id}/override`, {
        slot: slotA,
        primary_person_id: slotObjB.primary_person_id,
      });

      await apiPost(`/schedules/${schedule.schedule.id}/override`, {
        slot: slotB,
        primary_person_id: slotObjA.primary_person_id,
      });

      const updated = await apiGet<ScheduleResponse>(
        `/schedules/${schedule.schedule.id}`
      );
      setSchedule(updated);
      setSwapMessage(`Swapped slot #${slotA} and slot #${slotB}.`);
      setSelectedSlots([]);
    } catch (e: any) {
      setSwapError(e.message ?? String(e));
    }
  }

  // ---- NEW: inline edit helpers using the existing override API ----

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
      const updated = await apiGet<ScheduleResponse>(
        `/schedules/${schedule.schedule.id}`
      );
      setSchedule(updated);
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
      <h1>Generate On-Call Schedule</h1>

      <form onSubmit={handleGenerate} style={{ marginBottom: 24 }}>
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
        <div style={{ marginTop: 8 }}>
          <label>
            Rotation days:
            <input
              type="number"
              value={rotationDays}
              onChange={(e) => setRotationDays(Number(e.target.value))}
              style={{ marginLeft: 8 }}
            />
          </label>
        </div>
        <div style={{ marginTop: 8 }}>
          <label>
            Week starts on:
            <select
              value={weekStartsOn}
              onChange={(e) => setWeekStartsOn(Number(e.target.value))}
              style={{ marginLeft: 8 }}
            >
              <option value={0}>Monday</option>
              <option value={6}>Sunday</option>
            </select>
          </label>
        </div>
        <button type="submit" style={{ marginTop: 12 }}>
          Generate
        </button>
      </form>

      {error && <p style={{ color: "red" }}>{error}</p>}
      {swapError && <p style={{ color: "red" }}>{swapError}</p>}
      {editError && <p style={{ color: "red" }}>{editError}</p>}
      {swapMessage && <p style={{ color: "green" }}>{swapMessage}</p>}
      {editMessage && <p style={{ color: "green" }}>{editMessage}</p>}

      {schedule && (
        <>
          <h2>
            Schedule #{schedule.schedule.id} (Team {schedule.schedule.team_id},{" "}
            {schedule.schedule.year})
          </h2>

          <div style={{ marginBottom: 8 }}>
            <button
              disabled={selectedSlots.length !== 2}
              onClick={handleSwapWeeks}
            >
              Swap Selected Weeks
            </button>
          </div>

          <table border={1} cellPadding={4}>
            <thead>
              <tr>
                <th>Select</th>
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
                    <td>
                      <input
                        type="checkbox"
                        checked={selectedSlots.includes(s.slot)}
                        onChange={() => toggleSlotSelection(s.slot)}
                      />
                    </td>
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

          <div style={{ marginTop: 16 }}>
            <a
              href={`${
                process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000"
              }/schedules/${schedule.schedule.id}/export?format=csv`}
              target="_blank"
            >
              Download CSV
            </a>{" "}
            |{" "}
            <a
              href={`${
                process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000"
              }/schedules/${schedule.schedule.id}/export?format=md`}
              target="_blank"
            >
              View Markdown
            </a>{" "}
            |{" "}
            <a
              href={`${
                process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000"
              }/schedules/${schedule.schedule.id}/export?format=ics`}
              target="_blank"
            >
              Download ICS
            </a>
          </div>
        </>
      )}
    </div>
  );
}
