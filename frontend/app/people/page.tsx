"use client";

import { useEffect, useState } from "react";
import { apiGet, apiPost, apiDelete } from "@/lib/api";

interface Person {
  id: number;
  name: string;
  email?: string | null;
}

interface PersonUsage {
  person_id: number;
  pto_count: number;
  primary_slots: number;
  secondary_slots: number;
  total_slots?: number; // optional, we can compute client-side
}

export default function PeoplePage() {
  const [people, setPeople] = useState<Person[]>([]);
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [selectedPerson, setSelectedPerson] = useState<Person | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // delete modal state
  const [deleteTarget, setDeleteTarget] = useState<Person | null>(null);
  const [usage, setUsage] = useState<PersonUsage | null>(null);
  const [usageLoading, setUsageLoading] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function loadPeople() {
    setError(null);
    try {
      const data = await apiGet<Person[]>("/people/");
      setPeople(data);
    } catch (e: any) {
      setError(e.message ?? String(e));
    }
  }

  useEffect(() => {
    loadPeople();
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    setLoading(true);
    setError(null);

    try {
      const created = await apiPost<Person>("/people/", {
        name: newName.trim(),
        email: newEmail.trim() || null,
      });
      setPeople((prev) => [...prev, created]);
      setNewName("");
      setNewEmail("");
    } catch (e: any) {
      setError(e.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }

  async function handleSelectPerson(id: number) {
    setError(null);
    try {
      const p = await apiGet<Person>(`/people/${id}`);
      setSelectedPerson(p);
    } catch (e: any) {
      setError(e.message ?? String(e));
    }
  }

  async function openDeleteModal(person: Person) {
    setDeleteTarget(person);
    setUsage(null);
    setUsageLoading(true);
    setDeleteError(null);

    try {
      const u = await apiGet<PersonUsage>(`/people/${person.id}/usage`);
      const totalSlots =
        (u.primary_slots ?? 0) + (u.secondary_slots ?? 0);
      setUsage({ ...u, total_slots: totalSlots });
    } catch (e: any) {
      setDeleteError(e.message ?? String(e));
    } finally {
      setUsageLoading(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    if (!usage) return;

    const totalSlots = usage.total_slots ?? (usage.primary_slots + usage.secondary_slots);
    if (usage.pto_count > 0 || totalSlots > 0) {
      setDeleteError(
        "This person still has PTO entries or schedule slots. " +
          "Clean those up before deleting."
      );
      return;
    }

    setDeleting(true);
    setDeleteError(null);
    try {
      await apiDelete(`/people/${deleteTarget.id}`);
      setPeople((prev) => prev.filter((p) => p.id !== deleteTarget.id));
      if (selectedPerson?.id === deleteTarget.id) {
        setSelectedPerson(null);
      }
      setDeleteTarget(null);
      setUsage(null);
    } catch (e: any) {
      setDeleteError(e.message ?? String(e));
    } finally {
      setDeleting(false);
    }
  }

  function closeDeleteModal() {
    setDeleteTarget(null);
    setUsage(null);
    setDeleteError(null);
    setUsageLoading(false);
    setDeleting(false);
  }

  return (
    <div>
      <h1>People</h1>

      <section className="card" style={{ marginBottom: 24 }}>
        <h2>Add Person</h2>
        <form
          onSubmit={handleCreate}
          style={{ display: "flex", gap: 8, alignItems: "center" }}
        >
          <input
            type="text"
            placeholder="Name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            style={{ flex: 1, padding: 6 }}
          />
          <input
            type="email"
            placeholder="Email (optional)"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            style={{ flex: 1, padding: 6 }}
          />
          <button type="submit" disabled={loading}>
            {loading ? "Saving..." : "Add"}
          </button>
        </form>
      </section>

      <section className="card">
        <h2>People List</h2>
        {error && <p style={{ color: "salmon" }}>{error}</p>}
        {people.length === 0 && <p>No people yet.</p>}
        {people.length > 0 && (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left" }}>ID</th>
                <th style={{ textAlign: "left" }}>Name</th>
                <th style={{ textAlign: "left" }}>Email</th>
                <th style={{ textAlign: "left" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {people.map((p) => (
                <tr key={p.id}>
                  <td>{p.id}</td>
                  <td>{p.name}</td>
                  <td>{p.email ?? ""}</td>
                  <td style={{ display: "flex", gap: 8 }}>
                    <button
                      type="button"
                      onClick={() => handleSelectPerson(p.id)}
                    >
                      View
                    </button>
                    <button
                      type="button"
                      className="danger-button"
                      onClick={() => openDeleteModal(p)}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {selectedPerson && (
          <div style={{ marginTop: 16 }}>
            <h3>Selected Person</h3>
            <p>
              <strong>ID:</strong> {selectedPerson.id}
            </p>
            <p>
              <strong>Name:</strong> {selectedPerson.name}
            </p>
            <p>
              <strong>Email:</strong> {selectedPerson.email ?? "(none)"}</p>
          </div>
        )}
      </section>

      {/* Usage summary + delete modal */}
      {deleteTarget && (
        <div className="modal-backdrop">
          <div className="modal">
            <h2>Delete {deleteTarget.name}?</h2>

            {usageLoading && <p>Loading usage summary...</p>}

            {usage && (
              <div style={{ marginBottom: 12 }}>
                <p>
                  PTO entries: <strong>{usage.pto_count}</strong>
                </p>
                <p>
                  Schedule slots (primary):{" "}
                  <strong>{usage.primary_slots}</strong>
                </p>
                <p>
                  Schedule slots (secondary):{" "}
                  <strong>{usage.secondary_slots}</strong>
                </p>
              </div>
            )}

            {deleteError && (
              <p style={{ color: "salmon", marginBottom: 8 }}>
                {deleteError}
              </p>
            )}

            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <button type="button" onClick={closeDeleteModal}>
                Cancel
              </button>

              <button
                type="button"
                className="danger-button"
                disabled={
                  deleting ||
                  usageLoading ||
                  !usage ||
                  usage.pto_count > 0 ||
                  (usage.total_slots ??
                    usage.primary_slots + usage.secondary_slots) > 0
                }
                onClick={confirmDelete}
                title={
                  usage && (usage.pto_count > 0 ||
                  (usage.total_slots ??
                    usage.primary_slots + usage.secondary_slots) > 0)
                    ? "Clear PTO and schedule slots first."
                    : ""
                }
              >
                {deleting ? "Deleting..." : "Confirm Delete"}
              </button>
            </div>

            {usage && (usage.pto_count > 0 ||
              (usage.total_slots ??
                usage.primary_slots + usage.secondary_slots) > 0) && (
              <p style={{ marginTop: 8, fontSize: 12, opacity: 0.8 }}>
                This person is still referenced in PTO or schedules. Use the
                Calendar + PTO Admin screens to clean up those references,
                then try again.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
