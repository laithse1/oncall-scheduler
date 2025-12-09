
from datetime import date, datetime
from pydantic import BaseModel, Field
from typing import List, Optional, Literal


# ----- Person -----
class PersonCreate(BaseModel):
    name: str
    email: Optional[str] = None
    time_zone: Optional[str] = None

class PersonRead(BaseModel):
    id: int
    name: str
    email: Optional[str] = None
    time_zone: Optional[str] = None

    class Config:
        from_attributes = True

# ----- Team -----
class TeamCreate(BaseModel):
    name: str
    description: Optional[str] = None

class TeamRead(BaseModel):
    id: int
    name: str
    description: Optional[str] = None
    member_ids: List[int] = Field(default_factory=list)

    class Config:
        from_attributes = True

class TeamMembershipUpdate(BaseModel):
    member_ids: List[int]

# ----- PTO -----
class PTOCreate(BaseModel):
    person_id: int
    start_date: date
    end_date: date
    reason: Optional[str] = None

class PTORead(BaseModel):
    id: int
    person_id: int
    start_date: date
    end_date: date
    reason: Optional[str] = None

    class Config:
        from_attributes = True

# ----- Schedule -----
class ScheduleDefinitionCreate(BaseModel):
    year: int
    rotation_days: int = 7
    week_starts_on: int = 0
    custom_start_date: Optional[date] = None
    person_ids: Optional[List[int]] = None

class ScheduleDefinitionRead(BaseModel):
    id: int
    team_id: int
    year: int
    rotation_days: int
    week_starts_on: int
    custom_start_date: Optional[date]
    created_at: datetime

    class Config:
        from_attributes = True

class OnCallSlotRead(BaseModel):
    id: int
    slot: int
    start: date
    end: date
    primary_person_id: int
    secondary_person_id: Optional[int] = None
    notes: Optional[str] = None

    class Config:
        from_attributes = True

class ScheduleRead(BaseModel):
    schedule: ScheduleDefinitionRead
    slots: List[OnCallSlotRead]

class OverrideRequest(BaseModel):
    slot: int
    primary_person_id: Optional[int] = None
    secondary_person_id: Optional[int] = None
    notes: Optional[str] = None

# For team-level on-call dashboard
class OnCallNowResponse(BaseModel):
    schedule_id: int
    team_id: int
    slot: OnCallSlotRead
    primary_person: PersonRead
    secondary_person: Optional[PersonRead] = None

class PersonUsage(BaseModel):
    person_id: int
    name: str
    pto_count: int
    primary_slots: int
    secondary_slots: int
    total_slots: int


class SchedulePersonUsage(BaseModel):
    schedule_id: int
    team_id: int
    year: int
    people: List[PersonUsage]



class BulkReassignRequest(BaseModel):
    from_person_id: int
    to_person_id: int
    scope: Literal["primary", "secondary", "both"] = "both"

