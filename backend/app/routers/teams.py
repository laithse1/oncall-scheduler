
from fastapi import APIRouter, Depends, HTTPException
from typing import List
from sqlalchemy.orm import Session
from datetime import date
from ..db import get_db
from ..repositories_db import TeamsRepositoryDB
from ..models_db import Team, ScheduleDefinition, OnCallSlot, Person
from ..schemas import TeamCreate, TeamRead, TeamMembershipUpdate, OnCallNowResponse, OnCallSlotRead, PersonRead
from ..repositories_db import TeamsRepositoryDB, SchedulesRepositoryDB


router = APIRouter(prefix="/teams", tags=["teams"])

@router.post("/", response_model=TeamRead)
def create_team(data: TeamCreate, db: Session = Depends(get_db)):
    repo = TeamsRepositoryDB(db)
    return repo.create(data)

@router.get("/", response_model=List[TeamRead])
def list_teams(db: Session = Depends(get_db)):
    repo = TeamsRepositoryDB(db)
    return repo.list()

@router.get("/{team_id}", response_model=TeamRead)
def get_team(team_id: int, db: Session = Depends(get_db)):
    repo = TeamsRepositoryDB(db)
    team = repo.get(team_id)
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")
    member_ids = [m.person_id for m in team.memberships]
    return TeamRead(
        id=team.id,
        name=team.name,
        description=team.description,
        member_ids=member_ids,
    )

@router.put("/{team_id}/members", response_model=TeamRead)
def update_team_members(
    team_id: int,
    update: TeamMembershipUpdate,
    db: Session = Depends(get_db),
):
    repo = TeamsRepositoryDB(db)
    return repo.update_members(team_id, update.member_ids)

@router.get("/{team_id}/oncall-now", response_model=OnCallNowResponse)
def get_team_oncall_now(team_id: int, db: Session = Depends(get_db)):
    # still validate that the team exists
    team = db.get(Team, team_id)
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")

    sched_repo = SchedulesRepositoryDB(db)
    result = sched_repo.get_oncall_now_for_team(team_id)
    if not result:
        raise HTTPException(
            status_code=404,
            detail=f"No active on-call slot for today in current schedule for team {team_id}",
        )

    sched, slot, primary, secondary = result
    if not primary:
        raise HTTPException(status_code=500, detail="Primary person not found")

    return OnCallNowResponse(
        schedule_id=sched.id,
        team_id=team_id,
        slot=OnCallSlotRead.model_validate(slot),
        primary_person=PersonRead.model_validate(primary),
        secondary_person=PersonRead.model_validate(secondary) if secondary else None,
    )

