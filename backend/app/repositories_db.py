from typing import List, Optional, Dict, Set
from datetime import date, timedelta
from sqlalchemy.orm import Session
from sqlalchemy import select, delete,or_
from sqlalchemy.exc import IntegrityError
from .models_db import Person, Team, TeamMembership, PTO, ScheduleDefinition, OnCallSlot

from .schemas import (
    PersonCreate,
    PersonRead,
    TeamCreate,
    TeamRead,
    PTOCreate,
    PTORead,
)
from .scheduler import generate_oncall_slots

# ----- People -----
class PeopleRepositoryDB:
    def __init__(self, db: Session):
        self.db = db

    def create(self, data: PersonCreate) -> PersonRead:
        obj = Person(name=data.name, email=data.email, time_zone=data.time_zone)
        self.db.add(obj)
        self.db.commit()
        self.db.refresh(obj)
        return PersonRead.model_validate(obj)

    def list(self) -> List[PersonRead]:
        objs = self.db.scalars(select(Person)).all()
        return [PersonRead.model_validate(o) for o in objs]

    def get(self, person_id: int) -> Optional[Person]:
        return self.db.get(Person, person_id)

    #  usage helper used by both API and delete
    def get_usage(self, person_id: int) -> Optional[dict]:
        person = self.db.get(Person, person_id)
        if not person:
            return None

        pto_count = (
            self.db.query(PTO)
            .filter(PTO.person_id == person_id)
            .count()
        )

        primary_slots = (
            self.db.query(OnCallSlot)
            .filter(OnCallSlot.primary_person_id == person_id)
            .count()
        )

        secondary_slots = (
            self.db.query(OnCallSlot)
            .filter(OnCallSlot.secondary_person_id == person_id)
            .count()
        )

        return {
            "person_id": person_id,
            "pto_count": pto_count,
            "primary_slots": primary_slots,
            "secondary_slots": secondary_slots,
            "total_slots": primary_slots + secondary_slots,
        }

    #  single delete implementation
    def delete(self, person_id: int) -> bool:
        usage = self.get_usage(person_id)
        if usage is None:
            return False

        # Block delete if there is PTO or any schedule usage
        if usage["pto_count"] > 0 or usage["total_slots"] > 0:
            return False

        person = self.db.get(Person, person_id)
        if not person:
            return False

        # Remove team memberships (safe regardless)
        self.db.query(TeamMembership).filter(
            TeamMembership.person_id == person_id
        ).delete(synchronize_session=False)

        try:
            self.db.delete(person)
            self.db.commit()
        except Exception:
            self.db.rollback()
            raise

        return True


# ----- Teams -----
class TeamsRepositoryDB:
    def __init__(self, db: Session):
        self.db = db

    def create(self, data: TeamCreate) -> TeamRead:
        obj = Team(name=data.name, description=data.description)
        self.db.add(obj)
        self.db.commit()
        self.db.refresh(obj)
        return TeamRead(
            id=obj.id,
            name=obj.name,
            description=obj.description,
            member_ids=[],
        )

    def list(self) -> List[TeamRead]:
        teams = self.db.scalars(select(Team)).all()
        result: List[TeamRead] = []
        for t in teams:
            member_ids = [m.person_id for m in t.memberships]
            result.append(
                TeamRead(
                    id=t.id,
                    name=t.name,
                    description=t.description,
                    member_ids=member_ids,
                )
            )
        return result

    def get(self, team_id: int) -> Optional[Team]:
        return self.db.get(Team, team_id)

    def update_members(self, team_id: int, member_ids: List[int]) -> TeamRead:
        team = self.db.get(Team, team_id)
        if not team:
            raise ValueError("Team not found")

        self.db.execute(
            delete(TeamMembership).where(TeamMembership.team_id == team_id)
        )
        for pid in member_ids:
            self.db.add(TeamMembership(team_id=team_id, person_id=pid))
        self.db.commit()
        self.db.refresh(team)
        return TeamRead(
            id=team.id,
            name=team.name,
            description=team.description,
            member_ids=[m.person_id for m in team.memberships],
        )
    def delete(self, team_id: int) -> bool:
        """Delete a team and all data that *must* belong to it.

        - Remove OnCallSlot rows for schedules owned by this team
        - Remove ScheduleDefinition rows for this team
        - Remove TeamMembership rows
        - Finally remove the Team row
        """
        team = self.db.get(Team, team_id)
        if not team:
            return False

        # 1) Find all schedules belonging to this team
        schedules = (
            self.db.query(ScheduleDefinition)
            .filter(ScheduleDefinition.team_id == team_id)
            .all()
        )

        # 2) Delete slots for those schedules
        for sched in schedules:
            (
                self.db.query(OnCallSlot)
                .filter(OnCallSlot.schedule_id == sched.id)
                .delete(synchronize_session=False)
            )

        # 3) Delete the schedules themselves
        (
            self.db.query(ScheduleDefinition)
            .filter(ScheduleDefinition.team_id == team_id)
            .delete(synchronize_session=False)
        )

        # 4) Delete team memberships
        (
            self.db.query(TeamMembership)
            .filter(TeamMembership.team_id == team_id)
            .delete(synchronize_session=False)
        )

        # 5) Delete the team record
        self.db.delete(team)

        self.db.commit()
        return True

# ----- PTO -----
class PTORepositoryDB:
    def __init__(self, db: Session):
        self.db = db

    def create(self, data: PTOCreate) -> PTORead:
        obj = PTO(
            person_id=data.person_id,
            start_date=data.start_date,
            end_date=data.end_date,
            reason=data.reason,
        )
        self.db.add(obj)
        self.db.commit()
        self.db.refresh(obj)
        return PTORead.model_validate(obj)

    def list_for_team_year(self, team_id: int, year: int) -> Dict[int, Set]:
        """
        Return {person_id: {dates...}} for PTO within that year.
        """
        ptos = (
            self.db.query(PTO)
            .join(Person)
            .join(TeamMembership, TeamMembership.person_id == Person.id)
            .filter(
                TeamMembership.team_id == team_id,
                PTO.start_date <= date(year, 12, 31),
                PTO.end_date >= date(year, 1, 1),
            )
            .all()
        )
        pto_by_person: Dict[int, Set] = {}

        for p in ptos:
            d = p.start_date
            while d <= p.end_date:
                if d.year == year:
                    pto_by_person.setdefault(p.person_id, set()).add(d)
                d += timedelta(days=1)
        return pto_by_person

# ----- Schedules -----
class SchedulesRepositoryDB:
    def __init__(self, db: Session):
        self.db = db

    def create_schedule(
        self,
        team_id: int,
        year: int,
        rotation_days: int,
        week_starts_on: int,
        custom_start_date,
        person_ids: List[int],
        pto_by_person: Dict[int, Set],
    ) -> int:
        definition = ScheduleDefinition(
            team_id=team_id,
            year=year,
            rotation_days=rotation_days,
            week_starts_on=week_starts_on,
            custom_start_date=custom_start_date,
        )
        self.db.add(definition)
        self.db.flush()  # get definition.id

        raw_slots = generate_oncall_slots(
            people_ids=person_ids,
            year=year,
            rotation_days=rotation_days,
            week_starts_on=week_starts_on,
            custom_start_date=custom_start_date,
            pto_by_person=pto_by_person,
            assign_secondary=True,
        )

        for s in raw_slots:
            self.db.add(
                OnCallSlot(
                    schedule_id=definition.id,
                    slot=s["slot"],
                    start=s["start"],
                    end=s["end"],
                    primary_person_id=s["primary_person_id"],
                    secondary_person_id=s["secondary_person_id"],
                )
            )
        self.db.commit()
        return definition.id

    def get_schedule(self, schedule_id: int) -> Optional[ScheduleDefinition]:
        return self.db.get(ScheduleDefinition, schedule_id)

    def get_slots(self, schedule_id: int) -> List[OnCallSlot]:
        sched = self.db.get(ScheduleDefinition, schedule_id)
        if not sched:
            return []
        # already ordered by slot due to UniqueConstraint semantics in practice
        return sorted(sched.slots, key=lambda s: s.slot)
    
    def delete_schedule(self, schedule_id: int) -> bool:
        definition = self.db.get(ScheduleDefinition, schedule_id)
        if not definition:
            return False

        # Delete slots first, then the schedule definition
        (
            self.db.query(OnCallSlot)
            .filter(OnCallSlot.schedule_id == schedule_id)
            .delete()
        )
        self.db.delete(definition)
        self.db.commit()
        return True

    def apply_override(
        self,
        schedule_id: int,
        slot_num: int,
        primary_person_id: Optional[int],
        secondary_person_id: Optional[int],
        notes: Optional[str],
    ) -> OnCallSlot:
        slot: OnCallSlot | None = (
            self.db.query(OnCallSlot)
            .filter(OnCallSlot.schedule_id == schedule_id, OnCallSlot.slot == slot_num)
            .first()
        )
        if not slot:
            raise KeyError("slot not found")
        if primary_person_id is not None:
            slot.primary_person_id = primary_person_id
        if secondary_person_id is not None:
            slot.secondary_person_id = secondary_person_id
        if notes is not None:
            slot.notes = notes
        self.db.commit()
        self.db.refresh(slot)
        return slot
    
    def get_slots_with_people(self, schedule_id: int) -> List[OnCallSlot]:
        """
        Return slots for a schedule and attach convenience attributes:
          - primary_name, primary_email
          - secondary_name, secondary_email

        This keeps existing logic intact while making it easy for exports,
        emails, etc. to include human-friendly info.
        """
        slots = self.get_slots(schedule_id)
        if not slots:
            return []

        person_ids: Set[int] = set()
        for s in slots:
            person_ids.add(s.primary_person_id)
            if s.secondary_person_id is not None:
                person_ids.add(s.secondary_person_id)

        if not person_ids:
            return slots

        people = (
            self.db.query(Person)
            .filter(Person.id.in_(person_ids))
            .all()
        )
        people_by_id = {p.id: p for p in people}

        for s in slots:
            primary = people_by_id.get(s.primary_person_id)
            setattr(s, "primary_name", primary.name if primary else None)
            setattr(s, "primary_email", primary.email if primary else None)

            secondary = (
                people_by_id.get(s.secondary_person_id)
                if s.secondary_person_id is not None
                else None
            )
            setattr(s, "secondary_name", secondary.name if secondary else None)
            setattr(s, "secondary_email", secondary.email if secondary else None)

        return slots

    def get_oncall_now_for_schedule(self, schedule_id: int):
        """
        Return (schedule, slot, primary_person, secondary_person) for the
        given schedule_id and today's date, or None if not found.
        """
        today = date.today()

        sched = self.db.get(ScheduleDefinition, schedule_id)
        if not sched:
            return None

        slot = (
            self.db.query(OnCallSlot)
            .filter(
                OnCallSlot.schedule_id == schedule_id,
                OnCallSlot.start <= today,
                OnCallSlot.end >= today,
            )
            .first()
        )
        if not slot:
            return None

        primary = self.db.get(Person, slot.primary_person_id)
        secondary = (
            self.db.get(Person, slot.secondary_person_id)
            if slot.secondary_person_id is not None
            else None
        )
        return sched, slot, primary, secondary

    def get_oncall_now_for_team(self, team_id: int, year: int | None = None):
        """
        Return (schedule, slot, primary_person, secondary_person) for a team
        in the given year (defaults to current year) for today's date.
        """
        today = date.today()
        if year is None:
            year = today.year

        sched = (
            self.db.query(ScheduleDefinition)
            .filter(
                ScheduleDefinition.team_id == team_id,
                ScheduleDefinition.year == year,
            )
            .order_by(ScheduleDefinition.created_at.desc())
            .first()
        )
        if not sched:
            return None

        slot = (
            self.db.query(OnCallSlot)
            .filter(
                OnCallSlot.schedule_id == sched.id,
                OnCallSlot.start <= today,
                OnCallSlot.end >= today,
            )
            .first()
        )
        if not slot:
            return None

        primary = self.db.get(Person, slot.primary_person_id)
        secondary = (
            self.db.get(Person, slot.secondary_person_id)
            if slot.secondary_person_id is not None
            else None
        )
        return sched, slot, primary, secondary
    
    
    def get_schedule_for_team_year(
        self, team_id: int, year: int
    ) -> Optional[ScheduleDefinition]:
        """
        Return the most recently-created schedule for a given team & year,
        or None if none exist.
        """
        return (
            self.db.query(ScheduleDefinition)
            .filter(
                ScheduleDefinition.team_id == team_id,
                ScheduleDefinition.year == year,
            )
            .order_by(ScheduleDefinition.id.desc())
            .first()
        )

    