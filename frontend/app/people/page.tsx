"use client";

import { useEffect, useState } from "react";
import { apiGet, apiPost } from "@/lib/api";

interface Person {
  id: number;
  name: string;
  email?: string | null;
}

export default function PeoplePage() {
  const [people, setPeople] = useState<Person[]>([]);
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [selectedPerson, setSelectedPerson] = useState<Person | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadPeople() {
    setError(null);
    try {
      const data = await apiGet<Person[]>("/people");
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
      const created = await apiPost<Person>("/people", {
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
        {error && <p style={{ color: "red" }}>{error}</p>}
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
                  <td>
                    <button
                      type="button"
                      onClick={() => handleSelectPerson(p.id)}
                    >
                      View
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
    </div>
  );
}
