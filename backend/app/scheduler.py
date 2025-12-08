
from datetime import date, timedelta
from typing import List, Dict, Any, Optional, Set

def first_week_start_of_year(year: int, week_starts_on: int = 0) -> date:
    d = date(year, 1, 1)
    while d.weekday() != week_starts_on:
        d += timedelta(days=1)
    return d

def overlaps_pto(slot_start: date, slot_end: date, pto_dates: Set[date]) -> bool:
    d = slot_start
    while d <= slot_end:
        if d in pto_dates:
            return True
        d += timedelta(days=1)
    return False

def generate_oncall_slots(
    people_ids: List[int],
    year: int,
    rotation_days: int = 7,
    week_starts_on: int = 0,
    custom_start_date: Optional[date] = None,
    pto_by_person: Optional[Dict[int, Set[date]]] = None,
    assign_secondary: bool = True,
) -> List[Dict[str, Any]]:
    """
    Returns list of slots:
      {
        "slot": int,
        "primary_person_id": int,
        "secondary_person_id": Optional[int],
        "start": date,
        "end": date,
      }
    """
    if not people_ids:
        raise ValueError("At least one person is required")
    if rotation_days <= 0:
        raise ValueError("rotation_days must be positive")

    pto_by_person = pto_by_person or {}

    start = custom_start_date or first_week_start_of_year(year, week_starts_on)
    end_of_year = date(year, 12, 31)

    slots: List[Dict[str, Any]] = []
    i = 0
    current_start = start

    n = len(people_ids)

    while current_start <= end_of_year:
        current_end = current_start + timedelta(days=rotation_days - 1)
        if current_end > end_of_year:
            current_end = end_of_year

        # choose primary: start from nominal person, then try next if PTO
        base_index = i % n
        primary_idx = base_index
        chosen_primary = None
        for offset in range(n):
            candidate_idx = (base_index + offset) % n
            pid = people_ids[candidate_idx]
            if not overlaps_pto(current_start, current_end, pto_by_person.get(pid, set())):
                chosen_primary = pid
                primary_idx = candidate_idx
                break

        # if everyone is on PTO, fall back to nominal person (no perfect solution)
        if chosen_primary is None:
            chosen_primary = people_ids[base_index]

        secondary_person_id = None
        if assign_secondary and n > 1:
            # pick the next person in rotation who is NOT the primary
            for offset in range(1, n):
                candidate_idx = (primary_idx + offset) % n
                pid2 = people_ids[candidate_idx]
                if pid2 != chosen_primary:
                    secondary_person_id = pid2
                    break

        slots.append(
            {
                "slot": i + 1,
                "primary_person_id": chosen_primary,
                "secondary_person_id": secondary_person_id,
                "start": current_start,
                "end": current_end,
            }
        )

        i += 1
        current_start = current_end + timedelta(days=1)

    return slots
