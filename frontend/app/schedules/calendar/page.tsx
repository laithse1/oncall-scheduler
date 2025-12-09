"use client";

import { useEffect, useMemo, useState } from "react";
import { apiGet, apiDelete, apiPost } from "@/lib/api";

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

type BulkScope = "primary" | "secondary" | "both";

export default function CalendarPage() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [teamId, setTeamId] = useState<number | "">("");
  const [year, setYear] = useState<number>(new Date().getFullYear());
  const [schedule, setSchedule] = useState<ScheduleResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [deletingSchedule, setDeletingSchedule] = useState(false);

  // "Who's on this schedule?" + bulk reassign state
  const [showUsage, setShowUsage] = useState(true);
  const [bulkFromId, setBulkFromId] = useState<number | "">("");
  const [bulkToId, setBulkToId] = useState<number | "">("");
  const [bulkScope, setBulkScope] = useState<BulkScope>("both");
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkMessage, setBulkMessage] = useState<string | null>(null);

  const personNameById = useMemo(() => {
    const map: Record<number, string> = {};
    people.forEach((p) => {
      map[p.id] = p.name;
    });
    return map;
  }, [people]);

  // Aggregate usage per person for current schedule
  const scheduleUsage = useMemo(() => {
    if (!schedule) return [];

    const counts: Record<
      number,
      { personId: number; primary: number; secondary: number }
    > = {};

    for (const slot of schedule.slots) {
      if (slot.primary_person_id != null) {
        const pId = slot.primary_person_id;
        if (!counts[pId])
          counts[pId] = { personId: pId, primary: 0, secondary: 0 };
        counts[pId].primary += 1;
      }
      if (slot.secondary_person_id != null) {
        const sId = slot.secondary_person_id;
        if (!counts[sId])
          counts[sId] = { personId: sId, primary: 0, secondary: 0 };
        counts[sId].secondary += 1;
      }
    }

    return Object.values(counts)
      .map((c) => ({
        personId: c.personId,
        name: personNameById[c.personId] ?? `ID ${c.personId}`,
        primary: c.primary,
        secondary: c.secondary,
        total: c.primary + c.secondary,
      }))
      .sort((a, b) => b.total - a.total);
  }, [schedule, personNameById]);

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
    setBulkMessage(null);
    try {
      const result = await apiGet<ScheduleResponse>(
        `/schedules/teams/${teamId}?year=${year}`
      );
      setSchedule(result);
      // reset bulk form when switching schedules
      setBulkFromId("");
      setBulkToId("");
      setBulkScope("both");
    } catch (e: any) {
      setError(e.message ?? String(e));
      setSchedule(null);
    } finally {
      setLoading(false);
    }
  }

  async function reloadCurrentSchedule() {
    if (!schedule) return;
    const { team_id, year } = schedule.schedule;
    const refreshed = await apiGet<ScheduleResponse>(
      `/schedules/teams/${team_id}?year=${year}`
    );
    setSchedule(refreshed);
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
    setBulkMessage(null);
    try {
      await apiDelete(`/schedules/${id}`);
      setSchedule(null);
    } catch (e: any) {
      setError(e.message ?? String(e));
    } finally {
      setDeletingSchedule(false);
    }
  }

  async function handleBulkReassign(e: React.FormEvent) {
    e.preventDefault();
    if (!schedule || bulkFromId === "" || bulkToId === "") return;

    if (bulkFromId === bulkToId) {
      setError("From and To person must be different.");
      return;
    }

    setBulkLoading(true);
    setError(null);
    setBulkMessage(null);

    try {
      await apiPost(`/schedules/${schedule.schedule.id}/bulk-reassign`, {
        from_person_id: bulkFromId,
        to_person_id: bulkToId,
        scope: bulkScope,
      });

      setBulkMessage("Slots reassigned successfully.");
      await reloadCurrentSchedule();
    } catch (e: any) {
      setError(e.message ?? String(e));
    } finally {
      setBulkLoading(false);
    }
  }

  // 🔥 NEW: remove a person completely from this schedule (primary + secondary + PTO for this schedule)
  async function handleRemovePersonFromSchedule(personId: number) {
    if (!schedule) return;

    const name = personNameById[personId] ?? `ID ${personId}`;
    const confirmed = window.confirm(
      `Remove ${name} from ALL primary/secondary slots in schedule #${schedule.schedule.id} for team ${schedule.schedule.team_id} (${schedule.schedule.year})?\n\n` +
        "This will clear their assignments from this schedule. This action cannot be undone."
    );
    if (!confirmed) return;

    setError(null);
    setBulkMessage(null);

    try {
      await apiDelete(
        `/schedules/${schedule.schedule.id}/remove-person/${personId}`
      );
      setBulkMessage(`Removed ${name} from this schedule.`);
      await reloadCurrentSchedule();
    } catch (e: any) {
      setError(e.message ?? String(e));
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
      {bulkMessage && <p style={{ color: "#5eead4" }}>{bulkMessage}</p>}

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

          {/* Who's on this schedule + bulk reassign + per-person remove */}
          {scheduleUsage.length > 0 && (
            <section className="card" style={{ marginTop: 16 }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 8,
                }}
              >
                <h3>Who&apos;s on this schedule?</h3>
                <button
                  type="button"
                  onClick={() => setShowUsage((v) => !v)}
                  className="secondary-button"
                >
                  {showUsage ? "Hide" : "Show"}
                </button>
              </div>

              {showUsage && (
                <>
                  <table
                    style={{
                      width: "100%",
                      borderCollapse: "collapse",
                      marginBottom: 12,
                    }}
                  >
                    <thead>
                      <tr>
                        <th style={{ textAlign: "left" }}>Person</th>
                        <th style={{ textAlign: "right" }}>Primary slots</th>
                        <th style={{ textAlign: "right" }}>Secondary slots</th>
                        <th style={{ textAlign: "right" }}>Total</th>
                        <th style={{ textAlign: "right" }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {scheduleUsage.map((u) => (
                        <tr key={u.personId}>
                          <td>{u.name}</td>
                          <td style={{ textAlign: "right" }}>{u.primary}</td>
                          <td style={{ textAlign: "right" }}>{u.secondary}</td>
                          <td style={{ textAlign: "right" }}>{u.total}</td>
                          <td
                            style={{
                              textAlign: "right",
                              display: "flex",
                              gap: 8,
                              justifyContent: "flex-end",
                            }}
                          >
                            <button
                              type="button"
                              className="secondary-button"
                              onClick={() => setBulkFromId(u.personId)}
                            >
                              Use as &quot;From&quot;
                            </button>
                            <button
                              type="button"
                              className="danger-button"
                              onClick={() =>
                                handleRemovePersonFromSchedule(u.personId)
                              }
                            >
                              Remove from schedule
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  <form
                    onSubmit={handleBulkReassign}
                    style={{
                      display: "flex",
                      flexWrap: "wrap",
                      gap: 8,
                      alignItems: "center",
                    }}
                  >
                    <span>Bulk reassign slots:</span>

                    <select
                      value={bulkFromId}
                      onChange={(e) =>
                        setBulkFromId(
                          e.target.value ? Number(e.target.value) : ""
                        )
                      }
                    >
                      <option value="">
                        From person (currently on this schedule)
                      </option>
                      {scheduleUsage.map((u) => (
                        <option key={u.personId} value={u.personId}>
                          {u.name}
                        </option>
                      ))}
                    </select>

                    <span>→</span>

                    <select
                      value={bulkToId}
                      onChange={(e) =>
                        setBulkToId(
                          e.target.value ? Number(e.target.value) : ""
                        )
                      }
                    >
                      <option value="">To person (any active person)</option>
                      {people.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} (id {p.id})
                        </option>
                      ))}
                    </select>

                    <select
                      value={bulkScope}
                      onChange={(e) =>
                        setBulkScope(e.target.value as BulkScope)
                      }
                    >
                      <option value="both">Primary + Secondary</option>
                      <option value="primary">Primary only</option>
                      <option value="secondary">Secondary only</option>
                    </select>

                    <button
                      type="submit"
                      disabled={
                        bulkLoading ||
                        bulkFromId === "" ||
                        bulkToId === "" ||
                        bulkFromId === bulkToId
                      }
                    >
                      {bulkLoading ? "Reassigning..." : "Reassign Slots"}
                    </button>
                  </form>
                  <p style={{ marginTop: 4, fontSize: 12, opacity: 0.8 }}>
                    Tip: use this when someone is leaving the team – reassign
                    all of their weeks here, then you can safely remove them
                    from the team or delete their account. If you really want
                    them off this schedule entirely, use “Remove from schedule”.
                  </p>
                </>
              )}
            </section>
          )}

          {/* Raw schedule table */}
          <table
            border={1}
            cellPadding={4}
            style={{ marginTop: 16, width: "100%" }}
          >
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
