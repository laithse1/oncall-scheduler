
from fastapi import APIRouter, Depends, HTTPException
from typing import List
from sqlalchemy.orm import Session
from ..db import get_db
from ..repositories_db import PeopleRepositoryDB
from sqlalchemy.exc import IntegrityError
from ..schemas import PersonCreate, PersonRead, PersonUsage



router = APIRouter(prefix="/people", tags=["people"])

@router.post("/", response_model=PersonRead)
def create_person(data: PersonCreate, db: Session = Depends(get_db)):
    repo = PeopleRepositoryDB(db)
    return repo.create(data)

@router.get("/", response_model=List[PersonRead])
def list_people(db: Session = Depends(get_db)):
    repo = PeopleRepositoryDB(db)
    return repo.list()

@router.get("/{person_id}", response_model=PersonRead)
def get_person(person_id: int, db: Session = Depends(get_db)):
    repo = PeopleRepositoryDB(db)
    obj = repo.get(person_id)
    if not obj:
        raise HTTPException(status_code=404, detail="Person not found")
    return PersonRead.model_validate(obj)
@router.get("/{person_id}/usage", response_model=PersonUsage)
def get_person_usage(person_id: int, db: Session = Depends(get_db)):
    repo = PeopleRepositoryDB(db)
    usage = repo.get_usage(person_id)
    if usage is None:
        raise HTTPException(status_code=404, detail="Person not found")

    # Map dict → Pydantic
    return PersonUsage(
        person_id=usage["person_id"],
        pto_count=usage["pto_count"],
        primary_slots=usage["primary_slots"],
        secondary_slots=usage["secondary_slots"],
    )


@router.delete("/{person_id}", status_code=204)
def delete_person(person_id: int, db: Session = Depends(get_db)):
    repo = PeopleRepositoryDB(db)
    deleted = repo.delete(person_id)
    if not deleted:
        raise HTTPException(
            status_code=400,
            detail=(
                "Cannot delete person while they still have PTO entries or "
                "on-call schedule slots. Clear those references and try again."
            ),
        )



@router.delete("/{person_id}", status_code=204)
def delete_person(person_id: int, db: Session = Depends(get_db)):
    repo = PeopleRepositoryDB(db)
    try:
        deleted = repo.delete(person_id)
    except ValueError as e:
        # Person is still referenced by PTO or schedule slots
        raise HTTPException(status_code=400, detail=str(e))
    if not deleted:
        raise HTTPException(status_code=404, detail="Person not found")
    # 204 No Content
