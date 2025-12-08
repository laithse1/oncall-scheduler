"use client";

import { useEffect, useState } from "react";
import { apiGet, apiPost, apiPut } from "@/lib/api";

interface Person {
  id: number;
  name: string;
}

interface Team {
  id: number;
  name: string;
  description?: string | null;
}

interface TeamDetail extends Team {
  member_ids: number[];
}

interface OnCallNow {
  schedule_id: number;
  slot_index: number;
  start_date: string;
  end_date: string;
  primary_name: string;
  secondary_name?: string | null;
}

export default function TeamsPage() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [selectedTeamId, setSelectedTeamId] = useState<number | null>(null);
  const [selectedTeam, setSelectedTeam] = useState<TeamDetail | null>(null);
  const [memberIds, setMemberIds] = useState<number[]>([]);
  const [newTeamName, setNewTeamName] = useState("");
  const [newTeamDesc, setNewTeamDesc] = useState("");
  const [oncall, setOncall] = useState<OnCallNow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savingMembers, setSavingMembers] = useState(false);
  const [creatingTeam, setCreatingTeam] = useState(false);

  async function loadBase() {
    setError(null);
    try {
      const [t, p] = await Promise.all([
        apiGet<Team[]>("/teams"),
        apiGet<Person[]>("/people"),
      ]);
      setTeams(t);
      setPeople(p);
    } catch (e: any) {
      setError(e.message ?? String(e));
    }
  }

  useEffect(() => {
    loadBase();
  }, []);

  async function loadTeam(id: number) {
    setError(null);
    setOncall(null);
    try {
      const detail = await apiGet<TeamDetail>(`/teams/${id}`);
      setSelectedTeam(detail);
      setMemberIds(detail.member_ids ?? []);
      setSelectedTeamId(id);

      // Also load team on-call status (if a schedule exists)
      try {
        const oc: any = await apiGet<any>(`/teams/${id}/oncall-now`);
        setOncall({
          schedule_id: oc.schedule_id,
          slot_index: oc.slot_index,
          start_date: oc.start_date,
          end_date: oc.end_date,
          primary_name: oc.primary_person_name ?? oc.primary_name ?? "Unknown",
          secondary_name:
            oc.secondary_person_name ?? oc.secondary_name ?? undefined,
        });
      } catch {
        setOncall(null);
      }
    } catch (e: any) {
      setError(e.message ?? String(e));
    }
  }

  async function handleCreateTeam(e: React.FormEvent) {
    e.preventDefault();
    if (!newTeamName.trim()) return;
    setCreatingTeam(true);
    setError(null);
    try {
      const created = await apiPost<Team>("/teams", {
        name: newTeamName.trim(),
        description: newTeamDesc.trim() || null,
      });
      setTeams((prev) => [...prev, created]);
      setNewTeamName("");
      setNewTeamDesc("");
    } catch (e: any) {
      setError(e.message ?? String(e));
    } finally {
      setCreatingTeam(false);
    }
  }

  function toggleMember(personId: number) {
    setMemberIds((prev) =>
      prev.includes(personId)
        ? prev.filter((id) => id !== personId)
        : [...prev, personId]
    );
  }

  async function saveMembers() {
    if (!selectedTeamId) return;
    setSavingMembers(true);
    setError(null);
    try {
      await apiPut(`/teams/${selectedTeamId}/members`, {
        member_ids: memberIds,
      });
    } catch (e: any) {
      setError(e.message ?? String(e));
    } finally {
      setSavingMembers(false);
    }
  }

  return (
    <div>
      <h1>Teams</h1>
      {error && <p style={{ color: "red" }}>{error}</p>}

      <div style={{ display: "flex", gap: 24, alignItems: "flex-start" }}>
        <section className="card" style={{ flex: 1 }}>
          <h2>Create Team</h2>
          <form
            onSubmit={handleCreateTeam}
            style={{ display: "flex", flexDirection: "column", gap: 8 }}
          >
            <input
              type="text"
              placeholder="Team name"
              value={newTeamName}
              onChange={(e) => setNewTeamName(e.target.value)}
            />
            <input
              type="text"
              placeholder="Description (optional)"
              value={newTeamDesc}
              onChange={(e) => setNewTeamDesc(e.target.value)}
            />
            <button type="submit" disabled={creatingTeam}>
              {creatingTeam ? "Creating..." : "Create Team"}
            </button>
          </form>

          <h2 style={{ marginTop: 24 }}>Teams</h2>
          {teams.length === 0 && <p>No teams yet.</p>}
          <ul>
            {teams.map((t) => (
              <li key={t.id}>
                <button type="button" onClick={() => loadTeam(t.id)}>
                  {t.name} (id {t.id})
                </button>
              </li>
            ))}
          </ul>
        </section>

        <section className="card" style={{ flex: 2 }}>
          <h2>Team Members</h2>
          {!selectedTeam && <p>Select a team to edit its members.</p>}
          {selectedTeam && (
            <>
              <p>
                <strong>{selectedTeam.name}</strong>{" "}
                {selectedTeam.description && <>– {selectedTeam.description}</>}
              </p>
              <div
                style={{
                  maxHeight: 260,
                  overflowY: "auto",
                  border: "1px solid #e5e7eb",
                  padding: 8,
                  borderRadius: 8,
                }}
              >
                {people.length === 0 && <p>No people defined.</p>}
                {people.map((p) => (
                  <label
                    key={p.id}
                    style={{ display: "flex", gap: 8, alignItems: "center" }}
                  >
                    <input
                      type="checkbox"
                      checked={memberIds.includes(p.id)}
                      onChange={() => toggleMember(p.id)}
                    />
                    <span>
                      {p.name} (id {p.id})
                    </span>
                  </label>
                ))}
              </div>
              <button
                type="button"
                onClick={saveMembers}
                disabled={savingMembers}
                style={{ marginTop: 12 }}
              >
                {savingMembers ? "Saving..." : "Save Members"}
              </button>
            </>
          )}

          {oncall && (
            <div style={{ marginTop: 24 }}>
              <h3>Current On-Call for this Team</h3>
              <p>
                <strong>Schedule ID:</strong> {oncall.schedule_id}
              </p>
              <p>
                <strong>Slot:</strong> #{oncall.slot_index}
              </p>
              <p>
                <strong>Dates:</strong> {oncall.start_date} → {oncall.end_date}
              </p>
              <p>
                <strong>Primary:</strong> {oncall.primary_name}
              </p>
              {oncall.secondary_name && (
                <p>
                  <strong>Secondary:</strong> {oncall.secondary_name}
                </p>
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
