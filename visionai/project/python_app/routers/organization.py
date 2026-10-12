from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

import crud
import schemas
from database import get_db

router = APIRouter(tags=["Organization"])


# --- Companies ---
@router.post("/api/companies", response_model=schemas.CompanyRead)
def create_company(data: schemas.CompanyCreate, db: Session = Depends(get_db)):
    return crud.create_company(db, data)


@router.get("/api/companies", response_model=list[schemas.CompanyRead])
def list_companies(db: Session = Depends(get_db)):
    return crud.list_companies(db)


@router.get("/api/companies/{company_id}", response_model=schemas.CompanyRead)
def get_company(company_id: str, db: Session = Depends(get_db)):
    obj = crud.get_company(db, company_id)
    if not obj:
        raise HTTPException(404, "Company not found")
    return obj


# --- Branches ---
@router.post("/api/branches", response_model=schemas.BranchRead)
def create_branch(data: schemas.BranchCreate, db: Session = Depends(get_db)):
    if not crud.get_company(db, data.company_id):
        raise HTTPException(404, "Company not found")
    return crud.create_branch(db, data)


@router.get("/api/branches", response_model=list[schemas.BranchRead])
def list_branches(company_id: str | None = None, db: Session = Depends(get_db)):
    return crud.list_branches(db, company_id)


# --- Buildings ---
@router.post("/api/buildings", response_model=schemas.BuildingRead)
def create_building(data: schemas.BuildingCreate, db: Session = Depends(get_db)):
    return crud.create_building(db, data)


@router.get("/api/buildings", response_model=list[schemas.BuildingRead])
def list_buildings(branch_id: str | None = None, db: Session = Depends(get_db)):
    return crud.list_buildings(db, branch_id)


# --- Floors ---
@router.post("/api/floors", response_model=schemas.FloorRead)
def create_floor(data: schemas.FloorCreate, db: Session = Depends(get_db)):
    return crud.create_floor(db, data)


@router.get("/api/floors", response_model=list[schemas.FloorRead])
def list_floors(building_id: str | None = None, db: Session = Depends(get_db)):
    return crud.list_floors(db, building_id)
