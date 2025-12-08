# backend/app/seed.py

from datetime import date
from typing import List

from .db import SessionLocal
from .models_db import Person, Team, TeamMembership
from .repositories_db import SchedulesRepositoryDB


DEFAULT_PEOPLE = [
    "Laith Alkhalil",
    "Alice Johnson",
    "Bob Smith",
    "Charlie Davis",
    "Dana Lee",
    "Eve Martinez",
]


def seed_initial_data() -> None:
    """Seed initial people, team, memberships, and schedule if DB is empty."""
    db = SessionLocal()
    try:
        # If there are already people, we assume the DB is seeded.
        existing_people_count = db.query(Person).count()
        if existing_people_count > 0:
            print("🔹 Seed skipped: people already exist in DB.")
            return

        print("🌱 Seeding initial data...")

        # 1) Create people
        people: List[Person] = []
        for name in DEFAULT_PEOPLE:
            p = Person(name=name)
            db.add(p)
            people.append(p)

        db.flush()  # get IDs without full commit

        # 2) Create a team
        team = Team(name="Default On-call Team", description="Seeded demo team")
        db.add(team)
        db.flush()  # get team.id

        # 3) Add memberships (all people in this team)
        for p in people:
            tm = TeamMembership(team_id=team.id, person_id=p.id)
            db.add(tm)

        db.commit()
        db.refresh(team)

        # 4) Generate a schedule for the current year
        current_year = date.today().year
        person_ids = [p.id for p in people]

        sched_repo = SchedulesRepositoryDB(db)
        schedule_id = sched_repo.create_schedule(
            team_id=team.id,
            year=current_year,
            rotation_days=7,        # 1-week rotation
            week_starts_on=0,       # Monday
            custom_start_date=None, # use default first-week logic
            person_ids=person_ids,
            pto_by_person={},       # no PTO initially
        )

        print(
            f"✅ Seed complete: {len(people)} people, "
            f"team id={team.id}, schedule id={schedule_id} for {current_year}"
        )
    except Exception as e:
        db.rollback()
        print(f"❌ Seed failed: {e}")
        raise
    finally:
        db.close()
