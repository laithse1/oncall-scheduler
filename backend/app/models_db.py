
from datetime import datetime, date
from sqlalchemy import (
    Column,
    Integer,
    String,
    DateTime,
    Date,
    ForeignKey,
    Text,
    UniqueConstraint,
    Boolean,
)
from sqlalchemy.orm import relationship, Mapped, mapped_column
from .db import Base

class Person(Base):
    __tablename__ = "people"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    time_zone: Mapped[str | None] = mapped_column(String(64), nullable=True)

    teams = relationship("TeamMembership", back_populates="person")
    pto_periods = relationship("PTO", back_populates="person")

class Team(Base):
    __tablename__ = "teams"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(200), unique=True, nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    memberships = relationship("TeamMembership", back_populates="team")
    schedules = relationship("ScheduleDefinition", back_populates="team")

class TeamMembership(Base):
    __tablename__ = "team_memberships"
    __table_args__ = (
        UniqueConstraint("team_id", "person_id", name="uix_team_person"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    team_id: Mapped[int] = mapped_column(ForeignKey("teams.id"), nullable=False)
    person_id: Mapped[int] = mapped_column(ForeignKey("people.id"), nullable=False)

    team = relationship("Team", back_populates="memberships")
    person = relationship("Person", back_populates="teams")

class PTO(Base):
    """
    Per-person PTO / blackout periods.
    Any slot that overlaps with [start_date, end_date] for this person
    should avoid assigning them as primary.
    """
    __tablename__ = "pto"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    person_id: Mapped[int] = mapped_column(ForeignKey("people.id"), nullable=False)
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date: Mapped[date] = mapped_column(Date, nullable=False)
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)

    person = relationship("Person", back_populates="pto_periods")

class ScheduleDefinition(Base):
    __tablename__ = "schedule_definitions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    team_id: Mapped[int] = mapped_column(ForeignKey("teams.id"), nullable=False)
    year: Mapped[int] = mapped_column(Integer, nullable=False)
    rotation_days: Mapped[int] = mapped_column(Integer, nullable=False, default=7)
    week_starts_on: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    custom_start_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow
    )

    team = relationship("Team", back_populates="schedules")
    slots = relationship("OnCallSlot", back_populates="schedule", cascade="all, delete-orphan")

class OnCallSlot(Base):
    __tablename__ = "oncall_slots"
    __table_args__ = (
        UniqueConstraint("schedule_id", "slot", name="uix_schedule_slot"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    schedule_id: Mapped[int] = mapped_column(
        ForeignKey("schedule_definitions.id"), nullable=False
    )
    slot: Mapped[int] = mapped_column(Integer, nullable=False)
    start: Mapped[date] = mapped_column(Date, nullable=False)
    end: Mapped[date] = mapped_column(Date, nullable=False)
    primary_person_id: Mapped[int] = mapped_column(ForeignKey("people.id"), nullable=False)
    secondary_person_id: Mapped[int | None] = mapped_column(
        ForeignKey("people.id"), nullable=True
    )
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    reminded: Mapped[bool] = mapped_column(Boolean, default=False)

    schedule = relationship("ScheduleDefinition", back_populates="slots")
