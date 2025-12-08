
from fastapi import APIRouter, Depends
from typing import List
from sqlalchemy.orm import Session
from ..db import get_db
from ..repositories_db import PTORepositoryDB
from ..schemas import PTOCreate, PTORead

router = APIRouter(prefix="/pto", tags=["pto"])

@router.post("/", response_model=PTORead)
def create_pto(data: PTOCreate, db: Session = Depends(get_db)):
    repo = PTORepositoryDB(db)
    return repo.create(data)
