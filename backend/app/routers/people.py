
from fastapi import APIRouter, Depends, HTTPException
from typing import List
from sqlalchemy.orm import Session
from ..db import get_db
from ..repositories_db import PeopleRepositoryDB
from ..schemas import PersonCreate, PersonRead

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
