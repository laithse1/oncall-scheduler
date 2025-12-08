from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.exc import OperationalError
import time


from .db import Base, engine
from .routers import people, teams, pto, schedules

from .seed import seed_initial_data

app = FastAPI(title="On-call Scheduler API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # tighten this in prod
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(people.router)
app.include_router(teams.router)
app.include_router(pto.router)
app.include_router(schedules.router)


@app.on_event("startup")
def on_startup() -> None:
    """Wait for Postgres to be ready, then create tables."""
    max_attempts = 10
    delay_seconds = 3

    for attempt in range(1, max_attempts + 1):
        try:
            Base.metadata.create_all(bind=engine)
            print("✅ Database ready, tables ensured.")
            break
        except OperationalError as e:
            print(
                f"⏳ DB not ready (attempt {attempt}/{max_attempts}): {e}"
            )
            if attempt == max_attempts:
                print("❌ Giving up on DB connection.")
                raise
            time.sleep(delay_seconds)
    # Seed initial data (idempotent)
    seed_initial_data()

@app.get("/")
def root():
    return {"status": "ok", "message": "On-call Scheduler API"}
