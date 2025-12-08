
"use client";

import { useEffect, useState } from "react";
import { apiGet } from "@/lib/api";

interface Team {
  id: number;
  name: string;
  description?: string;
}

interface Person {
  id: number;
  name: string;
  email?: string;
  time_zone?: string;
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

interface OnCallNowResponse {
  schedule_id: number;
  team_id: number;
  slot: Slot;
  primary_person: Person;
  secondary_person?: Person | null;
}

interface ScheduleRead {
  schedule: {
    id: number;
    team_id: number;
    year: number;
    rotation_days: number;
    week_starts_on: number;
  };
  slots: Slot[];
}

interface WeekSummary {
  slot: Slot;
  primary: Person;
  secondary?: Person | null;
}

export default function TeamDashboardPage() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [teamId, setTeamId] = useState<number | "">("");

  const [thisWeek, setThisWeek] = useState<OnCallNowResponse | null>(null);
  const [nextWeek, setNextWeek] = useState<WeekSummary | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    apiGet<Team[]>("/teams/")
      .then(setTeams)
      .catch((e) => setError(e.message));
  }, []);

  async function loadOncall() {
    if (teamId === "") return;
    setLoading(true);
    setError(null);
    setThisWeek(null);
    setNextWeek(null);

    try {
      const res = await apiGet<OnCallNowResponse>(
        `/teams/${teamId}/oncall-now`
      );
      setThisWeek(res);

      const sched = await apiGet<ScheduleRead>(
        `/schedules/${res.schedule_id}`
      );

      const currentSlotNum = res.slot.slot;
      const allSlots = [...sched.slots].sort((a, b) => a.slot - b.slot);
      const currentIdx = allSlots.findIndex(
        (s) => s.slot === currentSlotNum
      );
      const nextSlot = currentIdx >= 0 ? allSlots[currentIdx + 1] : undefined;

      if (nextSlot) {
        const nextPrimary = await apiGet<Person>(
          `/people/${nextSlot.primary_person_id}`
        );
        let nextSecondary: Person | null = null;
        if (nextSlot.secondary_person_id != null) {
          nextSecondary = await apiGet<Person>(
            `/people/${nextSlot.secondary_person_id}`
          );
        }
        setNextWeek({
          slot: nextSlot,
          primary: nextPrimary,
          secondary: nextSecondary ?? undefined,
        });
      } else {
        setNextWeek(null);
      }
    } catch (e: any) {
      setError(e.message);
      setThisWeek(null);
      setNextWeek(null);
    } finally {
      setLoading(false);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    loadOncall();
  }

  const selectedTeam = teams.find((t) => t.id === teamId);

  return (
    <div style={{ padding: 24 }}>
      <h1>Team On-Call Dashboard</h1>

      <form onSubmit={handleSubmit} style={{ marginBottom: 16 }}>
        <label>
          Team:{" "}
          <select
            value={teamId}
            onChange={(e) =>
              setTeamId(e.target.value ? Number(e.target.value) : "")
            }
          >
            <option value="">-- select team --</option>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} (id {t.id})
              </option>
            ))}
          </select>
        </label>
        <button type="submit" style={{ marginLeft: 8 }}>
          {loading ? "Loading..." : "Check"}
        </button>
      </form>

      {error && <p style={{ color: "red" }}>{error}</p>}

      {thisWeek && (
        <div
          style={{
            borderRadius: 8,
            padding: 16,
            boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
            maxWidth: 480,
            marginBottom: 16,
          }}
        >
          <h2 style={{ marginTop: 0 }}>Who’s On Call Right Now?</h2>
          {selectedTeam && (
            <p style={{ margin: "4px 0" }}>
              <strong>Team:</strong> {selectedTeam.name} (ID {selectedTeam.id})
            </p>
          )}
          <p style={{ margin: "4px 0" }}>
            <strong>Schedule ID:</strong> {thisWeek.schedule_id}
          </p>
          <p style={{ margin: "4px 0" }}>
            <strong>Slot:</strong> #{thisWeek.slot.slot}
          </p>
          <p style={{ margin: "4px 0" }}>
            <strong>Date Range:</strong> {thisWeek.slot.start} →{" "}
            {thisWeek.slot.end}
          </p>
          <p style={{ margin: "4px 0" }}>
            <strong>Primary:</strong> {thisWeek.primary_person.name}{" "}
            {thisWeek.primary_person.email && (
              <span>({thisWeek.primary_person.email})</span>
            )}
          </p>
          {thisWeek.secondary_person && (
            <p style={{ margin: "4px 0" }}>
              <strong>Secondary:</strong> {thisWeek.secondary_person.name}{" "}
              {thisWeek.secondary_person.email && (
                <span>({thisWeek.secondary_person.email})</span>
              )}
            </p>
          )}
          {thisWeek.slot.notes && (
            <p style={{ margin: "4px 0" }}>
              <strong>Notes:</strong> {thisWeek.slot.notes}
            </p>
          )}
        </div>
      )}

      {(thisWeek || nextWeek) && (
        <div
          style={{
            display: "flex",
            gap: 16,
            flexWrap: "wrap",
            maxWidth: 800,
          }}
        >
          {thisWeek && (
            <div
              style={{
                flex: "1 1 260px",
                borderRadius: 8,
                padding: 12,
                border: "1px solid #ddd",
              }}
            >
              <h3 style={{ marginTop: 0 }}>This Week</h3>
              <p style={{ margin: "4px 0" }}>
                <strong>Dates:</strong> {thisWeek.slot.start} →{" "}
                {thisWeek.slot.end}
              </p>
              <p style={{ margin: "4px 0" }}>
                <strong>Primary:</strong> {thisWeek.primary_person.name}
              </p>
              {thisWeek.secondary_person && (
                <p style={{ margin: "4px 0" }}>
                  <strong>Secondary:</strong>{" "}
                  {thisWeek.secondary_person.name}
                </p>
              )}
            </div>
          )}

          {nextWeek && (
            <div
              style={{
                flex: "1 1 260px",
                borderRadius: 8,
                padding: 12,
                border: "1px solid #ddd",
              }}
            >
              <h3 style={{ marginTop: 0 }}>Next Week</h3>
              <p style={{ margin: "4px 0" }}>
                <strong>Slot:</strong> #{nextWeek.slot.slot}
              </p>
              <p style={{ margin: "4px 0" }}>
                <strong>Dates:</strong> {nextWeek.slot.start} →{" "}
                {nextWeek.slot.end}
              </p>
              <p style={{ margin: "4px 0" }}>
                <strong>Primary:</strong> {nextWeek.primary.name}
              </p>
              {nextWeek.secondary && (
                <p style={{ margin: "4px 0" }}>
                  <strong>Secondary:</strong> {nextWeek.secondary.name}
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
