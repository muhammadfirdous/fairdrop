import re
from datetime import date
from typing import Literal
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

Volume = int
MAX = 1_000_000_000

class Input(BaseModel):
    model_config = ConfigDict(extra='forbid', str_strip_whitespace=True)

class Revision(Input):
    revision: int = Field(ge=1, strict=True)

class Critical(Revision):
    operation_id: str = Field(min_length=8, max_length=100)

class Login(Input):
    email: str = Field(max_length=200)
    password: str = Field(min_length=1, max_length=200)

class Source(Revision):
    opening_ml: int = Field(ge=0, le=MAX, strict=True)
    flow_ml_min: int = Field(gt=0, le=MAX, strict=True)
    start: int = Field(ge=0, lt=86400, strict=True)
    end: int = Field(gt=0, lt=86400, strict=True)
    changeover: int = Field(ge=0, le=3600, strict=True)
    policy: Literal['proportional', 'minimums']
    @model_validator(mode='after')
    def ordered(self):
        if self.start >= self.end:
            raise ValueError('Operating end must be after start. Overnight windows are unsupported.')
        return self

class RequestInput(Revision):
    requested_ml: int = Field(ge=0, le=MAX, strict=True)
    start: int = Field(ge=0, lt=86400, strict=True)
    end: int = Field(gt=0, lt=86400, strict=True)
    note: str = Field(default='', max_length=1000)
    @model_validator(mode='after')
    def ordered(self):
        if self.start >= self.end:
            raise ValueError('Availability end must be after start. Overnight windows are unsupported.')
        return self

class Review(Revision):
    status: Literal['approved', 'rejected']
    approved_ml: int = Field(ge=0, le=MAX, strict=True)
    minimum_ml: int = Field(ge=0, le=MAX, strict=True)
    reason: str = Field(default='', max_length=1000)

class Preview(Revision):
    preset: Literal['saved', 'adequate', 'shortage', 'changed-b', 'short-f', 'custom'] = 'saved'
    source: Source | None = None

class Publish(Critical):
    draft_id: int

class Delivery(Critical):
    actual_ml: int = Field(ge=0, le=MAX, strict=True)
    reason: str = Field(default='', max_length=1000)

class Reason(Critical):
    reason: str = Field(min_length=1, max_length=1000)

class AdjustmentInput(Reason):
    amount_ml: int = Field(ge=-MAX, le=MAX, strict=True)

class Target(Reason):
    target_ml: int = Field(ge=0, le=MAX, strict=True)

class PlotInput(Input):
    name: str = Field(min_length=1, max_length=100)
    grower_id: int = Field(gt=0, strict=True)
    crop: str = Field(default='', max_length=200)
    area: str = Field(default='', max_length=20)
    position: int = Field(ge=0, le=5, strict=True)
    active: bool = True
    @field_validator('area')
    @classmethod
    def area_number(cls, value):
        if value and (not re.fullmatch(r'\d+(\.\d{1,3})?', value) or float(value) > 1_000_000):
            raise ValueError('Area must be a finite non-negative number.')
        return value

class PlotEdit(PlotInput):
    revision: int = Field(ge=1, strict=True)
    date: str

class Reset(Input):
    confirmation: Literal['RESET FICTIONAL DEMO']

def valid_date(value):
    try:
        if date.fromisoformat(value).isoformat() != value:
            raise ValueError()
    except (ValueError, TypeError):
        from fastapi import HTTPException
        raise HTTPException(422, 'Use a valid local date in YYYY-MM-DD format.')
    return value
