from fastapi import APIRouter, Depends, HTTPException, Response, Query
from typing import List
from sqlalchemy.orm import Session
from datetime import date
import csv
from io import StringIO

from ..db import get_db
from ..repositories_db import SchedulesRepositoryDB, PTORepositoryDB, TeamsRepositoryDB
from ..models_db import ScheduleDefinition, OnCallSlot, Person
from ..schemas import (
    ScheduleDefinitionCreate,
    ScheduleDefinitionRead,
    ScheduleRead,
    OnCallSlotRead,
    OverrideRequest,
)
from ..scheduler import first_week_start_of_year

router = APIRouter(prefix="/schedules", tags=["schedules"])


@router.post("/teams/{team_id}/generate", response_model=ScheduleRead)
def generate_schedule_for_team(
    team_id: int,
    data: ScheduleDefinitionCreate,
    db: Session = Depends(get_db),
):
    teams_repo = TeamsRepositoryDB(db)
    team = teams_repo.get(team_id)
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")

    if data.person_ids:
        person_ids = data.person_ids
    else:
        member_ids = [m.person_id for m in team.memberships]
        if not member_ids:
            raise HTTPException(
                status_code=400, detail="Team has no members and no person_ids supplied"
            )
        person_ids = member_ids

    pto_repo = PTORepositoryDB(db)
    pto_by_person = pto_repo.list_for_team_year(team_id, data.year)

    sched_repo = SchedulesRepositoryDB(db)
    schedule_id = sched_repo.create_schedule(
        team_id=team_id,
        year=data.year,
        rotation_days=data.rotation_days,
        week_starts_on=data.week_starts_on,
        custom_start_date=data.custom_start_date,
        person_ids=person_ids,
        pto_by_person=pto_by_person,
    )

    schedule = sched_repo.get_schedule(schedule_id)
    slots = sched_repo.get_slots(schedule_id)
    if not schedule:
        raise HTTPException(status_code=500, detail="Failed to create schedule")
    return ScheduleRead(
        schedule=ScheduleDefinitionRead.model_validate(schedule),
        slots=[OnCallSlotRead.model_validate(s) for s in slots],
    )


@router.get("/{schedule_id}", response_model=ScheduleRead)
def get_schedule(schedule_id: int, db: Session = Depends(get_db)):
    sched_repo = SchedulesRepositoryDB(db)
    schedule = sched_repo.get_schedule(schedule_id)
    if not schedule:
        raise HTTPException(status_code=404, detail="Schedule not found")
    slots = sched_repo.get_slots(schedule_id)
    return ScheduleRead(
        schedule=ScheduleDefinitionRead.model_validate(schedule),
        slots=[OnCallSlotRead.model_validate(s) for s in slots],
    )


@router.post("/{schedule_id}/override", response_model=OnCallSlotRead)
def override_slot(
    schedule_id: int,
    override: OverrideRequest,
    db: Session = Depends(get_db),
):
    sched_repo = SchedulesRepositoryDB(db)
    # validate people if provided
    if override.primary_person_id is not None:
        if not db.get(Person, override.primary_person_id):
            raise HTTPException(status_code=400, detail="Primary person not found")
    if override.secondary_person_id is not None:
        if not db.get(Person, override.secondary_person_id):
            raise HTTPException(status_code=400, detail="Secondary person not found")

    try:
        slot = sched_repo.apply_override(
            schedule_id=schedule_id,
            slot_num=override.slot,
            primary_person_id=override.primary_person_id,
            secondary_person_id=override.secondary_person_id,
            notes=override.notes,
        )
    except KeyError:
        raise HTTPException(status_code=404, detail="Slot not found")

    return OnCallSlotRead.model_validate(slot)


@router.get("/{schedule_id}/oncall-now", response_model=OnCallSlotRead)
def get_oncall_now(schedule_id: int, db: Session = Depends(get_db)):
    sched_repo = SchedulesRepositoryDB(db)

    result = sched_repo.get_oncall_now_for_schedule(schedule_id)
    if not result:
        raise HTTPException(
            status_code=404,
            detail="No active slot for today or schedule not found",
        )

    _sched, slot, _primary, _secondary = result
    return OnCallSlotRead.model_validate(slot)


@router.get("/{schedule_id}/export")
def export_schedule(
    schedule_id: int,
    format: str = Query("csv", pattern="^(csv|md|ics)$"),
    db: Session = Depends(get_db),
):
    sched_repo = SchedulesRepositoryDB(db)
    schedule = sched_repo.get_schedule(schedule_id)
    if not schedule:
        raise HTTPException(status_code=404, detail="Schedule not found")

    # enriched slots: adds primary_name, primary_email, secondary_name, secondary_email
    slots = sched_repo.get_slots_with_people(schedule_id)

    # CSV export
    if format == "csv":
        buf = StringIO()
        writer = csv.writer(buf)
        # include IDs + names + emails
        writer.writerow(
            [
                "slot",
                "start",
                "end",
                "primary_person_id",
                "primary_name",
                "primary_email",
                "secondary_person_id",
                "secondary_name",
                "secondary_email",
                "notes",
            ]
        )
        for s in slots:
            writer.writerow(
                [
                    s.slot,
                    s.start.isoformat(),
                    s.end.isoformat(),
                    s.primary_person_id,
                    getattr(s, "primary_name", "") or "",
                    getattr(s, "primary_email", "") or "",
                    s.secondary_person_id or "",
                    getattr(s, "secondary_name", "") or "",
                    getattr(s, "secondary_email", "") or "",
                    s.notes or "",
                ]
            )
        return Response(
            content=buf.getvalue(),
            media_type="text/csv",
            headers={
                "Content-Disposition": f"attachment; filename=schedule_{schedule_id}.csv"
            },
        )

    # Markdown export
    if format == "md":
        lines = [
            f"# Schedule {schedule_id}",
            "",
            "| Slot | Start | End | Primary | Secondary | Notes |",
            "|------|-------|-----|---------|-----------|-------|",
        ]
        for s in slots:
            primary_label = getattr(s, "primary_name", None) or f"#{s.primary_person_id}"
            if getattr(s, "primary_email", None):
                primary_label = f"{primary_label} <{s.primary_email}>"

            if s.secondary_person_id:
                secondary_label = (
                    getattr(s, "secondary_name", None) or f"#{s.secondary_person_id}"
                )
                if getattr(s, "secondary_email", None):
                    secondary_label = f"{secondary_label} <{s.secondary_email}>"
            else:
                secondary_label = ""

            lines.append(
                f"| {s.slot} | {s.start.isoformat()} | {s.end.isoformat()} | "
                f"{primary_label} | {secondary_label} | {s.notes or ''} |"
            )
        md = "\n".join(lines)
        return Response(content=md, media_type="text/markdown")

    # ICS export
    if format == "ics":
        # basic all-day events
        def fmt(d: date) -> str:
            return d.strftime("%Y%m%d")

        lines = [
            "BEGIN:VCALENDAR",
            "VERSION:2.0",
            "PRODID:-//OnCallScheduler//EN",
        ]
        for s in slots:
            uid = f"{schedule_id}-{s.slot}@oncall"
            dtstart = fmt(s.start)
            dtend = fmt(s.end + date.resolution)  # exclusive end
            primary_label = getattr(s, "primary_name", None) or f"#{s.primary_person_id}"
            summary = f"On-call slot {s.slot} (primary {primary_label})"
            lines.extend(
                [
                    "BEGIN:VEVENT",
                    f"UID:{uid}",
                    f"DTSTART;VALUE=DATE:{dtstart}",
                    f"DTEND;VALUE=DATE:{dtend}",
                    f"SUMMARY:{summary}",
                    "END:VEVENT",
                ]
            )
        lines.append("END:VCALENDAR")
        ics = "\n".join(lines)
        return Response(
            content=ics,
            media_type="text/calendar",
            headers={
                "Content-Disposition": f"attachment; filename=schedule_{schedule_id}.ics"
            },
        )

    # Should be unreachable because of the Query pattern, but just in case:
    raise HTTPException(status_code=400, detail="Unsupported format")


@router.get("/teams/{team_id}", response_model=ScheduleRead)
def get_schedule_for_team(
    team_id: int,
    year: int = Query(..., ge=2000, le=2100),
    db: Session = Depends(get_db),
):
    """
    Fetch the latest schedule for a given team + year.
    Example: /schedules/teams/2?year=2026
    """
    sched_repo = SchedulesRepositoryDB(db)
    schedule = sched_repo.get_schedule_for_team_year(team_id, year)
    if not schedule:
        raise HTTPException(
            status_code=404,
            detail="No schedule found for that team/year",
        )

    slots = sched_repo.get_slots(schedule.id)
    return ScheduleRead(
        schedule=ScheduleDefinitionRead.model_validate(schedule),
        slots=[OnCallSlotRead.model_validate(s) for s in slots],
    )

@router.delete("/{schedule_id}", status_code=204)
def delete_schedule(schedule_id: int, db: Session = Depends(get_db)):
    repo = SchedulesRepositoryDB(db)
    deleted = repo.delete_schedule(schedule_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Schedule not found")
