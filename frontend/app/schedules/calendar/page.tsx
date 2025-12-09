"use client";

import { useEffect, useMemo, useState } from "react";
import { apiGet, apiDelete } from "@/lib/api";

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
  const [deletingSchedule, setDeletingSchedule] = useState(false);

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

  async function handleDeleteSchedule() {
    if (!schedule) return;
    const id = schedule.schedule.id;

    const confirmed = window.confirm(
      `Delete schedule #${id} for team ${schedule.schedule.team_id} (${schedule.schedule.year})?\n\n` +
        "This will remove all on-call slots for this schedule and cannot be undone."
    );
    if (!confirmed) return;

    setDeletingSchedule(true);
    setError(null);
    try {
      await apiDelete(`/schedules/${id}`);
      setSchedule(null);
    } catch (e: any) {
      setError(e.message ?? String(e));
    } finally {
      setDeletingSchedule(false);
    }
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

      {error && <p style={{ color: "salmon" }}>{error}</p>}

      {schedule && (
        <>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 16,
            }}
          >
            <div>
              <h2>
                Schedule #{schedule.schedule.id} (Team{" "}
                {schedule.schedule.team_id}, {schedule.schedule.year})
              </h2>
              <p>
                Rotation: {schedule.schedule.rotation_days}-day blocks. Week
                starts on{" "}
                {schedule.schedule.week_starts_on === 0 ? "Monday" : "Sunday"}.
              </p>
            </div>

            <button
              type="button"
              className="danger-button"
              onClick={handleDeleteSchedule}
              disabled={deletingSchedule}
            >
              {deletingSchedule ? "Deleting..." : "Delete Schedule"}
            </button>
          </div>

          <table border={1} cellPadding={4} style={{ marginTop: 12, width: "100%" }}>
            <thead>
              <tr>
                <th>Slot</th>
                <th>Primary</th>
                <th>Secondary</th>
                <th>Start</th>
                <th>End</th>
                <th>Notes</th>
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
                    <td>{primaryName}</td>
                    <td>{secondaryName}</td>
                    <td>{s.start}</td>
                    <td>{s.end}</td>
                    <td>{s.notes ?? ""}</td>
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
