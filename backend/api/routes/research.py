from fastapi import APIRouter

from backend.models.schemas import ColdOutreachTargetRequest, ColdOutreachTargetResponse, DistributorRequest, Output
from backend.services.research import find_cold_outreach_targets, find_distributors

router = APIRouter(tags=['research'])


@router.post('/find-distributors', response_model=Output)
async def extract_distributors(req: DistributorRequest):
    return await find_distributors(req)


@router.post('/find-cold-targets', response_model=ColdOutreachTargetResponse)
async def extract_cold_outreach_targets(req: ColdOutreachTargetRequest):
    return await find_cold_outreach_targets(req)
