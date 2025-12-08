"use client";

import { useEffect, useState } from "react";
import { apiGet } from "@/lib/api";

interface ScheduleSlot {
  index: number;
  start_date: string;
  end_date: string;
  primary_name: string;
  secondary_name?: string | null;
}

interface ScheduleDetail {
  id: number;
  team_id: number;
  team_name: string;
  year: number;
  slots: ScheduleSlot[];
}

interface ScheduleOnCallNow {
  schedule_id: number;
  slot_index: number;
  start_date: string;
  end_date: string;
  primary_person_name?: string;
  secondary_person_name?: string | null;
}

export default function ScheduleDetailPage({
  params,
}: {
  params: { scheduleId: string };
}) {
  const scheduleId = Number(params.scheduleId);
  const [schedule, setSchedule] = useState<ScheduleDetail | null>(null);
  const [oncall, setOncall] = useState<ScheduleOnCallNow | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!scheduleId) return;

    async function load() {
      setError(null);
      try {
        const [sched, oc] = await Promise.all([
          apiGet<ScheduleDetail>(`/schedules/${scheduleId}`),
          apiGet<ScheduleOnCallNow>(
            `/schedules/${scheduleId}/oncall-now`
          ).catch(() => null as any),
        ]);
        setSchedule(sched);
        setOncall(oc);
      } catch (e: any) {
        setError(e.message ?? String(e));
      }
    }

    load();
  }, [scheduleId]);

  if (!scheduleId) {
    return <p>Invalid schedule id.</p>;
  }

  return (
    <div>
      <h1>Schedule #{scheduleId}</h1>
      {error && <p style={{ color: "red" }}>{error}</p>}

      {schedule && (
        <section className="card" style={{ marginBottom: 24 }}>
          <p>
            <strong>Team:</strong> {schedule.team_name} (id {schedule.team_id})
          </p>
          <p>
            <strong>Year:</strong> {schedule.year}
          </p>
          <p>
            <strong>Total slots:</strong> {schedule.slots.length}
          </p>
        </section>
      )}

      {oncall && (
        <section className="card" style={{ marginBottom: 24 }}>
          <h2>On-call Now</h2>
          <p>
            <strong>Slot:</strong> #{oncall.slot_index}
          </p>
          <p>
            <strong>Dates:</strong> {oncall.start_date} → {oncall.end_date}
          </p>
          {oncall.primary_person_name && (
            <p>
              <strong>Primary:</strong> {oncall.primary_person_name}
            </p>
          )}
          {oncall.secondary_person_name && (
            <p>
              <strong>Secondary:</strong> {oncall.secondary_person_name}
            </p>
          )}
        </section>
      )}

      {schedule && schedule.slots.length > 0 && (
        <section className="card">
          <h2>All Slots</h2>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left" }}>#</th>
                <th style={{ textAlign: "left" }}>Start</th>
                <th style={{ textAlign: "left" }}>End</th>
                <th style={{ textAlign: "left" }}>Primary</th>
                <th style={{ textAlign: "left" }}>Secondary</th>
              </tr>
            </thead>
            <tbody>
              {schedule.slots.map((s) => (
                <tr key={s.index}>
                  <td>{s.index}</td>
                  <td>{s.start_date}</td>
                  <td>{s.end_date}</td>
                  <td>{s.primary_name}</td>
                  <td>{s.secondary_name ?? "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
